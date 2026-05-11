import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  XRPL_TX_RETRY_QUEUE,
  type XrplTxRetryJob,
} from '../queue/xrpl-tx-retry.types';
import { ReconcilerService } from './reconciler.service';

/**
 * XRPL 트랜잭션 재시도 워커.
 * - throw하면 BullMQ가 defaultJobOptions(attempts/backoff)으로 자동 재시도
 * - 멱등성: ReconcilerService.reconcileContract 진입 시 동일 contractId+yearMonth+Matched
 *   row가 이미 있으면 skip
 */
@Processor(XRPL_TX_RETRY_QUEUE)
export class XrplTxRetryProcessor extends WorkerHost {
  private readonly logger = new Logger(XrplTxRetryProcessor.name);

  constructor(private readonly reconciler: ReconcilerService) {
    super();
  }

  async process(job: Job<XrplTxRetryJob>): Promise<void> {
    const { data, attemptsMade } = job;
    this.logger.log(
      `retry job ${data.kind} contract=${data.contractId} ym=${data.yearMonth} attempt=${attemptsMade + 1}`,
    );
    switch (data.kind) {
      case 'reconcile-payment':
        await this.reconciler.reconcileContract(
          data.contractId,
          data.yearMonth,
        );
        return;
      default: {
        const exhaustive: never = data.kind;
        throw new Error(`Unknown retry job kind: ${String(exhaustive)}`);
      }
    }
  }
}
