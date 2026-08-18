/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Compatibility bridge from legacy VS Code settings to Copilot SDK managed
 * settings.
 *
 * Scope and limits, all deliberate:
 *
 * - **Restrictions only.** Mappings may add `deny`, `ask`, or the bypass lock;
 *   they never widen what a session may do. See
 *   {@link IAgentHostManagedSettingsPermissions} for why an `allow` list is not
 *   contributed even to narrow another rule's reach.
 * - **Global layers only.** Values are read from policy, user, and application;
 *   workspace and folder values are ignored, because the agent host is shared by
 *   every window connected to it and one workspace's settings must not leak into
 *   another window's sessions.
 * - **Only what survives translation.** A setting is mapped only when its VS
 *   Code semantics can be expressed exactly in the SDK's rule grammar. Where
 *   they cannot — a regular-expression terminal rule, an allow list that blocks
 *   what it omits — the restriction is skipped rather than approximated, since a
 *   near-miss silently changes what an administrator configured.
 * - **Copilot sessions on a local host.** The renderer sends an empty
 *   contribution to remote hosts, and other agents do not consume managed
 *   settings, so restrictions bridged here do not reach them. Those agents
 *   remain governed by the root-config path (see
 *   `AgentHostAutoApprovePolicyRestrictedConfigKey`).
 *
 * New enterprise controls belong directly in the SDK's managed-settings
 * contract; this table exists only so settings that predate it keep working.
 */

import type { IConfigurationService } from '../../configuration/common/configuration.js';
import { AgentNetworkDomainSettingId } from '../../networkFilter/common/settings.js';
import { buildManagedFamilyRule, buildManagedRule, ManagedRuleFamily } from './agentHostManagedRules.js';
import { getGlobalConfigurationValue, inspectValue } from './agentHostConfigurationSync.js';
import { GLOBAL_AUTO_APPROVE_SETTING_ID, TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID, TERMINAL_AUTO_APPROVE_SETTING_ID, type AgentHostTerminalAutoApproveRules } from './agentHostSchema.js';

/**
 * The restrictions this bridge contributes to the Copilot SDK.
 *
 * Note the deliberate absence of an `allow` list. The SDK's managed `allow` is
 * not a scoping hint — a covered request resolves to `managed_allow`, which the
 * runtime treats as outright approval and returns without prompting. Worse, the
 * runtime only intersects allow lists when more than one managed source supplies
 * one, so a lone list from VS Code is never intersected and would grant blanket
 * auto-approval, potentially relaxing an MDM policy rather than reinforcing it.
 * This bridge therefore only ever contributes restrictions.
 */
export interface IAgentHostManagedSettingsPermissions {
	disableBypassPermissionsMode?: 'disable';
	deny?: string[];
	ask?: string[];
}

export const AgentHostMapLegacySettingsToManagedSettingsSettingId = 'chat.agentHost.copilot.mapLegacySettingsToManagedSettings';

/**
 * Which configuration layers may drive a mapping.
 *
 * `policyOnly` is the default for anything that removes a capability the user
 * would otherwise have, so a personal preference is never promoted into an
 * enterprise-grade restriction the user cannot lift. `anyGlobal` exists for
 * mappings whose VS Code behavior already honors user and application values,
 * where narrowing to policy would be a regression.
 */
type ManagedPermissionsSettingSources = 'policyOnly' | 'anyGlobal';

interface IManagedPermissionsSettingMapping {
	readonly settingId: string;
	/** Further settings whose changes must also re-resolve this mapping. */
	readonly additionalSettingIds?: readonly string[];
	contribute(configurationService: IConfigurationService): IAgentHostManagedSettingsPermissions | undefined;
}

function managedPermissionsSetting<T>(
	settingId: string,
	sources: ManagedPermissionsSettingSources,
	transform: (value: T) => IAgentHostManagedSettingsPermissions | undefined,
): IManagedPermissionsSettingMapping {
	return {
		settingId,
		contribute: configurationService => {
			const configuration = inspectValue<T>(configurationService, settingId);
			if (configuration === undefined) {
				return undefined;
			}
			const [value, source] = configuration;
			if (sources === 'policyOnly' && source !== 'policyValue') {
				return undefined;
			}
			return transform(value);
		},
	};
}

