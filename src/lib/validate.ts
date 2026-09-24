export const MIN_PASSWORD_LENGTH = 6;

/** Deliberately loose: the confirmation email is the real check. */
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function isPasswordLongEnough(value: string): boolean {
  return value.length >= MIN_PASSWORD_LENGTH;
}
