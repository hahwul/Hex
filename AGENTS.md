# Copilot Instructions for Hex

## Project Overview

Hex is a Hex Viewer & Editor plugin for [Caido](https://caido.io/). It adds hex viewing and editing capabilities to the History, Replay, Search, and Sitemap tabs in Caido.

## Tech Stack

- **Language**: TypeScript
- **Framework**: Vue.js 3 (Composition API with `<script setup>`)
- **Build Tool**: Vite (via `@caido-community/dev`)
- **Package Manager**: pnpm (v9)
- **Testing**: Vitest
- **Styling**: TailwindCSS with PrimeVue and Caido themes
- **Linting**: ESLint with `@caido/eslint-config`

## Project Structure

```
Hex/
├── .github/              # GitHub configuration
├── packages/
│   └── frontend/         # Frontend Vue.js plugin
│       ├── src/
│       │   ├── __tests__/    # Unit tests
│       │   ├── plugins/      # Vue plugins (SDK)
│       │   ├── styles/       # CSS styles
│       │   ├── views/        # Vue components
│       │   ├── HexEditor.ts  # Hex editor class
│       │   ├── index.ts      # Plugin entry point
│       │   ├── types.ts      # TypeScript types
│       │   └── utils.ts      # Utility functions
│       ├── package.json
│       ├── tsconfig.json
│       └── vitest.config.ts
├── caido.config.ts       # Caido plugin configuration
├── package.json          # Root package.json
└── pnpm-workspace.yaml   # pnpm workspace config
```

## Development Commands

```bash
# Install dependencies
pnpm install

# Build the plugin
pnpm build

# Watch mode for development
pnpm watch

# Run linter
pnpm lint

# Run type checker
pnpm typecheck

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage
```

## Code Style Guidelines

### TypeScript

- Use strict TypeScript with `noImplicitAny` and `strict` mode
- Use explicit type annotations for function parameters and return types
- Prefer `type` over `interface` for type definitions
- Use `@/` alias for imports from `packages/frontend/src/`

### Vue.js

- Use Composition API with `<script setup lang="ts">`
- Define props using `defineProps<T>()` with TypeScript types
- Define emits using `defineEmits()`
- Use `ref()` and `reactive()` for reactive state
- Use `computed()` for derived state
- Use `watch()` for side effects

### Naming Conventions

- **Files**: PascalCase for Vue components (e.g., `HexView.vue`), camelCase for utilities (e.g., `utils.ts`)
- **Variables/Functions**: camelCase (e.g., `hexToAscii`, `parseHttpRaw`)
- **Constants**: UPPER_SNAKE_CASE for true constants (e.g., `KEY`), camelCase for reactive state and computed values
- **Types/Interfaces**: PascalCase (e.g., `FrontendSDK`)
- **CSS Classes**: Tailwind utility classes or kebab-case for custom classes

### Testing

- Tests are located in `packages/frontend/src/__tests__/`
- Use Vitest with `describe`, `it`, and `expect`
- Group related tests using `describe` blocks
- Test both happy paths and edge cases

### HTTP Protocol

- Use CRLF (`\r\n`) for HTTP line endings
- The `ensureCRLF` utility ensures proper line endings

## Caido SDK Integration

This plugin integrates with Caido's frontend SDK. Key integration points:

- `sdk.httpHistory?.addRequestViewMode()` - Add view mode to History tab
- `sdk.replay?.addRequestViewMode()` - Add view mode to Replay tab
- `sdk.search?.addRequestViewMode()` - Add view mode to Search tab
- `sdk.sitemap?.addRequestViewMode()` - Add view mode to Sitemap tab
- `sdk.window?.showToast()` - Show toast notifications
- `sdk.window?.getActiveEditor()` - Get the active editor for modifications

## Important Notes

- Size limit for hex display: 10KB (to prevent performance issues)
- Non-printable characters (< 32 or >= 127) are displayed as `.` in ASCII view
- Editing is only available in the Replay tab for requests
- External dependencies like `@codemirror/*` and `vue` are externalized in the build
