import type { SchemaDef, GetModels } from '@zenstackhq/schema'
import { z } from 'zod/v4'

export type QueryCompilerOptions<Schema extends SchemaDef, ModelName extends GetModels<Schema>> = {
  schema: Schema
  modelName: ModelName
}

type CommonFilter<T> = {
  equals?: T | null
  in?: T[]
  notIn?: T[]
  lt?: T
  lte?: T
  gt?: T
  gte?: T
  not?: T | CommonFilter<T>
}

type CommonArrayFilter<T> = {
  equals?: T[]
  has?: T
  hasEvery?: T[]
  hasSome?: T[]
  isEmpty?: boolean
}

type EnumFilter = Pick<CommonFilter<string>, 'equals' | 'in' | 'notIn' | 'not'>

type StringFilter = {
  contains?: string
  startsWith?: string
  endsWith?: string
  mode?: 'default' | 'insensitive'
} & CommonFilter<string>

type IntFilter = CommonFilter<number>
type BigIntFilter = CommonFilter<bigint>

type BooleanFilter = Pick<CommonFilter<boolean>, 'equals' | 'not'>

const operatorNames = new Set(['AND', 'OR', 'NOT'])

export class QueryCompiler<Schema extends SchemaDef, ModelName extends GetModels<Schema>> {
  private readonly options: QueryCompilerOptions<Schema, ModelName>

  constructor(options: QueryCompilerOptions<Schema, ModelName>) {
    this.options = options
  }

  compile(where: any) {
    const schemaFields: Record<string, unknown> = {}
    const model = this.options.schema.models[this.options.modelName]!
    let andSchemas: z.ZodSchema[] | undefined
    let notSchemas: z.ZodSchema[] | undefined
    let orSchemas: z.ZodSchema[] | undefined

    for (const [key, value] of Object.entries(where)) {
      if (operatorNames.has(key)) {
        if (key === 'AND') {
          if (Array.isArray(value)) {
            andSchemas = value.map(where => this.compile(where))
          } else {
            andSchemas = [this.compile(value)]
          }

          continue
        }

        if (key === 'NOT') {
          if (Array.isArray(value)) {
            notSchemas = value.map(where => this.compile(where))
          } else {
            notSchemas = [this.compile(value)]
          }

          continue
        }

        if (key === 'OR' && Array.isArray(value)) {
          orSchemas = value.map(where => this.compile(where))
        }

        continue
      }

      const field = Object.values(model.fields).find(field => field.name === key)!
      const fieldModel = this.options.schema.models[field.type]
      const isEnum = !!fieldModel

      if (isEnum) {
        if (field.array) {
          schemaFields[key] = QueryCompiler.compileEnumArray(value as CommonArrayFilter<string>)
        } else {
          schemaFields[key] = QueryCompiler.compileEnum(value as string | EnumFilter)
        }
        continue
      }

      switch (field.type) {
        case 'String':
          if (field.array) {
            schemaFields[key] = QueryCompiler.compileStringArray(value as CommonArrayFilter<string>)
          } else {
            schemaFields[key] = QueryCompiler.compileString(value as string | CommonFilter<string>)
          }
          break
        case 'Boolean':
          if (field.array) {
            schemaFields[key] = QueryCompiler.compileBooleanArray(
              value as CommonArrayFilter<boolean>,
            )
          } else {
            schemaFields[key] = QueryCompiler.compileBoolean(
              value as boolean | CommonFilter<boolean>,
            )
          }
          break
        case 'Int':
          if (field.array) {
            schemaFields[key] = QueryCompiler.compileIntArray(value as CommonArrayFilter<number>)
          } else {
            schemaFields[key] = QueryCompiler.compileInt(value as number | IntFilter)
          }
          break
        case 'Float':
          if (field.array) {
            schemaFields[key] = QueryCompiler.compileFloatArray(value as CommonArrayFilter<number>)
          } else {
            schemaFields[key] = QueryCompiler.compileFloat(value as number | IntFilter)
          }
          break
        case 'BigInt':
          if (field.array) {
            schemaFields[key] = QueryCompiler.compileBigIntArray(value as CommonArrayFilter<bigint>)
          } else {
            schemaFields[key] = QueryCompiler.compileBigInt(value as bigint | BigIntFilter)
          }
          break
        case 'DateTime':
          schemaFields[key] = QueryCompiler.compileDateTime(value as Date | CommonFilter<Date>)
          break
        default:
          break
      }
    }

    const localSchema = z.object(schemaFields)

    return z.any().refine(payload => {
      if (!localSchema.safeParse(payload).success) {
        return false
      }

      if (andSchemas) {
        for (const schema of andSchemas) {
          if (!schema.safeParse(payload).success) {
            return false
          }
        }
      }

      if (orSchemas && orSchemas.length > 0) {
        let matched = false

        for (const schema of orSchemas) {
          if (schema.safeParse(payload).success) {
            matched = true
            break
          }
        }

        if (!matched) {
          return false
        }
      }

      if (notSchemas) {
        for (const schema of notSchemas) {
          if (schema.safeParse(payload).success) {
            return false
          }
        }
      }

      return true
    })
  }

