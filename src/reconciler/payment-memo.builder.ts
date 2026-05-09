import { createHash } from 'node:crypto';
import { convertHexToString, convertStringToHex } from 'xrpl';

/**
 * 월별 정산 Payment에 동봉되는 Memo 페이로드.
 * SHA-256 해시들이 사후 ledger에서 디코드 → 검증 가능 → 위변조 불가 증명.
 */
export interface ReconcileMemoPayload {
  contractId: string;
  yearMonth: string; // YYYY-MM
  /** SHA-256(JSON.stringify(KEPCO 응답)) */
  kepcoUsageHash: string;
  /** SHA-256(임대인 청구액) — 예선은 kepcoUsageHash와 동일 */
  landlordClaimHash: string;
  /** XRP drops 단위 청구액 */
  calculatedAmountDrops: string;
}

export interface ReconcileMemo {
  Memo: {
    MemoType: string;
    MemoFormat: string;
    MemoData: string;
  };
}

const MEMO_TYPE = 'reconcile/v1';
const MEMO_FORMAT = 'application/json';
const MAX_MEMO_BYTES = 1024;

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function buildReconcileMemo(
  payload: ReconcileMemoPayload,
): ReconcileMemo {
  const json = JSON.stringify(payload);
  const bytes = Buffer.byteLength(json, 'utf-8');
  if (bytes > MAX_MEMO_BYTES) {
    throw new Error(
      `Memo data too large: ${bytes} bytes > ${MAX_MEMO_BYTES} (XRPL Memo 한계)`,
    );
  }
  return {
    Memo: {
      MemoType: convertStringToHex(MEMO_TYPE),
      MemoFormat: convertStringToHex(MEMO_FORMAT),
      MemoData: convertStringToHex(json),
    },
  };
}

export function decodeReconcileMemo(
  memo: ReconcileMemo['Memo'],
): ReconcileMemoPayload {
  const type = convertHexToString(memo.MemoType);
  if (type !== MEMO_TYPE) {
    throw new Error(`Unexpected MemoType: ${type} (expected ${MEMO_TYPE})`);
  }
  const json = convertHexToString(memo.MemoData);
  return JSON.parse(json) as ReconcileMemoPayload;
}
