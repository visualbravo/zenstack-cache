import type { CacheInvalidationOptions, CacheProvider, CacheEntry } from '../types'
import { Redis } from 'ioredis'
import { getTotalTtl } from '../utils'

interface ZenStackRedisCommands {
  invalidate: (options: string) => Promise<void>
  invalidateAll: () => Promise<void>
}

declare module 'ioredis' {
  interface Redis extends ZenStackRedisCommands {}
}

export class RedisCacheProvider implements CacheProvider {
  private readonly redis: Redis

  constructor(options: RedisCacheProviderOptions) {
    this.redis = new Redis(options.url, {
      scripts: {
        invalidate: {
          numberOfKeys: 0,
          lua: `
            local options = cjson.decode(ARGV[1])
            local keysToDelete = {}

            if (options.tags) then
                for _, tag in ipairs(options.tags) do
                    local formattedTag = 'zenstack:tag:' .. tag
                    local keys = redis.call('SMEMBERS', formattedTag)

                    for _, key in ipairs(keys) do
                      keysToDelete[#keysToDelete + 1] = key
                    end

                    redis.call('DEL', formattedTag)
                end
            end

            if (#keysToDelete > 0) then
              redis.call('DEL', unpack(keysToDelete))
            end
          `,
        },

        invalidateAll: {
          numberOfKeys: 0,
          lua: `
            local keys = redis.call('SMEMBERS', 'zenstack:key')

            for i = 1, #keys do
                local key = keys[i]
                redis.call('DEL', key)
            end

            redis.call('DEL', 'zenstack:key')
          `,
        },
      },
    })
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
    multi.sadd('zenstack:key', formattedKey)

    const totalTtl = getTotalTtl(entry)

    if (totalTtl > 0) {
      multi.expire(formattedKey, totalTtl)
    }

    if (entry.options.tags) {
      for (const tag of entry.options.tags) {
        const formattedTagKey = formatTagKey(tag)

        multi.sadd(formattedTagKey, formattedKey)
        multi.sadd('zenstack:key', formattedTagKey)
      }
    }

    await multi.exec()
  }

  async invalidate(options: CacheInvalidationOptions) {
    await this.redis.invalidate(JSON.stringify(options))
  }

  async invalidateAll() {
    await this.redis.invalidateAll()
  }
}

export type RedisCacheProviderOptions = {
  url: string
}

function formatQueryKey(key: string) {
  return `zenstack:query:${key}`
}

function formatTagKey(key: string) {
  return `zenstack:tag:${key}`
}