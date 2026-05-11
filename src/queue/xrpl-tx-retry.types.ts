/**
 * XRPL 트랜잭션 재시도 큐 — job payload 정의.
 *
 * 현재 단일 kind('reconcile-payment')만. 향후 EscrowFinish / EscrowCancel 등 추가 시
 * discriminated union으로 확장.
 */
export const XRPL_TX_RETRY_QUEUE = 'xrpl-tx-retry';

export interface ReconcilePaymentRetryJob {
  kind: 'reconcile-payment';
  contractId: string;
  /** 'YYYY-MM' */
  yearMonth: string;
}

export type XrplTxRetryJob = ReconcilePaymentRetryJob;
