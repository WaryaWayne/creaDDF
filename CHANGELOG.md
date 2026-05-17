# Changelog

All notable changes to this project will be documented in this file.

This changelog starts on 2026-05-17.

## 0.0.3 - 2026-05-17

### Changed

- Released package version `0.0.3`.
- Updated the required Node.js runtime to `>=24.14.0` and documented the current runtime requirement.
- Updated the project for Effect v4 beta packages and the current Effect TypeScript tooling.
- Switched internal source imports to the `#/*` package import alias.
- Refactored Effect test helpers to use `itEffect`.
- Refreshed `pnpm-lock.yaml` for the updated dependency set.

### Commits

- `e1aac38` - 0.0.3
- `0b68d63` - Merge pull request #39 from WaryaWayne/chore/update-node-engine-v2
- `c9d2d69` - Update Node.js runtime requirement to 24.14.0
- `edb424b` - Merge pull request #37 from WaryaWayne/chore/update-imports-v2
- `e2fcf04` - Update pnpm-lock.yaml
- `8646e12` - Refactor Effect test helpers to use itEffect
- `4f1b7cf` - Update tsconfig and package.json for Effect v4
- `cba0047` - Refactor imports to use '#' path alias
