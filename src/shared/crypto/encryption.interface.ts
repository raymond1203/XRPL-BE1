export const ENCRYPTION_SERVICE = Symbol('ENCRYPTION_SERVICE');

/**
 * PII 컬럼 보호용 대칭 암호화 인터페이스.
 * 예선: AesGcmEncryptionService (env 32바이트 base64 키)
 * 본선: KMS DEK 패턴으로 useClass 교체
 */
export interface EncryptionService {
  /** 평문 → base64(iv | tag | ciphertext) */
  encrypt(plaintext: string): string;
  /** base64(iv | tag | ciphertext) → 평문. 변조 시 throw */
  decrypt(ciphertext: string): string;
}
