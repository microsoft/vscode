---
name: dev-container-handoff
description: Create a plain Dev Container and continue the current task in a new session inside it. Use when the user asks to run, try, or continue work in a container or Dev Container, or wants an isolated Linux environment for the task.
---
<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->
<!-- Customize this skill and select save to override its behavior. Delete that copy to restore the built-in behavior. -->

# Continue in a Dev Container

A plain Dev Container is a Linux container from the Ubuntu base image (`mcr.microsoft.com/devcontainers/base:ubuntu`) with an agent host running inside. It keeps its files in a Docker volume and is listed in Remote Environments, like one created there with the Create Dev Container action. A new session inside it continues the work. This session stays as the record of the conversation.

## 1. Confirm

If the user didn't explicitly ask to move the work into a Dev Container, ask once before creating one. Say where it runs and that the new session starts without this conversation's history.

The container runs on the same host as this session by default: this computer, or the SSH, Tunnel, or WSL host this session runs on. For another host the user names, get its exact ID from `list_agent_hosts`.

## 2. Create the container

Call `create_dev_container`, with `host` only when it should run on a different host than this session. If the tool isn't available, explain that Dev Containers can't be created from this window. Building one can take a few minutes. If it fails, explain the error, such as Docker not running, and help fix it before calling it again: each call creates another container.

The result has the container's `hostId` and its empty `workspace` folder. If its `status` is `notReady`, the container exists but can't start sessions yet: don't create another one; follow its `guidance`.

## 3. Write the handoff prompt

The new session sees only this prompt, so make it self-contained:

- The goal, in the user's words where possible.
- What has been done and decided so far, and why.
- What the session needs from this workspace. The container starts empty and nothing is copied into it, so include the content of small files, or say which repository to clone.
- Open problems and the exact next step.
- If the user wants a report here, ask the session to reply with `send_remote_message` to session `"origin"` when it's done or blocked.

## 4. Start the session

Call `create_remote_session` with:

- `prompt`: the handoff prompt.
- `title`: a short title for the task.
- `hostId`: the `hostId` from `create_dev_container`.
- `workspace`: `{ "uri": "<workspace from create_dev_container>", "isolation": "folder" }`.
- `model`: only when the user asked for one; `list_agent_hosts` shows the container's models.

Share the returned `openLink` as a Markdown link and end your turn. Don't continue the task here or poll the new session. Don't retry an uncertain creation.
