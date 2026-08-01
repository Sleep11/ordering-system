export function formatPrice(price) {
  const num = parseFloat(price)
  if (isNaN(num)) return '¥0.00'
  return '¥' + num.toFixed(2)
}

export function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function getOrderPrice(order) {
  return parseFloat(order.price) || 0
}

export function getOrderDiscount(order, lunchSelfPick, dinnerSelfPick) {
  if (typeof order.discount === 'number') return order.discount
  const today = new Date(new Date().getTime() + 8 * 3600 * 1000).toISOString().split('T')[0]
  if (order.date === today && order.mealType === 'lunch' && lunchSelfPick) return 1
  if (order.date === today && order.mealType === 'dinner' && dinnerSelfPick) return 1
  return 0
}

export function getOrderReceivable(order, lunchSP, dinnerSP) {
  if (typeof order.receivable === 'number') return order.receivable
  return Math.max(0, getOrderPrice(order) - getOrderDiscount(order, lunchSP, dinnerSP))
}

export function getOrderActual(order) {
  if (typeof order.actual === 'number') return order.actual
  return order.paid ? (parseFloat(order.price) || 0) : 0
}

export function getOrderRefund(order, lunchSP, dinnerSP) {
  if (typeof order.refund === 'number') return order.refund
  return order.paid ? getOrderDiscount(order, lunchSP, dinnerSP) : 0
}

export function getOrderItems(order) {
  if (Array.isArray(order.items) && order.items.length > 0) return order.items
  return [{
    menuId: order.menuId || '',
    name: order.itemName || '未知',
    price: parseFloat(order.price) || 0,
    quantity: 1
  }]
}

export function getMealSummary(orders) {
  const counts = {}
  for (const o of orders) {
    const items = getOrderItems(o)
    for (const item of items) {
      const key = item.name
      counts[key] = (counts[key] || 0) + (item.quantity || 1)
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, qty]) => name + (qty > 1 ? '×' + qty : ''))
    .join('、')
}