/**
 * A mapping whose restriction is decided by several settings together — for
 * example a list that only takes effect while a separate switch is on. The
 * additional setting ids are registered so a change to any of them re-resolves
 * the contribution.
 */
function managedPermissionsCompositeSetting(
	settingId: string,
	additionalSettingIds: readonly string[],
	contribute: (configurationService: IConfigurationService) => IAgentHostManagedSettingsPermissions | undefined,
): IManagedPermissionsSettingMapping {
	return { settingId, additionalSettingIds, contribute };
}

/**
 * Translates VS Code's agent network filter into managed domain rules.
 *
 * Only the blocking half is expressible. VS Code denies any domain outside a
 * populated allow list, but a managed `allow` entry does not block what it omits
 * — unmatched requests fall through to a prompt the user can approve — so
 * mapping the allow list would quietly downgrade a block into a prompt. The deny
 * list and the "filter on with nothing configured" case both mean block, and
 * both survive the translation intact.
 */
function contributeNetworkDomainRules(configurationService: IConfigurationService): IAgentHostManagedSettingsPermissions | undefined {
	if (getGlobalConfigurationValue<boolean>(configurationService, AgentNetworkDomainSettingId.NetworkFilter) !== true) {
		return undefined;
	}
	const allowed = getGlobalConfigurationValue<string[]>(configurationService, AgentNetworkDomainSettingId.AllowedNetworkDomains) ?? [];
	const denied = getGlobalConfigurationValue<string[]>(configurationService, AgentNetworkDomainSettingId.DeniedNetworkDomains) ?? [];

	// VS Code's restrictive default: with the filter on and neither list
	// configured, every domain is blocked.
	if (allowed.length === 0 && denied.length === 0) {
		return { deny: [buildManagedFamilyRule(ManagedRuleFamily.Domain)] };
	}

	const deny: string[] = [];
	for (const pattern of denied) {
		if (typeof pattern !== 'string') {
			continue;
		}
		// VS Code accepts a bare `*` as "every domain"; the SDK expresses that as
		// the family rule rather than as an argument.
		const rule = pattern.trim() === '*'
			? buildManagedFamilyRule(ManagedRuleFamily.Domain)
			: buildManagedRule(ManagedRuleFamily.Domain, pattern);
		if (rule) {
			deny.push(rule);
		}
	}
	return deny.length > 0 ? { deny } : undefined;
}

/**
 * Translates VS Code's explicit terminal auto-approve denials into managed
 * shell rules.
 *
 * A `false` entry means "require explicit approval", not "block" — the
 * setting's own enum description says so, and the host-side auto-approver's
 * `denied` result only causes a prompt. It therefore maps onto `ask`, which
 * keeps the user's approval path, rather than `deny`, which is terminal and has
 * no ask stage.
 *
 * Only literal command prefixes survive. A key wrapped in `/` is a regular
 * expression and an object-valued entry matches the whole command line; neither
 * has an equivalent in the SDK's shell rule grammar, so both are skipped rather
 * than approximated.
 */
function contributeTerminalDenialRules(rules: AgentHostTerminalAutoApproveRules): IAgentHostManagedSettingsPermissions | undefined {
	if (!rules || typeof rules !== 'object') {
		return undefined;
	}
	const ask: string[] = [];
	for (const [command, value] of Object.entries(rules)) {
		if (value !== false || isRegexAutoApproveKey(command)) {
			continue;
		}
		// `Shell(cmd)` already matches both the bare command and the command with
		// arguments, so the trailing-wildcard form would be redundant.
		const rule = buildManagedRule(ManagedRuleFamily.Shell, command);
		if (rule) {
			ask.push(rule);
		}
	}
	return ask.length > 0 ? { ask } : undefined;
}

/** VS Code treats a key wrapped in `/` as a regular expression. */
function isRegexAutoApproveKey(command: string): boolean {
	return command.startsWith('/') && command.lastIndexOf('/') > 0;
}

