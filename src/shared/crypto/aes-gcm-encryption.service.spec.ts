import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { AesGcmEncryptionService } from './aes-gcm-encryption.service';

describe('AesGcmEncryptionService', () => {
  function makeService(masterKey: string | undefined): AesGcmEncryptionService {
    const config = {
      get: jest.fn().mockReturnValue(masterKey),
    } as unknown as ConfigService;
    return new AesGcmEncryptionService(config);
  }

  function generateKey(): string {
    return randomBytes(32).toString('base64');
  }

  it('round-trips ASCII plaintext', () => {
    const svc = makeService(generateKey());
    const original = 'hello, BlueSafe';
    const ct = svc.encrypt(original);
    expect(ct).not.toEqual(original);
    expect(svc.decrypt(ct)).toEqual(original);
  });

  it('round-trips Unicode plaintext (한국어 + emoji)', () => {
    const svc = makeService(generateKey());
    const original = '임차인: 김철수 / 여권: US123456 / 🔒 secret';
    const ct = svc.encrypt(original);
    expect(svc.decrypt(ct)).toEqual(original);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const svc = makeService(generateKey());
    const ct1 = svc.encrypt('same plaintext');
    const ct2 = svc.encrypt('same plaintext');
    expect(ct1).not.toEqual(ct2);
  });

  it('detects tampered ciphertext (auth tag check)', () => {
    const svc = makeService(generateKey());
    const ct = svc.encrypt('original');
    const buf = Buffer.from(ct, 'base64');
    // 마지막 바이트 1비트 뒤집기 → 변조
    buf[buf.length - 1] ^= 0x01;
    const tampered = buf.toString('base64');
    expect(() => svc.decrypt(tampered)).toThrow();
  });

  it('throws when ENCRYPTION_MASTER_KEY is not configured', () => {
    const svc = makeService(undefined);
    expect(() => svc.encrypt('x')).toThrow(/not configured/);
    expect(() => svc.decrypt('AAAA')).toThrow(/not configured/);
  });

  it('throws when ENCRYPTION_MASTER_KEY length is wrong', () => {
    const svc = makeService(Buffer.from('too-short').toString('base64'));
    expect(() => svc.encrypt('x')).toThrow(/32 bytes/);
  });

  it('throws on ciphertext shorter than IV+TAG', () => {
    const svc = makeService(generateKey());
    expect(() => svc.decrypt('AAAA')).toThrow(/ciphertext too short/);
  });
});
