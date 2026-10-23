export function maskPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) throw new Error("Phone number must contain 10–15 digits.");
  const country = digits.slice(0, -10) || "91";
  const local = digits.slice(-10);
  return '+' + country + ' ' + local.slice(0,2) + '******' + local.slice(-2);
}
