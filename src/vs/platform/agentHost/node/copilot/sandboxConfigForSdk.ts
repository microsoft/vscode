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
 * Structurally a narrowed form of the SDK's `SandboxConfig` type (from
 * `@github/copilot-sdk`'s `SessionUpdateOptionsParams.sandboxConfig`) — the
 * same shape the Copilot extension produces via its own `buildSandboxConfigForCLI`.
 * Defined locally because `SandboxConfig` is not re-exported from the SDK's
 * public entry point; this shape stays assignable to it.
 */
export interface ISdkSandboxConfig {
	enabled: true;
	userPolicy: {
		filesystem: {
			readwritePaths?: string[];
			readonlyPaths?: string[];
			deniedPaths?: string[];
		};
		network: {
			allowOutbound: boolean;
			allowedHosts?: string[];
			blockedHosts?: string[];
		};
	};
}

/**
 * Translate the AgentHost's host-side sandbox configuration into the
 * opaque `sandboxConfig` shape the Copilot SDK forwards to the runtime
 * via `session.options.update`.
 *
 * Used when {@link AgentHostConfigKey.EnableCustomTerminalTool} is OFF — the
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
 *  - Network: `allowNetwork` opens outbound to everything and drops the
 *    allow/deny lists. Otherwise the allow/deny lists open outbound when
 *    set so they're actually enforced; macOS fails closed because the
 *    runtime has no per-host filter (Seatbelt would silently degrade to
 *    "allow all outbound").
 */
export function buildSandboxConfigForSdk(
	platform: NodeJS.Platform,
	sandbox: ISandboxConfigValue | undefined,
): ISdkSandboxConfig | undefined {
	if (!sandbox) {
		return undefined;
	}

	const enabledRaw = platform === 'win32' && sandbox[AgentHostSandboxKey.WindowsEnabled] !== undefined
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

	const allowAllNetwork = enabledRaw === AgentSandboxEnabledValue.AllowNetwork;
	const hostListsEnforceable = platform !== 'darwin';
	const rawAllow = sandbox[AgentHostSandboxKey.AllowedNetworkDomains];
	const rawBlock = sandbox[AgentHostSandboxKey.DeniedNetworkDomains];
	const allowedHosts = !allowAllNetwork && hostListsEnforceable && rawAllow?.length ? [...rawAllow] : undefined;
	const blockedHosts = !allowAllNetwork && hostListsEnforceable && rawBlock?.length ? [...rawBlock] : undefined;
	const allowOutbound = allowAllNetwork || !!allowedHosts || !!blockedHosts;
	return {
		enabled: true,
		userPolicy: {
			filesystem: {
				...(readwrite.size ? { readwritePaths: [...readwrite] } : {}),
				...(readonly.size ? { readonlyPaths: [...readonly] } : {}),
				...(denied.size ? { deniedPaths: [...denied] } : {}),
			},
			network: {
				allowOutbound,
				...(allowOutbound && allowedHosts ? { allowedHosts } : {}),
				...(allowOutbound && blockedHosts ? { blockedHosts } : {}),
			},
		},
	};
}
