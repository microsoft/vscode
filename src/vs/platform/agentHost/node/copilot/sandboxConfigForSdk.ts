/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { homedir } from 'os';
import { posix, win32 } from '../../../../base/common/path.js';
import { OperatingSystem } from '../../../../base/common/platform.js';
import type { URI } from '../../../../base/common/uri.js';
import { AgentSandboxEnabledValue, type IAgentSandboxMaskedCredentials, normalizeSandboxFileSystemPath } from '../../../sandbox/common/settings.js';
import { AgentHostSandboxKey, type ISandboxConfigValue } from '../../common/sandboxConfigSchema.js';
import type { ISessionSandboxPolicy } from '../../common/meta/agentSandboxPolicyMeta.js';

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

	/** Environment credentials masked by the sandbox and injected at authorized HTTPS hosts. */
	credentials?: Required<IAgentSandboxMaskedCredentials>;

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

	/** Hosts that sandboxed processes are allowed to connect to. */
	allowedHosts?: string[];

	/** Hosts that sandboxed processes are blocked from connecting to. */
	blockedHosts?: string[];

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
 *  - Network: the separate `allowNetwork` policy opens outbound to everything,
 *    while configured domain allow/deny lists are forwarded as host rules.
 *
 * All platforms share enablement and user-configured paths; legacy per-OS paths are ignored.
 * Optional toggles are forwarded only when supplied; absent values use runtime defaults.
 * Credential authentication defaults to enabled and uses the effective Copilot-only preferences.
 *
 * `extraReadonlyPaths` grants read access to session attachments, generated shell
 * init scripts and applied plugin resources, unless a managed read-only list is present.
 *
 * `attachedPaths` grants read-only access to the exact files and folders the
 * user attached to the chat; see {@link resolveAttachedPathGrants}.
 */
export function buildSandboxConfigForSdk(
	platform: NodeJS.Platform,
	sandbox: ISandboxConfigValue | undefined,
	extraReadonlyPaths?: readonly string[],
	managedPolicy?: ISessionSandboxPolicy,
	attachedPaths?: ISandboxAttachedPaths,
): SandboxConfig | undefined {
	const enabledRaw = sandbox?.[AgentHostSandboxKey.Enabled];
	if (enabledRaw !== AgentSandboxEnabledValue.On) {
		return undefined;
	}

	const os = toOperatingSystem(platform);
	const { denied, readonly, readwrite } = resolveUserPaths(sandbox, os);
	// User denies win over host-generated read grants; existing read/write grants are preserved.
	for (const path of managedPolicy?.readonlyPaths !== undefined ? [] : extraReadonlyPaths ?? []) {
		const p = normalizeSandboxFileSystemPath(path, os);
		if (!denied.has(p) && !readonly.has(p) && !readwrite.has(p)) {
			readonly.add(p);
		}
	}
	for (const path of partitionAttachedPaths(os, sandbox, { denied, readonly, readwrite }, managedPolicy, attachedPaths).granted) {
		readonly.add(path);
	}

	const allowNetwork = sandbox?.[AgentHostSandboxKey.AllowNetwork];
	const allowLocalNetwork = sandbox?.[AgentHostSandboxKey.AllowLocalNetwork];
	const allowedHosts = sandbox?.[AgentHostSandboxKey.AllowedNetworkDomains];
	const blockedHosts = sandbox?.[AgentHostSandboxKey.DeniedNetworkDomains];
	const allowBypass = sandbox?.[AgentHostSandboxKey.AllowUnsandboxedCommands];
	const sandboxMcpServers = sandbox?.[AgentHostSandboxKey.SandboxMcpServers];
	const sandboxLspServers = sandbox?.[AgentHostSandboxKey.SandboxLspServers];
	const allowDevToolAccess = sandbox?.[AgentHostSandboxKey.AllowDevToolAccess];
	const maskedCredentials = sandbox?.[AgentHostSandboxKey.MaskedCredentials];
	const sandboxConfig: SandboxConfig = {
		enabled: true,
		addCurrentWorkingDirectory: sandbox?.[AgentHostSandboxKey.AddCurrentWorkingDirectory] ?? true,
		...(sandboxMcpServers !== undefined ? { sandboxMcpServers } : {}),
		...(sandboxLspServers !== undefined ? { sandboxLspServers } : {}),
		...(allowDevToolAccess !== undefined ? { allowDevToolAccess } : {}),
		...(allowBypass !== undefined ? { allowBypass } : {}),
		auth: {
			git: sandbox?.[AgentHostSandboxKey.AuthenticateGit] ?? true,
			gh: sandbox?.[AgentHostSandboxKey.AuthenticateGh] ?? true,
		},
		...(maskedCredentials !== undefined ? { credentials: { envVars: maskedCredentials.envVars ?? {} } } : {}),
		userPolicy: {
			...(denied.size || readonly.size || readwrite.size ? {
				filesystem: {
					...(denied.size ? { deniedPaths: [...denied] } : {}),
					...(readonly.size ? { readonlyPaths: [...readonly] } : {}),
					...(readwrite.size ? { readwritePaths: [...readwrite] } : {}),
				},
			} : {}),
			...(typeof allowNetwork === 'boolean' || allowLocalNetwork !== undefined || allowedHosts?.length || blockedHosts?.length ? {
				network: {
					...(typeof allowNetwork === 'boolean' ? { allowOutbound: allowNetwork } : {}),
					...(allowLocalNetwork !== undefined ? { allowLocalNetwork } : {}),
					...(allowedHosts?.length || blockedHosts?.length ? {
						allowedHosts: [...(allowedHosts ?? [])],
						blockedHosts: [...(blockedHosts ?? [])],
					} : {}),
				},
			} : {}),
		},
	};
	return sandboxConfig;
}

