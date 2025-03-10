/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { StorageScope } from '../../../../platform/storage/common/storage.js';
import { ILanguageModelToolsService, IToolResult } from '../../chat/common/languageModelToolsService.js';
import { IMcpRegistry } from './mcpRegistryTypes.js';
import { McpServer, McpServerMetadataCache } from './mcpServer.js';
import { IMcpServer, IMcpService, McpCollectionDefinition, McpServerDefinition } from './mcpTypes.js';

export class McpService extends Disposable implements IMcpService {

	declare _serviceBrand: undefined;

	private readonly _servers = observableValue<readonly IMcpServer[]>(this, []);
	public readonly servers: IObservable<readonly IMcpServer[]> = this._servers;

	private readonly userCache: McpServerMetadataCache;
	private readonly workspaceCache: McpServerMetadataCache;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService
	) {
		super();

		this.userCache = instantiationService.createInstance(McpServerMetadataCache, StorageScope.PROFILE);
		this.workspaceCache = instantiationService.createInstance(McpServerMetadataCache, StorageScope.WORKSPACE);

		const definitionsObservable = derived(reader => {
			const collections = this._mcpRegistry.collections.read(reader);
			return collections.flatMap(collectionDefinition => collectionDefinition.serverDefinitions.read(reader).map(serverDefinition => ({
				serverDefinition,
				collectionDefinition,
			})));
		});

		const updateThrottle = this._store.add(new RunOnceScheduler(() => {
			const definitions = definitionsObservable.get();

			const nextDefinitions = new Set(definitions);
			const currentServers = this._servers.get();
			const nextServers: IMcpServer[] = [];
			for (const server of currentServers) {
				const match = definitions.find(d => defsEqual(server, d));
				if (match) {
					nextDefinitions.delete(match);
					nextServers.push(server);
				} else {
					server.dispose();
				}
			}
			for (const def of nextDefinitions) {
				nextServers.push(instantiationService.createInstance(McpServer, def.collectionDefinition, def.serverDefinition, def.collectionDefinition.scope === StorageScope.WORKSPACE ? this.workspaceCache : this.userCache));
			}

			this._servers.set(nextServers, undefined);
		}, 500));

		// Throttle changes so that if a collection is changed, or a server is
		// unregistered/registered, we don't stop servers unnecessarily.
		this._register(autorun(reader => {
			definitionsObservable.read(reader);
			updateThrottle.schedule(500);
		}));


		const tools = this._register(new MutableDisposable());

		this._register(autorun(reader => {

			const servers = this._servers.read(reader);

			// TODO@jrieken wasteful, needs some diff'ing/change-info
			const newStore = new DisposableStore();

			tools.clear();

			for (const server of servers) {

				for (const tool of server.tools.read(reader)) {

					newStore.add(toolsService.registerToolData({
						id: tool.id,
						displayName: tool.definition.name,
						modelDescription: tool.definition.description ?? '',
						inputSchema: tool.definition.inputSchema,
						tags: ['mcp', 'vscode_editing']
					}));
					newStore.add(toolsService.registerToolImplementation(tool.id, {

						async prepareToolInvocation(parameters, token) {
							return {
								confirmationMessages: {
									title: localize('aaa', "Run tool from {0}", server.definition.label),
									message: localize('ddd', "Do you allow to run `{0}` from `{1}`?", tool.definition.name, server.definition.label)
								}
							};
						},

						async invoke(invocation, countTokens, token) {

							const result: IToolResult = {
								content: []
							};

							const callResult = await tool.call(invocation.parameters as Record<string, any>, token);
							for (const item of callResult.content) {
								if (item.type === 'text') {
									result.content.push({
										kind: 'text',
										value: item.text
									});
								} else {
									// TODO@jrieken handle different item types
								}
							}

							return result;
						},
					}));
				}
			}

			tools.value = newStore;

		}));
	}

	public override dispose(): void {
		this._servers.get().forEach(server => server.dispose());
		super.dispose();
	}
}

function defsEqual(server: IMcpServer, def: { serverDefinition: McpServerDefinition; collectionDefinition: McpCollectionDefinition }) {
	return McpCollectionDefinition.equals(server.collection, def.collectionDefinition) &&
		McpServerDefinition.equals(server.definition, def.serverDefinition);
}
