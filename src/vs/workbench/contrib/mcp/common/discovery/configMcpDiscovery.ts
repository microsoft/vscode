/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals as arrayEquals } from '../../../../../base/common/arrays.js';
import { Throttler } from '../../../../../base/common/async.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { Location } from '../../../../../editor/common/languages.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { getMcpServerMapping } from '../mcpConfigFileUtils.js';
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
		uri(): URI | undefined;
		getServerToLocationMapping(uri: URI): Promise<Map<string, Location>>;
	}[];

	private _remoteEnvironment: IRemoteAgentEnvironment | null = null;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@IProductService productService: IProductService,
		@ILabelService labelService: ILabelService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@IPreferencesService preferencesService: IPreferencesService,
		@ITextModelService private readonly _textModelService: ITextModelService,
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
				uri: () => preferencesService.userSettingsResource,
				getServerToLocationMapping: uri => this._getServerIdMapping(uri, [mcpConfigurationSection, 'servers']),
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
				uri: () => this._remoteEnvironment?.settingsPath,
				getServerToLocationMapping: uri => this._getServerIdMapping(uri, [mcpConfigurationSection, 'servers']),
			},
			{
				key: 'workspaceValue',
				target: ConfigurationTarget.WORKSPACE,
				label: localize('mcp.configuration.workspaceValue', 'From your workspace'),
				serverDefinitions: observableValue(this, []),
				scope: StorageScope.WORKSPACE,
				disposable: this._register(new MutableDisposable()),
				order: McpCollectionSortOrder.Workspace,
				uri: () => preferencesService.workspaceSettingsResource ? URI.joinPath(preferencesService.workspaceSettingsResource, '../mcp.json') : undefined,
				getServerToLocationMapping: uri => this._getServerIdMapping(uri, ['servers']),
			},
		];
	}

	public start() {
		const throttler = this._register(new Throttler());

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(mcpConfigurationSection)) {
				throttler.queue(() => this.sync());
			}
		}));

		this._remoteAgentService.getEnvironment().then(remoteEnvironment => {
			this._remoteEnvironment = remoteEnvironment;
			throttler.queue(() => this.sync());
		});

		throttler.queue(() => this.sync());
	}

	private async _getServerIdMapping(resource: URI, pathToServers: string[]): Promise<Map<string, Location>> {
		const store = new DisposableStore();
		try {
			const ref = await this._textModelService.createModelReference(resource);
			store.add(ref);
			const serverIdMapping = getMcpServerMapping({ model: ref.object.textEditorModel, pathToServers });
			return serverIdMapping;
		} catch {
			return new Map();
		} finally {
			store.dispose();
		}
	}

	private async sync() {
		const configurationKey = this._configurationService.inspect<IMcpConfiguration>(mcpConfigurationSection);
		const configMappings = await Promise.all(this.configSources.map(src => {
			const uri = src.uri();
			return uri && src.getServerToLocationMapping(uri);
		}));

		for (const [index, src] of this.configSources.entries()) {
			const collectionId = `mcp.config.${src.key}`;
			let value = configurationKey[src.key];

			// If we see there are MCP servers, migrate them automatically
			if (value?.mcpServers) {
				value = { ...value, servers: { ...value.servers, ...value.mcpServers }, mcpServers: undefined };
				this._configurationService.updateValue(mcpConfigurationSection, value, {}, src.target, { donotNotifyError: true });
			}

			const configMapping = configMappings[index];
			const nextDefinitions = Object.entries(value?.servers || {}).map(([name, value]): McpServerDefinition => ({
				id: `${collectionId}.${name}`,
				label: name,
				launch: 'type' in value && value.type === 'sse' ? {
					type: McpServerTransportType.SSE,
					uri: URI.parse(value.url),
					headers: Object.entries(value.headers || {}),
				} : {
					type: McpServerTransportType.Stdio,
					args: value.args || [],
					command: value.command,
					env: value.env || {},
					cwd: undefined,
				},
				variableReplacement: {
					section: mcpConfigurationSection,
					target: src.target,
				},
				presentation: {
					order: src.order,
					origin: configMapping?.get(name),
				}
			}));

			if (arrayEquals(nextDefinitions, src.serverDefinitions.get(), McpServerDefinition.equals)) {
				continue;
			}

			if (!nextDefinitions.length) {
				src.disposable.clear();
				src.serverDefinitions.set(nextDefinitions, undefined);
			} else {
				src.serverDefinitions.set(nextDefinitions, undefined);
				src.disposable.value ??= this._mcpRegistry.registerCollection({
					id: collectionId,
					label: src.label,
					presentation: { order: src.order, origin: src.uri() },
					remoteAuthority: src.remoteAuthority || null,
					serverDefinitions: src.serverDefinitions,
					isTrustedByDefault: true,
					scope: src.scope,
				});
			}
		}
	}
}