/** Files and folders the user attached to a chat, as local paths of the executing Agent Host. */
export interface ISandboxAttachedPaths {
	/** The exact attached files and folders. */
	readonly paths: readonly string[];
	/** The working directory the runtime grants read/write when `addCurrentWorkingDirectory` is on. */
	readonly workingDirectory?: string;
	/** Further working directories the session was launched with; the runtime grants them read/write. */
	readonly additionalWorkingDirectories?: readonly string[];
}

/** How the sandbox treats the paths of the user's attachments. */
export interface ISandboxAttachedPathGrants {
	/** Paths added to `readonlyPaths`. */
	readonly granted: readonly string[];
	/** Paths the effective policy keeps unreadable: under a denied path, or outside a managed read-only list. */
	readonly blocked: readonly string[];
	/** Folders not granted because they contain a writable folder, which a read-only grant could make read-only. */
	readonly containsWritable: readonly string[];
}

/**
 * Resolves read-only grants for user-attached files and folders.
 *
 * Attaching a file or folder is explicit consent to let the agent read exactly
 * that path, so it is granted read-only for the chat. The grant never widens
 * the policy beyond that:
 *  - A path that is, or is inside, a denied path stays denied.
 *  - When the managed policy defines a read-only list, attachments are not
 *    added: the host must not widen an administrator's allowlist.
 *  - A path already readable (inside a read-only or read/write grant, or the
 *    granted working directory) is left alone, so a granted read-only entry
 *    never downgrades a writable file.
 *  - A folder that contains a writable folder (the working directory, an
 *    additional working directory, or a read/write path) is not granted, so
 *    the read-only entry can't make that folder read-only.
 *
 * Paths are compared after resolving `.` and `..` segments with `platform`'s
 * path rules, and granted in that normalized form.
 *
 * Returns no grants when sandboxing is off.
 */
export function resolveAttachedPathGrants(
	platform: NodeJS.Platform,
	sandbox: ISandboxConfigValue | undefined,
	managedPolicy: ISessionSandboxPolicy | undefined,
	attachedPaths: ISandboxAttachedPaths | undefined,
): ISandboxAttachedPathGrants {
	if (sandbox?.[AgentHostSandboxKey.Enabled] !== AgentSandboxEnabledValue.On) {
		return { granted: [], blocked: [], containsWritable: [] };
	}
	const os = toOperatingSystem(platform);
	return partitionAttachedPaths(os, sandbox, resolveUserPaths(sandbox, os), managedPolicy, attachedPaths);
}

interface IResolvedUserPaths {
	readonly denied: Set<string>;
	readonly readonly: Set<string>;
	readonly readwrite: Set<string>;
}

