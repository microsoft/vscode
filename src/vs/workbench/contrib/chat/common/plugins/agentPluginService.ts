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
import { ContributionEnablementState, IEnablementModel } from '../enablement.js';
import { HookType } from '../promptSyntax/hookTypes.js';
import { IMarketplacePlugin } from './pluginMarketplaceService.js';

export const IAgentPluginService = createDecorator<IAgentPluginService>('agentPluginService');

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

export interface IAgentPlugin {
	readonly uri: URI;
	readonly format: PluginFormat;
	/** Human-readable display name for the plugin. */
	readonly label: string;
	readonly enablement: IObservable<ContributionEnablementState>;
	/**
	 * When `true`, the plugin is blocked by enterprise policy. It remains
	 * visible (shown as disabled) but its contributions are inactive and the
	 * user cannot re-enable it. Folded into {@link enablement} so all gating
	 * consumers honor it automatically.
	 */
	readonly policyBlocked?: IObservable<boolean>;
	/** Removes this plugin from its discovery source (config or installed storage). Undefined for policy-managed plugins that cannot be removed by the user. */
	remove?(): void;
	readonly hooks: IObservable<readonly IAgentPluginHook[]>;
	readonly commands: IObservable<readonly IAgentPluginCommand[]>;
	readonly skills: IObservable<readonly IAgentPluginSkill[]>;
	readonly agents: IObservable<readonly IAgentPluginAgent[]>;
	readonly instructions: IObservable<readonly IAgentPluginInstruction[]>;
	readonly mcpServerDefinitions: IObservable<readonly IAgentPluginMcpServerDefinition[]>;
	/** Set when the plugin was installed from a marketplace repository. */
	readonly fromMarketplace?: IMarketplacePlugin;
}

export interface IAgentPluginService {
	readonly _serviceBrand: undefined;
	readonly plugins: IObservable<readonly IAgentPlugin[]>;
	readonly enablementModel: IEnablementModel;
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
