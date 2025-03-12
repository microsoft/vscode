/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals as arrayEquals } from '../../../../../base/common/arrays.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IMcpConfiguration, mcpConfigurationSection } from '../mcpConfiguration.js';
import { IMcpRegistry } from '../mcpRegistryTypes.js';
import { McpCollectionSortOrder, McpServerDefinition, McpServerTransportType } from '../mcpTypes.js';
import { IMcpDiscovery } from './mcpDiscovery.js';


/**
 * Discovers MCP servers based on various config sources.
 */
export class ConfigMcpDiscovery extends Disposable implements IMcpDiscovery {
	private readonly configSources: {
		key: 'userLocalValue' | 'userRemoteValue' | 'workspaceValue';
		label: string;
		serverDefinitions: ISettableObservable<readonly McpServerDefinition[]>;
		scope: StorageScope;
		target: ConfigurationTarget;
		disposable: MutableDisposable<IDisposable>;
		order: number;
		remoteAuthority?: string;
	}[];

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@IProductService productService: IProductService,
		@ILabelService labelService: ILabelService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		const remoteLabel = environmentService.remoteAuthority ? labelService.getHostLabel(Schemas.vscodeRemote, environmentService.remoteAuthority) : 'Remote';
		this.configSources = [
			{
				key: 'userLocalValue',
				target: ConfigurationTarget.USER_LOCAL,
				label: localize('mcp.configuration.userLocalValue', 'Global in {0}', productService.nameShort),
				serverDefinitions: observableValue(this, []),
				scope: StorageScope.PROFILE,
				disposable: this._register(new MutableDisposable()),
				order: McpCollectionSortOrder.User,
			},
			{
				key: 'userRemoteValue',
				target: ConfigurationTarget.USER_REMOTE,
				label: localize('mcp.configuration.userRemoteValue', 'From {0}', remoteLabel),
				serverDefinitions: observableValue(this, []),
				scope: StorageScope.PROFILE,
				disposable: this._register(new MutableDisposable()),
				remoteAuthority: environmentService.remoteAuthority,
				order: McpCollectionSortOrder.User + McpCollectionSortOrder.RemotePenalty,
			},
			{
				key: 'workspaceValue',
				target: ConfigurationTarget.WORKSPACE,
				label: localize('mcp.configuration.workspaceValue', 'From your workspace'),
				serverDefinitions: observableValue(this, []),
				scope: StorageScope.WORKSPACE,
				disposable: this._register(new MutableDisposable()),
				order: McpCollectionSortOrder.Workspace,

			},
		];
	}

	public start() {
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(mcpConfigurationSection)) {
				this.sync();
			}
		}));

		this.sync();
	}

	private sync() {
		const configurationKey = this._configurationService.inspect<IMcpConfiguration>(mcpConfigurationSection);

		for (const src of this.configSources) {
			const collectionId = `mcp.config.${src.key}`;
			let value = configurationKey[src.key];

			// If we see there are MCP servers, migrate them automatically
			if (value?.mcpServers) {
				value = { ...value, servers: { ...value.servers, ...value.mcpServers }, mcpServers: undefined };
				this._configurationService.updateValue(mcpConfigurationSection, value, {}, src.target, { donotNotifyError: true });
			}

			const nextDefinitions = Object.entries(value?.servers || {}).map(([name, value]): McpServerDefinition => ({
				id: `${collectionId}.${name}`,
				label: name,
				launch: {
					type: McpServerTransportType.Stdio,
					args: value.args || [],
					command: value.command,
					env: value.env || {},
					cwd: undefined,
				},
				variableReplacement: {
					section: mcpConfigurationSection,
					target: src.target,
				}
			}));

			if (arrayEquals(nextDefinitions, src.serverDefinitions.get(), McpServerDefinition.equals)) {
				continue;
			}

			if (!nextDefinitions.length) {
				src.disposable.clear();
			} else {
				src.serverDefinitions.set(nextDefinitions, undefined);
				src.disposable.value ??= this._mcpRegistry.registerCollection({
					id: collectionId,
					label: src.label,
					order: src.order,
					remoteAuthority: src.remoteAuthority || null,
					serverDefinitions: src.serverDefinitions,
					isTrustedByDefault: true,
					scope: src.scope,
				});
			}
		}
	}
}
