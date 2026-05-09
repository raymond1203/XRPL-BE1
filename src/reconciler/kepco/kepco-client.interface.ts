export const KEPCO_CLIENT = Symbol('KEPCO_CLIENT');

export interface KepcoQueryParams {
  /** 우리 시스템의 Contract.id (mock에서 식별자로 사용) */
  contractId: string;
  /** 'YYYY-MM' 형식 정산 대상 월 */
  yearMonth: string;
}

export interface MonthlyUsage {
  contractId: string;
  yearMonth: string;
  /** 월간 사용량 (kWh) */
  usageKwh: number;
  /** 청구 금액 (KRW) */
  chargeKrw: number;
  /** 검침일 */
  meterReadingDate: Date;
}

/**
 * 한국전력 파워플래너 API 추상화.
 * 예선: KepcoMockClient (deterministic 응답)
 * 본선: KepcoApiClient (실 OAuth + REST/SOAP) — 동일 토큰으로 useClass 교체
 */
export interface KepcoClient {
  getMonthlyUsage(params: KepcoQueryParams): Promise<MonthlyUsage>;
}
