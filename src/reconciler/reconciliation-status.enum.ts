export enum ReconciliationStatus {
  /** KEPCO 사용량 = 임대인 청구액 → Payment 발사 완료 */
  Matched = 'matched',
  /** 사용량 ≠ 청구액 → 분쟁 알림 (예선은 사용 안 함) */
  Mismatch = 'mismatch',
  /** KEPCO API 또는 XRPL 제출 실패 */
  Failed = 'failed',
}
