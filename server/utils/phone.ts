/** Return the canonical digits-only WhatsApp phone representation. */
export function normalizePhoneNumber(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '').replace(/^00/, '');
  return digits.length === 10 && /^[6-9]/.test(digits) ? `91${digits}` : digits;
}
