/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotSession } from '@github/copilot-sdk';
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

type SdkSandboxConfig = NonNullable<Parameters<CopilotSession['rpc']['options']['update']>[0]['sandboxConfig']>;

export type CopilotSandboxConfig = SdkSandboxConfig & {
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

	const allowNetwork = sandbox[AgentHostSandboxKey.AllowNetwork];
	const allowBypass = sandbox[AgentHostSandboxKey.AllowUnsandboxedCommands];
	const filesystem = hasFileSystemPolicy
		? {
			...(denied.size ? { deniedPaths: [...denied] } : {}),
			...(readonly.size ? { readonlyPaths: [...readonly] } : {}),
			...(readwrite.size ? { readwritePaths: [...readwrite] } : {}),
		}
		: undefined;
	const network = typeof allowNetwork === 'boolean' ? { allowOutbound: allowNetwork } : undefined;
	const userPolicy = filesystem || network
		? {
			...(filesystem ? { filesystem } : {}),
			...(network ? { network } : {}),
		}
		: undefined;
	return {
		enabled: true,
		...(typeof allowBypass === 'boolean' ? { allowBypass } : {}),
		...(userPolicy ? { userPolicy } : {}),
	};
}
