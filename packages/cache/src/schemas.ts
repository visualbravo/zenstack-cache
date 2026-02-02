import z from 'zod'

export const cacheOptionsSchema = z.strictObject({
  ttl: z.int().positive().min(1).optional(),
  swr: z.int().positive().min(1).optional(),
  tags: z.string().array().optional(),
})

export const cacheEnvelopeSchema = z.object({
  cache: cacheOptionsSchema.optional(),
})
