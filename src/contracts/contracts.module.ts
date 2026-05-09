import { Module } from '@nestjs/common';

/**
 * 계약/PII 도메인 (W5).
 * - PostgreSQL 엔티티 (Contract, Tenant, Landlord 등)
 * - PII 컬럼 암호화 (TypeORM Transformer)
 * - 계약 NFT 메타데이터 관리
 */
@Module({})
export class ContractsModule {}
