import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Payment, Wallet } from 'xrpl';
import { ContractStatus } from '../contracts/contract-status.enum';
import {
  ContractsService,
  type ContractDto,
} from '../contracts/contracts.service';
import {
  XRPL_TX_RETRY_QUEUE,
  type XrplTxRetryJob,
} from '../queue/xrpl-tx-retry.types';
import {
  EMAIL_SERVICE,
  type EmailService,
} from '../shared/email/email.interface';
import { XrplClientService } from '../xrpl/xrpl-client.service';
import { buildMonthlyReportEmail } from './email/monthly-report.template';
import { KEPCO_CLIENT, type KepcoClient } from './kepco/kepco-client.interface';
import { buildReconcileMemo, sha256Hex } from './payment-memo.builder';
import { ReconciliationStatus } from './reconciliation-status.enum';
import { Reconciliation } from './reconciliation.entity';

@Injectable()
export class ReconcilerService {
  private readonly logger = new Logger(ReconcilerService.name);

  constructor(
    @InjectRepository(Reconciliation)
    private readonly recordRepo: Repository<Reconciliation>,
    private readonly contractsService: ContractsService,
    private readonly xrplClient: XrplClientService,
    @Inject(KEPCO_CLIENT) private readonly kepcoClient: KepcoClient,
    @InjectQueue(XRPL_TX_RETRY_QUEUE)
    private readonly retryQueue: Queue<XrplTxRetryJob>,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    private readonly cfg: ConfigService,
  ) {}

