import { Injectable, Logger } from '@nestjs/common';
import type { SignerListSet, TxResponse, Wallet } from 'xrpl';
import { XrplClientService } from './xrpl-client.service';

export interface SignerSpec {
  /** signer 계정 classic address */
  account: string;
  /** signer weight (1-65535) */
  weight: number;
  /** WalletLocator (선택, 32바이트 hex) */
  walletLocator?: string;
}

export interface SetSignerListParams {
  /** SignerList의 owner — 이 트랜잭션의 서명자 */
  account: Wallet;
  /** 1-32명 */
  signers: SignerSpec[];
  /** Σ(weights) 이하의 양수 */
  quorum: number;
}

export interface SignerListSetResult {
  txHash: string;
  ledgerIndex: number;
  validated: boolean;
}

@Injectable()
export class SignerListService {
  private readonly logger = new Logger(SignerListService.name);
  private static readonly MAX_SIGNERS = 32;
  private static readonly MIN_WEIGHT = 1;
  private static readonly MAX_WEIGHT = 65535;

  constructor(private readonly xrplClient: XrplClientService) {}

  async setSignerList(
    params: SetSignerListParams,
  ): Promise<SignerListSetResult> {
    this.validateParams(params);

    const tx: SignerListSet = {
      TransactionType: 'SignerListSet',
      Account: params.account.classicAddress,
      SignerQuorum: params.quorum,
      SignerEntries: params.signers.map((s) => ({
        SignerEntry: {
          Account: s.account,
          SignerWeight: s.weight,
          ...(s.walletLocator ? { WalletLocator: s.walletLocator } : {}),
        },
      })),
    };

    const client = this.xrplClient.getClient();
    const response = await client.submitAndWait(tx, { wallet: params.account });
    const result = this.assertSuccess(response);

    this.logger.log(
      `SignerListSet OK: hash=${result.txHash} signers=${params.signers.length} quorum=${params.quorum}`,
    );
    return result;
  }

  private validateParams(params: SetSignerListParams): void {
    const { account, signers, quorum } = params;

    if (signers.length === 0) {
      throw new Error('SignerListSet requires at least one signer');
    }
    if (signers.length > SignerListService.MAX_SIGNERS) {
      throw new Error(
        `SignerListSet supports up to ${SignerListService.MAX_SIGNERS} signers (got ${signers.length})`,
      );
    }
    if (quorum <= 0) {
      throw new Error('quorum must be greater than 0');
    }

    const seen = new Set<string>();
    let totalWeight = 0;
    for (const s of signers) {
      if (
        s.weight < SignerListService.MIN_WEIGHT ||
        s.weight > SignerListService.MAX_WEIGHT
      ) {
        throw new Error(
          `signer weight out of range: ${s.weight} (must be ${SignerListService.MIN_WEIGHT}-${SignerListService.MAX_WEIGHT})`,
        );
      }
      if (s.account === account.classicAddress) {
        throw new Error('owner account cannot be in its own SignerList');
      }
      if (seen.has(s.account)) {
        throw new Error(`duplicate signer account: ${s.account}`);
      }
      seen.add(s.account);
      totalWeight += s.weight;
    }

    if (quorum > totalWeight) {
      throw new Error(
        `quorum (${quorum}) exceeds sum of signer weights (${totalWeight})`,
      );
    }
  }

  private assertSuccess(
    response: TxResponse<SignerListSet>,
  ): SignerListSetResult {
    const result = response.result;
    const meta = result.meta;
    if (typeof meta !== 'object' || meta === null) {
      throw new Error('SignerListSet not validated: meta missing or string');
    }
    if (meta.TransactionResult !== 'tesSUCCESS') {
      throw new Error(`SignerListSet failed: ${meta.TransactionResult}`);
    }

    const ledger = Number(result.ledger_index);
    if (!Number.isFinite(ledger)) {
      throw new Error('SignerListSet response missing ledger_index');
    }

    return {
      txHash: result.hash,
      ledgerIndex: ledger,
      validated: result.validated ?? false,
    };
  }
}