/** Compatibility mappings for legacy settings only; new controls belong directly in the SDK. */
const managedPermissionsSettings: readonly IManagedPermissionsSettingMapping[] = [
	// Disabling the SDK's bypass mode takes "Allow All" away from the user for
	// good, so only an administrator may drive it.
	managedPermissionsSetting<boolean>(GLOBAL_AUTO_APPROVE_SETTING_ID, 'policyOnly', value => value === false ? { disableBypassPermissionsMode: 'disable' } : undefined),
	// Matches VS Code, where a user or application value already suppresses
	// terminal auto-approval outright.
	managedPermissionsSetting<boolean>(TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID, 'anyGlobal', value => value === false ? { ask: [buildManagedFamilyRule(ManagedRuleFamily.Shell)] } : undefined),
	// The filter and its lists are evaluated together, and VS Code honors a user
	// or application value for all three.
	managedPermissionsCompositeSetting(
		AgentNetworkDomainSettingId.NetworkFilter,
		[AgentNetworkDomainSettingId.AllowedNetworkDomains, AgentNetworkDomainSettingId.DeniedNetworkDomains],
		contributeNetworkDomainRules,
	),
	// Mirrors the setting's own semantics, where a user or application value
	// already forces approval for the matching command.
	managedPermissionsSetting<AgentHostTerminalAutoApproveRules>(TERMINAL_AUTO_APPROVE_SETTING_ID, 'anyGlobal', contributeTerminalDenialRules),
];

export const managedPermissionsConfigurationIds = [
	AgentHostMapLegacySettingsToManagedSettingsSettingId,
	...managedPermissionsSettings.flatMap(mapping => [mapping.settingId, ...mapping.additionalSettingIds ?? []]),
];

export function isManagedSettingsPermissions(value: unknown): value is IAgentHostManagedSettingsPermissions {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}
	const permissions = value as Record<string, unknown>;
	if (Object.keys(permissions).some(key => key !== 'disableBypassPermissionsMode' && key !== 'deny' && key !== 'ask')) {
		return false;
	}
	return (permissions.disableBypassPermissionsMode === undefined || permissions.disableBypassPermissionsMode === 'disable')
		&& isStringArrayOrUndefined(permissions.deny)
		&& isStringArrayOrUndefined(permissions.ask);
}

function isStringArrayOrUndefined(value: unknown): boolean {
	return value === undefined || (Array.isArray(value) && value.every(item => typeof item === 'string'));
}

/**
 * Combines every mapping's contribution into the single document sent to the
 * host.
 *
 * Rules are deduplicated because two settings can legitimately restrict the same
 * operation — an admin who disables terminal auto-approval *and* denies a
 * command should not produce that command twice, since each duplicate is parsed
 * and evaluated separately by the runtime.
 *
 * Note that contributing any rule at all makes the runtime's managed policy
 * "active", which causes unmatched shell, read, write, URL and factory requests
 * to require approval rather than falling through to the normal auto-approval
 * paths. That is broader than any individual mapping intends, but it errs toward
 * prompting, so it is accepted deliberately: the alternative — contributing an
 * `allow` list to narrow the effect — resolves to auto-approval and would make
 * sessions *less* restricted. See {@link IAgentHostManagedSettingsPermissions}.
 */
export function resolveManagedSettingsPermissions(configurationService: IConfigurationService): IAgentHostManagedSettingsPermissions {
	if (getGlobalConfigurationValue<boolean>(configurationService, AgentHostMapLegacySettingsToManagedSettingsSettingId) !== true) {
		return {};
	}

	const deny = new Set<string>();
	const ask = new Set<string>();
	let disableBypassPermissionsMode: 'disable' | undefined;
	for (const mapping of managedPermissionsSettings) {
		const contribution = mapping.contribute(configurationService);
		if (!contribution) {
			continue;
		}
		if (contribution.disableBypassPermissionsMode) {
			disableBypassPermissionsMode = contribution.disableBypassPermissionsMode;
		}
		contribution.deny?.forEach(rule => deny.add(rule));
		contribution.ask?.forEach(rule => ask.add(rule));
	}

	const permissions: IAgentHostManagedSettingsPermissions = {};
	if (disableBypassPermissionsMode) {
		permissions.disableBypassPermissionsMode = disableBypassPermissionsMode;
	}
	if (deny.size > 0) {
		permissions.deny = [...deny];
	}
	if (ask.size > 0) {
		permissions.ask = [...ask];
	}
	return permissions;
}
