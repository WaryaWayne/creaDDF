---
name: effect
description: Work with Effect v4 / effect-smol TypeScript code in this repo
---

# Effect

This codebase uses Effect for typed, composable TypeScript services, schemas, HTTP client behavior, and SDK workflows.

## Source Of Truth

Use the current Effect v4 / effect-smol source, not memory or older Effect v2/v3 examples.

1. The local Effect reference checkout is `references/effect-smol`; if someone says `references/effect`, check this folder first.
2. If `references/effect-smol` is missing, clone `https://github.com/Effect-TS/effect-smol` there.
3. Keep `references/` local and uncommitted. It is already ignored by `.gitignore`.
4. Search `references/effect-smol` for exact APIs, examples, tests, and naming patterns before answering or implementing Effect-specific code.
5. Also inspect nearby repo code under `src` and the implementation standards in `@docs/04-implementation-standards.md`.
6. Prefer implementations backed by current source references and local repo style.

Useful reference entrypoints:

- `references/effect-smol/ai-docs/src/01_effect/01_basics/01_effect-gen.ts`
- `references/effect-smol/ai-docs/src/01_effect/01_basics/02_effect-fn.ts`
- `references/effect-smol/ai-docs/src/01_effect/02_services/01_service.ts`
- `references/effect-smol/ai-docs/src/01_effect/02_services/20_layer-composition.ts`
- `references/effect-smol/ai-docs/src/09_testing/10_effect-tests.ts`
- `references/effect-smol/ai-docs/src/09_testing/20_layer-tests.ts`
- `references/effect-smol/packages/vitest/src/index.ts`

## Effect Best Practices

- Use `Effect.fn("Stable.Name")(function* (...) { ... })` for exported SDK operations and important reusable service methods.
- Do not write a plain function whose only job is to return `Effect.gen`; use `Effect.fn` so spans, traces, and diagnostics name the operation.
- Use `Effect.gen(function* () { ... })` for multi-step workflows and `yield*` every effectful dependency, service call, decode, retry, sleep, or fiber operation.
- When raising a typed error inside a generator, `return yield* new SomeError(...)` so TypeScript understands the branch does not continue.
- Keep pure deterministic transforms as plain functions only when they do not read context, perform IO, decode effectfully, retry, log, or participate in orchestration.
- Prefer `Schema` for API and domain data shapes, and use `Schema.decodeUnknownEffect(...)` at API/resource boundaries.
- Use `Data.TaggedError` or `Schema.TaggedErrorClass` for typed domain errors; use `Effect.catchTags(...)` when handling several tagged errors together.
- Preserve lower-level causes when wrapping transport, schema, SQL, or platform failures.
- Keep layer composition explicit with `Context.Service`, `Layer.succeed`, `Layer.effect`, `Layer.provide`, `Layer.provideMerge`, and `Effect.provide`.
- Define services as `Context.Service` classes with stable string identifiers and return implementations with `Service.of(...)`.
- Put business rules and SDK behavior in Effect services/functions; keep HTTP/client boundaries thin around URL construction, encoding, decoding, and transport error mapping.
- Use the native Effect HTTP client APIs already present in this repo; do not add fetch-style compatibility layers unless the user explicitly asks.
- Treat Effect LSP diagnostics as best-practice feedback. Do not silence them with `any`, non-null assertions, unchecked casts, or older APIs just to satisfy types.

## Repo Style

- Prefix client/core method names with `DdfClient`, `DdfAuth`, `DdfHttp`, or `DdfOData`.
- Prefix resource methods with the resource service, such as `DdfProperty.listProperties`.
- Prefix sync methods with the sync service, such as `DdfPropertySync.syncProperties`.
- Prefer colocated SDK code and tests under `src`.
- Do not call live CREA APIs from default tests.
- Use `Effect.runPromise(...)` only at real runtime boundaries such as CLI scripts, integration entrypoints, or app callbacks; inside SDK code and unit tests, stay in Effect values.

## Testing Patterns

- Use colocated `src/*.test.ts` files.
- Use `describe`, `it`, `assert`, and `expect` from `@effect/vitest`.
- Write Effect tests as `it.effect("does something", () => Effect.gen(function* () { ... }))`.
- Prefer `Effect.gen` in tests too; use `yield*` for service access, schema decodes, fibers, `Effect.exit(...)`, and assertions on effect results.
- Do not wrap `it.effect` bodies in `Effect.runPromise(...)`; `@effect/vitest` runs the returned Effect.
- For expected Effect failures, use `const exit = yield* Effect.exit(program)` inside `Effect.gen` and assert with `Exit` or `Cause` helpers.
- Mock yielded services through Effect Context and Layer composition.
- Prefer `Effect.provide(effect, Layer.succeed(Service, mock))` or a small `Layer.effect(...)` when a mock itself needs refs, clocks, or setup.
- Use `layer(testLayer)("name", (it) => { ... })` from `@effect/vitest` when several tests should share one provided layer.
- Use `TestClock` from `effect/testing` for sleeps, retry backoff, token expiry, and time-sensitive code instead of waiting on real timers.
- Use `it.effect.each(...)` for table tests and `it.effect.prop(...)` with `Schema` arbitraries when property checks add value.
- Use `it.live(...)` only when the test intentionally uses live runtime services. Live CREA credential checks belong in opt-in integration tests, not default unit tests.
- Run `pnpm test` from the repo root. It currently runs typecheck and `vitest run`.
