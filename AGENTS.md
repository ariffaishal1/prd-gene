# Repository Guidelines

## Project Structure & Module Organization

This repository is an npm workspace for the AI PRD Generator:

- `client/`: Next.js App Router frontend. UI lives in `app/`, browser helpers in
  `lib/`, component tests in `tests/`, and Playwright flows in `e2e/`.
- `server/`: Express TypeScript API. Keep routes and middleware in `src/app.ts`,
  AI access in `src/ai.ts`, and upload processing in focused modules.
- `packages/contracts/`: API request, response, error, and domain types shared by
  both applications.
- `prd.md`: authoritative MVP requirements and exclusions.

Never call 9Router from browser code or duplicate a public API shape outside the
contracts package.

## Build, Test, and Development Commands

Run `npm install` once at the repository root. Useful commands:

```bash
npm run dev        # Build contracts, then run client and server together
npm run typecheck  # Check all three TypeScript workspaces
npm run lint       # Run server and Next.js ESLint rules
npm test           # Run server and client unit/integration tests
npm run build      # Create production builds for every workspace
npm run test:e2e   # Run the mocked browser workflow with Playwright
```

Copy `.env.example` to `.env`, configure the 9Router key/model, and keep 9Router
running on port `20128` unless `AI_BASE_URL` points elsewhere.

## Coding Style & Naming Conventions

Use TypeScript, ESM, two-space indentation, and existing ESLint settings. React
components use PascalCase, hooks use `useSomething`, and ordinary modules use
kebab-case. Keep functions small and prefer explicit domain names such as
`buildPrdMessages` over generic helpers. All user-facing copy is Indonesian.

## Testing Guidelines

Use Vitest and Testing Library for unit/integration coverage, Supertest for API
behavior, and Playwright for the main user journey. Test files end in
`.test.ts`, `.test.tsx`, or `.spec.ts`. Mock 9Router; tests must not spend tokens
or require external credentials. Cover success, validation, expiration, and
provider failure paths when changing an endpoint.

## Commit & Pull Request Guidelines

Use concise Conventional Commit messages, for example `feat: add PRD download`
or `fix: reject expired uploads`. PRs should explain user-visible behavior,
identify changed API contracts, list verification commands, and include desktop
and mobile screenshots for UI changes.

## Security & Configuration

Never commit `.env`, API keys, uploaded documents, or generated PRDs. Preserve
upload size/signature validation, session ownership, TTL cleanup, CORS allowlists,
and rate limits. Do not expose filesystem paths or upstream error details.
