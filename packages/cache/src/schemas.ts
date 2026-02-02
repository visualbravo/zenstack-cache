import z from 'zod'

export const cacheOptionsSchema = z.strictObject({
  ttl: z.int().positive().optional(),
  swr: z.int().positive().optional(),
  tags: z.string().array().optional(),
})

export const cacheEnvelopeSchema = z.object({
  cache: cacheOptionsSchema.optional(),
})