  static compileString(value: string | StringFilter) {
    if (typeof value === 'string') {
      return z.literal(value)
    }

    if (typeof value.equals !== 'undefined') {
      if (value.mode === 'insensitive') {
        return z.string().transform(v => v.toLowerCase() === value.equals!.toLowerCase())
      }

      return z.literal(value.equals)
    }

    let schema = z.string()

    if (typeof value.startsWith !== 'undefined') {
      if (value.mode === 'insensitive') {
        schema = schema.startsWith(value.startsWith.toLowerCase()).toLowerCase()
      } else {
        schema = schema.startsWith(value.startsWith)
      }
    }

    if (typeof value.endsWith !== 'undefined') {
      if (value.mode === 'insensitive') {
        schema = schema.endsWith(value.endsWith.toLowerCase()).toLowerCase()
      } else {
        schema = schema.endsWith(value.endsWith)
      }
    }

    if (typeof value.contains !== 'undefined') {
      if (value.mode === 'insensitive') {
        schema = schema.includes(value.contains.toLowerCase()).toLowerCase()
      } else {
        schema = schema.includes(value.contains)
      }
    }

    if (typeof value.gt !== 'undefined') {
      schema = schema.refine(v => v > value.gt!)
    }

    if (typeof value.gte !== 'undefined') {
      schema = schema.refine(v => v >= value.gte!)
    }

    if (typeof value.lt !== 'undefined') {
      schema = schema.refine(v => v < value.lt!)
    }

    if (typeof value.lte !== 'undefined') {
      schema = schema.refine(v => v <= value.lte!)
    }

    if (typeof value.in !== 'undefined') {
      schema = schema.refine(v => value.in?.includes(v))
    }

    if (typeof value.notIn !== 'undefined') {
      schema = schema.refine(v => !value.notIn?.includes(v))
    }

    if (typeof value.not !== 'undefined') {
      schema = schema.refine(v => !this.compileString(value.not!).safeParse(v).success)
    }

    return schema
  }

  static compileStringArray(value: CommonArrayFilter<string>) {
    if (value.isEmpty === true) {
      return z.string().array().length(0)
    }

    let schema = z.string().array()

    if (typeof value.equals !== 'undefined') {
      schema = schema.refine(v => {
        for (let i = 0; i < v.length; i++) {
          if (value.equals![i] !== v[i]) {
            return false
          }
        }

        return true
      })
    }

    if (typeof value.hasEvery !== 'undefined') {
      schema = schema.refine(v => {
        const vSet = new Set(v)
        const valueSet = new Set(value.hasEvery!)

        return vSet.isSupersetOf(valueSet)
      })
    }

    if (typeof value.hasSome !== 'undefined') {
      schema = schema.refine(v => {
        const vSet = new Set(v)
        const valueSet = new Set(value.hasSome!)

        return vSet.intersection(valueSet).size > 0
      })
    }

    if (typeof value.has !== 'undefined') {
      schema = schema.refine(v => {
        return v.includes(value.has!)
      })
    }

    return schema
  }

  static compileBoolean(value: boolean | BooleanFilter) {
    if (typeof value === 'boolean') {
      return z.literal(value)
    }

    if (typeof value.equals !== 'undefined') {
      return z.literal(value.equals)
    }

    let schema = z.boolean()

    if (typeof value.not !== 'undefined') {
      schema = schema.refine(v => !this.compileBoolean(value.not!).safeParse(v).success)
    }

    return schema
  }

  static compileBooleanArray(value: CommonArrayFilter<boolean>) {
    if (value.isEmpty === true) {
      return z.boolean().array().length(0)
    }

    let schema = z.boolean().array()

    if (typeof value.equals !== 'undefined') {
      schema = schema.refine(v => {
        for (let i = 0; i < v!.length; i++) {
          if (value.equals![i] !== v![i]) {
            return false
          }
        }

        return true
      })
    }

    if (typeof value.hasEvery !== 'undefined') {
      schema = schema.refine(v => {
        const vSet = new Set(v)
        const valueSet = new Set(value.hasEvery!)

        return vSet.isSupersetOf(valueSet)
      })
    }

    if (typeof value.hasSome !== 'undefined') {
      schema = schema.refine(v => {
        const vSet = new Set(v)
        const valueSet = new Set(value.hasSome!)

        return vSet.intersection(valueSet).size > 0
      })
    }

    if (typeof value.has !== 'undefined') {
      schema = schema.refine(v => {
        return v.includes(value.has!)
      })
    }

    return schema
  }

