import { Global, Module } from '@nestjs/common';
import { AesGcmEncryptionService } from './crypto/aes-gcm-encryption.service';
import { ENCRYPTION_SERVICE } from './crypto/encryption.interface';
import { EnvKeyProvider } from './key-provider/env-key-provider';
import { KEY_PROVIDER } from './key-provider/key-provider.interface';

/**
 * 도메인 모듈 간 공통 인프라.
 * - KEY_PROVIDER: XRPL Wallet 시드 보관 (Env / 본선 KMS)
 * - ENCRYPTION_SERVICE: PII 컬럼 AES-256-GCM 대칭 암호화
 *
 * @Global() — cross-cutting (Xrpl/Contracts/Reconciler 모두 사용)
 */
@Global()
@Module({
  providers: [
    { provide: KEY_PROVIDER, useClass: EnvKeyProvider },
    { provide: ENCRYPTION_SERVICE, useClass: AesGcmEncryptionService },
  ],
  exports: [KEY_PROVIDER, ENCRYPTION_SERVICE],
})
export class SharedModule {}
