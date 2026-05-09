import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ContractsService } from '../src/contracts/contracts.service';
import {
  decodeReconcileMemo,
  type ReconcileMemo,
} from '../src/reconciler/payment-memo.builder';
import { ReconcilerService } from '../src/reconciler/reconciler.service';
import { ReconciliationStatus } from '../src/reconciler/reconciliation-status.enum';
import { XrplClientService } from '../src/xrpl/xrpl-client.service';

/**
 * 실 Testnet + Postgres 통합 — W6 정산 cron의 핵심 흐름 end-to-end 검증.
 *
 * 시나리오:
 *   1) lockTenantDeposit으로 Locked 계약 생성 (4 fundWallet + 3 trans, ~35s)
 *   2) reconcileContract 실행 (KEPCO mock + Payment+Memo Testnet 제출, ~5s)
 *   3) Reconciliation row 영속 검증
 *   4) Testnet에서 tx 재조회 → Memo 디코드 → 원본 payload 일치 검증 (위변조 불가 증명)
 *
 * 사전 요구: docker compose up -d (Postgres)
 */
describe('ReconcilerService (Testnet + Postgres integration)', () => {
  let app: INestApplication;
  let contractsService: ContractsService;
  let reconcilerService: ReconcilerService;
  let dataSource: DataSource;
  let xrplClient: XrplClientService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    contractsService = app.get(ContractsService);
    reconcilerService = app.get(ReconcilerService);
    dataSource = app.get(DataSource);
    xrplClient = app.get(XrplClientService);
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE reconciliations CASCADE');
    await dataSource.query('TRUNCATE TABLE contracts CASCADE');
  });

  it('reconcileContract: Locked 계약 → KEPCO mock → Payment+Memo Testnet → DB record + Memo round-trip', async () => {
    const client = xrplClient.getClient();

    // 1) lockTenantDeposit으로 Locked 계약 생성
    const contractAccount = (await client.fundWallet()).wallet;
    const tenant = (await client.fundWallet()).wallet;
    const landlord = (await client.fundWallet()).wallet;
    const operator = (await client.fundWallet()).wallet;

    const now = Date.now();
    const locked = await contractsService.lockTenantDeposit({
      contractWallet: contractAccount,
      tenantAddress: tenant.classicAddress,
      landlordAddress: landlord.classicAddress,
      operatorAddress: operator.classicAddress,
      depositAmount: '50000000',
      stakeAmount: '10000000',
      startsAt: new Date(now),
      endsAt: new Date(now + 365 * 86_400_000),
      finishAfter: new Date(now + 372 * 86_400_000),
      cancelAfter: new Date(now + 395 * 86_400_000),
      tenantPii: 'tenant',
      landlordPii: 'landlord',
    });

    expect(locked.status).toBe('locked');
    // seed 영속화 검증 (ContractsService #13 사전 준비 검증)
    expect(locked.contractAccountSeed).toBe(contractAccount.seed!);

    // 2) reconcileContract 실행
    const yearMonth = '2026-04';
    const record = await reconcilerService.reconcileContract(
      locked.id,
      yearMonth,
    );

    // 3) Reconciliation row 검증
    expect(record.status).toBe(ReconciliationStatus.Matched);
    expect(record.paymentTxHash).toMatch(/^[A-F0-9]{64}$/);
    expect(record.yearMonth).toBe(yearMonth);
    expect(record.kepcoUsageKwh).toBeGreaterThanOrEqual(100);
    expect(record.kepcoUsageKwh).toBeLessThanOrEqual(499);
    expect(record.kepcoChargeKrw).toBe(record.kepcoUsageKwh * 120);
    expect(record.kepcoUsageHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.errorMessage).toBeNull();

    // 4) Testnet에서 tx 재조회 → Memo 디코드 → 원본 payload 일치 검증
    const txResp = await client.request({
      command: 'tx',
      transaction: record.paymentTxHash!,
    });

    type TxJsonMaybe = {
      Memos?: Array<{ Memo: ReconcileMemo['Memo'] }>;
    };
    const result = txResp.result as TxJsonMaybe & {
      tx_json?: TxJsonMaybe;
    };
    const memos = result.tx_json?.Memos ?? result.Memos;
    expect(memos).toBeDefined();
    expect(memos!).toHaveLength(1);

    const decoded = decodeReconcileMemo(memos![0].Memo);
    expect(decoded.contractId).toBe(locked.id);
    expect(decoded.yearMonth).toBe(yearMonth);
    expect(decoded.kepcoUsageHash).toBe(record.kepcoUsageHash);
    expect(decoded.calculatedAmountDrops).toBe(String(record.kepcoChargeKrw));
  }, 120_000);
});
