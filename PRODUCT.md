# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The existing application is a desktop IDE built with Electron and web technologies, starting from this VS Code fork.

## Users

The creator is building an IDE for their own development work across multiple projects and LLM conversations.

## Product Purpose

Keep multiple independent project workspaces and a shared Agents view accessible within one application window. Switching projects should preserve each workspace's working state and running work.

## Capabilities and Constraints

- A top tab bar contains the open project workspaces, including single-folder and multi-folder workspaces.
- A permanent Agents button sits to the left of the project tabs and opens the shared view across projects.
- Each project sidebar provides Project Chats alongside Files and Source Control, showing the LLM conversations associated with that project.
- Selecting a project chat opens it in the central editor area like selecting a file in Explorer. The conversation can be continued there and is also accessible from Agents.
- A chat in Agents provides navigation to its relevant project tab.
- The design covers macOS, Windows, and Linux, with initial runnable feasibility validation on macOS.
- SSH and Dev Containers are architectural requirements; the initial layout prototype uses local projects.
- The current planning milestone is an agreed layout and interaction specification, a clickable prototype, and an architectural feasibility decision, ready for implementation.

## Evidence on Hand

The existing editor workbench and Agents workbench are implemented in `src/vs/workbench` and `src/vs/sessions`. They provide the starting behavior and layout references; the proposed combined window has not yet been validated at runtime.

The [One-window IDE with project tabs and shared Agents](https://github.com/ejjsharpe/escode/issues/16) wayfinder map tracks the outstanding decisions and links their resolutions.
