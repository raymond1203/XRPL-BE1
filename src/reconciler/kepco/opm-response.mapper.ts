import type { MonthlyUsage } from './kepco-client.interface';
import type { OpmBillData } from './opm-response.types';

/**
 * OPM 청구정보(NO.8) 응답 → MonthlyUsage 도메인 매핑.
 *
 * 안내서 수령 시 입력 OpmBillData 필드만 교체하면 reconciler 흐름은 무변.
 */
export function mapOpmBillToMonthlyUsage(
  contractId: string,
  bill: OpmBillData,
): MonthlyUsage {
  return {
    contractId,
    yearMonth: `${bill.billYm.slice(0, 4)}-${bill.billYm.slice(4, 6)}`,
    usageKwh: bill.kwh,
    chargeKrw: bill.billAmt,
    meterReadingDate: parseYyyymmdd(bill.measureToDt),
  };
}

function parseYyyymmdd(yyyymmdd: string): Date {
  const year = Number(yyyymmdd.slice(0, 4));
  const month = Number(yyyymmdd.slice(4, 6));
  const day = Number(yyyymmdd.slice(6, 8));
  return new Date(Date.UTC(year, month - 1, day));
}
