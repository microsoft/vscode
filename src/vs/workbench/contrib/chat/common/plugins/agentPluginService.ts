/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { SyncDescriptor0 } from '../../../../../platform/instantiation/common/descriptors.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { type INamedPluginResource, type IMcpServerDefinition, type IParsedHookCommand, type PluginFormat } from '../../../../../platform/agentPlugins/common/pluginParsers.js';
import { ContributionEnablementState, IEnablementModel, isContributionEnabled } from '../enablement.js';
import { IAutomationBlueprint } from '../automations/automationBlueprint.js';
import { HookType } from '../promptSyntax/hookTypes.js';
import { IMarketplacePlugin } from './pluginMarketplaceService.js';
import { localize } from '../../../../../nls.js';

export const IAgentPluginService = createDecorator<IAgentPluginService>('agentPluginService');

export const IAgentPluginEnablementService = createDecorator<IAgentPluginEnablementService>('agentPluginEnablementService');

export interface IAgentPluginEnablementService extends IEnablementModel {
	readonly _serviceBrand: undefined;
	/** Keeps a stable enablement identity across install locations, including other workspaces. */
	copyEnablement(source: URI, target: URI): void;
}

export interface IAgentPluginHook {
	readonly type: HookType;
	readonly hooks: readonly IParsedHookCommand[];
	/** URI where this hook is defined -- not unique, multiple hooks may be in a manifest */
	readonly uri: URI;
	readonly originalId: string;
}

export type IAgentPluginCommand = INamedPluginResource;
export type IAgentPluginSkill = INamedPluginResource;
export type IAgentPluginAgent = INamedPluginResource;
export type IAgentPluginInstruction = INamedPluginResource;
export type IAgentPluginMcpServerDefinition = IMcpServerDefinition;
export interface IAgentPluginAutomation {
	readonly uri: URI;
	readonly blueprint: IAutomationBlueprint;
}

export type CopilotCliPluginInstallSource =
	| { readonly kind: 'github'; readonly repository: string; readonly ref?: string; readonly sha?: string; readonly path?: string }
	| { readonly kind: 'url'; readonly url: string; readonly ref?: string; readonly sha?: string; readonly path?: string }
	| { readonly kind: 'local'; readonly path: string };

export interface ICopilotCliPluginInstallation {
	readonly name: string;
	readonly marketplace: string;
	readonly directSourceId?: string;
	readonly source?: CopilotCliPluginInstallSource;
}

export interface IAgentPlugin {
	readonly uri: URI;
	readonly format: PluginFormat;
	/** Human-readable display name for the plugin. */
	readonly label: string;
	/** Version declared by the plugin manifest, falling back to marketplace metadata. */
	readonly version?: IObservable<string | undefined>;
	readonly enablement: IObservable<ContributionEnablementState>;
	/** Explicit managed enablement for this plugin. Undefined when policy does not mention it. */
	readonly policyEnablement?: IObservable<boolean | undefined>;
	/** Compatibility view for consumers that only distinguish policy-blocked plugins. */
	readonly policyBlocked?: IObservable<boolean>;
	/** Removes this plugin from its discovery source (config or installed storage). */
	remove?(): Promise<boolean>;
	/** Persists global enablement through the runtime that owns this installation. */
	setEnabled?(enabled: boolean): Promise<void>;
	readonly hooks: IObservable<readonly IAgentPluginHook[]>;
	readonly commands: IObservable<readonly IAgentPluginCommand[]>;
	readonly skills: IObservable<readonly IAgentPluginSkill[]>;
	readonly agents: IObservable<readonly IAgentPluginAgent[]>;
	readonly instructions: IObservable<readonly IAgentPluginInstruction[]>;
	readonly mcpServerDefinitions: IObservable<readonly IAgentPluginMcpServerDefinition[]>;
	readonly automations: IObservable<readonly IAgentPluginAutomation[]>;
	/** Set when the plugin was installed from a marketplace repository. */
	readonly fromMarketplace?: IMarketplacePlugin;
	/** Set when the Copilot SDK owns this plugin installation. */
	readonly copilotCliInstallation?: ICopilotCliPluginInstallation;
}

