/* eslint-disable */

import type { SchemaDef, GetModels } from '@zenstackhq/schema'
import type { WhereInput, SimplifiedPlainResult, ClientContract } from '@zenstackhq/orm'
import { parse } from 'lossless-json'
import { Redis } from 'ioredis'
import Decimal from 'decimal.js'
import hash from 'stable-hash'
import type { XReadGroupResponse, DebeziumShortEventType } from './internal'
import { EventDiscriminator } from './discriminator'

const operationMap: Record<DebeziumShortEventType, DatabaseEventType> = {
  c: 'created',
  u: 'updated',
  d: 'deleted',
}

export type DatabaseEventType = 'created' | 'updated' | 'deleted'

export type LiveStreamOptions<Schema extends SchemaDef, ModelName extends GetModels<Schema>> = {
  model: ModelName
  redis: Redis
  client: ClientContract<Schema>
  id: string
  clientId: string
  created?: WhereInput<Schema, ModelName, true>
  updated?: {
    before?: WhereInput<Schema, ModelName, true>
    after?: WhereInput<Schema, ModelName, true>
  }
  deleted?: WhereInput<Schema, ModelName, true>
}

export type RecordCreatedEvent<Schema extends SchemaDef, ModelName extends GetModels<Schema>> = {
  type: 'created'
  id: string
  transactionId: string
  date: Date
  created: SimplifiedPlainResult<Schema, ModelName>
}

export type RecordUpdatedEvent<Schema extends SchemaDef, ModelName extends GetModels<Schema>> = {
  type: 'updated'
  id: string
  transactionId: string
  date: Date
  updated: {
    before: SimplifiedPlainResult<Schema, ModelName>
    after: SimplifiedPlainResult<Schema, ModelName>
  }
}

export type RecordDeletedEvent<Schema extends SchemaDef, ModelName extends GetModels<Schema>> = {
  type: 'deleted'
  id: string
  transactionId: string
  date: Date
  deleted: SimplifiedPlainResult<Schema, ModelName>
}

export type RecordEvent<Schema extends SchemaDef, ModelName extends GetModels<Schema>> =
  | RecordCreatedEvent<Schema, ModelName>
  | RecordUpdatedEvent<Schema, ModelName>
  | RecordDeletedEvent<Schema, ModelName>

export type RecordResultMap<Schema extends SchemaDef, ModelName extends GetModels<Schema>> = {
  created: RecordCreatedEvent<Schema, ModelName>
  updated: RecordUpdatedEvent<Schema, ModelName>
  deleted: RecordDeletedEvent<Schema, ModelName>
}

export type ExtractRequestedEvents<
  Schema extends SchemaDef,
  ModelName extends GetModels<Schema>,
  Opts,
> =
  | (Opts extends { created: any } ? RecordCreatedEvent<Schema, ModelName> : never)
  | (Opts extends { updated: any } ? RecordUpdatedEvent<Schema, ModelName> : never)
  | (Opts extends { deleted: any } ? RecordDeletedEvent<Schema, ModelName> : never)

export type RequestedEvents<Schema extends SchemaDef, ModelName extends GetModels<Schema>, Opts> = [
  ExtractRequestedEvents<Schema, ModelName, Opts>,
] extends [never]
  ? RecordEvent<Schema, ModelName>
  : ExtractRequestedEvents<Schema, ModelName, Opts>

export type PickStreamFilters<Schema extends SchemaDef, ModelName extends GetModels<Schema>> = {
  created?: WhereInput<Schema, ModelName, true>
  updated?: {
    before?: WhereInput<Schema, ModelName, true>
    after?: WhereInput<Schema, ModelName, true>
  }
  deleted?: WhereInput<Schema, ModelName, true>
}

export type ZenStackLiveOptions<Schema extends SchemaDef> = {
  client: ClientContract<Schema>

  /**
   * This client's unique ID. Used for horizontal scaling.
   */
  id?: string

  redis: {
    url: string
  }
}

export class LiveStream<
  Schema extends SchemaDef,
  ModelName extends GetModels<Schema>,
  Opts = unknown,
