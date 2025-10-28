# ADR-0001: Initial Stack
**Date:** 2025-10-28  
**Status:** Accepted

## Context
Need fast scaffolding for landing page and core infrastructure while keeping the VS Code fork as the editor foundation.

## Decision
- **Landing:** Next.js 14 (Node 20, npm, TypeScript)
- **Editor:** VS Code fork (existing)
- **CI:** GitHub Actions
- **Package manager:** npm (not pnpm/yarn)

## Rationale
- Next.js: fast DX, strong ecosystem, easy deployment
- npm: already present in VS Code fork; no tooling friction
- GitHub Actions: native integration, free tier sufficient
- Small and reversible: can migrate at v0.2 if needed

## Alternatives Considered
- Astro for landing: more minimal but less familiar to most contributors
- pnpm for workspace: better de-duplication but adds setup friction
- Turborepo: overkill for current scale

## Consequences
- Familiar toolchain accelerates onboarding
- Can revisit at next milestone if constraints change
