/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Cross-vendor convention env var that announces which AI agent is driving a
 * process. Tools further down the chain (`git`, `gh`, CI systems, …) inherit it,
 * which lets activity be attributed to the originating AI experience without
 * touching the user's global environment.
 */
export const AiAgentEnvVar = 'AI_AGENT';

/**
 * The value VS Code announces for processes it spawns on behalf of an agent
 * session, following the `github_copilot_<surface>` form used by the other
 * GitHub Copilot surfaces (e.g. the GitHub Copilot app uses
 * `github_copilot_app_agent`).
 *
 * This must be set for *every* process an agent session spawns — the local
 * (in-workbench) harness terminal tool, the agent host process and every agent
 * SDK subprocess it launches — otherwise the surface is under-counted.
 */
export const AiAgentEnvValue = 'github_copilot_vscode_agent';
