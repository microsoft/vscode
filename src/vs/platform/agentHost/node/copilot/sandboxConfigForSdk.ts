/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentSandboxEnabledValue } from '../../../sandbox/common/settings.js';
import { AgentHostSandboxKey, type ISandboxConfigValue } from '../../common/sandboxConfigSchema.js';

/**
 * Per-platform filesystem rule bundle accepted under each `fileSystem.<os>`
 * sub-key (`AgentHostSandboxKey.LinuxFileSystem` etc.) in the AgentHost root
 * sandbox config bag. Mirrors the workbench's `chat.agent.sandbox.fileSystem.*`
 * shape so the workbench-side forwarder can copy values verbatim.
 */
export interface IAgentSandboxFileSystemSetting {
	allowRead?: string[];
	allowWrite?: string[];
	denyRead?: string[];
	denyWrite?: string[];
}

/**
 * SDK-side sandbox configuration produced by {@link buildSandboxConfigForSdk}.
 *
 * Mirrors the SDK's `SandboxConfig` type (from
 * `@github/copilot-sdk`'s `SessionUpdateOptionsParams.sandboxConfig`) — the
 * same shape the Copilot extension produces via its own `buildSandboxConfigForCLI`.
 * Defined locally because `SandboxConfig` is not re-exported from the SDK's
 * public entry point.
 */
export interface ISdkSandboxConfig {
	enabled: boolean;
	addCurrentWorkingDirectory?: boolean;
	allowDevToolAccess?: boolean;
	gitAuth?: boolean;
	ghAuth?: boolean;
	userPolicy?: {
		filesystem?: {
			readwritePaths?: string[];
			readonlyPaths?: string[];
			deniedPaths?: string[];
			clearPolicyOnExit?: boolean;
		};
		network?: {
			allowOutbound?: boolean;
			allowLocalNetwork?: boolean;
			proxy?: {
				url: string;
				username?: string;
				password?: string;
			};
		};
		seatbelt?: {
			keychainAccess?: boolean;
		};
		/** @deprecated Use `seatbelt` instead. */
		experimental?: {
			seatbelt?: {
				keychainAccess?: boolean;
			};
		};
	};
}

/**
 * Translate the AgentHost's host-side sandbox configuration into the
 * opaque `sandboxConfig` shape the Copilot SDK forwards to the runtime
 * via `session.options.update`.
 *
 * Used when {@link CopilotCliConfigKey.EnableCustomTerminalTool} is OFF — the
 * SDK's built-in shell tool runs the user's commands, so we have to push the
 * sandbox policy down into the SDK itself. When the custom terminal tool is
 * ON, the AgentHost's own {@link TerminalSandboxEngine} wraps commands and
 * this function is not consulted.
 *
 * Mirrors `buildSandboxConfigForCLI` in
 * `extensions/copilot/src/extension/chatSessions/copilotcli/node/copilotcliSessionService.ts`
 * so the two surfaces behave the same:
 *  - Path precedence: `denyRead` > `denyWrite` > `allowWrite` > `allowRead`.
 *    Each path appears in exactly one of `deniedPaths` / `readonlyPaths` /
 *    `readwritePaths`.
 *  - Network: the separate `allowNetwork` policy opens outbound to everything.
 *    The legacy `allowNetwork` enablement value is treated equivalently.
 *    Domain allow/deny lists are ignored because the SDK's `SandboxConfig`
 *    does not support host-level rules.
 *
 * Windows uses its platform-specific enablement and filesystem settings. It
 * does not fall back to the shared enablement setting so Windows rollout is
 * controlled independently.
 */
export function buildSandboxConfigForSdk(
	platform: NodeJS.Platform,
	sandbox: ISandboxConfigValue | undefined,
): ISdkSandboxConfig | undefined {
	if (!sandbox) {
		return undefined;
	}

	const enabledRaw = platform === 'win32'
		? sandbox[AgentHostSandboxKey.WindowsEnabled]
		: sandbox[AgentHostSandboxKey.Enabled];
	if (enabledRaw !== AgentSandboxEnabledValue.On && enabledRaw !== AgentSandboxEnabledValue.AllowNetwork) {
		return undefined;
	}

	const fsRaw = platform === 'win32'
		? sandbox[AgentHostSandboxKey.WindowsFileSystem]
		: platform === 'darwin'
			? sandbox[AgentHostSandboxKey.MacFileSystem]
			: sandbox[AgentHostSandboxKey.LinuxFileSystem];
	const fs = (fsRaw && typeof fsRaw === 'object') ? fsRaw as IAgentSandboxFileSystemSetting : {};

	const denied = new Set<string>(fs.denyRead ?? []);
	const readonly = new Set<string>();
	const readwrite = new Set<string>();
	for (const p of fs.denyWrite ?? []) {
		if (!denied.has(p)) {
			readonly.add(p);
		}
	}
	for (const p of fs.allowWrite ?? []) {
		if (!denied.has(p) && !readonly.has(p)) {
			readwrite.add(p);
		}
	}
	for (const p of fs.allowRead ?? []) {
		if (!denied.has(p) && !readonly.has(p) && !readwrite.has(p)) {
			readonly.add(p);
		}
	}

	const allowAllNetwork = enabledRaw === AgentSandboxEnabledValue.AllowNetwork || sandbox[AgentHostSandboxKey.AllowNetwork] === true;
	return {
		enabled: true,
		userPolicy: {
			filesystem: {
				...(readwrite.size ? { readwritePaths: [...readwrite] } : {}),
				...(readonly.size ? { readonlyPaths: [...readonly] } : {}),
				...(denied.size ? { deniedPaths: [...denied] } : {}),
			},
			network: {
				allowOutbound: allowAllNetwork,
			},
		},
	};
}
