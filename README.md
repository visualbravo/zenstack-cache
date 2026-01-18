<div align="center">
  <h1>
    ZenStack LIVE 🔴
    <small>(beta)</small>
  </h1>
</div>

Supercharge your ZenStack backend with realtime streaming capabilities. Instantly react to any insert, update, or delete, and declaratively filter records using the same Prisma API you've come to love.

<div align="center">
    <a href="https://www.npmjs.com/package/@visualbravo/zenstack-live?activeTab=versions">
      <img alt="NPM Version" src="https://img.shields.io/npm/v/%40visualbravo%2Fzenstack-live/latest">
    </a>
    <a>
      <img alt="GitHub Actions Workflow Status" src="https://img.shields.io/github/actions/workflow/status/visualbravo/zenstack-live/build-and-test.yaml">
    </a>
    <a href="https://discord.gg/Ykhr738dUe">
      <img alt="Join the ZenStack server" src="https://img.shields.io/discord/1035538056146595961">
    </a>
    <a href="https://github.com/visualbravo/zenstack-live/blob/main/LICENSE">
      <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green">
    </a>

  <p>
    ℹ️ This project is not affiliated with or endorsed by the ZenStack team.
  </p>
</div>

## Features
* 🛟 **Type-safe:** Queries have full intellisense based on your ZenStack models.
* 🛡️ **Durable:** Server went down? Your app picks up right where it left off, and even detects all the changes that happened while it was offline.
* 📈 **Scalable:** Just add more instances.
* 🗿 **Simple:** Build event-driven apps with fewer headaches.

## Requirements

* ZenStack (version >= `3.0.0`)
* Node.js (version >= `22.0.0`)
* Postgres that supports [logical replication](https://www.postgresql.org/docs/current/logical-replication.html) (version >= `10`)
* Redis that supports [streams](https://redis.io/docs/latest/develop/data-types/streams/) (version >= `5.0.0`)
* A non-serverless server that will process events. You can forward events to serverless if you so desire.

## Installation

```bash
npm install @visualbravo/zenstack-live
pnpm add @visualbravo/zenstack-live
bun add @visualbravo/zenstack-live
```

## Setup

Just copy our [`docker-compose.yaml`](.devcontainer/docker-compose.yaml), make any necessary changes, and proceed as follows

```typescript
import { schema } from './zenstack/schema'
import { ZenStackClient } from '@zenstackhq/orm'
import { ZenStackLive } from '@visualbravo/zenstack-live'

const client = new ZenStackClient(schema, {
  ...
})

const live = new ZenStackLive({
  client,

  redis: {
    url: process.env.REDIS_URL,
  },
})
```

## Use Cases

### Welcome Emails

```typescript
const newUserStream = live.stream({
  model: 'User',
  id: 'send-welcome-email',
  created: {},
})

for await (let event of newUserStream) {
  const user = event.created
    //  ^ properly typed as the `User` model

  await sendEmail({
    to: user.email,
    subject: `Welcome, ${user.name}!`,
  })
}
```

### Audit Logging

```typescript
import { beforeAfter } from '@visualbravo/zenstack-live'

const patientStream = live.stream({
  model: 'Patient',
  id: 'audit-log',
  created: {},
  updated: {},
  deleted: {},
})

for await (let event of patientStream) {
  const { before, after } = beforeAfter(event)

  await client.auditLog.create({
    data: {
      before,
      after,
      model: 'Patient',
      operation: event.type,
    },
  })
}
```

### Caching

```typescript
const postStream = live.stream({
  model: 'Post',
  id: 'cache',
  created: {},
  updated: {},
  deleted: {},
})

for await (let event of postStream) {
  if (event.type === 'deleted') {
    await redis.del(`posts:${event.deleted.id}`)
    continue
  }

  const { after } = beforeAfter(event)

  await redis.set(`posts:${after!.id}`, after)
}
```

You've seen the simple stuff, now let's look at more complex examples.

### Moderation

```typescript
const potentiallyHarmfulPostsStream = live.stream({
  model: 'Post',
  id: 'sentiment-moderation',

  created: {
    // All of this is type-safe, with autocomplete based on your model.
    OR: [
      {
        title: {
          contains: 'ugly',
          mode: 'insensitive',
        },
      },

      {
        title: {
          contains: 'stupid',
          mode: 'insensitive',
        },
      },
    ],
  },
})

for await (let event of potentiallyHarmfulPostsStream) {
  const post = event.created
  const sentiment = await analyzeSentiment(post)

  if (sentiment === 'rude') {
    await suspendUser(post.authorId)
  }
}
```

### Shipping Notifications

```typescript
const deliveredOrdersStream = live.stream({
  model: 'Order',
  id: 'send-delivered-email',

  updated: {
    // This is a "transition" query. You are only notified if the record transitions
    // from *not* matching before, to *matching* afterwards.
    after: {
      status: 'DELIVERED',
    },
  },
})

for await (let event of deliveredOrdersStream) {
  const order = event.updated.after

  await sendEmail({
    to: order.contactEmail,
    subject: `✅ Delivered at ${toHumanReadable(event.date)}`,
  })
}
```

## How it Works

Hint: not with polling.

1. Debezium connects to your database.
2. Debezium stores inserts, updates, and deletes in a Redis stream, *even those which are done outside of ZenStack.*
3. LIVE connects to Redis and reads the events in the stream.
4. LIVE compares each event against your query, and if it matches, serves it to you.

## Limitations

1. **This project is in beta.** There are still some things missing or broken.
2. **Postgres only.** Actually, that might not be totally true. Debezium has MySQL support, but this project has not been tested with it. Want to help? Give it a try and tell us how it goes.
3. **Events represent snapshots in time of a single record.** They are not bound by the transaction they were in. If you're listening to `created` events, the record might not exist in the database anymore if it was deleted before your handler processed it. You can determine when an event occurred via `event.date`
4. **You can't query by relations.** Although that would be very cool, this is not possible because of limitation #2.
5. **Json filtering, date arrays, custom types, and replaying errored messages are not yet implemented.**
6. **Live stream handlers can't be hosted on a serverless platform.** They need to be constantly waiting for new events to come in. Your main backend can still be serverless, and you just communicate between the two like any other service.
7. **Only the `public` schema is supported at this time.**

## License

MIT