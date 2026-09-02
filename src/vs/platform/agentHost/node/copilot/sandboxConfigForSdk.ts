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
 * ToDo: This will be removed as the SDK's built-in sandbox configuration types are exported.
 */
export interface SandboxConfig {
	/** Whether sandboxing is enabled for the session. */
	enabled: boolean;

	/** Whether all sandbox restrictions can be bypassed. */
	allowBypass?: boolean;

	/** Automatically grant read/write access to the current working directory. */
	addCurrentWorkingDirectory?: boolean;

	/** Automatically grant access to common developer tools and caches. */
	allowDevToolAccess?: boolean;

	/** Credential injection available while sandboxing is enabled. */
	auth?: SandboxAuthConfig;

	/** User-defined filesystem, network, and macOS policies. */
	userPolicy?: SandboxUserPolicy;
}

export interface SandboxAuthConfig {
	/** Inject credentials for authenticated Git operations. */
	git?: boolean;

	/** Export GH_TOKEN for GitHub CLI operations. */
	gh?: boolean;
}

export interface SandboxUserPolicy {
	filesystem?: SandboxFilesystemPolicy;
	network?: SandboxNetworkPolicy;

	/** Only relevant on macOS. */
	seatbelt?: SandboxSeatbeltPolicy;
}

export interface SandboxFilesystemPolicy {
	/** Paths that sandboxed processes can read and write. */
	readwritePaths?: string[];

	/** Paths that sandboxed processes can only read. */
	readonlyPaths?: string[];

	/** Paths that sandboxed processes cannot access. */
	deniedPaths?: string[];

	/** Whether to clear the filesystem policy when the session exits. */
	clearPolicyOnExit?: boolean;
}

export interface SandboxNetworkPolicy {
	/** Whether outbound network connections are permitted. */
	allowOutbound?: boolean;

	/** Whether localhost and local-network connections are permitted. */
	allowLocalNetwork?: boolean;

	/** Optional proxy used by sandboxed processes. */
	proxy?: SandboxNetworkProxyPolicy;
}

export interface SandboxNetworkProxyPolicy {
	/** HTTP or HTTPS proxy URL. */
	url: string;

	/** Optional proxy username. */
	username?: string;

	/** Optional proxy password or secret/environment reference. */
	password?: string;
}

export interface SandboxSeatbeltPolicy {
	/** Whether macOS Keychain access is permitted. */
	keychainAccess?: boolean;
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
 *    Domain allow/deny lists are ignored because the SDK's `SandboxConfig`
 *    does not support host-level rules.
 *
 * Windows uses its platform-specific enablement and filesystem settings. It
 * does not fall back to the shared enablement setting so Windows rollout is
 * controlled independently.
 *
 * `extraReadonlyPaths` grants read access to host-generated files the shell
 * tool needs, such as the session's shell init scripts. The SDK treats init
 * script readability as a caller obligation and fails silently when a script
 * cannot be read. `CopilotAgentSession` therefore includes the directory when
 * it applies the effective sandbox immediately before each turn.
 */
export function buildSandboxConfigForSdk(
	platform: NodeJS.Platform,
	sandbox: ISandboxConfigValue | undefined,
	extraReadonlyPaths?: readonly string[],
): SandboxConfig | undefined {
	const enabledRaw = platform === 'win32'
		? sandbox?.[AgentHostSandboxKey.WindowsEnabled]
		: sandbox?.[AgentHostSandboxKey.Enabled];
	if (enabledRaw !== AgentSandboxEnabledValue.On) {
		return undefined;
	}

	const fsRaw = platform === 'win32'
		? sandbox?.[AgentHostSandboxKey.WindowsFileSystem]
		: platform === 'darwin'
			? sandbox?.[AgentHostSandboxKey.MacFileSystem]
			: sandbox?.[AgentHostSandboxKey.LinuxFileSystem];
	const hasFileSystemPolicy = fsRaw !== undefined && typeof fsRaw === 'object';
	const fs = hasFileSystemPolicy ? fsRaw as IAgentSandboxFileSystemSetting : {};

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
	// Host-generated files the shell tool must be able to read (see
	// `extraReadonlyPaths`). Routed through the same precedence sets as user
	// paths so an explicit `denyRead` still wins, and so a path the user already
	// made readwrite is not downgraded.
	for (const p of extraReadonlyPaths ?? []) {
		if (!denied.has(p) && !readonly.has(p) && !readwrite.has(p)) {
			readonly.add(p);
		}
	}

	const allowNetwork = sandbox?.[AgentHostSandboxKey.AllowNetwork];
	const allowBypass = sandbox?.[AgentHostSandboxKey.AllowUnsandboxedCommands] ?? false;
	const sandboxConfig: SandboxConfig = {
		enabled: true,
		allowBypass,
		addCurrentWorkingDirectory: true,
		allowDevToolAccess: true,
		auth: {
			git: false,
			gh: false,
		},
		userPolicy: {
			filesystem: {
				...(denied.size ? { deniedPaths: [...denied] } : {}),
				...(readonly.size ? { readonlyPaths: [...readonly] } : {}),
				...(readwrite.size ? { readwritePaths: [...readwrite] } : {}),
				clearPolicyOnExit: true,
			},
			network: {
				allowOutbound: typeof allowNetwork === 'boolean' ? allowNetwork : false,
				allowLocalNetwork: true,
			},
		},
	};
	return sandboxConfig;
}
