/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IMcpService } from './mcpTypes.js';


export namespace McpContextKeys {

	export const serverCount = new RawContextKey<number>('mcp.serverCount', undefined, { type: 'number', description: localize('mcp.serverCount.description', "Context key that has the number of registered MCP servers") });
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

		this._store.add(autorun(r => {
			ctxServerCount.set(mcpService.servers.read(r).length);
			ctxToolsCount.set(mcpService.servers.read(r).reduce((count, server) => count + server.tools.read(r).length, 0));
		}));
	}
}
