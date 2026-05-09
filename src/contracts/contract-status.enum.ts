export enum ContractStatus {
  /** 계약 row 생성됨, 아직 escrow 미발생 */
  Pending = 'pending',
  /** 보증금 + Stake escrow + SignerListSet 모두 완료 */
  Locked = 'locked',
  /** 정상 종료, escrow 반환 완료 */
  Settled = 'settled',
  /** CancelAfter 도래 자동 환불 */
  Cancelled = 'cancelled',
  /** 분쟁 진행중 */
  Disputed = 'disputed',
}