function toOperatingSystem(platform: NodeJS.Platform): OperatingSystem {
	return platform === 'win32' ? OperatingSystem.Windows : platform === 'darwin' ? OperatingSystem.Macintosh : OperatingSystem.Linux;
}

function resolveUserPaths(sandbox: ISandboxConfigValue | undefined, os: OperatingSystem): IResolvedUserPaths {
	const fs = sandbox?.[AgentHostSandboxKey.UserConfiguredPaths];
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
	return { denied, readonly, readwrite };
}

function partitionAttachedPaths(
	os: OperatingSystem,
	sandbox: ISandboxConfigValue | undefined,
	userPaths: IResolvedUserPaths,
	managedPolicy: ISessionSandboxPolicy | undefined,
	attachedPaths: ISandboxAttachedPaths | undefined,
): ISandboxAttachedPathGrants {
	const granted: string[] = [];
	const blocked: string[] = [];
	const containsWritable: string[] = [];
	if (!attachedPaths?.paths.length) {
		return { granted, blocked, containsWritable };
	}
	const workingDirectories = [
		...(attachedPaths.workingDirectory && (sandbox?.[AgentHostSandboxKey.AddCurrentWorkingDirectory] ?? true) ? [attachedPaths.workingDirectory] : []),
		...attachedPaths.additionalWorkingDirectories ?? [],
	].map(path => normalizeSandboxFileSystemPath(path, os));
	const writable = [...userPaths.readwrite, ...workingDirectories];
	const readable = [...userPaths.readonly, ...writable];
	for (const path of new Set(attachedPaths.paths.map(path => normalizePathForPlatform(normalizeSandboxFileSystemPath(path, os), os)))) {
		if ([...userPaths.denied].some(denied => isEqualOrInside(path, denied, os))) {
			blocked.push(path);
		} else if (readable.some(root => isEqualOrInside(path, root, os))) {
			continue;
		} else if (writable.some(root => isEqualOrInside(root, path, os))) {
			containsWritable.push(path);
		} else if (managedPolicy?.readonlyPaths !== undefined) {
			blocked.push(path);
		} else {
			granted.push(path);
		}
	}
	return { granted, blocked, containsWritable };
}

/** Resolves `.` and `..` segments and drops a trailing separator, using `os`'s path rules. */
function normalizePathForPlatform(path: string, os: OperatingSystem): string {
	const separator = os === OperatingSystem.Windows ? '\\' : '/';
	let result = os === OperatingSystem.Windows ? win32.normalize(path) : posix.normalize(path);
	while (result.length > 1 && result.endsWith(separator) && !/^[a-zA-Z]:\\$/.test(result)) {
		result = result.slice(0, -1);
	}
	return result;
}

/** Whether `path` is `root` or inside it; `~` refers to the Agent Host user's home. */
function isEqualOrInside(path: string, root: string, os: OperatingSystem): boolean {
	const separator = os === OperatingSystem.Windows ? '\\' : '/';
	const normalize = (value: string) => {
		const expanded = value === '~' || value.startsWith(`~${separator}`) ? normalizeSandboxFileSystemPath(homedir(), os) + value.slice(1) : value;
		const result = normalizePathForPlatform(expanded, os);
		return os === OperatingSystem.Linux ? result : result.toLowerCase();
	};
	const p = normalize(path);
	const r = normalize(root);
	return p === r || p.startsWith(r.endsWith(separator) ? r : r + separator);
}

/**
 * The file system path of a `file` URI in `platform`'s syntax, matching what
 * `URI.fsPath` returns when the process runs on that platform. Sandbox paths are
 * compared with `platform`'s rules, so they must not take their syntax from the
 * process's OS through `URI.fsPath`.
 */
export function toSandboxFileSystemPath(uri: URI, platform: NodeJS.Platform): string {
	let path: string;
	if (uri.authority && uri.path.length > 1) {
		path = `//${uri.authority}${uri.path}`;
	} else if (/^\/[a-zA-Z]:/.test(uri.path)) {
		path = uri.path[1].toLowerCase() + uri.path.slice(2);
	} else {
		path = uri.path;
	}
	return platform === 'win32' ? path.replace(/\//g, '\\') : path;
}
