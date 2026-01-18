export type DebeziumSource = {
  version: string
  connector: string
  name: string
  ts_ms: number
  snapshot: string | boolean
  db: string
  sequence?: string
  ts_us?: number
  ts_ns?: number
  schema: string
  table: string
  txId?: number
  lsn?: number
  xmin?: number | null
}

export type DebeziumChangeEvent<T extends Record<string, unknown> = {}> = {
  before: T | null
  after: T | null
  source: DebeziumSource
  transaction: unknown | null
  op: DebeziumShortEventType
  ts_ms: number
  ts_us?: number
  ts_ns?: number
}

export type DebeziumShortEventType = 'c' | 'u' | 'd'

export type ParsedStreamEntry<T extends Record<string, unknown> = {}> = {
  key: {
    id: number
  }

  value: DebeziumChangeEvent<T>
}

export type XReadGroupResponse = [stream: string, entries: StreamEntry[]][]

export type StreamEntry = [id: string, keyValuePairs: [string, string]]

export type XAutoClaimResult = [nextStartId: string, messages: StreamMessage[]]

export type StreamMessage = [id: string, fields: [key: string, value: string][]]
