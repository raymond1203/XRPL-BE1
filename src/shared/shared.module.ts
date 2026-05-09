import { Module } from '@nestjs/common';

/**
 * 도메인 모듈 간 공통 인프라(KeyProvider 추상화, 암호화 헬퍼 등) 보관.
 * 후속 작업에서 KeyProvider 등을 providers/exports에 등록 예정.
 */
@Module({})
export class SharedModule {}
