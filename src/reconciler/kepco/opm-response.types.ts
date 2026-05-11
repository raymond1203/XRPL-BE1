/**
 * OPM(Open P-Meter) API 응답 스키마 — 가정값.
 *
 * 한전 EDS 사업자 등록(opm.kepco.co.kr) + 안내서 수령 전까지의 임시 정의.
 * data.go.kr 공공데이터 일반 패턴(serviceKey + JSON) + EDS 카탈로그 필드 키워드
 * (고객번호/청구년월/사용량/요금)에서 추론.
 *
 * 안내서 수령 시 본 파일과 opm-response.mapper.ts 두 곳만 수정하면 됨.
 */

export interface OpmBillResponse {
  result: 'SUCCESS' | 'FAIL';
  resultMsg?: string;
  data: OpmBillData;
}

export interface OpmBillData {
  custNo: string;
  /** YYYYMM */
  billYm: string;
  /** 청구 사용량 (kWh) */
  kwh: number;
  /** 청구 금액 (원, VAT 포함) */
  billAmt: number;
  /** YYYYMMDD */
  dueDate: string;
  /** YYYYMMDD */
  measureFromDt: string;
  /** YYYYMMDD */
  measureToDt: string;
}

export interface OpmDailyUsageResponse {
  result: 'SUCCESS' | 'FAIL';
  resultMsg?: string;
  data: OpmDailyUsageData;
}

export interface OpmDailyUsageData {
  custNo: string;
  /** YYYYMMDD */
  useDate: string;
  /** 15분 간격 × 96개 */
  intervals: Array<{ time: string; kwh: number }>;
}
