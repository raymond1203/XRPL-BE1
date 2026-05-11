/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { ContractsService } from '../contracts/contracts.service';
import { NotProductionGuard } from '../shared/guards/not-production.guard';
import { ReconcilerService } from './reconciler.service';
import { ReconciliationsController } from './reconciliations.controller';
import { ReconciliationStatus } from './reconciliation-status.enum';
import type { Reconciliation } from './reconciliation.entity';

describe('ReconciliationsController', () => {
  let controller: ReconciliationsController;
  let reconciler: jest.Mocked<ReconcilerService>;
  let contractsService: jest.Mocked<ContractsService>;
  let cfg: { get: jest.Mock };

  const contractId = '22222222-2222-2222-2222-222222222222';
  const sampleRow: Reconciliation = {
    id: 'rid-1',
    contractId,
    yearMonth: '2026-04',
    kepcoUsageKwh: 320,
    kepcoChargeKrw: 56400,
    kepcoUsageHash: 'h'.repeat(64),
    status: ReconciliationStatus.Matched,
    paymentTxHash: 'P'.repeat(64),
    errorMessage: null,
    createdAt: new Date('2026-05-01'),
  };

  beforeEach(async () => {
    reconciler = {
      findReconciliationsByContractId: jest.fn().mockResolvedValue([sampleRow]),
      runManualReconcile: jest
        .fn()
        .mockResolvedValue({ yearMonth: '2026-04', processed: 3 }),
    } as unknown as jest.Mocked<ReconcilerService>;
    contractsService = {
      findById: jest.fn().mockResolvedValue({ id: contractId }),
    } as unknown as jest.Mocked<ContractsService>;
    cfg = { get: jest.fn().mockReturnValue('development') };
    const mod: TestingModule = await Test.createTestingModule({
      controllers: [ReconciliationsController],
      providers: [
        { provide: ReconcilerService, useValue: reconciler },
        { provide: ContractsService, useValue: contractsService },
        { provide: ConfigService, useValue: cfg },
        NotProductionGuard,
      ],
    }).compile();
    controller = mod.get(ReconciliationsController);
  });

  it('GET /contracts/:contractId/reconciliations: 응답 매핑', async () => {
    const res = await controller.listByContract(contractId);
    expect(res).toHaveLength(1);
    expect(res[0].paymentTxHash).toBe(sampleRow.paymentTxHash);
    expect(res[0].kepcoChargeKrw).toBe(56400);
  });

  it('GET /contracts/:contractId/reconciliations: 계약 없을 때 404', async () => {
    contractsService.findById.mockResolvedValueOnce(null);
    await expect(controller.listByContract(contractId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('POST /reconciliations/run: 정상 트리거', async () => {
    const res = await controller.runManual({
      yearMonth: '2026-04',
      contractId,
    });
    expect(res).toEqual({ yearMonth: '2026-04', processed: 3 });
    expect(reconciler.runManualReconcile).toHaveBeenCalledWith({
      yearMonth: '2026-04',
      contractId,
    });
  });

  it('NotProductionGuard: production 환경에서 404', () => {
    cfg.get.mockReturnValue('production');
    const guard = new NotProductionGuard(cfg as unknown as ConfigService);
    expect(() => guard.canActivate()).toThrow(NotFoundException);
  });
});
