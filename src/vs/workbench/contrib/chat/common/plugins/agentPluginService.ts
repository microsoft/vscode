/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { SyncDescriptor0 } from '../../../../../platform/instantiation/common/descriptors.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IMcpServerConfiguration } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { HookType, IHookCommand } from '../promptSyntax/hookSchema.js';
import { IMarketplacePlugin } from './pluginMarketplaceService.js';

export const IAgentPluginService = createDecorator<IAgentPluginService>('agentPluginService');

export interface IAgentPluginHook {
	readonly type: HookType;
	readonly hooks: readonly IHookCommand[];
	readonly originalId: string;
}

export interface IAgentPluginCommand {
	readonly uri: URI;
	readonly name: string;
}

export interface IAgentPluginSkill {
	readonly uri: URI;
	readonly name: string;
}

export interface IAgentPluginAgent {
	readonly uri: URI;
	readonly name: string;
}

export interface IAgentPluginMcpServerDefinition {
	readonly name: string;
	readonly configuration: IMcpServerConfiguration;
}

export interface IAgentPlugin {
	readonly uri: URI;
	readonly enabled: IObservable<boolean>;
	setEnabled(enabled: boolean): void;
	readonly hooks: IObservable<readonly IAgentPluginHook[]>;
	readonly commands: IObservable<readonly IAgentPluginCommand[]>;
	readonly skills: IObservable<readonly IAgentPluginSkill[]>;
	readonly agents: IObservable<readonly IAgentPluginAgent[]>;
	readonly mcpServerDefinitions: IObservable<readonly IAgentPluginMcpServerDefinition[]>;
	/** Set when the plugin was installed from a marketplace repository. */
	readonly fromMarketplace?: IMarketplacePlugin;
}

export interface IAgentPluginService {
	readonly _serviceBrand: undefined;
	readonly plugins: IObservable<readonly IAgentPlugin[]>;
	readonly allPlugins: IObservable<readonly IAgentPlugin[]>;
	setPluginEnabled(pluginUri: URI, enabled: boolean): void;
}

export interface IAgentPluginDiscovery extends IDisposable {
	readonly plugins: IObservable<readonly IAgentPlugin[]>;
	start(): void;
}

export function getCanonicalPluginCommandId(plugin: IAgentPlugin, commandName: string): string {
	const pluginSegment = basename(plugin.uri);
	const prefix = normalizePluginToken(pluginSegment);
	const normalizedCommand = normalizePluginToken(commandName);
	if (normalizedCommand.startsWith(`${prefix}:`)) {
		return normalizedCommand;
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
	private readonly _discovery: SyncDescriptor0<IAgentPluginDiscovery>[] = [];

	register(descriptor: SyncDescriptor0<IAgentPluginDiscovery>): void {
		this._discovery.push(descriptor);
	}

	getAll(): readonly SyncDescriptor0<IAgentPluginDiscovery>[] {
		return this._discovery;
	}
}

export const agentPluginDiscoveryRegistry = new AgentPluginDiscoveryRegistry();


