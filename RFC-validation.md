# RFC: Runtime Type Validation via Standard Schema

## Status: Draft

## Summary

Add runtime type validation to Cap'n Web RPC methods using Standard Schema interface and decorators.

```
┌─────────────────────────────────────────────────────────────────┐
│                         @validate decorator                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   class MyApi extends RpcTarget {                               │
│     @validate([z.string(), z.number().positive()])              │
│     async greet(name: string, age: number) { ... }              │
│   }                                                             │
│                                                                 │
│   ┌─────────┐    ┌──────────────────┐    ┌─────────────────┐   │
│   │ Request │───▶│ Standard Schema  │───▶│ Method Handler  │   │
│   │  args   │    │   Validation     │    │   (if valid)    │   │
│   └─────────┘    └──────────────────┘    └─────────────────┘   │
│                          │                                      │
│                          ▼ (if invalid)                         │
│                  ┌──────────────────┐                           │
│                  │ ValidationError  │                           │
│                  │ w/ issue paths   │                           │
│                  └──────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Why Standard Schema

### The TypeScript Ecosystem Already Uses Runtime Validators

Most TypeScript projects already use runtime validation libraries:

```
┌────────────────────────────────────────────────────────────────┐
│              Weekly npm downloads (Dec 2024)                   │
├────────────────────────────────────────────────────────────────┤
│  Zod        ████████████████████████████████████  ~25M         │
│  Yup        ██████████████████████████           ~18M         │
│  Joi        █████████████████████                ~14M         │
│  Valibot    ████                                 ~2M          │
│  ArkType    █                                    ~200K        │
└────────────────────────────────────────────────────────────────┘
```

Standard Schema unifies these libraries under one interface. Teams keep their existing validator—we just plug into it.

### Zero Friction Integration

```typescript
// Already have this in your codebase?
const UserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

// Just use it directly with @validate
class UserApi extends RpcTarget {
  @validate([UserSchema])
  async updateUser(user: z.infer<typeof UserSchema>) { ... }
}
```

### Works with Standard Tooling

```
Source Code ──▶ TypeScript ──▶ JavaScript ──▶ Runtime
     │              │              │              │
     │              │              │              ▼
     │              │              │    ┌─────────────────┐
     │              │              │    │ Schema.validate │
     │              │              │    │   (Zod, etc)    │
     │              │              │    └─────────────────┘

✓ Any bundler (esbuild, Rollup, Vite, Webpack)
✓ All runtimes (Node, Deno, Bun, browsers, Workers)
✓ Hot reload compatible
✓ No build plugins required
```

### Runtime Introspection

```typescript
// Generate OpenAPI schemas from validation
const schema = getValidationSchema(api, "createUser");

// Build admin UIs from schemas
const fields = schema.map(s => s.shape);

// Dynamic schema composition
const DynamicSchema = z.object({
  value: config.maxValue ? z.number().max(config.maxValue) : z.number()
});
```

---

## Build-Time Alternatives

Solutions like Typia take a different approach—generating validation code at compile time from TypeScript types:

```typescript
// Typia: types are source of truth
interface User {
  name: string;
  /** @format email */
  email: string;
}
typia.assert<User>(data);  // transformed at build time
```

**Benefits:**
- Zero runtime overhead (validation inlined)
- DRY—TypeScript types define validation
- Optimal generated code

**Trade-offs for most teams:**
- Requires build-time transforms (ts-patch, unplugin-typia)
- Teams already using Zod/Valibot/Yup must migrate or maintain two systems
- Constraints expressed via JSDoc tags rather than rich DSL
- No runtime schema introspection

For teams not already invested in a runtime validator and with full control over their build pipeline, build-time solutions can be compelling.

### Contributing Standard Schema Support for Typia

We could contribute Standard Schema support upstream, letting Typia users opt into the ecosystem:

```typescript
// Future: Typia implementing Standard Schema
import typia from "typia";

const UserSchema = typia.schema<User>();

class Api extends RpcTarget {
  @validate([UserSchema])  // Works with our decorator
  async createUser(user: User) { ... }
}
```

This bridges both worlds—Typia's AOT optimization with Standard Schema's interoperability.

---

## Implementation

Current implementation in `src/validate.ts`:

```typescript
// Decorator signature
function validate<S extends SchemaConfig>(schema: S)

// Validates args using Standard Schema ~standard.validate()
// Collects all issues before throwing ValidationError
// Extracts param names for better error messages
// Registers schemas for runtime introspection
```

### Supported Libraries (20+ total)

| Library    | Version | Example                                    |
|------------|---------|---------------------------------------------|
| Zod        | 3.24+   | `z.string().email()`                        |
| Valibot    | 1.0+    | `v.pipe(v.string(), v.email())`             |
| ArkType    | 2.0+    | `type("string.email")`                      |
| Yup        | 1.7+    | `yup.string().email()`                      |
| ...        | ...     | Any Standard Schema compliant validator     |

---

## Design Decisions

1. **Input-only validation** - RPC trust boundaries are at input
2. **No built-in schemas** - Users bring their own validators; we stay library-agnostic
3. **Export Standard Schema types from capnweb** - No extra dependency needed
