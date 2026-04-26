/**
 * Format a date string (YYYY-MM-DD or ISO) as MM/DD/YYYY.
 * Uses string splitting — no timezone issues.
 */
export function fmtDate(dateStr: string): string {
  const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const [year, month, day] = datePart.split('-');
  return `${month}/${day}/${year}`;
}
