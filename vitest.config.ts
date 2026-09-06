import { defineConfig } from 'vitest/config'

/**
 * Kept separate from `vite.config.ts` so the app build carries no test
 * configuration, and so the dev-server proxy block cannot affect test runs.
 *
 * The suite is `node`-environment on purpose: everything under test is either
 * pure domain code or a service whose browser dependencies are injected, which
 * is exactly the boundary `docs/01-architecture.md` asks for. A test that
 * needed a DOM would be a sign that logic had leaked into the UI layer.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    restoreMocks: true
  }
})
