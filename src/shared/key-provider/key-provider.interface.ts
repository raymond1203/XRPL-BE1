import type { Wallet } from 'xrpl';

export const KEY_PROVIDER = Symbol('KEY_PROVIDER');

/**
 * 시드/지갑 보관 방식을 추상화한 인터페이스.
 * 예선: EnvKeyProvider (.env에서 시드 조회)
 * 본선: KmsKeyProvider (AWS KMS 호출) — 동일 인터페이스로 교체
 */
export interface KeyProvider {
  /**
   * 논리 식별자(walletId)로 Wallet 조회.
   * @param walletId - 'operator' / 'issuer' 등 논리명
   * @throws walletId가 매핑 없거나 시드가 비어있는 경우
   */
  getWallet(walletId: string): Promise<Wallet>;
}
