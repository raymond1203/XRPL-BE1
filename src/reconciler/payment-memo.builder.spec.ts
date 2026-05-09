import { convertStringToHex } from 'xrpl';
import {
  buildReconcileMemo,
  decodeReconcileMemo,
  sha256Hex,
  type ReconcileMemoPayload,
} from './payment-memo.builder';

describe('payment-memo.builder', () => {
  const samplePayload: ReconcileMemoPayload = {
    contractId: 'contract-uuid-1',
    yearMonth: '2026-04',
    kepcoUsageHash: 'a'.repeat(64),
    landlordClaimHash: 'b'.repeat(64),
    calculatedAmountDrops: '12000',
  };

  describe('sha256Hex', () => {
    it('produces deterministic 64-char hex', () => {
      const h = sha256Hex('hello');
      expect(h).toMatch(/^[0-9a-f]{64}$/);
      expect(sha256Hex('hello')).toBe(h);
    });

    it('produces different hashes for different inputs', () => {
      expect(sha256Hex('hello')).not.toBe(sha256Hex('world'));
    });
  });

  describe('buildReconcileMemo / decodeReconcileMemo round-trip', () => {
    it('encodes then decodes to original payload', () => {
      const memo = buildReconcileMemo(samplePayload);
      const decoded = decodeReconcileMemo(memo.Memo);
      expect(decoded).toEqual(samplePayload);
    });

    it('produces only valid uppercase hex (xrpl.js convertStringToHex 기준)', () => {
      const memo = buildReconcileMemo(samplePayload);
      expect(memo.Memo.MemoType).toMatch(/^[0-9A-F]+$/);
      expect(memo.Memo.MemoFormat).toMatch(/^[0-9A-F]+$/);
      expect(memo.Memo.MemoData).toMatch(/^[0-9A-F]+$/);
    });

    it('encodes MemoType to hex of "reconcile/v1"', () => {
      const memo = buildReconcileMemo(samplePayload);
      expect(memo.Memo.MemoType).toBe(convertStringToHex('reconcile/v1'));
    });
  });

  describe('buildReconcileMemo size limits', () => {
    it('throws when payload exceeds 1KB', () => {
      const big: ReconcileMemoPayload = {
        ...samplePayload,
        contractId: 'x'.repeat(2000),
      };
      expect(() => buildReconcileMemo(big)).toThrow(/too large/);
    });
  });

  describe('decodeReconcileMemo validation', () => {
    it('throws on unexpected MemoType', () => {
      const wrong = {
        MemoType: convertStringToHex('wrong/v1'),
        MemoFormat: convertStringToHex('application/json'),
        MemoData: convertStringToHex(JSON.stringify(samplePayload)),
      };
      expect(() => decodeReconcileMemo(wrong)).toThrow(/Unexpected MemoType/);
    });
  });
});
