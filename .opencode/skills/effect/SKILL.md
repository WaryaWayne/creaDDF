---
name: effect
description: Work with Effect v4 / effect-smol TypeScript code in this repo
---

# Effect

This codebase uses Effect for typed, composable TypeScript services, schemas, HTTP client behavior, and SDK workflows.

## Source Of Truth

Use the current Effect v4 / effect-smol source, not memory or older Effect v2/v3 examples.

1. If `references/effect-smol` is missing, clone `https://github.com/Effect-TS/effect-smol` there.
2. Keep `references/` local and uncommitted. It is already ignored by `.gitignore`.
3. Search `references/effect-smol` for exact APIs, examples, tests, and naming patterns before answering or implementing Effect-specific code.
4. Also inspect nearby repo code under `src` and the implementation standards in `@docs/04-implementation-standards.md`.
5. Prefer implementations backed by current source references and local repo style.

## Repo Style

- Use `Effect.fn("Stable.Name")` for exported SDK operations and important reusable service methods.
- Use `Effect.gen(function* () { ... })` for multi-step workflows.
- Keep exported SDK behavior as native Effect functions, not plain functions that only return `Effect.gen`.
- Prefer `Schema` for API and domain data shapes.
- Use `Data.TaggedError` or `Schema.TaggedErrorClass` for typed domain errors.
- Keep HTTP/client boundaries thin: build URLs, decode/encode, call services, and map transport errors.
- Put business rules and SDK behavior in Effect services/functions.
- Keep layer composition explicit with `Context.Service`, `Layer.succeed`, `Layer.effect`, and `Effect.provide`.
- Do not introduce `any`, non-null assertions, unchecked casts, or older Effect APIs just to satisfy types.
- Do not call live CREA APIs from default tests.

## Testing Patterns

- Use colocated `src/*.test.ts` files.
- Use `describe` and `it` from `node:test`.
- Use `assert` from `node:assert/strict`.
- Run effects with `Effect.runPromise(...)`.
- For expected Effect failures, use `Effect.exit(...)` plus `Exit` assertions, or `assert.rejects(...)` around `Effect.runPromise(...)`.
- Mock yielded services through Effect Context and Layer composition.
- Prefer `Layer.succeed(Service)(mock)` or `Effect.provide(effect, Layer.succeed(Service)(mock))` for service mocks.
- Mock HTTP with injected `fetch` functions through `makeDdfLayer(...)`; do not monkey-patch global fetch.
- Run `pnpm test` from the repo root. It currently runs typecheck and `node --import tsx --test src/*.test.ts`.
- Do not use OpenCode's `testEffect(...)`, `it.live(...)`, Bun test helpers, or OpenCode fixture layers in this repo.
