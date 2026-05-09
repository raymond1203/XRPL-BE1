import { Injectable, Logger } from '@nestjs/common';
import { EscrowCreate, TxResponse, Wallet, isoTimeToRippleTime } from 'xrpl';
import { XrplClientService } from './xrpl-client.service';

export interface CreateEscrowParams {
  /** 송신자/서명자 — Account 필드와 서명에 사용됨 */
  account: Wallet;
  /** 수취 계정 classic address */
  destination: string;
  /** drops 단위 (XRP만; ADR-001 예선 결정) */
  amount: string;
  /** 정상 해제 가능 시점 */
  finishAfter?: Date;
  /** 자동 환불 시점 */
  cancelAfter?: Date;
  /** PREIMAGE-SHA-256 condition (선택) */
  condition?: string;
  /** 수취 측 DestinationTag (필요 시) */
  destinationTag?: number;
}

export interface EscrowCreatedResult {
  /** EscrowCreate 트랜잭션 hash (64자 hex) */
  txHash: string;
  /** EscrowFinish/Cancel 시 OfferSequence로 사용할 값 */
  escrowSequence: number;
  /** 검증된 ledger index */
  ledgerIndex: number;
  /** XRPL이 검증 완료했는지 */
  validated: boolean;
}

@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);

  constructor(private readonly xrplClient: XrplClientService) {}

  async createEscrow(params: CreateEscrowParams): Promise<EscrowCreatedResult> {
    this.validateParams(params);

    const tx: EscrowCreate = {
      TransactionType: 'EscrowCreate',
      Account: params.account.classicAddress,
      Destination: params.destination,
      Amount: params.amount,
    };

    if (params.finishAfter) {
      tx.FinishAfter = isoTimeToRippleTime(params.finishAfter.toISOString());
    }
    if (params.cancelAfter) {
      tx.CancelAfter = isoTimeToRippleTime(params.cancelAfter.toISOString());
    }
    if (params.condition) {
      tx.Condition = params.condition;
    }
    if (params.destinationTag !== undefined) {
      tx.DestinationTag = params.destinationTag;
    }

    const client = this.xrplClient.getClient();
    const response = await client.submitAndWait(tx, { wallet: params.account });
    return this.assertSuccess(response);
  }

  private validateParams(params: CreateEscrowParams): void {
    if (!params.finishAfter && !params.cancelAfter && !params.condition) {
      throw new Error(
        'EscrowCreate requires at least one of: finishAfter, cancelAfter, condition',
      );
    }
    if (
      params.finishAfter &&
      params.cancelAfter &&
      params.cancelAfter.getTime() <= params.finishAfter.getTime()
    ) {
      throw new Error('cancelAfter must be later than finishAfter');
    }
  }

  private assertSuccess(
    response: TxResponse<EscrowCreate>,
  ): EscrowCreatedResult {
    const result = response.result;
    const meta = result.meta;
    if (typeof meta !== 'object' || meta === null) {
      throw new Error('EscrowCreate not validated: meta missing or string');
    }
    if (meta.TransactionResult !== 'tesSUCCESS') {
      throw new Error(`EscrowCreate failed: ${meta.TransactionResult}`);
    }

    // xrpl.js TxResponse 제네릭 타입이 BaseTransaction 필드를 any로 흘려서
    // Number() 코어션으로 안전하게 number로 narrowing.
    const seq = Number(result.Sequence);
    const ledger = Number(result.ledger_index);
    if (!Number.isFinite(seq) || !Number.isFinite(ledger)) {
      throw new Error(
        'EscrowCreate validated response missing Sequence/ledger_index',
      );
    }

    this.logger.log(`EscrowCreate OK: hash=${result.hash} seq=${seq}`);

    return {
      txHash: result.hash,
      escrowSequence: seq,
      ledgerIndex: ledger,
      validated: result.validated ?? false,
    };
  }
}
