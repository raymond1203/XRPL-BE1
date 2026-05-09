import type { Client, TxResponse, Wallet } from 'xrpl';
import { SignerListService } from './signer-list.service';
import { XrplClientService } from './xrpl-client.service';

describe('SignerListService', () => {
  let service: SignerListService;
  let mockSubmitAndWait: jest.Mock;
  let mockOwner: Wallet;

  const OWNER = 'rOwnerXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  const SIGNER_1 = 'rSigner1XXXXXXXXXXXXXXXXXXXXXXXXX';
  const SIGNER_2 = 'rSigner2XXXXXXXXXXXXXXXXXXXXXXXXX';
  const SIGNER_3 = 'rSigner3XXXXXXXXXXXXXXXXXXXXXXXXX';

  beforeEach(() => {
    mockSubmitAndWait = jest.fn();
    const mockClient = {
      submitAndWait: mockSubmitAndWait,
    } as unknown as Client;
    const mockXrplClient = {
      getClient: jest.fn().mockReturnValue(mockClient),
    } as unknown as XrplClientService;
    mockOwner = { classicAddress: OWNER } as unknown as Wallet;
    service = new SignerListService(mockXrplClient);
  });

  function makeSuccessResponse(): TxResponse {
    return {
      result: {
        hash: 'C'.repeat(64),
        ledger_index: 200,
        validated: true,
        meta: { TransactionResult: 'tesSUCCESS', AffectedNodes: [] },
      },
    } as unknown as TxResponse;
  }

  it('builds and submits a valid SignerListSet (3-of-3 with quorum 2) using nested SignerEntry wrapping', async () => {
    mockSubmitAndWait.mockResolvedValue(makeSuccessResponse());

    const result = await service.setSignerList({
      account: mockOwner,
      signers: [
        { account: SIGNER_1, weight: 1 },
        { account: SIGNER_2, weight: 1 },
        { account: SIGNER_3, weight: 1 },
      ],
      quorum: 2,
    });

    expect(mockSubmitAndWait).toHaveBeenCalledTimes(1);
    const [tx, opts] = mockSubmitAndWait.mock.calls[0] as [
      Record<string, unknown>,
      { wallet: Wallet },
    ];
    expect(tx.TransactionType).toBe('SignerListSet');
    expect(tx.Account).toBe(OWNER);
    expect(tx.SignerQuorum).toBe(2);

    const entries = tx.SignerEntries as Array<{
      SignerEntry: { Account: string; SignerWeight: number };
    }>;
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({
      SignerEntry: { Account: SIGNER_1, SignerWeight: 1 },
    });
    expect(opts.wallet).toBe(mockOwner);

    expect(result.txHash).toBe('C'.repeat(64));
    expect(result.ledgerIndex).toBe(200);
    expect(result.validated).toBe(true);
  });

  it('throws when signers list is empty', async () => {
    await expect(
      service.setSignerList({ account: mockOwner, signers: [], quorum: 1 }),
    ).rejects.toThrow(/at least one signer/);
    expect(mockSubmitAndWait).not.toHaveBeenCalled();
  });

  it('throws when accounts are duplicated', async () => {
    await expect(
      service.setSignerList({
        account: mockOwner,
        signers: [
          { account: SIGNER_1, weight: 1 },
          { account: SIGNER_1, weight: 1 },
        ],
        quorum: 1,
      }),
    ).rejects.toThrow(/duplicate signer account/);
    expect(mockSubmitAndWait).not.toHaveBeenCalled();
  });

  it('throws when owner is included in signers', async () => {
    await expect(
      service.setSignerList({
        account: mockOwner,
        signers: [
          { account: OWNER, weight: 1 },
          { account: SIGNER_1, weight: 1 },
        ],
        quorum: 1,
      }),
    ).rejects.toThrow(/owner account cannot be in its own SignerList/);
    expect(mockSubmitAndWait).not.toHaveBeenCalled();
  });

  it('throws when quorum exceeds sum of weights', async () => {
    await expect(
      service.setSignerList({
        account: mockOwner,
        signers: [
          { account: SIGNER_1, weight: 1 },
          { account: SIGNER_2, weight: 1 },
        ],
        quorum: 3,
      }),
    ).rejects.toThrow(/quorum \(3\) exceeds sum of signer weights \(2\)/);
    expect(mockSubmitAndWait).not.toHaveBeenCalled();
  });

  it('throws when quorum is zero or negative', async () => {
    await expect(
      service.setSignerList({
        account: mockOwner,
        signers: [{ account: SIGNER_1, weight: 1 }],
        quorum: 0,
      }),
    ).rejects.toThrow(/quorum must be greater than 0/);

    await expect(
      service.setSignerList({
        account: mockOwner,
        signers: [{ account: SIGNER_1, weight: 1 }],
        quorum: -1,
      }),
    ).rejects.toThrow(/quorum must be greater than 0/);
    expect(mockSubmitAndWait).not.toHaveBeenCalled();
  });

  it('throws when transaction result is not tesSUCCESS', async () => {
    mockSubmitAndWait.mockResolvedValue({
      result: {
        hash: 'D'.repeat(64),
        ledger_index: 201,
        meta: { TransactionResult: 'temBAD_QUORUM', AffectedNodes: [] },
      },
    });

    await expect(
      service.setSignerList({
        account: mockOwner,
        signers: [
          { account: SIGNER_1, weight: 1 },
          { account: SIGNER_2, weight: 1 },
          { account: SIGNER_3, weight: 1 },
        ],
        quorum: 2,
      }),
    ).rejects.toThrow(/SignerListSet failed: temBAD_QUORUM/);
  });
});
