# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-02-04

### Added

- Core runtime: introspection, field registry, query/mutation builders, flatten/unflatten
- React integration with `DriftProvider`, `useDriftType`, and TanStack Query v5 `queryOptions` pattern
- Zod schema generation from field definitions (`buildResultSchema`, `buildInputSchema`)
- CLI tool with `init` and `generate` commands
- Local schema file support (`--schema` flag) alongside endpoint introspection
- Custom fetcher support for urql, Apollo, graphql-request, etc.
- Wildcard type discovery (`types: "*"`) with `--exclude` pattern filtering
- Nested field flattening with configurable depth
- Rendering helpers (`formatValue`, `inputType`, `parseInput`)
- CI/CD with GitHub Actions (test, lint, typecheck, build, publish)
