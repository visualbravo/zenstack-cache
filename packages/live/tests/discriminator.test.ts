import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { schema } from './schemas/basic'
import { EventDiscriminator, type EventDiscriminatorOptions } from '../src/discriminator'
import { ZenStackClient, type ClientContract } from '@zenstackhq/orm'
import { PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import type { RecordCreatedEvent } from '../'

const baseDate = new Date('2024-01-01T00:00:00.000Z')
const laterDate = new Date('2024-01-01T00:00:00.001Z')
const earlierDate = new Date('2023-12-31T23:59:59.999Z')

const baseEvent = {
  type: 'created',
  created: {
    id: '1',
    string: 'string',
    stringArray: ['stringArray'],
    boolean: true,
    booleanArray: [true],
    dateTime: baseDate,
    enum: 'USER',
    bigInt: BigInt(1),
    bigIntArray: [BigInt(1)],
    int: 1,
    intArray: [1],
    float: 1,
    floatArray: [1],
    json: {},
  },
  date: baseDate,
  transactionId: '1',
  id: '1',
} as const satisfies RecordCreatedEvent<typeof schema, 'User'>

let client: ClientContract<typeof schema>

async function matches(
  event: RecordCreatedEvent<typeof schema, 'User'>,
  options: Pick<
    EventDiscriminatorOptions<typeof schema, 'User'>,
    'created' | 'updated' | 'deleted'
  >,
) {
  const discriminator = new EventDiscriminator({
    client,
    model: 'User',
    ...options,
  })

  const discriminatorMatches = discriminator.eventMatchesWhere(event)
  let databaseMatches = true

  if (event.type === 'created') {
    await client.user.create({
      // @ts-expect-error
      data: event.created,
    })

    databaseMatches = await client.user.exists({
      where: options.created,
    })
  }

  return discriminatorMatches && databaseMatches
}

beforeAll(async () => {
  client = new ZenStackClient(schema, {
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: process.env['POSTGRES_URL'],
      }),
    }),
  })

  await client.$pushSchema()
  await Promise.all([
    client.$queryRawUnsafe('ALTER TABLE "User" REPLICA IDENTITY FULL'),
    client.$queryRawUnsafe('ALTER TABLE "Post" REPLICA IDENTITY FULL'),
    client.$queryRawUnsafe('ALTER TABLE "Profile" REPLICA IDENTITY FULL'),
  ])
})

beforeEach(async () => {
  await client.user.deleteMany({
    where: {
      id: '1',
    },
  })
})

afterAll(async () => {
  await client.$disconnect()
})

