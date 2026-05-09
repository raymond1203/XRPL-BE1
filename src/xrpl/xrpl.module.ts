import { Module } from '@nestjs/common';
import { EscrowService } from './escrow.service';
import { XrplClientService } from './xrpl-client.service';

/**
 * XRPL 트랜잭션 모듈 (W5).
 * - XrplClientService: xrpl.js Client lifecycle 관리 (connect/disconnect)
 * - EscrowService: EscrowCreate 빌더/제출 (보증금/Stake용 generic)
 * - 후속: SignerListService (3자 멀티시그), EscrowFinish/Cancel
 */
@Module({
  providers: [XrplClientService, EscrowService],
  exports: [XrplClientService, EscrowService],
})
export class XrplModule {}
