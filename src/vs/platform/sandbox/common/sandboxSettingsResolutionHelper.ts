/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentSandboxEnabledSettingValue, AgentSandboxEnabledValue, IAgentSandboxUserConfiguredPaths, isAgentSandboxEnabledValue } from './settings.js';

type SandboxFileSystemPaths = Readonly<{
	readwritePaths?: readonly string[];
	readonlyPaths?: readonly string[];
	deniedPaths?: readonly string[];
}>;

/** Effective network restrictions resolved by the Copilot Agent Host for an integrated-browser client tool. */
export interface ISandboxNetworkRestrictions {
	readonly sandboxEnabled: boolean;
	readonly allowNetwork: boolean;
	readonly allowedDomains: readonly string[];
	readonly deniedDomains: readonly string[];
}

export function isSandboxNetworkRestrictions(value: unknown): value is ISandboxNetworkRestrictions {
	if (!value || typeof value !== 'object' || !('sandboxEnabled' in value) || !('allowNetwork' in value)
		|| !('allowedDomains' in value) || !('deniedDomains' in value)) {
		return false;
	}
	return typeof value.sandboxEnabled === 'boolean' && typeof value.allowNetwork === 'boolean'
		&& Array.isArray(value.allowedDomains) && value.allowedDomains.every(domain => typeof domain === 'string')
		&& Array.isArray(value.deniedDomains) && value.deniedDomains.every(domain => typeof domain === 'string');
}

/** Resolves local sandbox settings against the managed floor without changing saved preferences. */
export class SandboxSettingsResolutionHelper {
	static getNetworkRestrictions(enabled: AgentSandboxEnabledSettingValue | undefined, allowNetwork: boolean | undefined) {
		const sandboxEnabled = isAgentSandboxEnabledValue(enabled);
		return {
			sandboxEnabled,
			allowNetwork: allowNetwork ?? true,
			applyDomainRestrictions: sandboxEnabled && (allowNetwork ?? true),
		};
	}

	static resolveEnabled(local: AgentSandboxEnabledValue | undefined, managed: boolean | undefined): AgentSandboxEnabledValue | undefined {
		return managed === true ? AgentSandboxEnabledValue.On : local;
	}

	static resolveSandboxServers(local: boolean | undefined, managed: boolean | undefined): boolean | undefined {
		return managed === true ? true : local;
	}

	static resolveAllowBypass(local: boolean | undefined, managed: boolean | undefined, managedEnabled: boolean | undefined): boolean | undefined {
		return managed === false || (managedEnabled === true && managed !== true) ? false : local;
	}

	static resolveAllowAccess(local: boolean | undefined, managed: boolean | undefined): boolean | undefined {
		return managed === false ? false : local;
	}

	/** Uses a managed allowlist when present and combines blocklists; runtime enforcement remains authoritative. */
	static resolveNetworkHosts(
		localAllowedHosts: readonly string[] | undefined,
		localBlockedHosts: readonly string[] | undefined,
		managedAllowedHosts: readonly string[] | undefined,
		managedBlockedHosts: readonly string[] | undefined,
	): { allowedHosts: string[]; blockedHosts: string[] } {
		return {
			allowedHosts: [...new Set(managedAllowedHosts ?? localAllowedHosts ?? [])],
			blockedHosts: [...new Set([...(localBlockedHosts ?? []), ...(managedBlockedHosts ?? [])])],
		};
	}

	/** Uses managed grant lists when present and combines denied paths; runtime enforcement remains authoritative. */
	static resolveFileSystemPaths(
		local: SandboxFileSystemPaths | undefined,
		managed: SandboxFileSystemPaths | undefined,
	): IAgentSandboxUserConfiguredPaths {
		return {
			readwritePaths: [...new Set(managed?.readwritePaths ?? local?.readwritePaths ?? [])],
			readonlyPaths: [...new Set(managed?.readonlyPaths ?? local?.readonlyPaths ?? [])],
			deniedPaths: [...new Set([...(local?.deniedPaths ?? []), ...(managed?.deniedPaths ?? [])])],
		};
	}
}