describe('EventDiscriminator', () => {
  describe('types', () => {
    describe('String', () => {
      test('equals (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              string: { equals: 'string' },
            },
          }),
        ).resolves.toBe(true)
      })

      test('equals (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              string: { equals: 'other' },
            },
          }),
        ).resolves.toBe(false)
      })

      test('in (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              string: { in: ['foo', 'string', 'bar'] },
            },
          }),
        ).resolves.toBe(true)
      })

      test('in (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              string: { in: ['foo', 'bar'] },
            },
          }),
        ).resolves.toBe(false)
      })

      test('notIn (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              string: { notIn: ['foo', 'bar'] },
            },
          }),
        ).resolves.toBe(true)
      })

      test('notIn (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              string: { notIn: ['string'] },
            },
          }),
        ).resolves.toBe(false)
      })

      test('lt (lexicographic)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              string: { lt: 'z' },
            },
          }),
        ).resolves.toBe(true)
      })

      test('lte (boundary)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              string: { lte: 'string' },
            },
          }),
        ).resolves.toBe(true)
      })

      test('gt (lexicographic)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              string: { gt: 'a' },
            },
          }),
        ).resolves.toBe(true)
      })

      test('gte (boundary)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              string: { gte: 'string' },
            },
          }),
        ).resolves.toBe(true)
      })

      test('contains (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              string: { contains: 'tri' },
            },
          }),
        ).resolves.toBe(true)
      })

      test('contains (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              string: { contains: 'xyz' },
            },
          }),
        ).resolves.toBe(false)
      })

      test('startsWith (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              string: { startsWith: 'str' },
            },
          }),
        ).resolves.toBe(true)
      })

      test('startsWith (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              string: { startsWith: 'ing' },
            },
          }),
        ).resolves.toBe(false)
      })

      test('endsWith (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              string: { endsWith: 'ing' },
            },
          }),
        ).resolves.toBe(true)
      })

      test('endsWith (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              string: { endsWith: 'str' },
            },
          }),
        ).resolves.toBe(false)
      })

      test('case-sensitive by default', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              string: { equals: 'STRING' },
            },
          }),
        ).resolves.toBe(false)
      })

      test.skip('mode: insensitive (equals)', async () => {
        // const r = await client.user.findMany({
        //   where: {
        //     string: {
        //       equals: 'STRING',
        //       mode: 'insensitive',
        //     }
        //   }
        // })

        // await expect(r).toHaveLength(0)
        await expect(
          matches(baseEvent, {
            created: {
              string: {
                equals: 'STRING',
                mode: 'insensitive',
              },
            },
          }),
        ).resolves.toBe(true)
      })

      test.skip('mode: insensitive (contains)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              string: {
                contains: 'TRI',
                mode: 'insensitive',
              },
            },
          }),
        ).resolves.toBe(true)
      })

      test('not (value)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              string: { not: 'other' },
            },
          }),
        ).resolves.toBe(true)
      })

      test('not (value negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              string: { not: 'string' },
            },
          }),
        ).resolves.toBe(false)
      })

      test('not (nested filter)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              string: {
                not: { contains: 'tri' },
              },
            },
          }),
        ).resolves.toBe(false)
      })

      test('empty string equals (edge case)', async () => {
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                string: '',
              },
            },
            {
              created: {
                string: '',
              },
            },
          ),
        ).resolves.toBe(true)
      })

      test('contains empty string (edge case)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              string: { contains: '' },
            },
          }),
        ).resolves.toBe(true)
      })
    })

    describe('String[]', () => {
      const baseEvent = {
        type: 'created',
        created: {
          id: '1',
          string: 'string',
          stringArray: ['a', 'b', 'c'],
          boolean: true,
          booleanArray: [true],
          dateTime: new Date(),
          enum: 'USER',
          bigInt: BigInt(1),
          bigIntArray: [BigInt(1)],
          int: 1,
          intArray: [1],
          float: 1,
          floatArray: [1],
          json: {},
        },
        date: new Date(),
        transactionId: '1',
        id: '1',
      } as const satisfies RecordCreatedEvent<typeof schema, 'User'>

      test('has (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              stringArray: { has: 'a' },
            },
          }),
        ).resolves.toBe(true)
      })

      test('has (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              stringArray: { has: 'z' },
            },
          }),
        ).resolves.toBe(false)
      })

      test('hasEvery (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              stringArray: { hasEvery: ['a', 'b'] },
            },
          }),
        ).resolves.toBe(true)
      })

      test('hasEvery (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              stringArray: { hasEvery: ['a', 'z'] },
            },
          }),
        ).resolves.toBe(false)
      })

      test('hasSome (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              stringArray: { hasSome: ['x', 'b'] },
            },
          }),
        ).resolves.toBe(true)
      })

      test('hasSome (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              stringArray: { hasSome: ['x', 'y'] },
            },
          }),
        ).resolves.toBe(false)
      })

      test('isEmpty (false)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              stringArray: { isEmpty: false },
            },
          }),
        ).resolves.toBe(true)
      })

      test('isEmpty (true)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              stringArray: { isEmpty: true },
            },
          }),
        ).resolves.toBe(false)
      })

      test('equals (exact match)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              stringArray: { equals: ['a', 'b', 'c'] },
            },
          }),
        ).resolves.toBe(true)
      })

      test('equals (order mismatch)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              stringArray: { equals: ['c', 'b', 'a'] },
            },
          }),
        ).resolves.toBe(false)
      })

      test('equals (subset)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              stringArray: { equals: ['a', 'b'] },
            },
          }),
        ).resolves.toBe(false)
      })

      test('empty array equals (edge case)', async () => {
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                stringArray: [],
              },
            },
            {
              created: {
                stringArray: { equals: [] },
              },
            },
          ),
        ).resolves.toBe(true)
      })

      test('empty array isEmpty true (edge case)', async () => {
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                stringArray: [],
              },
            },
            {
              created: {
                stringArray: { isEmpty: true },
              },
            },
          ),
        ).resolves.toBe(true)
      })

      test('has on empty array (edge case)', async () => {
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                stringArray: [],
              },
            },
            {
              created: {
                stringArray: { has: 'a' },
              },
            },
          ),
        ).resolves.toBe(false)
      })
    })

    describe('Int', () => {
      test('equals (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              int: { equals: 1 },
            },
          }),
        ).resolves.toBe(true)
      })

      test('equals (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              int: { equals: 2 },
            },
          }),
        ).resolves.toBe(false)
      })

      test('top-level equals shorthand', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              int: 1,
            },
          }),
        ).resolves.toBe(true)
      })

      test('in (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              int: { in: [0, 1, 2] },
            },
          }),
        ).resolves.toBe(true)
      })

      test('in (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              int: { in: [2, 3, 4] },
            },
          }),
        ).resolves.toBe(false)
      })

      test('notIn (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              int: { notIn: [2, 3, 4] },
            },
          }),
        ).resolves.toBe(true)
      })

      test('notIn (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              int: { notIn: [1] },
            },
          }),
        ).resolves.toBe(false)
      })

      test('lt (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              int: { lt: 2 },
            },
          }),
        ).resolves.toBe(true)
      })

      test('lt (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              int: { lt: 1 },
            },
          }),
        ).resolves.toBe(false)
      })

      test('lte (boundary)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              int: { lte: 1 },
            },
          }),
        ).resolves.toBe(true)
      })

      test('gt (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              int: { gt: 0 },
            },
          }),
        ).resolves.toBe(true)
      })

      test('gt (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              int: { gt: 1 },
            },
          }),
        ).resolves.toBe(false)
      })

      test('gte (boundary)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              int: { gte: 1 },
            },
          }),
        ).resolves.toBe(true)
      })

      test('not (scalar positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              int: { not: 2 },
            },
          }),
        ).resolves.toBe(true)
      })

      test('not (scalar negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              int: { not: 1 },
            },
          }),
        ).resolves.toBe(false)
      })

      test('not (nested filter)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              int: {
                not: { gt: 0 },
              },
            },
          }),
        ).resolves.toBe(false)
      })

      test('zero value (edge case)', async () => {
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                int: 0,
              },
            },
            {
              created: {
                int: { equals: 0 },
              },
            },
          ),
        ).resolves.toBe(true)
      })

      test('negative value (edge case)', async () => {
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                int: -5,
              },
            },
            {
              created: {
                int: { lt: 0 },
              },
            },
          ),
        ).resolves.toBe(true)
      })
    })

    describe('Int[]', () => {
      const baseEvent = {
        type: 'created',
        created: {
          id: '1',
          string: 'string',
          stringArray: ['stringArray'],
          boolean: true,
          booleanArray: [true],
          dateTime: new Date(),
          enum: 'USER',
          bigInt: BigInt(1),
          bigIntArray: [BigInt(1)],
          int: 1,
          intArray: [1, 2, 3],
          float: 1,
          floatArray: [1],
          json: {},
        },
        date: new Date(),
        id: '1',
        transactionId: '1',
      } as const satisfies RecordCreatedEvent<typeof schema, 'User'>

      test('has (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              intArray: { has: 1 },
            },
          }),
        ).resolves.toBe(true)
      })

      test('has (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              intArray: { has: 99 },
            },
          }),
        ).resolves.toBe(false)
      })

      test('hasEvery (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              intArray: { hasEvery: [1, 3] },
            },
          }),
        ).resolves.toBe(true)
      })

      test('hasEvery (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              intArray: { hasEvery: [1, 99] },
            },
          }),
        ).resolves.toBe(false)
      })

      test('hasSome (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              intArray: { hasSome: [99, 2] },
            },
          }),
        ).resolves.toBe(true)
      })

      test('hasSome (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              intArray: { hasSome: [99, 100] },
            },
          }),
        ).resolves.toBe(false)
      })

      test('isEmpty (false)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              intArray: { isEmpty: false },
            },
          }),
        ).resolves.toBe(true)
      })

      test('isEmpty (true)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              intArray: { isEmpty: true },
            },
          }),
        ).resolves.toBe(false)
      })

      test('equals (exact match)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              intArray: { equals: [1, 2, 3] },
            },
          }),
        ).resolves.toBe(true)
      })

      test('equals (order mismatch)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              intArray: { equals: [3, 2, 1] },
            },
          }),
        ).resolves.toBe(false)
      })

      test('equals (subset)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              intArray: { equals: [1, 2] },
            },
          }),
        ).resolves.toBe(false)
      })

      // test('not (nested positive)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         intArray: {
      //           not: { has: 99 },
      //         },
      //       },
      //     ),
      //   ).resolves.toBe(true)
      // })

      // test('not (nested negative)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         intArray: {
      //           not: { has: 1 },
      //         },
      //       },
      //     ),
      //   ).resolves.toBe(false)
      // })

      test('empty array equals (edge case)', async () => {
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                intArray: [],
              },
            },
            {
              created: {
                intArray: { equals: [] },
              },
            },
          ),
        ).resolves.toBe(true)
      })

      test('empty array isEmpty true (edge case)', async () => {
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                intArray: [],
              },
            },
            {
              created: {
                intArray: { isEmpty: true },
              },
            },
          ),
        ).resolves.toBe(true)
      })

      test('has on empty array (edge case)', async () => {
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                intArray: [],
              },
            },
            {
              created: {
                intArray: { has: 1 },
              },
            },
          ),
        ).resolves.toBe(false)
      })

      test('negative and zero values (edge case)', async () => {
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                intArray: [-1, 0, 1],
              },
            },
            {
              created: {
                intArray: { hasEvery: [-1, 0] },
              },
            },
          ),
        ).resolves.toBe(true)
      })
    })

    describe('Float', () => {
      test('equals (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              float: { equals: 1 },
            },
          }),
        ).resolves.toBe(true)
      })

      test('equals (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              float: { equals: 2 },
            },
          }),
        ).resolves.toBe(false)
      })

      test('top-level equals shorthand', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              float: 1,
            },
          }),
        ).resolves.toBe(true)
      })

      test('in (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              float: { in: [0, 1, 2] },
            },
          }),
        ).resolves.toBe(true)
      })

      test('in (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              float: { in: [2, 3] },
            },
          }),
        ).resolves.toBe(false)
      })

      test('notIn (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              float: { notIn: [2, 3] },
            },
          }),
        ).resolves.toBe(true)
      })

      test('notIn (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              float: { notIn: [1] },
            },
          }),
        ).resolves.toBe(false)
      })

      test('lt (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              float: { lt: 2 },
            },
          }),
        ).resolves.toBe(true)
      })

      test('lt (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              float: { lt: 1 },
            },
          }),
        ).resolves.toBe(false)
      })

      test('lte (boundary)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              float: { lte: 1 },
            },
          }),
        ).resolves.toBe(true)
      })

      test('gt (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              float: { gt: 0 },
            },
          }),
        ).resolves.toBe(true)
      })

      test('gt (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              float: { gt: 1 },
            },
          }),
        ).resolves.toBe(false)
      })

      test('gte (boundary)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              float: { gte: 1 },
            },
          }),
        ).resolves.toBe(true)
      })

      test('not (scalar positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              float: { not: 2 },
            },
          }),
        ).resolves.toBe(true)
      })

      test('not (scalar negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              float: { not: 1 },
            },
          }),
        ).resolves.toBe(false)
      })

      test('not (nested filter)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              float: {
                not: { gt: 0 },
              },
            },
          }),
        ).resolves.toBe(false)
      })

      test('zero value (edge case)', async () => {
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                float: 0,
              },
            },
            {
              created: {
                float: { equals: 0 },
              },
            },
          ),
        ).resolves.toBe(true)
      })

      test('negative value (edge case)', async () => {
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                float: -10.5,
              },
            },
            {
              created: {
                float: { lt: 0 },
              },
            },
          ),
        ).resolves.toBe(true)
      })

      test('decimal precision (edge case)', async () => {
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                float: 0.000123,
              },
            },
            {
              created: {
                float: { equals: 0.000123 },
              },
            },
          ),
        ).resolves.toBe(true)
      })

      test('very large value (edge case)', async () => {
        const huge = 1e18
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                float: huge,
              },
            },
            {
              created: {
                float: { gte: huge },
              },
            },
          ),
        ).resolves.toBe(true)
      })
    })

    describe('Float[]', () => {
      const baseEvent = {
        type: 'created',
        created: {
          id: '1',
          string: 'string',
          stringArray: ['stringArray'],
          boolean: true,
          booleanArray: [true],
          dateTime: new Date('2024-01-01T00:00:00.000Z'),
          enum: 'USER',
          bigInt: BigInt(1),
          bigIntArray: [BigInt(1)],
          int: 1,
          intArray: [1],
          float: 1,
          floatArray: [1.1, 2.2, 3.3],
          json: {},
        },
        date: new Date('2024-01-01T00:00:00.000Z'),
        id: '1',
        transactionId: '1',
      } as const satisfies RecordCreatedEvent<typeof schema, 'User'>

      test('has (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              floatArray: { has: 2.2 },
            },
          }),
        ).resolves.toBe(true)
      })

      test('has (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              floatArray: { has: 9.9 },
            },
          }),
        ).resolves.toBe(false)
      })

      test('hasEvery (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              floatArray: { hasEvery: [1.1, 3.3] },
            },
          }),
        ).resolves.toBe(true)
      })

      test('hasEvery (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              floatArray: { hasEvery: [1.1, 9.9] },
            },
          }),
        ).resolves.toBe(false)
      })

      test('hasSome (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              floatArray: { hasSome: [0, 2.2] },
            },
          }),
        ).resolves.toBe(true)
      })

      test('hasSome (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              floatArray: { hasSome: [9.9, 10.1] },
            },
          }),
        ).resolves.toBe(false)
      })

      test('isEmpty (false)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              floatArray: { isEmpty: false },
            },
          }),
        ).resolves.toBe(true)
      })

      test('isEmpty (true)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              floatArray: { isEmpty: true },
            },
          }),
        ).resolves.toBe(false)
      })

      test('equals (exact match)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              floatArray: { equals: [1.1, 2.2, 3.3] },
            },
          }),
        ).resolves.toBe(true)
      })

      test('equals (order mismatch)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              floatArray: { equals: [3.3, 2.2, 1.1] },
            },
          }),
        ).resolves.toBe(false)
      })

      test('equals (subset)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              floatArray: { equals: [1.1, 2.2] },
            },
          }),
        ).resolves.toBe(false)
      })

      // test('not (nested positive)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         floatArray: {
      //           not: { has: 9.9 },
      //         },
      //       },
      //     }),
      //   ).resolves.toBe(true)
      // })

      // test('not (nested negative)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         floatArray: {
      //           not: { has: 1.1 },
      //         },
      //       },
      //     }),
      //   ).resolves.toBe(false)
      // })

      test('empty array equals (edge case)', async () => {
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                floatArray: [],
              },
            },
            {
              created: {
                floatArray: { equals: [] },
              },
            },
          ),
        ).resolves.toBe(true)
      })

      test('empty array isEmpty true (edge case)', async () => {
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                floatArray: [],
              },
            },
            {
              created: {
                floatArray: { isEmpty: true },
              },
            },
          ),
        ).resolves.toBe(true)
      })

      test('has on empty array (edge case)', async () => {
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                floatArray: [],
              },
            },
            {
              created: {
                floatArray: { has: 1.1 },
              },
            },
          ),
        ).resolves.toBe(false)
      })

      test('negative and zero values (edge case)', async () => {
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                floatArray: [-1.5, 0, 1.5],
              },
            },
            {
              created: {
                floatArray: { hasEvery: [-1.5, 0] },
              },
            },
          ),
        ).resolves.toBe(true)
      })

      test('decimal precision (edge case)', async () => {
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                floatArray: [0.0001, 0.0002, 0.0003],
              },
            },
            {
              created: {
                floatArray: { hasSome: [0.0002] },
              },
            },
          ),
        ).resolves.toBe(true)
      })

      test('very large value (edge case)', async () => {
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                floatArray: [1e18, 2e18, 3e18],
              },
            },
            {
              created: {
                floatArray: { hasSome: [2e18] },
              },
            },
          ),
        ).resolves.toBe(true)
      })
    })

    describe('Enum', () => {
      const baseEvent = {
        type: 'created',
        created: {
          id: '1',
          string: 'string',
          stringArray: ['stringArray'],
          boolean: true,
          booleanArray: [true],
          dateTime: new Date('2024-01-01T00:00:00.000Z'),
          enum: 'USER',
          bigInt: BigInt(1),
          bigIntArray: [BigInt(1)],
          int: 1,
          intArray: [1],
          float: 1,
          floatArray: [1],
          json: {},
        },
        date: new Date('2024-01-01T00:00:00.000Z'),
        transactionId: '1',
        id: '1',
      } as const satisfies RecordCreatedEvent<typeof schema, 'User'>

      test('top-level equals (matching value)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              enum: 'USER',
            },
          }),
        ).resolves.toBe(true)
      })

      test('top-level equals (non-matching value)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              enum: 'ADMIN',
            },
          }),
        ).resolves.toBe(false)
      })

      test('equals (matching value)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              enum: { equals: 'USER' },
            },
          }),
        ).resolves.toBe(true)
      })

      test('equals (non-matching value)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              enum: { equals: 'ADMIN' },
            },
          }),
        ).resolves.toBe(false)
      })

      test('in (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              enum: { in: ['USER', 'ADMIN'] },
            },
          }),
        ).resolves.toBe(true)
      })

      test('in (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              enum: { in: ['ADMIN'] },
            },
          }),
        ).resolves.toBe(false)
      })

      test('notIn (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              enum: { notIn: ['ADMIN'] },
            },
          }),
        ).resolves.toBe(true)
      })

      test('notIn (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              enum: { notIn: ['USER', 'ADMIN'] },
            },
          }),
        ).resolves.toBe(false)
      })
    })

    // describe('Enum[]', () => {
    //   const baseEvent = {
    //     type: 'created',
    //     before: null,
    //     created: {
    //       id: '1',
    //       string: 'string',
    //       stringArray: ['stringArray'],
    //       boolean: true,
    //       booleanArray: [true],
    //       dateTime: new Date('2024-01-01T00:00:00.000Z'),
    //       enum: 'USER',
    //       enumArray: ['ADMIN', 'USER'],
    //       bigInt: BigInt(1),
    //       bigIntArray: [BigInt(1)],
    //       int: 1,
    //       intArray: [1],
    //       float: 1,
    //       floatArray: [1],
    //       json: {},
    //     },
    //     date: new Date('2024-01-01T00:00:00.000Z'),
    //     id: '1',
    //   } as const satisfies RecordCreatedEvent<typeof schema, 'User'>

    //   test('has (positive)', async () => {
    //     await expect(
    //       matches(baseEvent, {
    //         created: {
    //           enumArray: { has: 'USER' },
    //         },
    //       }),
    //     ).resolves.toBe(true)
    //   })

    //   // test('has (negative)', async () => {
    //   //   await expect(
    //   //     matches(baseEvent, {
    //   //       created: {
    //   //         enumArray: { has: 'GUEST' }, // non-existent enum
    //   //       },
    //   //     }),
    //   //   ).resolves.toBe(false)
    //   // })

    //   test('hasEvery (positive)', async () => {
    //     await expect(
    //       matches(baseEvent, {
    //         created: {
    //           enumArray: { hasEvery: ['ADMIN', 'USER'] },
    //         },
    //       }),
    //     ).resolves.toBe(true)
    //   })

    //   // test('hasEvery (negative)', async () => {
    //   //   await expect(
    //   //     matches(baseEvent, {
    //   //       created: {
    //   //         enumArray: { hasEvery: ['ADMIN', 'GUEST'] },
    //   //       },
    //   //     }),
    //   //   ).resolves.toBe(false)
    //   // })

    //   // test('hasSome (positive)', async () => {
    //   //   await expect(
    //   //     matches(baseEvent, {
    //   //       created: {
    //   //         enumArray: { hasSome: ['GUEST', 'USER'] },
    //   //       },
    //   //     }),
    //   //   ).resolves.toBe(true)
    //   // })

    //   // test('hasSome (negative)', async () => {
    //   //   await expect(
    //   //     matches(baseEvent, {
    //   //       created: {
    //   //         enumArray: { hasSome: ['GUEST', 'MODERATOR'] },
    //   //       },
    //   //     }),
    //   //   ).resolves.toBe(false)
    //   // })

    //   test('isEmpty (false)', async () => {
    //     await expect(
    //       matches(baseEvent, {
    //         created: {
    //           enumArray: { isEmpty: false },
    //         },
    //       }),
    //     ).resolves.toBe(true)
    //   })

    //   test('isEmpty (true)', async () => {
    //     await expect(
    //       matches(baseEvent, {
    //         created: {
    //           enumArray: { isEmpty: true },
    //         },
    //       }),
    //     ).resolves.toBe(false)
    //   })

    //   test('equals (exact match)', async () => {
    //     await expect(
    //       matches(baseEvent, {
    //         created: {
    //           enumArray: { equals: ['ADMIN', 'USER'] },
    //         },
    //       }),
    //     ).resolves.toBe(true)
    //   })

    //   test('equals (order mismatch)', async () => {
    //     await expect(
    //       matches(baseEvent, {
    //         created: {
    //           enumArray: { equals: ['USER', 'ADMIN'] },
    //         },
    //       }),
    //     ).resolves.toBe(false)
    //   })

    //   test('equals (subset)', async () => {
    //     await expect(
    //       matches(baseEvent, {
    //         created: {
    //           enumArray: { equals: ['ADMIN'] },
    //         },
    //       }),
    //     ).resolves.toBe(false)
    //   })

    //   test('empty array equals and isEmpty edge case', async () => {
    //     await expect(
    //       matches(
    //         {
    //           ...baseEvent,
    //           created: {
    //             ...baseEvent.created,
    //             enumArray: [],
    //           },
    //         },
    //         {
    //           created: {
    //             enumArray: { equals: [] },
    //           },
    //         },
    //       ),
    //     ).resolves.toBe(true)

    //     await expect(
    //       matches(
    //         {
    //           ...baseEvent,
    //           created: {
    //             ...baseEvent.created,
    //             enumArray: [],
    //           },
    //         },
    //         {
    //           created: {
    //             enumArray: { isEmpty: true },
    //           },
    //         },
    //       ),
    //     ).resolves.toBe(true)
    //   })

    //   test('has on empty array (edge case)', async () => {
    //     await expect(
    //       matches(
    //         {
    //           ...baseEvent,
    //           created: {
    //             ...baseEvent.created,
    //             enumArray: [],
    //           },
    //         },
    //         {
    //           created: {
    //             enumArray: { has: 'ADMIN' },
    //           },
    //         },
    //       ),
    //     ).resolves.toBe(false)
    //   })
    // })

    describe('BigInt', () => {
      const baseEvent = {
        type: 'created',
        created: {
          id: '1',
          string: 'string',
          stringArray: ['stringArray'],
          boolean: true,
          booleanArray: [true],
          dateTime: new Date(),
          enum: 'USER',
          bigInt: BigInt(1),
          bigIntArray: [BigInt(1)],
          int: 1,
          intArray: [1],
          float: 1,
          floatArray: [1],
          json: {},
        },
        date: new Date(),
        transactionId: '1',
        id: '1',
      } as const satisfies RecordCreatedEvent<typeof schema, 'User'>

      // test('equals (positive)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         bigInt: { equals: BigInt(1) },
      //       },
      //     }),
      //   ).resolves.toBe(true)
      // })

      // test('equals (negative)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         bigInt: { equals: BigInt(2) },
      //       },
      //     }),
      //   ).resolves.toBe(false)
      // })

      test('top-level equals shorthand', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              bigInt: BigInt(1),
            },
          }),
        ).resolves.toBe(true)
      })

      // test('in (positive)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         bigInt: { in: [BigInt(0), BigInt(1), BigInt(2)] },
      //       },
      //     }),
      //   ).resolves.toBe(true)
      // })

      // test('in (negative)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         bigInt: { in: [BigInt(2), BigInt(3)] },
      //       },
      //     }),
      //   ).resolves.toBe(false)
      // })

      // test('notIn (positive)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         bigInt: { notIn: [BigInt(2), BigInt(3)] },
      //       },
      //     }),
      //   ).resolves.toBe(true)
      // })

      // test('notIn (negative)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         bigInt: { notIn: [BigInt(1)] },
      //       },
      //     }),
      //   ).resolves.toBe(false)
      // })

      // test('lt (positive)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         bigInt: { lt: BigInt(2) },
      //       },
      //     }),
      //   ).resolves.toBe(true)
      // })

      // test('lt (negative)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         bigInt: { lt: BigInt(1) },
      //       },
      //     }),
      //   ).resolves.toBe(false)
      // })

      // test('lte (boundary)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         bigInt: { lte: BigInt(1) },
      //       },
      //     }),
      //   ).resolves.toBe(true)
      // })

      // test('gt (positive)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         bigInt: { gt: BigInt(0) },
      //       },
      //     }),
      //   ).resolves.toBe(true)
      // })

      // test('gt (negative)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         bigInt: { gt: BigInt(1) },
      //       },
      //     }),
      //   ).resolves.toBe(false)
      // })

      // test('gte (boundary)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         bigInt: { gte: BigInt(1) },
      //       },
      //     }),
      //   ).resolves.toBe(true)
      // })

      test('not (scalar positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              bigInt: { not: BigInt(2) },
            },
          }),
        ).resolves.toBe(true)
      })

      test('not (scalar negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              bigInt: { not: BigInt(1) },
            },
          }),
        ).resolves.toBe(false)
      })

      // test('not (nested filter)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         bigInt: {
      //           not: { gt: BigInt(0) },
      //         },
      //       },
      //     }),
      //   ).resolves.toBe(false)
      // })

      // test('zero value (edge case)', async () => {
      //   await expect(
      //     matches(
      //       {
      //         ...baseEvent,
      //         created: {
      //           ...baseEvent.created,
      //           bigInt: BigInt(0),
      //         },
      //       },
      //       {
      //         created: {
      //           bigInt: { equals: BigInt(0) },
      //         },
      //       },
      //     ),
      //   ).resolves.toBe(true)
      // })

      // test('negative value (edge case)', async () => {
      //   await expect(
      //     matches(
      //       {
      //         ...baseEvent,
      //         created: {
      //           ...baseEvent.created,
      //           bigInt: BigInt(-10),
      //         },
      //       },
      //       {
      //         created: {
      //           bigInt: { lt: BigInt(0) },
      //         },
      //       },
      //     ),
      //   ).resolves.toBe(true)
      // })

      // test('very large value (edge case)', async () => {
      //   const huge = BigInt('900719925474099312345')

      //   await expect(
      //     matches(
      //       {
      //         ...baseEvent,
      //         created: {
      //           ...baseEvent.created,
      //           bigInt: huge,
      //         },
      //       },
      //       {
      //         created: {
      //           bigInt: { gte: BigInt('900719925474099312345') },
      //         },
      //       },
      //     ),
      //   ).resolves.toBe(true)
      // })
    })

    describe('Boolean', () => {
      test('equals (true)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              boolean: { equals: true },
            },
          }),
        ).resolves.toBe(true)
      })

      test('equals (false)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              boolean: { equals: false },
            },
          }),
        ).resolves.toBe(false)
      })

      test('top-level equals shorthand (true)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              boolean: true,
            },
          }),
        ).resolves.toBe(true)
      })

      test('top-level equals shorthand (false)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              boolean: false,
            },
          }),
        ).resolves.toBe(false)
      })

      test('not (scalar positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              boolean: { not: false },
            },
          }),
        ).resolves.toBe(true)
      })

      test('not (scalar negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              boolean: { not: true },
            },
          }),
        ).resolves.toBe(false)
      })

      test('not (nested filter)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              boolean: {
                not: { equals: true },
              },
            },
          }),
        ).resolves.toBe(false)
      })

      test('explicit false value (edge case)', async () => {
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                boolean: false,
              },
            },
            {
              created: {
                boolean: false,
              },
            },
          ),
        ).resolves.toBe(true)
      })

      test('not false with explicit false value (edge case)', async () => {
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                boolean: false,
              },
            },
            {
              created: {
                boolean: { not: true },
              },
            },
          ),
        ).resolves.toBe(true)
      })
    })

    describe('Boolean[]', () => {
      const baseEvent = {
        type: 'created',
        created: {
          id: '1',
          string: 'string',
          stringArray: ['stringArray'],
          boolean: true,
          booleanArray: [true, false, true],
          dateTime: new Date('2024-01-01T00:00:00.000Z'),
          enum: 'USER',
          bigInt: BigInt(1),
          bigIntArray: [BigInt(1)],
          int: 1,
          intArray: [1],
          float: 1,
          floatArray: [1],
          json: {},
        },
        date: new Date('2024-01-01T00:00:00.000Z'),
        id: '1',
        transactionId: '1',
      } as const satisfies RecordCreatedEvent<typeof schema, 'User'>

      test('has (true)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              booleanArray: { has: true },
            },
          }),
        ).resolves.toBe(true)
      })

      test('has (false)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              booleanArray: { has: false },
            },
          }),
        ).resolves.toBe(true)
      })

      // test('has (non-existent value)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         booleanArray: { has: null as any },
      //       },
      //     }),
      //   ).resolves.toBe(false)
      // })

      test('hasEvery (true + false)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              booleanArray: { hasEvery: [true, false] },
            },
          }),
        ).resolves.toBe(true)
      })

      // test('hasEvery (missing value)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         booleanArray: { hasEvery: [true, null as any] },
      //       },
      //     }),
      //   ).resolves.toBe(false)
      // })

      // test('hasSome (true or false)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         booleanArray: { hasSome: [false, null as any] },
      //       },
      //     }),
      //   ).resolves.toBe(true)
      // })

      // test('hasSome (non-existent value)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         booleanArray: { hasSome: [null as any] },
      //       },
      //     }),
      //   ).resolves.toBe(false)
      // })

      test('isEmpty (false)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              booleanArray: { isEmpty: false },
            },
          }),
        ).resolves.toBe(true)
      })

      test('isEmpty (true)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              booleanArray: { isEmpty: true },
            },
          }),
        ).resolves.toBe(false)
      })

      // test('equals (exact match)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         booleanArray: { equals: [true, false, true] },
      //       },
      //     }),
      //   ).resolves.toBe(true)
      // })

      // test('equals (order mismatch)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         booleanArray: { equals: [true, true, false] },
      //       },
      //     }),
      //   ).resolves.toBe(false)
      // })

      // test('equals (subset)', async () => {
      //   await expect(
      //     matches(baseEvent, {
      //       created: {
      //         booleanArray: { equals: [true, false] },
      //       },
      //     }),
      //   ).resolves.toBe(false)
      // })

      // test('empty array equals and isEmpty edge case', async () => {
      //   await expect(
      //     matches(
      //       {
      //         ...baseEvent,
      //         created: {
      //           ...baseEvent.created,
      //           booleanArray: [],
      //         },
      //       },
      //       {
      //         created: {
      //           booleanArray: { equals: [] },
      //         },
      //       },
      //     ),
      //   ).resolves.toBe(true)

      //   await expect(
      //     matches(
      //       {
      //         ...baseEvent,
      //         created: {
      //           ...baseEvent.created,
      //           booleanArray: [],
      //         },
      //       },
      //       {
      //         created: {
      //           booleanArray: { isEmpty: true },
      //         },
      //       },
      //     ),
      //   ).resolves.toBe(true)
      // })

      test('has on empty array (edge case)', async () => {
        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                booleanArray: [],
              },
            },
            {
              created: {
                booleanArray: { has: true },
              },
            },
          ),
        ).resolves.toBe(false)
      })
    })

    describe('DateTime', () => {
      test('equals (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              dateTime: { equals: baseDate },
            },
          }),
        ).resolves.toBe(true)
      })

      test('equals (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              dateTime: { equals: laterDate },
            },
          }),
        ).resolves.toBe(false)
      })

      test('top-level equals shorthand', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              dateTime: baseDate,
            },
          }),
        ).resolves.toBe(true)
      })

      test('in (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              dateTime: { in: [earlierDate, baseDate, laterDate] },
            },
          }),
        ).resolves.toBe(true)
      })

      test('in (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              dateTime: { in: [earlierDate, laterDate] },
            },
          }),
        ).resolves.toBe(false)
      })

      test('notIn (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              dateTime: { notIn: [earlierDate, laterDate] },
            },
          }),
        ).resolves.toBe(true)
      })

      test('notIn (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              dateTime: { notIn: [baseDate] },
            },
          }),
        ).resolves.toBe(false)
      })

      test('lt (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              dateTime: { lt: laterDate },
            },
          }),
        ).resolves.toBe(true)
      })

      test('lt (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              dateTime: { lt: baseDate },
            },
          }),
        ).resolves.toBe(false)
      })

      test('lte (boundary)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              dateTime: { lte: baseDate },
            },
          }),
        ).resolves.toBe(true)
      })

      test('gt (positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              dateTime: { gt: earlierDate },
            },
          }),
        ).resolves.toBe(true)
      })

      test('gt (negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              dateTime: { gt: baseDate },
            },
          }),
        ).resolves.toBe(false)
      })

      test('gte (boundary)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              dateTime: { gte: baseDate },
            },
          }),
        ).resolves.toBe(true)
      })

      test('not (scalar positive)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              dateTime: { not: laterDate },
            },
          }),
        ).resolves.toBe(true)
      })

      test('not (scalar negative)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              dateTime: { not: baseDate },
            },
          }),
        ).resolves.toBe(false)
      })

      test('not (nested filter)', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              dateTime: {
                not: { lt: laterDate },
              },
            },
          }),
        ).resolves.toBe(false)
      })

      test('millisecond precision boundary', async () => {
        await expect(
          matches(baseEvent, {
            created: {
              dateTime: { lt: laterDate },
            },
          }),
        ).resolves.toBe(true)
      })

      test('epoch date (edge case)', async () => {
        const epoch = new Date(0)

        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                dateTime: epoch,
              },
            },
            {
              created: {
                dateTime: { equals: epoch },
              },
            },
          ),
        ).resolves.toBe(true)
      })

      test('timezone-equivalent dates (same instant)', async () => {
        const utc = new Date('2024-01-01T00:00:00.000Z')
        const offset = new Date('2023-12-31T19:00:00.000-05:00')

        await expect(
          matches(
            {
              ...baseEvent,
              created: {
                ...baseEvent.created,
                dateTime: utc,
              },
            },
            {
              created: {
                dateTime: { equals: offset },
              },
            },
          ),
        ).resolves.toBe(true)
      })
    })
  })

  describe('operators', () => {
    const baseEvent = {
      type: 'created',
      created: {
        id: '1',
        string: 'hello',
        stringArray: ['stringArray'],
        boolean: true,
        booleanArray: [true],
        dateTime: new Date('2024-01-01T00:00:00.000Z'),
        enum: 'USER',
        bigInt: BigInt(1),
        bigIntArray: [BigInt(1)],
        int: 1,
        intArray: [1],
        float: 1,
        floatArray: [1],
        json: {},
      },
      date: new Date('2024-01-01T00:00:00.000Z'),
      id: '1',
      transactionId: '1',
    } as const satisfies RecordCreatedEvent<typeof schema, 'User'>

    test('AND - both conditions true', async () => {
      await expect(
        matches(baseEvent, {
          created: {
            AND: [{ string: 'hello' }, { string: { equals: 'hello' } }],
          },
        }),
      ).resolves.toBe(true)
    })

    test('AND - one condition false', async () => {
      await expect(
        matches(baseEvent, {
          created: {
            AND: [{ string: 'hello' }, { string: { equals: 'world' } }],
          },
        }),
      ).resolves.toBe(false)
    })

    test('OR - one condition true', async () => {
      await expect(
        matches(baseEvent, {
          created: {
            OR: [{ string: 'world' }, { string: { equals: 'hello' } }],
          },
        }),
      ).resolves.toBe(true)
    })

    test('OR - all conditions false', async () => {
      await expect(
        matches(baseEvent, {
          created: {
            OR: [{ string: 'world' }, { string: { equals: 'foo' } }],
          },
        }),
      ).resolves.toBe(false)
    })

    test('NOT - condition false', async () => {
      await expect(
        matches(baseEvent, {
          created: {
            NOT: { string: { equals: 'world' } },
          },
        }),
      ).resolves.toBe(true)
    })

    test('NOT - condition true', async () => {
      await expect(
        matches(baseEvent, {
          created: {
            NOT: { string: 'hello' },
          },
        }),
      ).resolves.toBe(false)
    })

    test('nested AND + OR', async () => {
      await expect(
        matches(baseEvent, {
          created: {
            AND: [
              {
                OR: [{ string: 'foo' }, { string: 'hello' }],
              },
              { string: { equals: 'hello' } },
            ],
          },
        }),
      ).resolves.toBe(true)
    })

    test('nested OR + NOT', async () => {
      await expect(
        matches(baseEvent, {
          created: {
            OR: [{ string: 'world' }, { NOT: { string: 'foo' } }],
          },
        }),
      ).resolves.toBe(true)
    })

    test('complex nested AND + OR + NOT (false)', async () => {
      await expect(
        matches(baseEvent, {
          created: {
            AND: [
              {
                OR: [{ string: 'foo' }, { string: 'bar' }],
              },
              { NOT: { string: 'hello' } },
            ],
          },
        }),
      ).resolves.toBe(false)
    })
  })
})
