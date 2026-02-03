import type { CacheInvalidationOptions, CacheProvider, CacheEntry } from '../types'
import { Redis } from 'ioredis'
import { getTotalTtl } from '../utils'
import { superjson } from '../superjson'

export class RedisCacheProvider implements CacheProvider {
  private readonly redis: Redis

  constructor(options: RedisCacheProviderOptions) {
    this.redis = new Redis(options.url)
  }

  async get(key: string) {
    const entryJson = await this.redis.get(makeQueryKey(key))

    if (!entryJson) {
      return undefined
    }

    return superjson.parse(entryJson) as CacheEntry
  }

  async set(key: string, entry: CacheEntry) {
    const multi = this.redis.multi()
    const queryKey = makeQueryKey(key)

    multi.set(queryKey, superjson.stringify(entry))

    const totalTtl = getTotalTtl(entry)

    if (totalTtl > 0) {
      multi.expire(queryKey, totalTtl)
    }

    if (entry.options.tags) {
      for (const tag of entry.options.tags) {
        const tagKey = makeTagKey(tag)

        multi.sadd(tagKey, queryKey)

        if (totalTtl > 0) {
          multi.expire(tagKey, totalTtl, 'GT')
          multi.expire(tagKey, totalTtl, 'NX')
        } else {
          multi.persist(tagKey)
        }
      }
    }

    await multi.exec()
  }

  async invalidate(options: CacheInvalidationOptions) {
    if (options.tags && options.tags.length > 0) {
      await Promise.all(
        options.tags.map(tag => {
          return new Promise((resolve, reject) => {
            const stream = this.redis.sscanStream(makeTagKey(tag), {
              count: 100,
            })

            stream.on('data', async (keys: string[]) => {
              if (keys.length > 1) {
                await this.redis.del(...keys)
              }
            })

            stream.on('error', reject)
            stream.on('end', resolve)
          })
        }),
      )
    }
  }

  async invalidateAll() {
    await new Promise((resolve, reject) => {
      const stream = this.redis.scanStream({
        count: 100,
        match: 'zenstack:cache:*',
      })

      stream.on('data', async (keys: string[]) => {
        if (keys.length > 1) {
          await this.redis.del(...keys)
        }
      })

      stream.on('error', reject)
      stream.on('end', resolve)
    })
  }
}

export type RedisCacheProviderOptions = {
  url: string
}

function makeQueryKey(key: string) {
  return `zenstack:cache:query:${key}`
}

function makeTagKey(key: string) {
  return `zenstack:cache:tag:${key}`
}