export interface IAgentPluginService {
	readonly _serviceBrand: undefined;
	readonly plugins: IObservable<readonly IAgentPlugin[]>;
	readonly enablementModel: IEnablementModel;
}

/** Commits global runtime enablement before publishing the client's decision; workspace overrides stay local. */
export async function setAgentPluginEnablement(plugin: IAgentPlugin, model: IEnablementModel, state: ContributionEnablementState): Promise<void> {
	if (plugin.policyEnablement?.get() !== undefined || plugin.policyBlocked?.get()) {
		throw new Error(localize('pluginEnablementManaged', "Plugin '{0}' is managed by your organization.", plugin.label));
	}
	const key = plugin.uri.toString();
	const rejected = () => new Error(localize('pluginEnablementRejected', "Plugin '{0}' enablement was rejected by the local enablement model.", plugin.label));
	if (model.canSetEnabled?.(key, state) === false) {
		throw rejected();
	}
	if (plugin.setEnabled && (state === ContributionEnablementState.EnabledProfile || state === ContributionEnablementState.DisabledProfile)) {
		const previousEnabled = model.readProfileEnabled(key);
		const enabled = isContributionEnabled(state);
		await plugin.setEnabled(enabled);
		try {
			if (model.canSetEnabled?.(key, state) === false) {
				throw rejected();
			}
			model.setEnabled(key, state);
			if (model.readProfileEnabled(key) !== enabled || isContributionEnabled(model.readEnabled(key)) !== enabled) {
				throw rejected();
			}
		} catch (error) {
			try {
				await plugin.setEnabled(previousEnabled);
			} catch (rollbackError) {
				throw new AggregateError([error, rollbackError], localize('pluginEnablementRollbackFailed', "Plugin '{0}' enablement was rejected and its runtime state could not be restored.", plugin.label));
			}
			throw error;
		}
		return;
	}
	model.setEnabled(key, state);
}

export interface IAgentPluginDiscovery extends IDisposable {
	readonly plugins: IObservable<readonly IAgentPlugin[] | undefined>;
	start(enablementModel: IEnablementModel): void;
}

export const enum AgentPluginDiscoveryPriority {
	Configured = 10,
	Marketplace = 20,
	Extension = 30,
	CopilotCli = 40,
}

export function getCanonicalPluginCommandId(plugin: { readonly uri: URI; readonly label?: string }, commandName: string): string {
	const prefix = (plugin.label ? normalizePluginToken(plugin.label) : '') || normalizePluginToken(basename(plugin.uri));
	const normalizedCommand = normalizePluginToken(commandName);
	if (normalizedCommand.startsWith(`${prefix}:`)) {
		return normalizedCommand;
	}

	// When the skill name matches the plugin name, use just the plugin
	// name so the user can invoke `/plugin-name` instead of the redundant
	// `/plugin-name:plugin-name`.
	if (prefix === normalizedCommand) {
		return prefix;
	}

	return `${prefix}:${normalizedCommand}`;
}

function normalizePluginToken(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^a-z0-9_.:-]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^[-:.]+|[-:.]+$/g, '');
}

class AgentPluginDiscoveryRegistry {
	private readonly _discovery: { readonly descriptor: SyncDescriptor0<IAgentPluginDiscovery>; readonly priority: AgentPluginDiscoveryPriority; readonly order: number }[] = [];
	private _order = 0;

	register(descriptor: SyncDescriptor0<IAgentPluginDiscovery>, priority: AgentPluginDiscoveryPriority): IDisposable {
		const registration = { descriptor, priority, order: this._order++ };
		this._discovery.push(registration);
		return toDisposable(() => {
			const index = this._discovery.indexOf(registration);
			if (index >= 0) {
				this._discovery.splice(index, 1);
			}
		});
	}

	getAll(): readonly { readonly descriptor: SyncDescriptor0<IAgentPluginDiscovery>; readonly priority: AgentPluginDiscoveryPriority; readonly order: number }[] {
		return [...this._discovery].sort((a, b) => a.priority - b.priority || a.order - b.order);
	}
}

export const agentPluginDiscoveryRegistry = new AgentPluginDiscoveryRegistry();
