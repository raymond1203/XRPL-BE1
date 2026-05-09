import { Global, Module } from '@nestjs/common';
import { EnvKeyProvider } from './key-provider/env-key-provider';
import { KEY_PROVIDER } from './key-provider/key-provider.interface';

/**
 * 도메인 모듈 간 공통 인프라(KeyProvider, 암호화 헬퍼 등) 보관.
 * @Global() — 매 모듈에서 imports 반복하지 않게 (cross-cutting 용도)
 */
@Global()
@Module({
  providers: [
    {
      provide: KEY_PROVIDER,
      useClass: EnvKeyProvider,
    },
  ],
  exports: [KEY_PROVIDER],
})
export class SharedModule {}
