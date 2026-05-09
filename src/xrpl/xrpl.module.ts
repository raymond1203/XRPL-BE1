import { Module } from '@nestjs/common';
import { EscrowService } from './escrow.service';
import { SignerListService } from './signer-list.service';
import { XrplClientService } from './xrpl-client.service';

/**
 * XRPL 트랜잭션 모듈 (W5).
 * - XrplClientService: xrpl.js Client lifecycle 관리
 * - EscrowService: EscrowCreate 빌더/제출 (보증금/Stake용 generic)
 * - SignerListService: SignerListSet 빌더/제출 (3자 멀티시그)
 * - 후속: EscrowFinish/Cancel, asfDisableMaster, Multisign 트랜잭션
 */
@Module({
  providers: [XrplClientService, EscrowService, SignerListService],
  exports: [XrplClientService, EscrowService, SignerListService],
})
export class XrplModule {}
