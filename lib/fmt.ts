/**
 * Format a date string (YYYY-MM-DD or ISO) as MM/DD/YYYY.
 * Uses string splitting — no timezone issues.
 */
export function fmtDate(dateStr: string): string {
  const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const [year, month, day] = datePart.split('-');
  return `${month}/${day}/${year}`;
}

/**
 * Texto limpio para mostrar/guardar. Devuelve '' cuando el valor es nulo, vacío
 * o el LITERAL "null"/"undefined" — algunos registros viejos (importados) guardaron
 * esas palabras como texto, y así nunca se imprimen en facturas ni se re-guardan.
 */
export function cleanStr(v: unknown): string {
  const s = String(v ?? '').trim();
  const low = s.toLowerCase();
  return low === 'null' || low === 'undefined' ? '' : s;
}
