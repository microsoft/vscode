/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../../base/common/event.js';
import { IObservable, observableFromEventOpts } from '../../../../../../base/common/observable.js';
import { managedPermissionsConfigurationIds, resolveManagedSettingsPermissions } from '../../../../../../platform/agentHost/common/agentHostManagedSettings.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { hasManagedPermissionRules, IManagedSettingsService } from '../../../../../../platform/policy/common/copilotManagedSettings.js';

/** Internal command the Copilot extension queries to explain why semantic search is unavailable. */
export const IS_SEMANTIC_SEARCH_DISABLED_BY_MANAGED_POLICY_COMMAND_ID = '_chat.isSemanticSearchDisabledByManagedPolicy';

/** Which Copilot managed permission sources are active, as VS Code sees them. */
export interface ISemanticSearchManagedPolicyState {
	/** Managed permission rule lists delivered by native MDM, server, or file managed settings. */
	readonly managedRules: boolean;
	/** Legacy VS Code policies that the bridge sends to a local Agent Host as managed rules. */
	readonly bridgedRules: boolean;
}

/**
 * Reads whether Copilot managed permissions disable semantic search. The Agent
 * Host withholds and denies semantic search while any managed permission rule
 * is active, because the runtime cannot match a query against managed `Read`
 * rules and the tool's own confirmation cannot guarantee a human decision.
 * This mirrors that decision for the rules VS Code can see, without
 * interpreting them; the host remains authoritative.
 */
export function getSemanticSearchManagedPolicyState(managedSettingsService: IManagedSettingsService, configurationService: IConfigurationService): ISemanticSearchManagedPolicyState {
	const bridged = resolveManagedSettingsPermissions(configurationService);
	return {
		managedRules: hasManagedPermissionRules(managedSettingsService),
		bridgedRules: !!bridged.deny?.length || !!bridged.ask?.length,
	};
}

/** Whether semantic search is disabled for a session whose host does or does not receive bridged rules. */
export function isSemanticSearchDisabledByManagedPolicy(state: ISemanticSearchManagedPolicyState, receivesBridgedRules: boolean): boolean {
	return state.managedRules || (receivesBridgedRules && state.bridgedRules);
}

/** Observes {@link getSemanticSearchManagedPolicyState} as managed settings and bridged policies change. */
export function observeSemanticSearchManagedPolicyState(owner: object, managedSettingsService: IManagedSettingsService, configurationService: IConfigurationService): IObservable<ISemanticSearchManagedPolicyState> {
	const onDidChange = Event.any<unknown>(
		managedSettingsService.onDidChangeManagedSettings,
		Event.filter(configurationService.onDidChangeConfiguration, e => managedPermissionsConfigurationIds.some(id => e.affectsConfiguration(id))),
	);
	return observableFromEventOpts(
		{ owner, equalsFn: (a, b) => a.managedRules === b.managedRules && a.bridgedRules === b.bridgedRules },
		onDidChange,
		() => getSemanticSearchManagedPolicyState(managedSettingsService, configurationService),
	);
}

CommandsRegistry.registerCommand(IS_SEMANTIC_SEARCH_DISABLED_BY_MANAGED_POLICY_COMMAND_ID, accessor =>
	isSemanticSearchDisabledByManagedPolicy(getSemanticSearchManagedPolicyState(accessor.get(IManagedSettingsService), accessor.get(IConfigurationService)), true));
