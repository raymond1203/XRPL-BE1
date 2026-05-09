import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from 'node:crypto';
import type { EncryptionService } from './encryption.interface';

/**
 * AES-256-GCM (인증된 암호화).
 * 패키지 형식: base64( IV(12B) | TAG(16B) | CIPHERTEXT )
 *
 * 키 누락 / 키 길이 오류는 lazy 검증 — 부팅은 통과시키고
 * 첫 encrypt/decrypt 호출 시점에 throw (XRPL_OPERATOR_SEED와 동일 패턴).
 */
@Injectable()
export class AesGcmEncryptionService implements EncryptionService {
  private static readonly IV_BYTES = 12;
  private static readonly TAG_BYTES = 16;
  private static readonly KEY_BYTES = 32;
  private static readonly ALGORITHM = 'aes-256-gcm';

  private readonly key: Buffer | null;
  private readonly initError: string | null;

  constructor(config: ConfigService) {
    const masterKey = config.get<string>('ENCRYPTION_MASTER_KEY');
    if (!masterKey) {
      this.key = null;
      this.initError = 'ENCRYPTION_MASTER_KEY is not configured';
      return;
    }
    const decoded = Buffer.from(masterKey, 'base64');
    if (decoded.length !== AesGcmEncryptionService.KEY_BYTES) {
      this.key = null;
      this.initError = `ENCRYPTION_MASTER_KEY must be ${AesGcmEncryptionService.KEY_BYTES} bytes base64 (got ${decoded.length} bytes)`;
      return;
    }
    this.key = decoded;
    this.initError = null;
  }

  encrypt(plaintext: string): string {
    const key = this.requireKey();
    const iv = randomBytes(AesGcmEncryptionService.IV_BYTES);
    const cipher: CipherGCM = createCipheriv(
      AesGcmEncryptionService.ALGORITHM,
      key,
      iv,
    );
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]).toString('base64');
  }

  decrypt(packaged: string): string {
    const key = this.requireKey();
    const buf = Buffer.from(packaged, 'base64');
    if (
      buf.length <
      AesGcmEncryptionService.IV_BYTES + AesGcmEncryptionService.TAG_BYTES
    ) {
      throw new Error('ciphertext too short');
    }
    const iv = buf.subarray(0, AesGcmEncryptionService.IV_BYTES);
    const tag = buf.subarray(
      AesGcmEncryptionService.IV_BYTES,
      AesGcmEncryptionService.IV_BYTES + AesGcmEncryptionService.TAG_BYTES,
    );
    const ciphertext = buf.subarray(
      AesGcmEncryptionService.IV_BYTES + AesGcmEncryptionService.TAG_BYTES,
    );
    const decipher: DecipherGCM = createDecipheriv(
      AesGcmEncryptionService.ALGORITHM,
      key,
      iv,
    );
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new Error(this.initError ?? 'encryption key not initialized');
    }
    return this.key;
  }
}
