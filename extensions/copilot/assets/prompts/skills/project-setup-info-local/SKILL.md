---
name: project-setup-info-local
description: 'Comprehensive setup steps to help the user create complete project structures in a VS Code workspace; this tool is designed for full project initialization and scaffolding, not for creating individual files. When to use this tool: user wants to create a new complete project from scratch; setting up entire project frameworks (TypeScript projects, React apps, Node.js servers, etc.); initializing Model Context Protocol (MCP) servers with full structure; creating VS Code extensions with proper scaffolding; setting up Next.js, Vite, or other framework-based projects; user asks for "new project", "create a workspace", "set up a [framework] project"; need to establish a complete development environment with dependencies, config files, and folder structure. When NOT to use this tool: creating single files or small code snippets; adding individual files to existing projects; making modifications to existing codebases; user asks to "create a file" or "add a component"; simple code examples or demonstrations; debugging or fixing existing code. This tool provides complete project setup including: folder structure creation; package.json and dependency management; configuration files (tsconfig, eslint, etc.); initial boilerplate code; development environment setup; build and run instructions. Use other file creation tools for individual files within existing projects.'
---

# How to setup a project

Determine what kind of project the user wants to create, then based on that, choose which setup info below to follow. Only setup a project if the folder is empty or if you've just called the tool first calling the tool to create a workspace.

## vscode-extension

A template for creating a VS Code extension using Yeoman and Generator-Code.

Run this command:

```
npx --package yo --package generator-code -- yo code . --skipOpen
```
The command has the following arguments:

- `-t, --extensionType`: Specify extension type: ts, js, command-ts, command-js, colortheme, language, snippets, keymap, extensionpack, localization, commandweb, notebook. Defaults to `ts`
- `-n, --extensionDisplayName`: Set the display name of the extension.
- `--extensionId`: Set the unique ID of the extension. Do not select this option if the user has not requested a unique ID.
- `--extensionDescription`: Provide a description for the extension.
- `--pkgManager`: Specify package manager: npm, yarn, or pnpm. Defaults to `npm`.
- `--bundler`: Bundle the extension using webpack or esbuild.
- `--gitInit`: Initialize a Git repository for the extension.
- `--snippetFolder`: Specify the location of the snippet folder.
- `--snippetLanguage`: Set the language for snippets.

### Rules

1. Do not remove any arguments from the command. Only add arguments if the user requests them.
2. Call the tool `get_vscode_api` with the user's query to get the relevant references.
3. After the tool `get_vscode_api` has completed, only then begin to modify the project.

## next-js

A React based framework for building server-rendered web applications.

Run this command:

```
npx create-next-app@latest .
```
The command has the following arguments:

- `--ts, --typescript`: Initialize as a TypeScript project. This is the default.
- `--js, --javascript`: Initialize as a JavaScript project.
- `--tailwind`: Initialize with Tailwind CSS config. This is the default.
- `--eslint`: Initialize with ESLint config.
- `--app`: Initialize as an App Router project.
- `--src-dir`: Initialize inside a 'src/' directory.
- `--turbopack`: Enable Turbopack by default for development.
- `--import-alias <prefix/*>`: Specify import alias to use.(default is "@/*")
- `--api`: Initialize a headless API using the App Router.
- `--empty`: Initialize an empty project.
- `--use-npm`: Explicitly tell the CLI to bootstrap the application using npm.
- `--use-pnpm`: Explicitly tell the CLI to bootstrap the application using pnpm.
- `--use-yarn`: Explicitly tell the CLI to bootstrap the application using Yarn.
- `--use-bun`: Explicitly tell the CLI to bootstrap the application using Bun.

## vite

A front end build tool for web applications that focuses on speed and performance. Can be used with React, Vue, Preact, Lit, Svelte, Solid, and Qwik.

Run this command:

```
npx create-vite@latest .
```
The command has the following arguments:

- `-t, --template NAME`: Use a specific template. Available templates: vanilla-ts, vanilla, vue-ts, vue, react-ts, react, react-swc-ts, react-swc, preact-ts, preact, lit-ts, lit, svelte-ts, svelte, solid-ts, solid, qwik-ts, qwik

## mcp-server

A Model Context Protocol (MCP) server project. This project supports multiple programming languages including TypeScript, JavaScript, Python, C#, Java, and Kotlin.

### Rules

1. First, visit https://github.com/modelcontextprotocol to find the correct SDK and setup instructions for the requested language. Default to TypeScript if no language is specified.
2. Use the `fetch_webpage` tool to find the correct implementation instructions from https://modelcontextprotocol.io/llms-full.txt
3. Update the copilot-instructions.md file in the .github directory to include references to the SDK documentation
4. Create an `mcp.json` file in the `.vscode` folder in the project root with the following content: `{ "servers": { "mcp-server-name": { "type": "stdio", "command": "command-to-run", "args": [list-of-args] } } }`.
   - mcp-server-name: The name of the MCP server. Create a unique name that reflects what this MCP server does.
   - command-to-run: The command to run to start the MCP server. This is the command you would use to run the project you just created.
   - list-of-args: The arguments to pass to the command. This is the list of arguments you would use to run the project you just created.
5. Install any required VS Code extensions based on the chosen language (e.g., Python extension for Python projects).
6. Inform the user that they can now debug this MCP server using VS Code.

## python-script

A simple Python script project which should be chosen when just a single script wants to be created.

Required extensions: `ms-python.python`, `ms-python.vscode-python-envs`

### Rules

1. Call the tool `copilot_runVscodeCommand` to correctly create a new Python script project in VS Code. Call the command with the following arguments.
   Note that "python-script" and "true" are constants while "New Project Name" and "/path/to/new/project" are placeholders for the project name and path respectively.
   ```json
   {
     "name": "python-envs.createNewProjectFromTemplate",
     "commandId": "python-envs.createNewProjectFromTemplate",
     "args": ["python-script", "true", "New Project Name", "/path/to/new/project"]
   }
   ```

## python-package

A Python package project which can be used to create a distributable package.

Required extensions: `ms-python.python`, `ms-python.vscode-python-envs`

### Rules

1. Call the tool `run_vscode_command` to correctly create a new Python package project in VS Code. Call the command with the following arguments.
   Note that "python-package" and "true" are constants while "New Package Name" and "/path/to/new/project" are placeholders for the package name and path respectively.
   ```json
   {
     "name": "python-envs.createNewProjectFromTemplate",
     "commandId": "python-envs.createNewProjectFromTemplate",
     "args": ["python-package", "true", "New Package Name", "/path/to/new/project"]
   }
   ```

