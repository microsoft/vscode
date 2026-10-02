/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from '../../../../base/common/platform.js';
import { AgentSandboxEnabledValue, normalizeSandboxFileSystemPath } from '../../../sandbox/common/settings.js';
import { AgentHostSandboxKey, type ISandboxConfigValue } from '../../common/sandboxConfigSchema.js';

/**
 * ToDo: This will be removed as the SDK's built-in sandbox configuration types are exported.
 */
export interface SandboxConfig {
	/** Whether sandboxing is enabled for the session. */
	enabled: boolean;

	/** Whether MCP servers run inside the sandbox. */
	sandboxMcpServers?: boolean;

	/** Whether LSP servers run inside the sandbox. */
	sandboxLspServers?: boolean;

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
 * Translate the AgentHost's normalized host-side sandbox configuration into the
 * opaque `sandboxConfig` shape the Copilot SDK forwards to the runtime
 * via `session.options.update`.
 *
 * Optional capabilities without a host setting are left to the runtime:
 *  - Path precedence: `deniedPaths` > `readonlyPaths` > `readwritePaths`.
 *    Each path appears in exactly one of `deniedPaths` / `readonlyPaths` /
 *    `readwritePaths`.
 *  - Network: the separate `allowNetwork` policy opens outbound to everything.
 *    Domain allow/deny lists are ignored because the SDK's `SandboxConfig`
 *    does not support host-level rules.
 *
 * All platforms share enablement and user-configured paths; legacy per-OS paths are ignored.
 * Optional toggles are forwarded only when supplied; absent values use runtime defaults.
 *
 * `extraReadonlyPaths` grants read access to session attachments and generated
 * shell init scripts when the effective sandbox is applied before each turn.
 */
export function buildSandboxConfigForSdk(
	platform: NodeJS.Platform,
	sandbox: ISandboxConfigValue | undefined,
	extraReadonlyPaths?: readonly string[],
): SandboxConfig | undefined {
	const enabledRaw = sandbox?.[AgentHostSandboxKey.Enabled];
	if (enabledRaw !== AgentSandboxEnabledValue.On) {
		return undefined;
	}

	const fs = sandbox?.[AgentHostSandboxKey.UserConfiguredPaths];
	const os = platform === 'win32' ? OperatingSystem.Windows : platform === 'darwin' ? OperatingSystem.Macintosh : OperatingSystem.Linux;
	const denied = new Set((fs?.deniedPaths ?? []).map(path => normalizeSandboxFileSystemPath(path, os)));
	const readonly = new Set<string>();
	const readwrite = new Set<string>();
	for (const path of fs?.readonlyPaths ?? []) {
		const p = normalizeSandboxFileSystemPath(path, os);
		if (!denied.has(p)) {
			readonly.add(p);
		}
	}
	for (const path of fs?.readwritePaths ?? []) {
		const p = normalizeSandboxFileSystemPath(path, os);
		if (!denied.has(p) && !readonly.has(p)) {
			readwrite.add(p);
		}
	}
	// User denies win over host-generated read grants; existing read/write grants are preserved.
	for (const path of extraReadonlyPaths ?? []) {
		const p = normalizeSandboxFileSystemPath(path, os);
		if (!denied.has(p) && !readonly.has(p) && !readwrite.has(p)) {
			readonly.add(p);
		}
	}

	const allowNetwork = sandbox?.[AgentHostSandboxKey.AllowNetwork];
	const allowLocalNetwork = sandbox?.[AgentHostSandboxKey.AllowLocalNetwork];
	const allowBypass = sandbox?.[AgentHostSandboxKey.AllowUnsandboxedCommands];
	const sandboxMcpServers = sandbox?.[AgentHostSandboxKey.SandboxMcpServers];
	const sandboxLspServers = sandbox?.[AgentHostSandboxKey.SandboxLspServers];
	const allowDevToolAccess = sandbox?.[AgentHostSandboxKey.AllowDevToolAccess];
	const sandboxConfig: SandboxConfig = {
		enabled: true,
		...(sandboxMcpServers !== undefined ? { sandboxMcpServers } : {}),
		...(sandboxLspServers !== undefined ? { sandboxLspServers } : {}),
		...(allowDevToolAccess !== undefined ? { allowDevToolAccess } : {}),
		...(allowBypass !== undefined ? { allowBypass } : {}),
		auth: {
			git: true,
			gh: true,
		},
		userPolicy: {
			filesystem: {
				...(denied.size ? { deniedPaths: [...denied] } : {}),
				...(readonly.size ? { readonlyPaths: [...readonly] } : {}),
				...(readwrite.size ? { readwritePaths: [...readwrite] } : {}),
			},
			...(typeof allowNetwork === 'boolean' || allowLocalNetwork !== undefined ? {
				network: {
					...(typeof allowNetwork === 'boolean' ? { allowOutbound: allowNetwork } : {}),
					...(allowLocalNetwork !== undefined ? { allowLocalNetwork } : {}),
				},
			} : {}),
		},
	};
	return sandboxConfig;
}
