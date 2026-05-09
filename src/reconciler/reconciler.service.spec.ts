import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { Wallet, type Client, type TxResponse } from 'xrpl';
import { ContractStatus } from '../contracts/contract-status.enum';
import { ContractsService } from '../contracts/contracts.service';
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
  };
  let contractsService: { findById: jest.Mock; findAllLocked: jest.Mock };
  let xrplClient: { getClient: jest.Mock };
  let kepcoClient: { getMonthlyUsage: jest.Mock };
  let mockSubmitAndWait: jest.Mock;

  // 테스트 실행마다 신규 유효 seed (정적 시드 박기 함정 회피)
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

    const moduleFixture = await Test.createTestingModule({
      providers: [
        ReconcilerService,
        { provide: getRepositoryToken(Reconciliation), useValue: recordRepo },
        { provide: ContractsService, useValue: contractsService },
        { provide: XrplClientService, useValue: xrplClient },
        { provide: KEPCO_CLIENT, useValue: kepcoClient },
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

      // Payment TX 구조 검증
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
    it('iterates locked contracts and continues despite individual failures', async () => {
      contractsService.findAllLocked.mockResolvedValue([
        { id: 'c1' },
        { id: 'c2' },
      ]);

      // 첫 호출 throw, 두 번째 성공 → 두 호출 모두 수행되어야 함 (swallow)
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
    });
  });
});
