# Contributing to PearAI

This is the source code for the bulk of PearAI's functionality. Almost all the contributions should be in this subdirectory.

## Table of Contents

- [Get started](#get-started)
- [Run the tests](#run-the-tests)
- [Run it locally](#run-it-locally)
- [Open a PR and add acknowledge your contribution](#open-a-pr-and-add-acknowledge-your-contribution)
- [Other Commands](#other-commands)

## Get started

> Pre-requisite: you have installed [git][install-git], [node][install-node] and [yarn][install-yarn].
>
> _Windows users need use [wsl][install-wsl] for local development, otherwise you should have no issues._

1. Fork the repository and create your branch from main.
1. Clone your fork.
1. Install dependencies in repository root: `yarn install`
1. Build the extension in repository root: `yarn build-all`

The project uses [TypeScript][typescript], [Vitest][vitest] for the tests and [Prettier][prettier] for the formatting.

## Run the tests

You can run tests with `yarn test`

To run them in watch mode, use: `yarn test-watch`.

## Run it locally

The extension can be run in two ways:

RECOMMENDED: Interally within the main PearAI application (which is a VSCode fork): https://github.com/trypear/pearai/. For running it standalone, you will want to `cd` into `extensions/pearai-extension` and visit [Contributing to pearai](CONTRIBUTING.md).

Standalone as an extension. This guide is for running it standalone.

You can use [VS Code's built-in debugger][vscode-debug-extension] on the project to try out your local extension.

To build the project, run `yarn build-extension` in the `extensions/pearai-extension` directory.

You can also use: `command+shift+P` -> `Debug: Select and Start Runnning` -> `run - app/vscode`.

This will:

1. Build the project
2. Open a new "Extension Development Host" VS Code window, with your local code overriding your "PearAI" extension

It's handy to test your changes in integration with VS Code API.

### Useful resources to start changing the code

- [VS Code Extension API documentation][vscode-extension-docs] is a good start
- [OpenAI API documentation][openai-docs] is also useful if you plan to change the prompts

### Code Style

Style formatting is managed by [Prettier][prettier]. It runs as a pre-commit hook, so you shouldn't have to worry about it.

## Open a PR and add acknowledge your contribution

You can open a Pull-Request at any time. It can even be a draft if you need to ask for guidance and help. Actually, we'd be pretty happy to assist you going in the best direction!

Once everything is ready, open a Pull-Request (if it's not already done) and ask for a review. We'll do our best to review it asap.

## More documentation

- You can find a brief introduction to the architecture of this extension [here][architecture-doc].

## Other Commands

- **Lint**: `yarn nx lint --skip-nx-cache`
- **Package**: `yarn nx run vscode:package`‍
