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

// These interfaces mirror the sandbox configuration contract currently accepted
// by the Copilot SDK. Replace them with the SDK-exported types once those become
// available so this file refers to the SDK contract directly.
export interface SandboxConfig {
	/** Whether to auto-add the current working directory to readwritePaths. Default: true. */
	addCurrentWorkingDirectory?: boolean;
	/** Whether to auto-grant read access to common developer-tool caches, registries, and toolchains in their default home locations (cargo, go, npm, Maven, and more), plus read-write access to (and, on Unix, up-front creation of) the scratch caches builds write on every run (go-build, ccache, sccache, Gradle caches, Cargo lock/tracker files), so builds work without extra configuration; a relocated CARGO_HOME additionally gets its Cargo lock files granted read-write. Default: true (enabled by default; set to false to opt out). */
	allowDevToolAccess?: boolean;
	/** Credential-injection capability flags. */
	auth?: SandboxConfigAuth;
	/** Whether sandboxing is enabled for the session. */
	enabled: boolean;
	/** User-managed sandbox policy fragment merged into the auto-discovered base policy. */
	userPolicy?: SandboxConfigUserPolicy;
}

/** User-managed sandbox policy fragment merged into the auto-discovered base policy. */
export interface SandboxConfigUserPolicy {
	/** Deprecated legacy location for `seatbelt`; read only when the top-level `seatbelt` is absent. */
	experimental?: SandboxConfigUserPolicyExperimental;
	/** Filesystem rules to merge into the base policy. */
	filesystem?: SandboxConfigUserPolicyFilesystem;
	/** Network rules to merge into the base policy. */
	network?: SandboxConfigUserPolicyNetwork;
	/** macOS seatbelt options to merge into the base policy. */
	seatbelt?: SandboxConfigUserPolicySeatbelt;
}

/** Platform-specific experimental policy fields. */
export interface SandboxConfigUserPolicyExperimental {
	/** macOS seatbelt experimental options. */
	seatbelt?: SandboxConfigUserPolicyExperimentalSeatbelt;
}

/** macOS seatbelt experimental options. */
export interface SandboxConfigUserPolicyExperimentalSeatbelt {
	/** Whether the macOS seatbelt profile may access the keychain. */
	keychainAccess?: boolean;
}

/** Filesystem rules to merge into the base policy. */
export interface SandboxConfigUserPolicyFilesystem {
	/** Whether to clear the policy when the session exits. */
	clearPolicyOnExit?: boolean;
	/** Paths explicitly denied. */
	deniedPaths?: string[];
	/** Paths granted read-only access. */
	readonlyPaths?: string[];
	/** Paths granted read/write access. */
	readwritePaths?: string[];
}

/** Network rules to merge into the base policy. */
export interface SandboxConfigUserPolicyNetwork {
	/** Whether traffic to local/loopback addresses is allowed. */
	allowLocalNetwork?: boolean;
	/** Whether outbound network traffic is allowed at all. */
	allowOutbound?: boolean;
	/** HTTP proxy the sandboxed process routes traffic through. Enforced on Windows and cooperative (honored by well-behaved tools, not strictly enforced) on Linux and macOS. Credentials go in the separate `username`/`password` fields. A credential-free http:// loopback proxy URL is routed through the localhost proxy automatically; an https:// or authenticated loopback URL is used as-is. */
	proxy?: SandboxConfigUserPolicyNetworkProxy;
}

/** HTTP proxy configuration for sandboxed traffic. */
export interface SandboxConfigUserPolicyNetworkProxy {
	/** Optional password for proxy authentication, combined with the URL at spawn time. The persisted value may be a literal password, a `${secret:…}` reference resolved from the OS keychain, or a `${VAR}`/`$VAR` environment reference; it is resolved just before the sandboxed process routes through the proxy. The /sandbox dialog stores a real password in the OS keychain and persists only a `${secret:…}` placeholder (never plaintext in settings.json); the field is masked in the dialog and redacted by /settings show. */
	password?: string;
	/** Proxy URL (e.g. http://proxy.example.com:8080). The port is optional and defaults to the scheme's standard port when omitted. Credentials must not be embedded here — a `user:pass@` authority is rejected; put them in the separate `username`/`password` fields. A credential-free http:// loopback URL is routed through the localhost proxy automatically; loopback covers localhost and any *.localhost subdomain, the whole 127.0.0.0/8 range, ::1, and IPv4-mapped loopback (::ffff:127.0.0.1). An https:// URL, or one with a username/password set, is used as-is. */
	url: string;
	/** Optional username for proxy authentication. Combined with the URL (and `password`) into `user:pass@host` when the sandboxed process routes through the proxy. */
	username?: string;
}

/** macOS seatbelt-specific options. */
export interface SandboxConfigUserPolicySeatbelt {
	/** Whether the macOS seatbelt profile may access the keychain. */
	keychainAccess?: boolean;
}

/** Credential-injection capability flags applied while the sandbox is enabled. */
export interface SandboxConfigAuth {
	/** Whether to export `GH_TOKEN` so the `gh` CLI authenticates inside the sandbox without the OS keyring the sandbox blocks. Default: false (opt-in). */
	gh?: boolean;
	/** Whether to inject git credentials as an `http.<url>.extraheader` so authenticated HTTPS git works inside the sandbox without the shell-based credential helper the sandbox blocks. github.com is served by the Copilot token; every other forge (Azure DevOps, GitHub Enterprise Server, GitLab, ...) by a credential the host resolves from the user's own helper before the sandbox is applied. Default: false (opt-in). */
	git?: boolean;
}

export type CopilotSandboxConfig = SandboxConfig & {
	readonly allowBypass?: boolean;
};

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
 */
export function buildSandboxConfigForSdk(
	platform: NodeJS.Platform,
	sandbox: ISandboxConfigValue | undefined,
): CopilotSandboxConfig | undefined {
	if (!sandbox) {
		return undefined;
	}

	const enabledRaw = platform === 'win32'
		? sandbox[AgentHostSandboxKey.WindowsEnabled]
		: sandbox[AgentHostSandboxKey.Enabled];
	if (enabledRaw !== AgentSandboxEnabledValue.On) {
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

	const allowAllNetwork = sandbox[AgentHostSandboxKey.AllowNetwork] === true;
	return {
		addCurrentWorkingDirectory: true,
		allowBypass: true,
		allowDevToolAccess: true,
		auth: {
			gh: false,
			git: false,
		},
		enabled: true,
		userPolicy: {
			experimental: {
				seatbelt: {
					keychainAccess: false,
				},
			},
			filesystem: {
				clearPolicyOnExit: false,
				deniedPaths: [...denied],
				readonlyPaths: [...readonly],
				readwritePaths: [...readwrite],
			},
			network: {
				allowLocalNetwork: false,
				allowOutbound: allowAllNetwork,
				proxy: undefined,
			},
			seatbelt: {
				keychainAccess: false,
			},
		},
	};
}