  /**
   * Cron 진입점 — KST 기준 매월 1일 00:00, 전월 정산.
   */
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT, {
    name: 'monthly-reconcile',
    timeZone: 'Asia/Seoul',
    waitForCompletion: true,
  })
  async monthlyCron(): Promise<void> {
    const yearMonth = this.previousMonthInKst();
    this.logger.log(`monthly cron triggered for yearMonth=${yearMonth}`);
    await this.runMonthlyReconcile(yearMonth);
  }

  async runMonthlyReconcile(yearMonth: string): Promise<void> {
    const contracts = await this.contractsService.findAllLocked();
    this.logger.log(
      `reconciling ${contracts.length} locked contracts for ${yearMonth}`,
    );
    for (const contract of contracts) {
      try {
        await this.reconcileContract(contract.id, yearMonth);
      } catch (err) {
        // 한 계약 실패가 다른 계약 정산을 막지 않게 swallow + log + 큐 enqueue
        this.logger.error(
          `reconcile failed for ${contract.id}: ${(err as Error).message} — enqueueing retry`,
        );
        await this.retryQueue.add('reconcile-payment', {
          kind: 'reconcile-payment',
          contractId: contract.id,
          yearMonth,
        });
      }
    }
  }

  /** HTTP에서 contractId 기준 정산 이력 조회 */
  async findReconciliationsByContractId(
    contractId: string,
  ): Promise<Reconciliation[]> {
    return this.recordRepo.find({
      where: { contractId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 수동 트리거. yearMonth 미지정 시 전월(KST), contractId 지정 시 단건만.
   * dev/staging 데모용 — production 라우트는 가드로 차단.
   */
  async runManualReconcile(opts: {
    yearMonth?: string;
    contractId?: string;
  }): Promise<{ yearMonth: string; processed: number }> {
    const yearMonth = opts.yearMonth ?? this.previousMonthInKst();
    if (opts.contractId) {
      await this.reconcileContract(opts.contractId, yearMonth);
      return { yearMonth, processed: 1 };
    }
    const before = await this.recordRepo.count({ where: { yearMonth } });
    await this.runMonthlyReconcile(yearMonth);
    const after = await this.recordRepo.count({ where: { yearMonth } });
    return { yearMonth, processed: after - before };
  }

  async reconcileContract(
    contractId: string,
    yearMonth: string,
  ): Promise<Reconciliation> {
    // 멱등성 — 같은 contractId+yearMonth가 이미 Matched면 skip (retry 안전)
    const alreadyMatched = await this.recordRepo.findOne({
      where: {
        contractId,
        yearMonth,
        status: ReconciliationStatus.Matched,
      },
    });
    if (alreadyMatched) {
      this.logger.log(
        `reconcile skip: ${contractId} ${yearMonth} already matched (tx=${alreadyMatched.paymentTxHash})`,
      );
      return alreadyMatched;
    }

    const contract = await this.contractsService.findById(contractId);
    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }
    if (contract.status !== ContractStatus.Locked) {
      throw new Error(
        `Contract ${contractId} is not Locked (status=${contract.status})`,
      );
    }
    if (!contract.contractAccountSeed || !contract.contractAccountAddress) {
      throw new Error(
        `Contract ${contractId} missing contractAccount info (seed/address)`,
      );
    }

    const usage = await this.kepcoClient.getMonthlyUsage({
      contractId,
      yearMonth,
    });
    const usageHash = sha256Hex(JSON.stringify(usage));

    const baseRecord = {
      contractId,
      yearMonth,
      kepcoUsageKwh: usage.usageKwh,
      kepcoChargeKrw: usage.chargeKrw,
      kepcoUsageHash: usageHash,
    };

    let txHash: string | null = null;
    let status: ReconciliationStatus = ReconciliationStatus.Matched;
    let errorMessage: string | null = null;
    let thrownError: Error | null = null;

    try {
      txHash = await this.submitPayment(
        contract.contractAccountAddress,
        contract.landlordAddress,
        contract.contractAccountSeed,
        usage.chargeKrw,
        {
          contractId,
          yearMonth,
          kepcoUsageHash: usageHash,
          // 예선: 임대인 청구액 = KEPCO 사용량 (별도 claim entity는 후속)
          landlordClaimHash: usageHash,
          calculatedAmountDrops: String(usage.chargeKrw),
        },
      );
    } catch (err) {
      status = ReconciliationStatus.Failed;
      errorMessage = (err as Error).message;
      thrownError = err as Error;
    }

    const record = await this.recordRepo.save(
      this.recordRepo.create({
        ...baseRecord,
        status,
        paymentTxHash: txHash,
        errorMessage,
      }),
    );

    if (thrownError) {
      throw thrownError;
    }

    this.logger.log(
      `reconciled ${contractId} ${yearMonth}: tx=${txHash}, ${usage.usageKwh}kWh / ₩${usage.chargeKrw}`,
    );

    // 월간 리포트 이메일 — 발송 실패가 정산을 무효화하지 않게 swallow + log
    if (txHash) {
      await this.sendMonthlyReportSafely(record.id, contract, {
        yearMonth,
        usageKwh: usage.usageKwh,
        chargeKrw: usage.chargeKrw,
        paymentTxHash: txHash,
      });
    }

    return record;
  }

  private async sendMonthlyReportSafely(
    recordId: string,
    contract: ContractDto,
    info: {
      yearMonth: string;
      usageKwh: number;
      chargeKrw: number;
      paymentTxHash: string;
    },
  ): Promise<void> {
    if (!contract.tenantEmail) {
      this.logger.log(
        `monthly report skip: contract=${contract.id} no tenantEmail`,
      );
      return;
    }
    try {
      const explorerBaseUrl =
        this.cfg.get<string>('XRPL_EXPLORER_URL') ?? 'https://testnet.xrpl.org';
      const message = buildMonthlyReportEmail({
        to: contract.tenantEmail,
        contractId: contract.id,
        yearMonth: info.yearMonth,
        usageKwh: info.usageKwh,
        chargeKrw: info.chargeKrw,
        paymentTxHash: info.paymentTxHash,
        explorerBaseUrl,
      });
      await this.emailService.send(message);
      await this.recordRepo.update(recordId, { reportSentAt: new Date() });
    } catch (err) {
      this.logger.error(
        `monthly report failed for ${contract.id} ${info.yearMonth}: ${(err as Error).message}`,
      );
    }
  }

  private async submitPayment(
    sourceAddress: string,
    destinationAddress: string,
    sourceSeed: string,
    amountKrw: number,
    memoPayload: Parameters<typeof buildReconcileMemo>[0],
  ): Promise<string> {
    // KRW → drops 변환: 예선은 1:1 (oracle은 후속)
    const amountDrops = String(amountKrw);
    const memo = buildReconcileMemo(memoPayload);
    const wallet = Wallet.fromSeed(sourceSeed);

    const tx: Payment = {
      TransactionType: 'Payment',
      Account: sourceAddress,
      Destination: destinationAddress,
      Amount: amountDrops,
      Memos: [memo],
    };

    const client = this.xrplClient.getClient();
    const response = await client.submitAndWait(tx, { wallet });
    const meta = response.result.meta;
    if (typeof meta !== 'object' || meta === null) {
      throw new Error('Payment response meta missing or string');
    }
    if (meta.TransactionResult !== 'tesSUCCESS') {
      throw new Error(`Payment failed: ${meta.TransactionResult}`);
    }
    return response.result.hash;
  }

  private previousMonthInKst(now: Date = new Date()): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const year = Number(parts.find((p) => p.type === 'year')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear -= 1;
    }
    return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
  }
}
