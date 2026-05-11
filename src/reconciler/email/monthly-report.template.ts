import type { EmailMessage } from '../../shared/email/email.interface';

export interface MonthlyReportInput {
  to: string;
  contractId: string;
  yearMonth: string;
  usageKwh: number;
  chargeKrw: number;
  paymentTxHash: string;
  explorerBaseUrl: string;
}

/**
 * 월간 정산 리포트 이메일 본문 빌더.
 * pure 함수 — i18n/HTML 전환 시 본 함수만 교체.
 *
 * 기획안 Layer 2 인용:
 * "Sarah 님의 보증금이 XRPL 에스크로에 안전하게 보관 중입니다. 트랜잭션 ID: rXXXX..."
 */
export function buildMonthlyReportEmail(
  input: MonthlyReportInput,
): EmailMessage {
  const explorerUrl = `${input.explorerBaseUrl.replace(/\/$/, '')}/transactions/${input.paymentTxHash}`;
  const subject = `[BlueSafe] ${input.yearMonth} 월 정산 리포트`;
  const text = [
    `BlueSafe 월간 정산 리포트 — ${input.yearMonth}`,
    '',
    `계약 ID: ${input.contractId}`,
    `전력 사용량(KEPCO): ${input.usageKwh} kWh`,
    `청구 금액(KEPCO): ₩${input.chargeKrw.toLocaleString('ko-KR')}`,
    `XRPL Payment 트랜잭션: ${input.paymentTxHash}`,
    '',
    `블록체인에서 직접 확인: ${explorerUrl}`,
    '',
    '이 이메일은 매월 정산 cron이 자동 발송합니다.',
    'XRPL Memo에는 KEPCO 응답의 SHA-256 해시가 기록되어 사후 위변조가 불가능합니다.',
  ].join('\n');
  return { to: input.to, subject, text };
}
