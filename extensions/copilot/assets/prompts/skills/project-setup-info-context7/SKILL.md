---
name: project-setup-info-context7
description: "Comprehensive setup steps to help the user create complete project structures in a VS Code workspace. This tool is designed for full project initialization and scaffolding, not for creating individual files. When to use this tool: when the user wants to create a new complete project from scratch; when setting up entire project frameworks (TypeScript projects, React apps, Node.js servers, etc.); when initializing Model Context Protocol (MCP) servers with full structure; when creating VS Code extensions with proper scaffolding; when setting up Next.js, Vite, or other framework-based projects; when the user asks for \"new project\", \"create a workspace\", or \"set up a [framework] project\"; when you need to establish a complete development environment with dependencies, config files, and folder structure. When NOT to use this tool: when creating single files or small code snippets; when adding individual files to existing projects; when making modifications to existing codebases; when the user asks to \"create a file\" or \"add a component\"; for simple code examples or demonstrations; for debugging or fixing existing code. This tool provides complete project setup including folder structure creation, package.json and dependency management, configuration files (tsconfig, eslint, etc.), initial boilerplate code, development environment setup, and build and run instructions. Use other file creation tools for individual files within existing projects."
---

# How to setup a project using context7 tools

Use context7 tools to find the latest libraries, APIs, and documentation to help the user create and customize their project. Only setup a project if the folder is empty or if you've just called the tool first calling the tool to create a workspace.

1. Call the `mcp_context7_resolve-library-id` tool with your project requirements.
2. Call the `mcp_context7_get-library-docs` tool to get scaffolding instructions.