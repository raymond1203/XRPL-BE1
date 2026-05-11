import { buildMonthlyReportEmail } from './monthly-report.template';

describe('buildMonthlyReportEmail', () => {
  it('subject + text에 주요 필드 포함', () => {
    const message = buildMonthlyReportEmail({
      to: 'sarah@example.com',
      contractId: 'c-uuid-1',
      yearMonth: '2026-04',
      usageKwh: 320,
      chargeKrw: 56400,
      paymentTxHash: 'A'.repeat(64),
      explorerBaseUrl: 'https://testnet.xrpl.org',
    });

    expect(message.to).toBe('sarah@example.com');
    expect(message.subject).toContain('2026-04');
    expect(message.text).toContain('320 kWh');
    expect(message.text).toContain('₩56,400');
    expect(message.text).toContain('A'.repeat(64));
    expect(message.text).toContain(
      `https://testnet.xrpl.org/transactions/${'A'.repeat(64)}`,
    );
  });

  it('explorerBaseUrl trailing slash 정규화', () => {
    const message = buildMonthlyReportEmail({
      to: 'x@example.com',
      contractId: 'c1',
      yearMonth: '2026-04',
      usageKwh: 1,
      chargeKrw: 1,
      paymentTxHash: 'B'.repeat(64),
      explorerBaseUrl: 'https://testnet.xrpl.org/',
    });
    expect(message.text).toContain(
      `https://testnet.xrpl.org/transactions/${'B'.repeat(64)}`,
    );
  });
});
