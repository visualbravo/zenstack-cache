import type { CacheInvalidationOptions, CacheProvider, CacheEntry } from '../types'
import { Redis } from 'ioredis'
import { getTotalTtl } from '../utils'

export class RedisCacheProvider implements CacheProvider {
  private readonly redis: Redis

  constructor(options: RedisCacheProviderOptions) {
    this.redis = new Redis(options.url)
  }

  async get(key: string) {
    const entryJson = await this.redis.get(formatQueryKey(key))

    if (!entryJson) {
      return undefined
    }

    return JSON.parse(entryJson) as CacheEntry
  }

  async set(key: string, entry: CacheEntry) {
    const multi = this.redis.multi()
    const formattedKey = formatQueryKey(key)

    multi.set(formattedKey, JSON.stringify(entry))

    const totalTtl = getTotalTtl(entry)

    if (totalTtl > 0) {
      multi.expire(formattedKey, totalTtl)
    }

    if (entry.options.tags) {
      for (const tag of entry.options.tags) {
        const formattedTagKey = formatTagKey(tag)

        multi.sadd(formattedTagKey, formattedKey)

        if (totalTtl > 0) {
          multi.expire(formattedTagKey, totalTtl, 'GT')
          multi.expire(formattedTagKey, totalTtl, 'NX')
        }
      }
    }

    await multi.exec()
  }

  async invalidate(options: CacheInvalidationOptions) {
    if (options.tags && options.tags.length > 0) {
      await Promise.all(options.tags.map(tag => {
        return new Promise((resolve, reject) => {
          const stream = this.redis.sscanStream(formatTagKey(tag), {
            count: 100,
          })

          stream.on('data', async (keys: string[]) => {
            await this.redis.del(...keys)
          })

          stream.on('error', reject)
          stream.on('end', resolve)
        })
      }))
    }
  }

  async invalidateAll() {
    await new Promise((resolve, reject) => {
      const stream = this.redis.scanStream({
        count: 100,
        match: 'zenstack:cache:*',
      })

      stream.on('data', async keys => {
        await this.redis.del(...keys)
      })

      stream.on('error', reject)
      stream.on('end', resolve)
    })
  }
}

export type RedisCacheProviderOptions = {
  url: string
}

function formatQueryKey(key: string) {
  return `zenstack:cache:query:${key}`
}

function formatTagKey(key: string) {
  return `zenstack:cache:tag:${key}`
}
