import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Wallet } from 'xrpl';
import type { KeyProvider } from './key-provider.interface';

@Injectable()
export class EnvKeyProvider implements KeyProvider {
  constructor(private readonly config: ConfigService) {}

  getWallet(walletId: string): Promise<Wallet> {
    try {
      const envKey = this.envKeyFor(walletId);
      const seed = this.config.get<string>(envKey);
      if (!seed) {
        throw new Error(
          `No seed configured for walletId='${walletId}' (env: ${envKey})`,
        );
      }
      return Promise.resolve(Wallet.fromSeed(seed));
    } catch (err) {
      return Promise.reject(err as Error);
    }
  }

  private envKeyFor(walletId: string): string {
    switch (walletId) {
      case 'operator':
        return 'XRPL_OPERATOR_SEED';
      // 후속 추가 예정: 'issuer' → XRPL_ISSUER_SEED 등
      default:
        throw new Error(`Unknown walletId: ${walletId}`);
    }
  }
}
