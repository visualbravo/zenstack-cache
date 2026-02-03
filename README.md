<div align="center">
  <h1>
    ZenStack Cache
  </h1>

  Reduce response times and database load with query-level caching integrated with the ZenStack ORM.
</div>

<div align="center">
    <a href="https://www.npmjs.com/package/@visualbravo/zenstack-cache?activeTab=versions">
      <img alt="NPM Version" src="https://img.shields.io/npm/v/%40visualbravo%2Fzenstack-cache/latest">
    </a>
    <a href="https://www.npmjs.com/package/@visualbravo/zenstack-cache">
      <img alt="NPM Downloads" src="https://img.shields.io/npm/dm/%40visualbravo%2Fzenstack-cache">
    </a>
    <a href="https://github.com/visualbravo/zenstack-cache/actions/workflows/build-and-test.yaml?query=branch%3Adev++">
      <img alt="Build Status" src="https://img.shields.io/github/actions/workflow/status/visualbravo/zenstack-cache/build-and-test.yaml">
    </a>
    <a href="https://discord.gg/2PaRSu7X">
      <img alt="Join the ZenStack Cache channel" src="https://img.shields.io/discord/1035538056146595961">
    </a>
    <a href="https://github.com/visualbravo/zenstack-cache/blob/76a2de03245c26841b04525dd8b424a8799d654c/LICENSE">
      <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green">
    </a>

  <p>
    ℹ️ This project is not affiliated with or endorsed by the ZenStack team.
  </p>
</div>

## Features
* 🌐 **Redis Cache:** A central cache to scale across different systems.
* 🖥️ **Memory Cache:** A simple cache when scale is not a concern.
* 🛟 **Type-safety:** The caching options appear in the intellisense for all read queries.
* 🏷️ **Tag-based Invalidation:** Easily invalidate multiple related cache entries.

## Requirements

* ZenStack (version >= `3.3.0`)
* Node.js (version >= `20.0.0`)
* Redis (version >= `7.0.0`)
  * ℹ️ Only if you intend to use the `RedisCacheProvider`

## Installation

```bash
npm install @visualbravo/zenstack-cache
pnpm add @visualbravo/zenstack-cache
bun add @visualbravo/zenstack-cache
```

## Sample Usage

```typescript
import { schema } from './zenstack/schema'
import { ZenStackClient } from '@zenstackhq/orm'
import { defineCachePlugin } from '@visualbravo/zenstack-cache'
import { RedisCacheProvider } from '@visualbravo/zenstack-cache/providers/redis'
import { MemoryCacheProvider } from '@visualbravo/zenstack-cache/providers/memory'

const client = new ZenStackClient(schema, {
  dialect: ...,
}).$use(
  defineCachePlugin({
    // Choose only one provider.

    // 1️⃣
    provider: new RedisCacheProvider({
      url: process.env['REDIS_URL'],
    }),

    // 2️⃣
    provider: new MemoryCacheProvider(),
  }),
)

async function getPostsPublishedByUser(userId: string) {
  const publishedPosts = await client.post.findMany({
    where: {
      published: true,
      authorId: userId,
    },

    // All of these are optional.
    cache: {
      ttl: 60,
      swr: 120,
      tags: [`user:${userId}`],
    },
  })

  return publishedPosts
}
```

## Invalidation

You can easily invalidate multiple cache entries.

```typescript
// Invalidate specific tags.
await client.$cache.invalidate({
  tags: ['user:1'],
})

// Invalidate everything.
await client.$cache.invalidateAll()
```

## Cache Status

After performing a query, you can check where the result came from.

```typescript
const publishedPostsStatus = client.$cache.status // 'hit' | 'miss' | 'stale'
```

* `hit` - a cache entry in the `ttl` window was found, and the database was not queried.
* `miss` - a cache entry was not found, and the database was queried.
* `stale` - a cache entry in the `swr` window was found, and the database was queried in the background to revalidate it.

## Revalidation

If the result was stale, you can choose to await its revalidation.
```typescript
const revalidatedPublishedPosts = await client.$cache.revalidation as Post[]
```

## Cache Options

* `ttl` reduces response times and database load by serving cached results.
* `swr` reduces response times by serving cached results, but does not reduce database load because it performs a revalidation in the background after each request.

> [!NOTE]
> The total TTL of a cache entry is equal to its `ttl` + `swr`. The `ttl` window comes first, followed by the `swr` window. You can combine the two options to best suit the needs of your application.

## Caching Forever

You can cache results forever by specifying neither `ttl` nor `swr`. Such results will always be considered fresh.

```typescript
client.post.findMany({
  cache: {
    tags: [`user:${userId}`],
  },
})
```

> [!WARNING]
> Your server may eventually run out of memory if you're not careful about invalidating entries that never expire.

## License

MIT
