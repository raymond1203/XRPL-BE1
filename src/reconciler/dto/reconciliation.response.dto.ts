import type { ReconciliationStatus } from '../reconciliation-status.enum';
import type { Reconciliation } from '../reconciliation.entity';

/**
 * HTTP 응답용 Reconciliation DTO.
 * 임차인 앱에서 월별 정산 이력을 표시할 때 사용.
 * Explorer 딥링크 = paymentTxHash + XRPL_EXPLORER_URL.
 */
export interface ReconciliationResponseDto {
  id: string;
  contractId: string;
  yearMonth: string;
  kepcoUsageKwh: number;
  kepcoChargeKrw: number;
  kepcoUsageHash: string;
  status: ReconciliationStatus;
  paymentTxHash: string | null;
  errorMessage: string | null;
  createdAt: Date;
}

export function toReconciliationResponse(
  row: Reconciliation,
): ReconciliationResponseDto {
  return {
    id: row.id,
    contractId: row.contractId,
    yearMonth: row.yearMonth,
    kepcoUsageKwh: row.kepcoUsageKwh,
    kepcoChargeKrw: row.kepcoChargeKrw,
    kepcoUsageHash: row.kepcoUsageHash,
    status: row.status,
    paymentTxHash: row.paymentTxHash,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
  };
}