> implements AsyncIterable<RequestedEvents<Schema, ModelName, Opts>> {
  private readonly options: LiveStreamOptions<Schema, ModelName>
  private readonly modelName: ModelName
  private readonly streamName: string
  private readonly consumerName: string
  private readonly consumerGroupName: string
  private readonly discriminator: EventDiscriminator<Schema, ModelName>

  constructor(options: LiveStreamOptions<Schema, ModelName>) {
    const hashed = hash({
      id: options.id,
      created: options.created,
      updated: options.updated,
      deleted: options.deleted,
    })

    this.options = options
    this.modelName = options.model
    this.streamName = `zenstack.table.public.${this.modelName}`
    this.consumerName = `zenstack.${options.clientId}`
    this.consumerGroupName = `zenstack.table.public.${this.modelName}.${hashed}`
    this.discriminator = new EventDiscriminator(options)
  }

  private async alterTable() {
    await this.options.client.$queryRawUnsafe(
      `ALTER TABLE "${this.modelName}" REPLICA IDENTITY FULL`,
    )
  }

  private async makeConsumerGroup() {
    try {
      await this.options.redis.xgroup(
        'CREATE',
        this.streamName,
        this.consumerGroupName,
        '$',
        'MKSTREAM',
      )
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('BUSYGROUP Consumer Group name already exists')
      ) {
        return
      }

      throw error
    }
  }

  private async acknowledgeEvent(eventId: string) {
    await this.options.redis
      .multi()
      .xack(this.streamName, this.consumerGroupName, eventId)
      .xdel(this.streamName, eventId)
      .exec()
  }

  private parseJson<T>(json: string) {
    return parse(json, undefined, {
      parseNumber: value => {
        return value
      },
    }) as T
  }

  private async sleep(ms: number) {
    await new Promise(resolve => setTimeout(resolve, ms))
  }

  async *[Symbol.asyncIterator](): AsyncIterator<RequestedEvents<Schema, ModelName, Opts>> {
    await Promise.all([this.makeConsumerGroup(), this.alterTable()])

    while (this.options.redis.status === 'ready') {
      const events = await this.getLatestEvents()

      if (events.length === 0) {
        await this.sleep(1000)
      }

      for (const event of events) {
        if (!this.discriminator.eventMatchesWhere(event)) {
          continue
        }

        yield event as unknown as RequestedEvents<Schema, ModelName, Opts>

        await this.acknowledgeEvent(event.id)
      }
    }
  }

  private hydratePayload(payload: any) {
    for (const [fieldName, field] of Object.entries(
      this.options.client.$schema.models[this.modelName]!.fields,
    )) {
      if (field.relation) {
        continue
      }

      if ([null, undefined, NaN].includes(payload[fieldName])) {
        payload[fieldName] = null
      }

      if (payload[fieldName] !== null) {
        switch (field.type) {
          case 'BigInt':
            payload[fieldName] = field.array
              ? (payload[fieldName] as string[]).map(value => BigInt(value))
              : BigInt(payload[fieldName])
            break
          case 'Int':
            payload[fieldName] = field.array
              ? (payload[fieldName] as string[]).map(value => Number(value))
              : Number(payload[fieldName])
            break
          case 'Decimal':
            payload[fieldName] = field.array
              ? (payload[fieldName] as string[]).map(value => Decimal(value))
              : Decimal(payload[fieldName])
            break
          case 'DateTime':
            payload[fieldName] = field.array
              ? (payload[fieldName] as string[]).map(value => new Date(Number(value) / 1000))
              : new Date(Number(payload[fieldName]) / 1000)
            break
          case 'Float':
            payload[fieldName] = field.array
              ? (payload[fieldName] as string[]).map(value => parseFloat(value))
              : parseFloat(payload[fieldName])
            break
          case 'Bytes':
            throw new Error(`Field "${fieldName}" has an unsupported type ("${field.type}")`)
        }
      }
    }
  }

  private async getLatestEvents() {
    const events: RecordEvent<Schema, ModelName>[] = []
    const xReadGroupResponse = (await this.options.redis.xreadgroup(
      'GROUP',
      this.consumerGroupName,
      this.consumerName,
      'COUNT',
      5,
      'BLOCK',
      0,
      'STREAMS',
      this.streamName,
      '>',
    )) as XReadGroupResponse | null

    if (xReadGroupResponse) {
      for (const [, entries] of xReadGroupResponse) {
        for (const [eventId, fields] of entries) {
          const [, eventJson] = fields

          if (eventJson === 'default') {
            continue
          }

          let event = this.parseJson<any>(eventJson)

          if (!event) {
            continue
          }

          const operation = operationMap[event.op as DebeziumShortEventType]

          if (operation === 'created') {
            this.hydratePayload(event.after)

            events.push({
              type: 'created',
              id: eventId,
              transactionId: String(event.source.txId),
              date: new Date(Number(event.ts_ms)),
              created: event.after,
            })
          } else if (operation === 'updated') {
            this.hydratePayload(event.before)
            this.hydratePayload(event.after)

            events.push({
              type: 'updated',
              id: eventId,
              transactionId: String(event.source.txId),
              date: new Date(Number(event.ts_ms)),
              updated: {
                before: event.before,
                after: event.after,
              },
            })
          } else {
            this.hydratePayload(event.before)

            events.push({
              type: 'deleted',
              id: eventId,
              transactionId: String(event.source.txId),
              date: new Date(Number(event.ts_ms)),
              deleted: event.before,
            })
          }
        }
      }
    }

    return events
  }
}

export class ZenStackLive<Schema extends SchemaDef> {
  private readonly options: ZenStackLiveOptions<Schema>
  private readonly redis: Redis

  constructor(options: ZenStackLiveOptions<Schema>) {
    this.options = options
    this.redis = new Redis(options.redis.url)
  }

  stream<ModelName extends GetModels<Schema>, Opts extends PickStreamFilters<Schema, ModelName>>(
    // streamOptions: Omit<LiveStreamOptions<Schema, ModelName>, 'schema' | 'redis' | 'clientId'>,
    streamOptions: { model: ModelName; id: string } & Opts,
  ) {
    return new LiveStream<Schema, ModelName, Opts>({
      ...streamOptions,
      redis: this.redis,
      clientId: this.options.id ?? 'zenstack',
      client: this.options.client,
    })
  }

  disconnect() {
    this.redis.disconnect()
  }
}

export type BeforeAfterResult<Schema extends SchemaDef, ModelName extends GetModels<Schema>> = {
  before: SimplifiedPlainResult<Schema, ModelName> | null
  after: SimplifiedPlainResult<Schema, ModelName> | null
}

export function beforeAfter<Schema extends SchemaDef, ModelName extends GetModels<Schema>>(
  event: RecordEvent<Schema, ModelName>,
): BeforeAfterResult<Schema, ModelName> {
  if (event.type === 'created') {
    return {
      before: null,
      after: event.created,
    }
  } else if (event.type === 'updated') {
    return {
      before: event.updated.before,
      after: event.updated.after,
    }
  }

  return {
    before: event.deleted,
    after: null,
  }
}
