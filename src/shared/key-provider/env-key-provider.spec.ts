import { ConfigService } from '@nestjs/config';
import { Wallet } from 'xrpl';
import { EnvKeyProvider } from './env-key-provider';

describe('EnvKeyProvider', () => {
  // 테스트 실행마다 신규 Testnet 시드 생성 (xrpl.js Wallet.generate 사용)
  const TEST_SEED = Wallet.generate().seed!;

  function makeProvider(seedValue: string | undefined): EnvKeyProvider {
    const config = {
      get: jest.fn().mockReturnValue(seedValue),
    } as unknown as ConfigService;
    return new EnvKeyProvider(config);
  }

  it('returns a Wallet for operator when seed is configured', async () => {
    const provider = makeProvider(TEST_SEED);
    const wallet = await provider.getWallet('operator');
    expect(wallet.classicAddress).toMatch(/^r/);
  });

  it('throws when seed is empty string', async () => {
    const provider = makeProvider('');
    await expect(provider.getWallet('operator')).rejects.toThrow(/No seed/);
  });

  it('throws when seed is undefined', async () => {
    const provider = makeProvider(undefined);
    await expect(provider.getWallet('operator')).rejects.toThrow(/No seed/);
  });

  it('throws for unknown walletId', async () => {
    const provider = makeProvider(TEST_SEED);
    await expect(provider.getWallet('unknown')).rejects.toThrow(
      /Unknown walletId/,
    );
  });
});
