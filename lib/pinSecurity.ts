import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const FORMAT = 'scrypt';

function toHex(input: Buffer) {
  return input.toString('hex');
}

function fromHex(input: string) {
  return Buffer.from(input, 'hex');
}

export function isHashedPin(storedPin: string) {
  return storedPin.startsWith(`${FORMAT}$`);
}

export function hashPin(pin: string) {
  const salt = randomBytes(16);
  const derived = scryptSync(pin, salt, 64);
  return `${FORMAT}$${toHex(salt)}$${toHex(derived)}`;
}

export function verifyPin(pin: string, storedPin: string) {
  if (!isHashedPin(storedPin)) {
    // Backward-compatible for legacy rows. Caller may upgrade this value after successful auth.
    return pin === storedPin;
  }

  const parts = storedPin.split('$');
  if (parts.length !== 3) return false;

  const salt = fromHex(parts[1]);
  const expected = fromHex(parts[2]);
  const actual = scryptSync(pin, salt, expected.length);

  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
