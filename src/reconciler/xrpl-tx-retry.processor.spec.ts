import { Test } from '@nestjs/testing';
import type { Job } from 'bullmq';
import type { XrplTxRetryJob } from '../queue/xrpl-tx-retry.types';
import { ReconcilerService } from './reconciler.service';
import { XrplTxRetryProcessor } from './xrpl-tx-retry.processor';

describe('XrplTxRetryProcessor', () => {
  let processor: XrplTxRetryProcessor;
  let reconciler: { reconcileContract: jest.Mock };

  beforeEach(async () => {
    reconciler = { reconcileContract: jest.fn().mockResolvedValue({}) };
    const mod = await Test.createTestingModule({
      providers: [
        XrplTxRetryProcessor,
        { provide: ReconcilerService, useValue: reconciler },
      ],
    }).compile();
    processor = mod.get(XrplTxRetryProcessor);
  });

  it('reconcile-payment job: ReconcilerService.reconcileContract 호출', async () => {
    const job = {
      data: {
        kind: 'reconcile-payment',
        contractId: 'c1',
        yearMonth: '2026-04',
      },
      attemptsMade: 0,
    } as Job<XrplTxRetryJob>;

    await processor.process(job);

    expect(reconciler.reconcileContract).toHaveBeenCalledWith('c1', '2026-04');
  });

  it('reconcileContract throw 시 processor도 throw (BullMQ가 재시도)', async () => {
    reconciler.reconcileContract.mockRejectedValueOnce(new Error('boom'));
    const job = {
      data: {
        kind: 'reconcile-payment',
        contractId: 'c1',
        yearMonth: '2026-04',
      },
      attemptsMade: 2,
    } as Job<XrplTxRetryJob>;
    await expect(processor.process(job)).rejects.toThrow('boom');
  });
});