  static compileEnum(value: string | EnumFilter) {
    if (typeof value === 'string') {
      return z.literal(value)
    }

    if (typeof value.equals !== 'undefined') {
      return z.literal(value.equals)
    }

    let schema = z.string()

    if (typeof value.in !== 'undefined') {
      schema = schema.refine(v => value.in?.includes(v))
    }

    if (typeof value.notIn !== 'undefined') {
      schema = schema.refine(v => !value.notIn?.includes(v))
    }

    if (typeof value.not !== 'undefined') {
      schema = schema.refine(v => !this.compileEnum(value.not!).safeParse(v).success)
    }

    return schema
  }

  static compileEnumArray(value: CommonArrayFilter<string>) {
    if (value.isEmpty === true) {
      return z.string().array().length(0)
    }

    let schema = z.string().array()

    if (typeof value.equals !== 'undefined') {
      schema = schema.refine(v => {
        for (let i = 0; i < v!.length; i++) {
          if (value.equals![i] !== v![i]) {
            return false
          }
        }

        return true
      })
    }

    if (typeof value.hasEvery !== 'undefined') {
      schema = schema.refine(v => {
        const vSet = new Set(v)
        const valueSet = new Set(value.hasEvery!)

        return vSet.isSupersetOf(valueSet)
      })
    }

    if (typeof value.hasSome !== 'undefined') {
      schema = schema.refine(v => {
        const vSet = new Set(v)
        const valueSet = new Set(value.hasSome!)

        return vSet.intersection(valueSet).size > 0
      })
    }

    if (typeof value.has !== 'undefined') {
      schema = schema.refine(v => {
        return v.includes(value.has!)
      })
    }

    return schema
  }

  static compileInt(value: number | IntFilter) {
    if (typeof value === 'number') {
      return z.literal(value)
    }

    if (typeof value.equals !== 'undefined') {
      return z.literal(value.equals)
    }

    let schema = z.number()

    if (typeof value.gt !== 'undefined') {
      schema = schema.refine(v => v > value.gt!)
    }

    if (typeof value.gte !== 'undefined') {
      schema = schema.refine(v => v >= value.gte!)
    }

    if (typeof value.lt !== 'undefined') {
      schema = schema.refine(v => v < value.lt!)
    }

    if (typeof value.lte !== 'undefined') {
      schema = schema.refine(v => v <= value.lte!)
    }

    if (typeof value.in !== 'undefined') {
      schema = schema.refine(v => value.in?.includes(v))
    }

    if (typeof value.notIn !== 'undefined') {
      schema = schema.refine(v => !value.notIn?.includes(v))
    }

    if (typeof value.not !== 'undefined') {
      schema = schema.refine(v => !this.compileInt(value.not!).safeParse(v).success)
    }

    return schema
  }

  static compileFloat(value: number | IntFilter) {
    if (typeof value === 'number') {
      return z.literal(value)
    }

    if (typeof value.equals !== 'undefined') {
      return z.literal(value.equals)
    }

    let schema = z.float64()

    if (typeof value.gt !== 'undefined') {
      schema = schema.refine(v => v > value.gt!)
    }

    if (typeof value.gte !== 'undefined') {
      schema = schema.refine(v => v >= value.gte!)
    }

    if (typeof value.lt !== 'undefined') {
      schema = schema.refine(v => v < value.lt!)
    }

    if (typeof value.lte !== 'undefined') {
      schema = schema.refine(v => v <= value.lte!)
    }

    if (typeof value.in !== 'undefined') {
      schema = schema.refine(v => value.in?.includes(v))
    }

    if (typeof value.notIn !== 'undefined') {
      schema = schema.refine(v => !value.notIn?.includes(v))
    }

    if (typeof value.not !== 'undefined') {
      schema = schema.refine(v => !this.compileFloat(value.not!).safeParse(v).success)
    }

    return schema
  }

  static compileFloatArray(value: CommonArrayFilter<number>) {
    if (value.isEmpty === true) {
      return z.float64().array().length(0)
    }

    let schema = z.float64().array()

    if (typeof value.equals !== 'undefined') {
      schema = schema.refine(v => {
        for (let i = 0; i < v!.length; i++) {
          if (value.equals![i] !== v![i]) {
            return false
          }
        }

        return true
      })
    }

    if (typeof value.hasEvery !== 'undefined') {
      schema = schema.refine(v => {
        const vSet = new Set(v)
        const valueSet = new Set(value.hasEvery!)

        return vSet.isSupersetOf(valueSet)
      })
    }

    if (typeof value.hasSome !== 'undefined') {
      schema = schema.refine(v => {
        const vSet = new Set(v)
        const valueSet = new Set(value.hasSome!)

        return vSet.intersection(valueSet).size > 0
      })
    }

    if (typeof value.has !== 'undefined') {
      schema = schema.refine(v => {
        return v.includes(value.has!)
      })
    }

    return schema
  }

