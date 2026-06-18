// Utilidades de dinero en centavos para evitar errores de coma flotante.
//
// Problema que resuelven: `((amount * pct) / 100).toFixed(2)` opera sobre un
// número binario. Un caso como 39.99 × 50% = 19.995 se representa como
// 19.99499… y toFixed lo redondea HACIA ABAJO a 19.99 en vez de 20.00, por lo
// que el mecánico pierde un centavo "a veces" (solo cuando cae un medio-centavo).

/** Redondea un monto a centavos de forma estable (2 decimales). */
export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Pago al mecánico = monto × porcentaje, redondeado a centavos.
 *
 * Trabaja sobre el monto convertido a CENTAVOS ENTEROS antes de aplicar el
 * porcentaje, de modo que los medios-centavos (x.xx5) redondeen correctamente
 * hacia arriba (20.00, no 19.99). Acepta string o number.
 */
export function computePayout(amount: number | string, pct: number | string): number {
  const amountCents = Math.round((parseFloat(String(amount)) || 0) * 100);
  const p = parseFloat(String(pct)) || 0;
  return Math.round((amountCents * p) / 100) / 100;
}
