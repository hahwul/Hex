# Hex

A Hex Viewer & Editor plugin for [Caido](https://caido.io/) that adds hex viewing and editing to the History and Replay tabs.

![](images/screenshot.jpg)

## Features

- **Hex Viewer** (History, Replay tabs)
- **Hex Editor** (History, Replay tabs)

![](images/edit.jpg)
*Double-click any line in the hex view to edit its contents directly.*

## Installation

1. Grab the latest plugin_package.zip from our Releases page.
2. In Caido, go to the Plugins page.
3. Click Install Package and select the file you just downloaded.

## Development

To build the plugin from the source code:

```bash
git clone https://github.com/hahwul/Hex
cd Hex
pnpm install
pnpm build
```

### Running Tests

The project includes comprehensive unit tests for the core functionality:

```bash
# Run all tests
pnpm test

# Run tests with coverage report
pnpm test:coverage
```

### Linting and Type Checking

```bash
# Run linter
pnpm lint

# Run type checker
pnpm typecheck
```

## Important Note

This plugin was created as a temporary convenience tool until official support for **Hex View** and **Edit** features is implemented in Caido. Once the related issue is resolved (see [caido/caido#29](https://github.com/caido/caido/issues/29)), this plugin will likely become unnecessary.

Until then, feel free to use it to improve your workflow!

## Special Thanks
To Michael([@dyrandy](https://github.com/dyrandy)), whose quiet persistence finally won. This plugin’s here because you asked nicely.. a lot. 😉
