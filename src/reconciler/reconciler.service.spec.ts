import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { Wallet, type Client, type TxResponse } from 'xrpl';
import { ContractStatus } from '../contracts/contract-status.enum';
import { ContractsService } from '../contracts/contracts.service';
import { XRPL_TX_RETRY_QUEUE } from '../queue/xrpl-tx-retry.types';
import { EMAIL_SERVICE } from '../shared/email/email.interface';
import { XrplClientService } from '../xrpl/xrpl-client.service';
import { KEPCO_CLIENT } from './kepco/kepco-client.interface';
import { ReconcilerService } from './reconciler.service';
import { ReconciliationStatus } from './reconciliation-status.enum';
import { Reconciliation } from './reconciliation.entity';

describe('ReconcilerService', () => {
  let service: ReconcilerService;
  let recordRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
  };
  let contractsService: { findById: jest.Mock; findAllLocked: jest.Mock };
  let xrplClient: { getClient: jest.Mock };
  let kepcoClient: { getMonthlyUsage: jest.Mock };
  let mockSubmitAndWait: jest.Mock;
  let retryQueue: { add: jest.Mock };
  let emailService: { send: jest.Mock };
  let configService: { get: jest.Mock };

  const VALID_SEED = Wallet.generate().seed!;
  const validContract = {
    id: 'c1',
    status: ContractStatus.Locked,
    contractAccountSeed: VALID_SEED,
    contractAccountAddress: 'rContractXXXXXXXXXXXXXXXXXXXXXXXXX',
    landlordAddress: 'rLandlordXXXXXXXXXXXXXXXXXXXXXXXXX',
  };

  beforeEach(async () => {
    mockSubmitAndWait = jest.fn();
    recordRepo = {
      create: jest.fn(
        (entity: Partial<Reconciliation>) => entity as Reconciliation,
      ),
      save: jest.fn((entity: Reconciliation) =>
        Promise.resolve({
          ...entity,
          id: 'rec-uuid',
          createdAt: new Date(),
        }),
      ),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn(),
      count: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };
    contractsService = {
      findById: jest.fn(),
      findAllLocked: jest.fn(),
    };
    xrplClient = {
      getClient: jest.fn(
        () => ({ submitAndWait: mockSubmitAndWait }) as unknown as Client,
      ),
    };
    kepcoClient = {
      getMonthlyUsage: jest.fn(),
    };
    retryQueue = { add: jest.fn().mockResolvedValue(undefined) };
    emailService = { send: jest.fn().mockResolvedValue(undefined) };
    configService = {
      get: jest.fn((k: string) =>
        k === 'XRPL_EXPLORER_URL' ? 'https://testnet.xrpl.org' : undefined,
      ),
    };

    const moduleFixture = await Test.createTestingModule({
      providers: [
        ReconcilerService,
        { provide: getRepositoryToken(Reconciliation), useValue: recordRepo },
        { provide: ContractsService, useValue: contractsService },
        { provide: XrplClientService, useValue: xrplClient },
        { provide: KEPCO_CLIENT, useValue: kepcoClient },
        { provide: getQueueToken(XRPL_TX_RETRY_QUEUE), useValue: retryQueue },
        { provide: EMAIL_SERVICE, useValue: emailService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = moduleFixture.get(ReconcilerService);
  });

  function makeUsage() {
    return {
      contractId: 'c1',
      yearMonth: '2026-04',
      usageKwh: 200,
      chargeKrw: 24000,
      meterReadingDate: new Date('2026-04-28T00:00:00Z'),
    };
  }

  function makeTesSuccessResponse(hash = 'A'.repeat(64)): TxResponse {
    return {
      result: {
        hash,
        meta: { TransactionResult: 'tesSUCCESS', AffectedNodes: [] },
      },
    } as unknown as TxResponse;
  }

  describe('reconcileContract', () => {
    it('happy path: KEPCO + Payment+Memo → matched record', async () => {
      contractsService.findById.mockResolvedValue(validContract);
      kepcoClient.getMonthlyUsage.mockResolvedValue(makeUsage());
      mockSubmitAndWait.mockResolvedValue(makeTesSuccessResponse());

      const record = await service.reconcileContract('c1', '2026-04');

      expect(record.status).toBe(ReconciliationStatus.Matched);
      expect(record.paymentTxHash).toBe('A'.repeat(64));
      expect(record.kepcoUsageKwh).toBe(200);
      expect(record.kepcoChargeKrw).toBe(24000);
      expect(record.kepcoUsageHash).toMatch(/^[0-9a-f]{64}$/);

      const [tx] = mockSubmitAndWait.mock.calls[0] as [Record<string, unknown>];
      expect(tx.TransactionType).toBe('Payment');
      expect(tx.Account).toBe(validContract.contractAccountAddress);
      expect(tx.Destination).toBe(validContract.landlordAddress);
      expect(tx.Amount).toBe('24000');

      const memos = tx.Memos as Array<{
        Memo: { MemoType: string; MemoData: string };
      }>;
      expect(memos).toHaveLength(1);
      expect(memos[0].Memo.MemoType).toMatch(/^[0-9A-F]+$/);
    });

    it('tenantEmail 있으면 월간 리포트 이메일 발송 + reportSentAt 업데이트', async () => {
      contractsService.findById.mockResolvedValue({
        ...validContract,
        tenantEmail: 'sarah@example.com',
      });
      kepcoClient.getMonthlyUsage.mockResolvedValue(makeUsage());
      mockSubmitAndWait.mockResolvedValue(makeTesSuccessResponse());

      await service.reconcileContract('c1', '2026-04');

      const sendCalls = emailService.send.mock.calls as Array<
        [{ to: string; subject: string; text: string }]
      >;
      expect(sendCalls).toHaveLength(1);
      expect(sendCalls[0][0].to).toBe('sarah@example.com');
      expect(sendCalls[0][0].subject).toContain('2026-04');

      const updateCalls = recordRepo.update.mock.calls as Array<
        [string, { reportSentAt: Date }]
      >;
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0][0]).toBe('rec-uuid');
      expect(updateCalls[0][1].reportSentAt).toBeInstanceOf(Date);
    });

    it('tenantEmail 없으면 이메일 발송 skip', async () => {
      contractsService.findById.mockResolvedValue(validContract);
      kepcoClient.getMonthlyUsage.mockResolvedValue(makeUsage());
      mockSubmitAndWait.mockResolvedValue(makeTesSuccessResponse());

      await service.reconcileContract('c1', '2026-04');

      expect(emailService.send).not.toHaveBeenCalled();
      expect(recordRepo.update).not.toHaveBeenCalled();
    });

    it('idempotent: 이미 Matched row 있으면 skip (XRPL 호출 안 함)', async () => {
      const matched = {
        id: 'rec-existing',
        contractId: 'c1',
        yearMonth: '2026-04',
        status: ReconciliationStatus.Matched,
        paymentTxHash: 'P'.repeat(64),
      } as Reconciliation;
      recordRepo.findOne.mockResolvedValueOnce(matched);

      const record = await service.reconcileContract('c1', '2026-04');

      expect(record).toBe(matched);
      expect(contractsService.findById).not.toHaveBeenCalled();
      expect(kepcoClient.getMonthlyUsage).not.toHaveBeenCalled();
      expect(mockSubmitAndWait).not.toHaveBeenCalled();
    });

    it('throws when contract not found', async () => {
      contractsService.findById.mockResolvedValue(null);
      await expect(
        service.reconcileContract('missing', '2026-04'),
      ).rejects.toThrow(/not found/);
      expect(recordRepo.save).not.toHaveBeenCalled();
    });

    it('throws when contract is not Locked', async () => {
      contractsService.findById.mockResolvedValue({
        ...validContract,
        status: ContractStatus.Pending,
      });
      await expect(service.reconcileContract('c1', '2026-04')).rejects.toThrow(
        /is not Locked/,
      );
      expect(recordRepo.save).not.toHaveBeenCalled();
    });

    it('persists Failed record + rethrows when Payment returns non-tesSUCCESS', async () => {
      contractsService.findById.mockResolvedValue(validContract);
      kepcoClient.getMonthlyUsage.mockResolvedValue(makeUsage());
      mockSubmitAndWait.mockResolvedValue({
        result: {
          hash: 'B'.repeat(64),
          meta: {
            TransactionResult: 'tecINSUF_RESERVE_LINE',
            AffectedNodes: [],
          },
        },
      });

      await expect(service.reconcileContract('c1', '2026-04')).rejects.toThrow(
        /tecINSUF_RESERVE_LINE/,
      );

      expect(recordRepo.save).toHaveBeenCalledTimes(1);
      const savedCalls = recordRepo.save.mock.calls as Array<[Reconciliation]>;
      const saved = savedCalls[0][0];
      expect(saved.status).toBe(ReconciliationStatus.Failed);
      expect(saved.paymentTxHash).toBeNull();
      expect(saved.errorMessage).toMatch(/tecINSUF_RESERVE_LINE/);
    });
  });

  describe('runMonthlyReconcile', () => {
    it('iterates locked contracts and enqueues retry on individual failure', async () => {
      contractsService.findAllLocked.mockResolvedValue([
        { id: 'c1' },
        { id: 'c2' },
      ]);

      const reconcileSpy = jest
        .spyOn(service, 'reconcileContract')
        .mockRejectedValueOnce(new Error('c1 boom'))
        .mockResolvedValueOnce({} as Reconciliation);

      await expect(
        service.runMonthlyReconcile('2026-04'),
      ).resolves.toBeUndefined();

      expect(reconcileSpy).toHaveBeenCalledTimes(2);
      expect(reconcileSpy).toHaveBeenNthCalledWith(1, 'c1', '2026-04');
      expect(reconcileSpy).toHaveBeenNthCalledWith(2, 'c2', '2026-04');
      // c1 실패 → 큐에 enqueue, c2 성공 → 큐 호출 없음
      expect(retryQueue.add).toHaveBeenCalledTimes(1);
      expect(retryQueue.add).toHaveBeenCalledWith('reconcile-payment', {
        kind: 'reconcile-payment',
        contractId: 'c1',
        yearMonth: '2026-04',
      });
    });
  });
});
