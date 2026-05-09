import { Module } from '@nestjs/common';
import { XrplClientService } from './xrpl-client.service';

/**
 * XRPL 트랜잭션 모듈 (W5).
 * - XrplClientService: xrpl.js Client lifecycle 관리 (connect/disconnect)
 * - 후속: EscrowService (보증금/Stake EscrowCreate), SignerListService (3자 멀티시그)
 */
@Module({
  providers: [XrplClientService],
  exports: [XrplClientService],
})
export class XrplModule {}
