import { Module } from '@nestjs/common';

/**
 * XRPL 트랜잭션 모듈 (W5).
 * - EscrowCreate (보증금) / EscrowCreate (임대인 Stake) / SignerListSet
 * - 후속 작업에서 XrplClientService, EscrowService, SignerListService 등 추가
 */
@Module({})
export class XrplModule {}
