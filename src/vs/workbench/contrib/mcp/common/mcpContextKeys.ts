/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IMcpService, McpServerToolsState } from './mcpTypes.js';


export namespace McpContextKeys {

	export const serverCount = new RawContextKey<number>('mcp.serverCount', undefined, { type: 'number', description: localize('mcp.serverCount.description', "Context key that has the number of registered MCP servers") });
	export const hasUnknownTools = new RawContextKey<boolean>('mcp.hasUnknownTools', undefined, { type: 'boolean', description: localize('mcp.hasUnknownTools.description', "Indicates whether there are MCP servers with unknown tools.") });
	export const toolsCount = new RawContextKey<number>('mcp.toolsCount', undefined, { type: 'number', description: localize('mcp.toolsCount.description', "Context key that has the number of registered MCP tools") });
}


export class McpContextKeysController extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.mcp.contextKey';

	constructor(
		@IMcpService mcpService: IMcpService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super();

		const ctxServerCount = McpContextKeys.serverCount.bindTo(contextKeyService);
		const ctxToolsCount = McpContextKeys.toolsCount.bindTo(contextKeyService);
		const ctxHasUnknownTools = McpContextKeys.hasUnknownTools.bindTo(contextKeyService);

		this._store.add(autorun(r => {
			const servers = mcpService.servers.read(r);
			const serverTools = servers.map(s => s.tools.read(r));
			ctxServerCount.set(servers.length);
			ctxToolsCount.set(serverTools.reduce((count, tools) => count + tools.length, 0));
			ctxHasUnknownTools.set(mcpService.hasExtensionsWithUnknownServers.read(r) || servers.some(s => {
				if (s.trusted.read(r) === false) {
					return false;
				}

				const toolState = s.toolsState.read(r);
				return toolState === McpServerToolsState.Unknown || toolState === McpServerToolsState.RefreshingFromUnknown;
			}));
		}));
	}
}
