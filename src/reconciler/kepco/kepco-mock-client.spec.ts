import { KepcoMockClient } from './kepco-mock-client';

describe('KepcoMockClient', () => {
  let client: KepcoMockClient;

  beforeEach(() => {
    client = new KepcoMockClient();
  });

  it('returns deterministic usage for same (contractId, yearMonth)', async () => {
    const a = await client.getMonthlyUsage({
      contractId: 'c1',
      yearMonth: '2026-04',
    });
    const b = await client.getMonthlyUsage({
      contractId: 'c1',
      yearMonth: '2026-04',
    });
    expect(a).toEqual(b);
  });

  it('returns different usage for different yearMonth', async () => {
    const apr = await client.getMonthlyUsage({
      contractId: 'c1',
      yearMonth: '2026-04',
    });
    const may = await client.getMonthlyUsage({
      contractId: 'c1',
      yearMonth: '2026-05',
    });
    expect(apr.usageKwh).not.toBe(may.usageKwh);
  });

  it('returns different usage for different contractId', async () => {
    const c1 = await client.getMonthlyUsage({
      contractId: 'c1',
      yearMonth: '2026-04',
    });
    const c2 = await client.getMonthlyUsage({
      contractId: 'c2',
      yearMonth: '2026-04',
    });
    expect(c1.usageKwh).not.toBe(c2.usageKwh);
  });

  it('keeps usageKwh within [100, 499] and chargeKrw = usageKwh * 120', async () => {
    const result = await client.getMonthlyUsage({
      contractId: 'c1',
      yearMonth: '2026-04',
    });
    expect(result.usageKwh).toBeGreaterThanOrEqual(100);
    expect(result.usageKwh).toBeLessThanOrEqual(499);
    expect(result.chargeKrw).toBe(result.usageKwh * 120);
  });

  it('reflects yearMonth in meterReadingDate', async () => {
    const result = await client.getMonthlyUsage({
      contractId: 'c1',
      yearMonth: '2026-04',
    });
    expect(result.meterReadingDate.toISOString()).toBe(
      '2026-04-28T00:00:00.000Z',
    );
  });
});
