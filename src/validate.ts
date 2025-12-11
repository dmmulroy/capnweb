import type { StandardSchemaV1 } from "@standard-schema/spec";

export type { StandardSchemaV1 };

/**
 * Error thrown when validation fails.
 */
export class ValidationError extends Error {
  readonly issues: ReadonlyArray<StandardSchemaV1.Issue>;
  readonly methodName: string;

  constructor(
    issues: ReadonlyArray<StandardSchemaV1.Issue>,
    methodName: string
  ) {
    const messages = issues.map((issue) => {
      const path = issue.path
        ?.map((p) => (typeof p === "object" ? p.key : p))
        .join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    });
    super(`Validation failed for ${methodName}: ${messages.join(", ")}`);
    this.name = "ValidationError";
    this.issues = issues;
    this.methodName = methodName;
  }
}

/**
 * Schema configuration - array of schemas, one per positional argument.
 */
export type SchemaConfig = readonly StandardSchemaV1[];

// Storage for validation schemas (wrapper function → schema)
const schemaRegistry = new WeakMap<
  Function,
  { readonly name: string | symbol; readonly schema: SchemaConfig; }
>();

// Async method signature
type AsyncMethod<This, Args extends unknown[], Return> = (
  this: This,
  ...args: Args
) => Promise<Return>;

/**
 * Decorator to add runtime validation to RPC methods using Standard Schema validators.
 *
 * Methods must be async (return Promise). This is enforced at compile time.
 * RPC methods are inherently async over the wire, so this is natural.
 *
 * @example
 * import { z } from 'zod';
 *
 * class MyApi extends RpcTarget {
 *   @validate([z.string().min(1), z.number().positive()])
 *   async greet(name: string, age: number) {
 *     return `Hello ${name}, you are ${age} years old`;
 *   }
 * }
 */
export function validate<const S extends SchemaConfig>(schema: S) {
  if (schema.length === 0) {
    throw new TypeError("@validate requires at least one schema");
  }

  return function <This, Args extends unknown[], Return>(
    target: AsyncMethod<This, Args, Return>,
    context: ClassMethodDecoratorContext<This, AsyncMethod<This, Args, Return>>
  ): AsyncMethod<This, Args, Return> {
    if (context.kind !== "method") {
      throw new TypeError("@validate can only be applied to methods");
    }

    const methodName = String(context.name);
    const paramNames = extractParamNames(target);

    async function validatedMethod(
      this: This,
      ...args: Args
    ): Promise<Return> {
      await runValidation(schema, args, methodName, paramNames);
      return target.call(this, ...args);
    }

    schemaRegistry.set(validatedMethod, { name: context.name, schema });

    return validatedMethod;
  };
}

/**
 * Extract parameter names from function source (best-effort).
 * Falls back to positional indices if parsing fails.
 *
 * Known limitations:
 * - Minified code will use indices
 * - Destructured params ({ a, b }) will show full pattern
 * - Default values with parens may truncate incorrectly
 */
function extractParamNames(fn: Function): string[] {
  const src = fn.toString();
  const match = src.match(/\(([^)]*)\)/);
  if (!match?.[1]) return [];

  return match[1]
    .split(",")
    .map((p) => p.trim().split(/[=:]/)[0].trim())
    .filter(Boolean);
}

/**
 * Type guard for Standard Schema.
 * Note: Some libraries (like ArkType) implement schemas as functions, not objects.
 *
 * SAFETY: Type assertions required for runtime type guard on unknown value.
 * We progressively narrow: check object/function → check ~standard exists → check validate is function.
 */
function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  if (value === null || value === undefined) return false;
  if (typeof value !== "object" && typeof value !== "function") return false;

  const standard = (value as { "~standard"?: unknown; })["~standard"];
  if (typeof standard !== "object" || standard === null) return false;

  return typeof (standard as { validate?: unknown; }).validate === "function";
}

/**
 * Run validation against all schemas.
 */
async function runValidation(
  schemas: SchemaConfig,
  args: readonly unknown[],
  methodName: string,
  paramNames: readonly string[]
): Promise<void> {
  const issues: StandardSchemaV1.Issue[] = [];

  for (let i = 0; i < schemas.length; i++) {
    const schema = schemas[i];
    if (!isStandardSchema(schema)) {
      throw new TypeError(
        `@validate: schema at index ${i} is not a valid Standard Schema (missing ~standard.validate)`
      );
    }

    const value = i < args.length ? args[i] : undefined;
    const result = await schema["~standard"].validate(value);

    if (result.issues) {
      const paramLabel = paramNames[i] ?? i;
      for (const issue of result.issues) {
        issues.push({
          ...issue,
          path: [paramLabel, ...(issue.path ?? [])],
        });
      }
    }
  }

  if (issues.length > 0) {
    throw new ValidationError(issues, methodName);
  }
}

/**
 * Get the validation schema for a method (for introspection).
 */
export function getValidationSchema(
  target: object,
  methodName: string | symbol
): SchemaConfig | undefined {
  if (!(methodName in target)) return undefined;

  // SAFETY: We verified methodName exists via `in` check above.
  // TypeScript doesn't narrow object types through `in`, so cast is required.
  const method = (target as Record<string | symbol, unknown>)[methodName];
  if (typeof method !== "function") return undefined;

  return schemaRegistry.get(method)?.schema;
}
