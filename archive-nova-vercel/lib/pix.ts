function stripAccents(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function sanitize(value: string, max: number) {
  return stripAccents(value)
    .toUpperCase()
    .replace(/[^A-Z0-9 .\-]/g, '')
    .trim()
    .slice(0, max)
}

function tlv(id: string, value: string) {
  return `${id}${String(value.length).padStart(2, '0')}${value}`
}

function crc16(payload: string) {
  let crc = 0xffff
  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) : (crc << 1)
      crc &= 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function buildPixPayload({
  key,
  receiverName,
  city,
  description = 'APOIO ARCHIVENOVA',
  txid = 'ARCHIVENOVA',
  amount,
}: {
  key: string
  receiverName: string
  city: string
  description?: string
  txid?: string
  amount?: number | null
}) {
  const merchantAccount = tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', key.trim()) + (description ? tlv('02', sanitize(description, 72)) : '')
  const amountField = typeof amount === 'number' && amount > 0 ? tlv('54', amount.toFixed(2)) : ''
  const additional = tlv('05', sanitize(txid || '***', 25) || '***')
  const base = [
    tlv('00', '01'),
    tlv('26', merchantAccount),
    tlv('52', '0000'),
    tlv('53', '986'),
    amountField,
    tlv('58', 'BR'),
    tlv('59', sanitize(receiverName || 'ARCHIVENOVA', 25) || 'ARCHIVENOVA'),
    tlv('60', sanitize(city || 'BRASIL', 15) || 'BRASIL'),
    tlv('62', additional),
  ].join('')
  const withCrcHeader = `${base}6304`
  return `${withCrcHeader}${crc16(withCrcHeader)}`
}
