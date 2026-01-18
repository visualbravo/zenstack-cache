import { schema } from './schema'
import { ZenStackLive, beforeAfter } from '@visualbravo/zenstack-live'
import { ZenStackClient } from '@zenstackhq/orm'
import { PostgresDialect } from 'kysely'
import { Pool } from 'pg'

const client = new ZenStackClient(schema, {
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env['POSTGRES_URL'],
    }),
  }),
})

const live = new ZenStackLive({
  client,

  redis: {
    url: process.env['REDIS_URL'] as string,
  },
})

const userStream = live.stream({
  model: 'User',
  id: 'all-user-changes',
  created: {},
  updated: {},
  deleted: {},
})

const postStream = live.stream({
  model: 'Post',
  id: 'all-post-changes',
  created: {},
  updated: {},
  deleted: {},
})

setInterval(async () => {
  const user = await client.user.create({
    data: {
      string: 'hello',

      posts: {
        create: {
          title: 'Cool title',
          content: 'Hello world',
        },
      },
    },
  })

  await client.user.update({
    data: {
      string: 'newhello',
    },

    where: {
      id: user.id,
    },
  })

  await client.user.delete({
    where: {
      id: user.id,
    },
  })
}, 5000)

;(async () => {
  for await (const event of userStream) {
    const { before, after } = beforeAfter(event)

    console.log({
      event,
      before,
      after,
    })
  }
})()

;(async () => {
  for await (const event of postStream) {
    const { before, after } = beforeAfter(event)

    console.log({
      event,
      before,
      after,
    })
  }
})()