  static compileIntArray(value: CommonArrayFilter<number>) {
    if (value.isEmpty === true) {
      return z.number().array().length(0)
    }

    let schema = z.number().array()

    if (typeof value.equals !== 'undefined') {
      schema = schema.refine(v => {
        for (let i = 0; i < v!.length; i++) {
          if (value.equals![i] !== v![i]) {
            return false
          }
        }

        return true
      })
    }

    if (typeof value.hasEvery !== 'undefined') {
      schema = schema.refine(v => {
        const vSet = new Set(v)
        const valueSet = new Set(value.hasEvery!)

        return vSet.isSupersetOf(valueSet)
      })
    }

    if (typeof value.hasSome !== 'undefined') {
      schema = schema.refine(v => {
        const vSet = new Set(v)
        const valueSet = new Set(value.hasSome!)

        return vSet.intersection(valueSet).size > 0
      })
    }

    if (typeof value.has !== 'undefined') {
      schema = schema.refine(v => {
        return v.includes(value.has!)
      })
    }

    return schema
  }

  private static isBigInt(value: unknown): value is bigint {
    return typeof value === 'bigint'
  }

  static compileBigInt(value: bigint | BigIntFilter) {
    if (this.isBigInt(value)) {
      return z.literal(value)
    }

    if (typeof value.equals !== 'undefined') {
      return z.literal(value.equals)
    }

    let schema = z.bigint()

    if (typeof value.gt !== 'undefined') {
      schema = schema.refine(v => v > value.gt!)
    }

    if (typeof value.gte !== 'undefined') {
      schema = schema.refine(v => v >= value.gte!)
    }

    if (typeof value.lt !== 'undefined') {
      schema = schema.refine(v => v < value.lt!)
    }

    if (typeof value.lte !== 'undefined') {
      schema = schema.refine(v => v <= value.lte!)
    }

    if (typeof value.not !== 'undefined') {
      schema = schema.refine(v => !this.compileBigInt(value.not!).safeParse(v).success)
    }

    return schema
  }

  static compileBigIntArray(value: CommonArrayFilter<bigint>) {
    if (value.isEmpty === true) {
      return z.bigint().array().length(0)
    }

    let schema = z.bigint().array()

    if (typeof value.equals !== 'undefined') {
      schema = schema.refine(v => {
        for (let i = 0; i < v!.length; i++) {
          if (value.equals![i] !== v![i]) {
            return false
          }
        }

        return true
      })
    }

    if (typeof value.hasEvery !== 'undefined') {
      schema = schema.refine(v => {
        const vSet = new Set(v)
        const valueSet = new Set(value.hasEvery!)

        return vSet.isSupersetOf(valueSet)
      })
    }

    if (typeof value.hasSome !== 'undefined') {
      schema = schema.refine(v => {
        const vSet = new Set(v)
        const valueSet = new Set(value.hasSome!)

        return vSet.intersection(valueSet).size > 0
      })
    }

    if (typeof value.has !== 'undefined') {
      schema = schema.refine(v => {
        return v.includes(value.has!)
      })
    }

    return schema
  }

  static compileDateTime(value: Date | CommonFilter<Date>) {
    if (value instanceof Date) {
      return z.date().refine(v => v.getTime() === value.getTime())
    }

    if (value.equals instanceof Date) {
      return z.date().refine(v => v.getTime() === value.equals!.getTime())
    }

    let schema = z.date()

    if (typeof value.gt !== 'undefined') {
      schema = schema.refine(v => v > value.gt!)
    }

    if (typeof value.gte !== 'undefined') {
      schema = schema.refine(v => v >= value.gte!)
    }

    if (typeof value.lt !== 'undefined') {
      schema = schema.refine(v => v < value.lt!)
    }

    if (typeof value.lte !== 'undefined') {
      schema = schema.refine(v => v <= value.lte!)
    }

    if (typeof value.in !== 'undefined') {
      schema = schema.refine(v => value.in?.some(v2 => v2.getTime() === v.getTime()))
    }

    if (typeof value.notIn !== 'undefined') {
      schema = schema.refine(v => value.notIn?.some(v2 => v2.getTime() !== v.getTime()))
    }

    if (typeof value.not !== 'undefined') {
      schema = schema.refine(v => !this.compileDateTime(value.not!).safeParse(v).success)
    }

    return schema
  }
}
