// 中国时区 (UTC+8) 日期工具
export function getChinaDate() {
  const now = new Date()
  const chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  return chinaTime.toISOString().split('T')[0]
}

export function formatDate(dateStr) {
  const parts = dateStr.split('-')
  return parts[0] + '年' + parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日'
}

export function getDayOfWeek(dateStr) {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const d = new Date(dateStr + 'T12:00:00+08:00')
  return days[d.getDay()]
}

export function getChinaHourMin() {
  const now = new Date()
  const h = (now.getUTCHours() + 8) % 24
  const m = now.getUTCMinutes()
  return { hour: h, minute: m, totalMin: h * 60 + m }
}

export function getChinaDateRange(offsetDays = 0) {
  const now = new Date()
  const chinaTs = now.getTime() + 8 * 60 * 60 * 1000
  const d = new Date(chinaTs + offsetDays * 24 * 60 * 60 * 1000)
  return d.toISOString().split('T')[0]
}
