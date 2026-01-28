import { ZenStackClient, type ClientContract } from '@zenstackhq/orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineCachePlugin } from '../src'
import { SqliteDialect } from 'kysely'
import SQLite from 'better-sqlite3'
import { RedisCacheProvider } from '../src/providers/redis'
import { schema } from './schemas/basic'
import { Redis, Pipeline } from 'ioredis'

const expire = vi.spyOn(Pipeline.prototype, 'expire')
const sadd = vi.spyOn(Pipeline.prototype, 'sadd')

describe('Cache plugin (redis)', () => {
  let db: ClientContract<typeof schema>
  let redis: Redis

  beforeEach(async () => {
    db = new ZenStackClient(schema, {
      dialect: new SqliteDialect({
        database: new SQLite(':memory:'),
      }),
    })

    redis = new Redis(process.env['REDIS_URL'] as string)

    expire.mockClear()
    sadd.mockClear()

    await db.$pushSchema()
    await redis.flushdb()
  })

  afterEach(async () => {
    vi.useRealTimers()
    await db?.$disconnect()
  })

  afterAll(async () => {
    await redis.flushdb()
  })

  it('respects ttl', async () => {
    const extDb = db.$use(
      defineCachePlugin({
        provider: new RedisCacheProvider({
          url: process.env['REDIS_URL'] as string,
        }),
      }),
    )

    expect(extDb.$cache.status).toBe(null)
    expect(extDb.$cache.revalidation).toBe(null)

    {
      const user = await extDb.user.create({
        data: {
          email: 'test@email.com',
        },
      })

      await extDb.user.findFirst({
        where: {
          id: user.id,
        },

        cache: {
          ttl: 60,
        },
      })

      expect(expire.mock.lastCall![1]).toBe(60)

      await extDb.user.delete({
        where: {
          id: user.id,
        },
      })

      await expect(
        extDb.user.findFirst({
          where: {
            id: user.id,
          },

          cache: {
            ttl: 60,
          },
        }),
      ).resolves.toMatchObject({
        email: 'test@email.com',
      })
    }

    {
      const user = await extDb.user.create({
        data: {
          email: 'test@email.com',
        },
      })

      await extDb.user.findUnique({
        where: {
          id: user.id,
        },

        cache: {
          ttl: 61,
        },
      })

      expect(expire.mock.lastCall![1]).toBe(61)

      await extDb.user.delete({
        where: {
          id: user.id,
        },
      })

      await expect(
        extDb.user.findUnique({
          where: {
            id: user.id,
          },

          cache: {
            ttl: 61,
          },
        }),
      ).resolves.toMatchObject({
        email: 'test@email.com',
      })

      expect(extDb.$cache.status).toBe('hit')
    }

    {
      const user = await extDb.user.create({
        data: {
          email: 'test@email.com',
        },
      })

      await extDb.user.findMany({
        where: {
          id: user.id,
        },

        cache: {
          ttl: 62,
        },
      })

      expect(expire.mock.lastCall![1]).toBe(62)

      await extDb.user.delete({
        where: {
          id: user.id,
        },
      })

      await expect(
        extDb.user.findMany({
          where: {
            id: user.id,
          },

          cache: {
            ttl: 62,
          },
        }),
      ).resolves.toHaveLength(1)

      expect(extDb.$cache.status).toBe('hit')
    }

    {
      const user = await extDb.user.create({
        data: {
          email: 'test@email.com',
        },
      })

      await extDb.user.findFirstOrThrow({
        where: {
          id: user.id,
        },

        cache: {
          ttl: 63,
        },
      })

      expect(expire.mock.lastCall![1]).toBe(63)

      await extDb.user.delete({
        where: {
          id: user.id,
        },
      })

      await expect(
        extDb.user.findFirstOrThrow({
          where: {
            id: user.id,
          },

          cache: {
            ttl: 63,
          },
        }),
      ).resolves.toMatchObject({
        email: 'test@email.com',
      })

      expect(extDb.$cache.status).toBe('hit')
    }

    {
      const user = await extDb.user.create({
        data: {
          email: 'test@email.com',
        },
      })

      await extDb.user.findUniqueOrThrow({
        where: {
          id: user.id,
        },

        cache: {
          ttl: 64,
        },
      })

      expect(expire.mock.lastCall![1]).toBe(64)

      await extDb.user.delete({
        where: {
          id: user.id,
        },
      })

      await expect(
        extDb.user.findUniqueOrThrow({
          where: {
            id: user.id,
          },

          cache: {
            ttl: 64,
          },
        }),
      ).resolves.toMatchObject({
        email: 'test@email.com',
      })

      expect(extDb.$cache.status).toBe('hit')
    }

    {
      const user = await extDb.user.create({
        data: {
          email: 'test@email.com',
        },
      })

      await extDb.user.exists({
        where: {
          id: user.id,
        },

        cache: {
          ttl: 65,
        },
      })

      expect(expire.mock.lastCall![1]).toBe(65)

      await extDb.user.delete({
        where: {
          id: user.id,
        },
      })

      await expect(
        extDb.user.exists({
          where: {
            id: user.id,
          },

          cache: {
            ttl: 65,
          },
        }),
      ).resolves.toBe(true)

      expect(extDb.$cache.status).toBe('hit')
    }

    {
      const user = await extDb.user.create({
        data: {
          email: 'test@email.com',
        },
      })

      await extDb.user.count({
        where: {
          id: user.id,
        },

        cache: {
          ttl: 66,
        },
      })

      expect(expire.mock.lastCall![1]).toBe(66)

      await extDb.user.delete({
        where: {
          id: user.id,
        },
      })

      await expect(
        extDb.user.count({
          where: {
            id: user.id,
          },

          cache: {
            ttl: 66,
          },
        }),
      ).resolves.toBe(1)

      expect(extDb.$cache.status).toBe('hit')
    }

    {
      const user = await extDb.user.create({
        data: {
          email: 'test@email.com',
        },
      })

      await extDb.user.groupBy({
        by: 'id',

        cache: {
          ttl: 67,
        },
      })

      expect(expire.mock.lastCall![1]).toBe(67)

      await extDb.user.delete({
        where: {
          id: user.id,
        },
      })

      await expect(
        extDb.user.groupBy({
          by: 'id',

          cache: {
            ttl: 67,
          },
        }),
      ).resolves.toHaveLength(1)
    }

    expect(extDb.$cache.status).toBe('hit')
  })

  it('respects swr', async () => {
    const extDb = db.$use(
      defineCachePlugin({
        provider: new RedisCacheProvider({
          url: process.env['REDIS_URL'] as string,
        }),
      }),
    )

    const user = await extDb.user.create({
      data: {
        email: 'test@email.com',
      },
    })

    await extDb.user.findFirst({
      where: {
        id: user.id,
      },

      cache: {
        swr: 60,
      },
    })

    expect(expire.mock.lastCall![1]).toBe(60)

    await extDb.user.update({
      data: {
        name: 'newname',
      },

      where: {
        id: user.id,
      },
    })

    await expect(
      extDb.user.findFirst({
        where: {
          id: user.id,
        },

        cache: {
          swr: 60,
        },
      }),
    ).resolves.toMatchObject({
      name: null,
    })

    expect(extDb.$cache.status).toBe('stale')
    const revalidatedUser = await extDb.$cache.revalidation

    expect(revalidatedUser).toMatchObject({
      name: 'newname',
    })

    await expect(
      extDb.user.findFirst({
        where: {
          id: user.id,
        },

        cache: {
          swr: 60,
        },
      }),
    ).resolves.toMatchObject({
      name: 'newname',
    })
  })

  it('respects ttl and swr simultaneously', async () => {
    const extDb = db.$use(
      defineCachePlugin({
        provider: new RedisCacheProvider({
          url: process.env['REDIS_URL'] as string,
        }),
      }),
    )

    const user = await extDb.user.create({
      data: {
        email: 'test@email.com',
      },
    })

    await extDb.user.findFirst({
      where: {
        id: user.id,
      },

      cache: {
        ttl: 60,
        swr: 60,
      },
    })

    await extDb.user.update({
      data: {
        name: 'newname',
      },

      where: {
        id: user.id,
      },
    })

    await expect(
      extDb.user.findFirst({
        where: {
          id: user.id,
        },

        cache: {
          ttl: 60,
          swr: 60,
        },
      }),
    ).resolves.toMatchObject({
      name: null,
    })

    expect(extDb.$cache.status).toBe('hit')

    await expect(
      extDb.user.findFirst({
        where: {
          id: user.id,
        },

        cache: {
          ttl: 60,
          swr: 60,
        },
      }),
    ).resolves.toMatchObject({
      name: null,
    })

    expect(expire.mock.lastCall![1]).toBe(120)
  })

  it('supports invalidating all entries', async () => {
    // This should still exist after we invalidate everything
    await redis.set('unrelatedkey', '1')

    const extDb = db.$use(
      defineCachePlugin({
        provider: new RedisCacheProvider({
          url: process.env['REDIS_URL'] as string,
        }),
      }),
    )

    const user = await extDb.user.create({
      data: {
        email: 'test@email.com',
      },
    })

    await Promise.all([
      extDb.user.findFirst({
        where: {
          id: user.id,
        },

        cache: {
          ttl: 60,
        },
      }),

      extDb.user.findUnique({
        where: {
          id: user.id,
        },

        cache: {
          ttl: 60,
        },
      }),

      extDb.user.findMany({
        cache: {
          ttl: 60,
        },
      }),

      extDb.user.findFirstOrThrow({
        where: {
          id: user.id,
        },

        cache: {
          ttl: 60,
        },
      }),

      extDb.user.findUniqueOrThrow({
        where: {
          id: user.id,
        },

        cache: {
          ttl: 60,
        },
      }),

      extDb.user.exists({
        where: {
          id: user.id,
        },

        cache: {
          ttl: 60,
        },
      }),

      extDb.user.count({
        cache: {
          ttl: 60,
        },
      }),

      // extDb.user.aggregate({
      //     where: {
      //         id: user.id,
      //     },

      //     cache: {
      //         ttl: 60,
      //     },
      // }),

      extDb.user.groupBy({
        by: 'id',

        cache: {
          ttl: 60,
        },
      }),
    ])

    await Promise.all([
      extDb.user.delete({
        where: {
          id: user.id,
        },
      }),

      extDb.user.create({
        data: {
          email: 'test2@email.com',
        },
      }),

      extDb.user.create({
        data: {
          email: 'test3@email.com',
        },
      }),
    ])

    await extDb.$cache.invalidateAll()
    await expect(redis.get('unrelatedkey')).resolves.toBe('1')

    await expect(
      extDb.user.findFirst({
        where: {
          id: user.id,
        },

        cache: {
          ttl: 60,
        },
      }),
    ).resolves.toBeNull()

    await expect(
      extDb.user.findUnique({
        where: {
          id: user.id,
        },

        cache: {
          ttl: 60,
        },
      }),
    ).resolves.toBeNull()

    await expect(
      extDb.user.findMany({
        cache: {
          ttl: 60,
        },
      }),
    ).resolves.toHaveLength(2)

    await expect(
      extDb.user.findFirstOrThrow({
        where: {
          id: user.id,
        },

        cache: {
          ttl: 60,
        },
      }),
    ).rejects.toThrow('Record not found')

    await expect(
      extDb.user.findUniqueOrThrow({
        where: {
          id: user.id,
        },

        cache: {
          ttl: 60,
        },
      }),
    ).rejects.toThrow('Record not found')

    await expect(
      extDb.user.exists({
        where: {
          id: user.id,
        },

        cache: {
          ttl: 60,
        },
      }),
    ).resolves.toBe(false)

    await expect(
      extDb.user.count({
        cache: {
          ttl: 60,
        },
      }),
    ).resolves.toBe(2)

    await expect(
      extDb.user.groupBy({
        by: 'id',

        cache: {
          ttl: 60,
        },
      }),
    ).resolves.toHaveLength(2)
  })

  it('supports invalidating by tags', async () => {
    const extDb = db.$use(
      defineCachePlugin({
        provider: new RedisCacheProvider({
          url: process.env['REDIS_URL'] as string,
        }),
      }),
    )

    const user1 = await extDb.user.create({
      data: {
        email: 'test@email.com',
      },
    })

    const user2 = await extDb.user.create({
      data: {
        email: 'test2@email.com',
      },
    })

    const post1 = await extDb.post.create({
      data: {
        title: 'title',
        authorId: user1.id,
      },
    })

    const post2 = await extDb.post.create({
      data: {
        title: 'title',
        authorId: user2.id,
      },
    })

    await Promise.all([
      extDb.user.findUnique({
        where: {
          id: user1.id,
        },

        cache: {
          ttl: 60,
          tags: ['user1'],
        },
      }),

      extDb.user.findUnique({
        where: {
          id: user2.id,
        },

        cache: {
          ttl: 60,
          tags: ['user2'],
        },
      }),

      extDb.post.findUnique({
        where: {
          id: post1.id,
        },

        cache: {
          ttl: 60,
          tags: ['post', 'user1'],
        },
      }),

      extDb.post.findUnique({
        where: {
          id: post2.id,
        },

        cache: {
          ttl: 60,
        },
      }),
    ])

    await Promise.all([
      extDb.user.update({
        data: {
          name: 'newname',
        },

        where: {
          id: user1.id,
        },
      }),

      extDb.user.update({
        data: {
          name: 'newname',
        },

        where: {
          id: user2.id,
        },
      }),

      extDb.post.update({
        data: {
          title: 'newtitle',
        },

        where: {
          id: post1.id,
        },
      }),
    ])

    await extDb.$cache.invalidate({
      tags: [],
    })

    // everything should still be the same as when we started
    await expect(
      extDb.user.findUnique({
        where: {
          id: user1.id,
        },

        cache: {
          ttl: 60,
          tags: ['user1'],
        },
      }),
    ).resolves.toMatchObject({
      name: null,
    })

    await expect(
      extDb.user.findUnique({
        where: {
          id: user2.id,
        },

        cache: {
          ttl: 60,
          tags: ['user2'],
        },
      }),
    ).resolves.toMatchObject({
      name: null,
    })

    await expect(
      extDb.post.findUnique({
        where: {
          id: post1.id,
        },

        cache: {
          ttl: 60,
          tags: ['post', 'user1'],
        },
      }),
    ).resolves.toMatchObject({
      title: 'title',
    })

    await extDb.$cache.invalidate({
      tags: ['these', 'tags', 'do', 'not', 'exist'],
    })

    // everything should still be the same as when we started
    await expect(
      extDb.user.findUnique({
        where: {
          id: user1.id,
        },

        cache: {
          ttl: 60,
          tags: ['user1'],
        },
      }),
    ).resolves.toMatchObject({
      name: null,
    })

    await expect(
      extDb.user.findUnique({
        where: {
          id: user2.id,
        },

        cache: {
          ttl: 60,
          tags: ['user2'],
        },
      }),
    ).resolves.toMatchObject({
      name: null,
    })

    await expect(
      extDb.post.findUnique({
        where: {
          id: post1.id,
        },

        cache: {
          ttl: 60,
          tags: ['post', 'user1'],
        },
      }),
    ).resolves.toMatchObject({
      title: 'title',
    })

    await extDb.$cache.invalidate({
      tags: ['user1'],
    })

    // only user2 and post2 stays the same
    await expect(
      extDb.user.findUnique({
        where: {
          id: user1.id,
        },

        cache: {
          ttl: 60,
          tags: ['user1'],
        },
      }),
    ).resolves.toMatchObject({
      name: 'newname',
    })

    await expect(
      extDb.user.findUnique({
        where: {
          id: user2.id,
        },

        cache: {
          ttl: 60,
          tags: ['user2'],
        },
      }),
    ).resolves.toMatchObject({
      name: null,
    })

    await expect(
      extDb.post.findUnique({
        where: {
          id: post1.id,
        },

        cache: {
          ttl: 60,
          tags: ['post', 'user1'],
        },
      }),
    ).resolves.toMatchObject({
      title: 'newtitle',
    })

    await expect(
      extDb.post.findUnique({
        where: {
          id: post2.id,
        },

        cache: {
          ttl: 60,
        },
      }),
    ).resolves.toMatchObject({
      title: 'title',
    })
  })

  it('handles edge cases', async () => {
    const extDb = db.$use(
      defineCachePlugin({
        provider: new RedisCacheProvider({
          url: process.env['REDIS_URL'] as string,
        }),
      }),
    )

    await expect(
      extDb.user.findMany({
        cache: {
          ttl: 0,
        },
      }),
    ).rejects.toThrow('Invalid findMany')

    await expect(
      extDb.user.findMany({
        cache: {
          swr: 0,
        },
      }),
    ).rejects.toThrow('Invalid findMany')

    await expect(
      extDb.user.findMany({
        cache: {
          ttl: 0,
          swr: 0,
        },
      }),
    ).rejects.toThrow('Invalid findMany')

    await extDb.user.findMany({
      cache: {
        tags: ['test'],
      },
    })

    expect(sadd.mock.lastCall![0]).toBe('zenstack:cache:tag:test')
  })

  it('handles tag set ttls', async () => {
    const extDb = db.$use(
      defineCachePlugin({
        provider: new RedisCacheProvider({
          url: process.env['REDIS_URL'] as string,
        }),
      }),
    )

    await extDb.user.findMany({
      cache: {
        tags: ['test'],
      },
    })

    expect(expire).not.toHaveBeenCalled()

    await extDb.user.findMany({
      cache: {
        ttl: 30,
        tags: ['test'],
      },
    })

    // A tag set's TTL should be the highest TTL of the keys in it.
    await expect(redis.ttl('zenstack:cache:tag:test')).resolves.toBeCloseTo(30, 2)

    await extDb.user.exists({
      cache: {
        ttl: 40,
        tags: ['test', 'test2'],
      },
    })

    await expect(redis.ttl('zenstack:cache:tag:test')).resolves.toBeCloseTo(40, 2)
    await expect(redis.ttl('zenstack:cache:tag:test2')).resolves.toBeCloseTo(40, 2)

    // A lower TTL does not change them.
    await extDb.user.findFirst({
      cache: {
        ttl: 10,
        tags: ['test', 'test2'],
      },
    })

    await expect(redis.ttl('zenstack:cache:tag:test')).resolves.toBeCloseTo(40, 2)
    await expect(redis.ttl('zenstack:cache:tag:test2')).resolves.toBeCloseTo(40, 2)

    // Should work with SWR too.
    await extDb.user.findFirst({
      cache: {
        swr: 80,
        tags: ['test', 'test2', 'test3'],
      },
    })

    await expect(redis.ttl('zenstack:cache:tag:test')).resolves.toBeCloseTo(80, 2)
    await expect(redis.ttl('zenstack:cache:tag:test2')).resolves.toBeCloseTo(80, 2)
    await expect(redis.ttl('zenstack:cache:tag:test3')).resolves.toBeCloseTo(80, 2)

    /**
     * If a tag set already has a TTL, but the options don't specify one, the tag set's
     * TTL should be removed.
     */
    await extDb.user.findFirst({
      cache: {
        tags: ['test'],
      },
    })

    await expect(redis.ttl('zenstack:cache:tag:test')).resolves.toBe(-1)
    await expect(redis.ttl('zenstack:cache:tag:test2')).resolves.toBeCloseTo(80, 2)
    await expect(redis.ttl('zenstack:cache:tag:test3')).resolves.toBeCloseTo(80, 2)
  })
})
