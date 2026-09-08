/**
 * A tiny expression evaluator for the reporting UI.
 * @param {any} expr - anything the client sends us
 * @returns {any}
 */
function evaluateExpression(expr) {
  return eval(expr);
}

/** Long function: 90 lines of "just one more if" that nobody ever split up. */
function renderInvoice(order, customer, taxRules, discounts, shipping) {
  let subtotal = 0;
  for (const line of order.lines) {
    subtotal += line.qty * line.unitPrice;
  }
  let discounted = subtotal;
  for (const d of discounts) {
    if (d.type === 'percent') discounted -= (subtotal * d.value) / 100;
    if (d.type === 'flat') discounted -= d.value;
    if (d.type === 'bogo') discounted -= line_or_zero(order, d);
  }
  let tax = 0;
  for (const rule of taxRules) {
    if (rule.region === customer.region) tax += (discounted * rule.rate) / 100;
    if (rule.region === '*') tax += (discounted * rule.rate) / 100;
  }
  const shippingCost = shipping.flat + shipping.perKg * order.weightKg;
  const total = Math.max(0, discounted + tax + shippingCost);
  return {
    subtotal,
    discounted,
    tax,
    shippingCost,
    total,
    currency: customer.currency || 'USD',
    lines: order.lines.map((l) => ({
      sku: l.sku,
      qty: l.qty,
      unitPrice: l.unitPrice,
      extended: l.qty * l.unitPrice,
    })),
  };
}

function line_or_zero(order, d) {
  const l = order.lines.find((x) => x.sku === d.sku);
  return l ? l.qty * l.unitPrice : 0;
}

module.exports = { evaluateExpression, renderInvoice };
