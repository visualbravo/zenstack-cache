import { definePlugin } from '@zenstackhq/orm'
import { stableHash } from 'stable-hash'
import murmurhash from 'murmurhash'
import { cacheEnvelopeSchema } from './schemas'
import type {
  CacheEnvelope,
  CacheInvalidationOptions,
  CachePluginOptions,
  CacheStatus,
} from './types'
import { entryIsFresh, entryIsStale } from './utils'

function lowerCaseFirst(input: string) {
  return input.charAt(0).toLowerCase() + input.slice(1)
}

export function defineCachePlugin(pluginOptions: CachePluginOptions) {
  let status: CacheStatus | null = null
  let revalidation: Promise<unknown> | null = null

  return definePlugin({
    id: 'cache',
    name: 'Cache',
    description: 'Optionally caches read queries.',

    queryArgs: {
      $read: cacheEnvelopeSchema,
    },

    client: {
      $cache: {
        invalidate: (options: CacheInvalidationOptions) => {
          return pluginOptions.provider.invalidate(options)
        },

        invalidateAll() {
          return pluginOptions.provider.invalidateAll()
        },

        /**
         * Returns the status of the last result returned, or `null`
         * if a result has yet to be returned.
         */
        get status() {
          return status
        },

        /**
         * Returns a `Promise` that fulfills when the last stale result
         * returned has been revalidated, or `null` if a stale result has
         * yet to be returned.
         */
        get revalidation() {
          return revalidation
        },
      },
    },

    onQuery: async ({ args, model, operation, proceed, client }) => {
      if (args && 'cache' in args) {
        const authId = client.$auth
          ? Object.keys(client.$auth)
              .filter(key =>
                client.$schema.models[client.$schema.authType!]!.idFields.includes(key),
              )
              .join('_')
          : undefined

        const json = stableHash({
          args,
          model,
          operation,
          authId,
        })

        if (!json) {
          throw new Error(
            `Failed to serialize cache entry for ${lowerCaseFirst(model)}.${operation}`,
          )
        }

        const cache = pluginOptions.provider
        const options = (args as CacheEnvelope).cache!
        const key = murmurhash.v3(json).toString()
        const entry = await cache.get(key)

        if (entry) {
          if (entryIsFresh(entry)) {
            status = 'hit'
            return entry.result
          } else if (entryIsStale(entry)) {
            revalidation = proceed(args).then(result => {
              cache
                .set(key, {
                  createdAt: Date.now(),
                  options,
                  result,
                })
                .catch(err => console.error(`Failed to cache query result: ${err}`))

              return result
            })

            status = 'stale'
            return entry.result
          }
        }

        const result = await proceed(args)

        cache
          .set(key, {
            createdAt: Date.now(),
            options,
            result,
          })
          .catch(err => console.error(`Failed to cache query result: ${err}`))

        status = 'miss'
        return result
      }

      return proceed(args)
    },
  })
}
