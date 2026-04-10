/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { mcpAccessConfig, McpAccessValue } from '../../../../platform/mcp/common/mcpManagement.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IMcpService, LazyCollectionState, McpConnectionState, McpServerCacheState } from './mcpTypes.js';


export namespace McpContextKeys {

	export const serverCount = new RawContextKey<number>('mcp.serverCount', undefined, { type: 'number', description: localize('mcp.serverCount.description', "Context key that has the number of registered MCP servers") });
	export const hasUnknownTools = new RawContextKey<boolean>('mcp.hasUnknownTools', undefined, { type: 'boolean', description: localize('mcp.hasUnknownTools.description', "Indicates whether there are MCP servers with unknown tools.") });
	/**
	 * A context key that indicates whether there are any servers with errors.
	 *
	 * @type {boolean}
	 * @default undefined
	 * @description This key is used to track the presence of servers with errors in the MCP context.
	 */
	export const hasServersWithErrors = new RawContextKey<boolean>('mcp.hasServersWithErrors', undefined, { type: 'boolean', description: localize('mcp.hasServersWithErrors.description', "Indicates whether there are any MCP servers with errors.") });
	export const toolsCount = new RawContextKey<number>('mcp.toolsCount', undefined, { type: 'number', description: localize('mcp.toolsCount.description', "Context key that has the number of registered MCP tools") });
	export const mcpDisabledByPolicy = new RawContextKey<boolean>('mcp.disabledByPolicy', false, { type: 'boolean', description: localize('mcp.disabledByPolicy.description', "Indicates whether MCP is disabled by policy") });
}


export class McpContextKeysController extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.mcp.contextKey';

	constructor(
		@IMcpService mcpService: IMcpService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		const ctxServerCount = McpContextKeys.serverCount.bindTo(contextKeyService);
		const ctxToolsCount = McpContextKeys.toolsCount.bindTo(contextKeyService);
		const ctxHasUnknownTools = McpContextKeys.hasUnknownTools.bindTo(contextKeyService);
		const ctxMcpDisabledByPolicy = McpContextKeys.mcpDisabledByPolicy.bindTo(contextKeyService);

		// Initialize the policy context key
		const updateMcpPolicyContextKey = () => {
			ctxMcpDisabledByPolicy.set(configurationService.inspect<string>(mcpAccessConfig).policyValue === McpAccessValue.None);
		};
		updateMcpPolicyContextKey();

		// Listen for configuration changes that affect MCP policy
		this._store.add(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(mcpAccessConfig)) {
				updateMcpPolicyContextKey();
			}
		}));

		this._store.add(bindContextKey(McpContextKeys.hasServersWithErrors, contextKeyService, r => mcpService.servers.read(r).some(c => c.connectionState.read(r).state === McpConnectionState.Kind.Error)));

		this._store.add(autorun(r => {
			const servers = mcpService.servers.read(r);
			const serverTools = servers.map(s => s.tools.read(r));
			ctxServerCount.set(servers.length);
			ctxToolsCount.set(serverTools.reduce((count, tools) => count + tools.length, 0));
			ctxHasUnknownTools.set(mcpService.lazyCollectionState.read(r).state !== LazyCollectionState.AllKnown || servers.some(s => {
				const toolState = s.cacheState.read(r);
				return toolState === McpServerCacheState.Unknown || toolState === McpServerCacheState.Outdated || toolState === McpServerCacheState.RefreshingFromUnknown;
			}));
		}));
	}
}
