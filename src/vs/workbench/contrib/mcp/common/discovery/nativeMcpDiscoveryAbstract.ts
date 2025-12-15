/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, IObservable, IReader, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { INativeMcpDiscoveryData } from '../../../../../platform/mcp/common/nativeMcpDiscoveryHelper.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { Dto } from '../../../../services/extensions/common/proxyIdentifier.js';
import { DiscoverySource, discoverySourceLabel, mcpDiscoverySection } from '../mcpConfiguration.js';
import { IMcpRegistry } from '../mcpRegistryTypes.js';
import { McpCollectionDefinition, McpCollectionSortOrder, McpServerDefinition, McpServerTrust } from '../mcpTypes.js';
import { IMcpDiscovery } from './mcpDiscovery.js';
import { ClaudeDesktopMpcDiscoveryAdapter, CursorDesktopMpcDiscoveryAdapter, NativeMpcDiscoveryAdapter, WindsurfDesktopMpcDiscoveryAdapter } from './nativeMcpDiscoveryAdapters.js';

export type WritableMcpCollectionDefinition = McpCollectionDefinition & { serverDefinitions: ISettableObservable<readonly McpServerDefinition[]> };

export abstract class FilesystemMcpDiscovery extends Disposable implements IMcpDiscovery {

	readonly fromGallery: boolean = false;

	protected readonly _fsDiscoveryEnabled: IObservable<{ [K in DiscoverySource]: boolean } | undefined>;

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
	) {
		super();

		this._fsDiscoveryEnabled = observableConfigValue(mcpDiscoverySection, undefined, configurationService);
	}

	protected _isDiscoveryEnabled(reader: IReader, discoverySource: DiscoverySource): boolean {
		const fsDiscovery = this._fsDiscoveryEnabled.read(reader);
		if (typeof fsDiscovery === 'boolean') {
			return fsDiscovery; // old commands
		}
		if (discoverySource && fsDiscovery?.[discoverySource] === true) {
			return true;
		}
		return false;
	}

	protected watchFile(
		file: URI,
		collection: WritableMcpCollectionDefinition,
		discoverySource: DiscoverySource,
		adaptFile: (contents: VSBuffer) => Promise<McpServerDefinition[] | undefined>,
	): IDisposable {
		const store = new DisposableStore();
		const collectionRegistration = store.add(new MutableDisposable());
		const updateFile = async () => {
			let definitions: McpServerDefinition[] = [];
			try {
				const contents = await this._fileService.readFile(file);
				definitions = await adaptFile(contents.value) || [];
			} catch {
				// ignored
			}
			if (!definitions.length) {
				collectionRegistration.clear();
			} else {
				collection.serverDefinitions.set(definitions, undefined);
				if (!collectionRegistration.value) {
					collectionRegistration.value = this._mcpRegistry.registerCollection(collection);
				}
			}
		};

		store.add(autorun(reader => {
			if (!this._isDiscoveryEnabled(reader, discoverySource)) {
				collectionRegistration.clear();
				return;
			}

			const throttler = reader.store.add(new RunOnceScheduler(updateFile, 500));
			const watcher = reader.store.add(this._fileService.createWatcher(file, { recursive: false, excludes: [] }));
			reader.store.add(watcher.onDidChange(() => throttler.schedule()));
			updateFile();
		}));

		return store;
	}

	public abstract start(): void;
}

/**
 * Base class that discovers MCP servers on a filesystem, outside of the ones
 * defined in VS Code settings.
 */
export abstract class NativeFilesystemMcpDiscovery extends FilesystemMcpDiscovery implements IMcpDiscovery {
	private readonly adapters: readonly NativeMpcDiscoveryAdapter[];
	private suffix = '';

	constructor(
		remoteAuthority: string | null,
		@ILabelService labelService: ILabelService,
		@IFileService fileService: IFileService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMcpRegistry mcpRegistry: IMcpRegistry,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(configurationService, fileService, mcpRegistry);
		if (remoteAuthority) {
			this.suffix = ' ' + localize('onRemoteLabel', ' on {0}', labelService.getHostLabel(Schemas.vscodeRemote, remoteAuthority));
		}

		this.adapters = [
			instantiationService.createInstance(ClaudeDesktopMpcDiscoveryAdapter, remoteAuthority),
			instantiationService.createInstance(CursorDesktopMpcDiscoveryAdapter, remoteAuthority),
			instantiationService.createInstance(WindsurfDesktopMpcDiscoveryAdapter, remoteAuthority),
		];
	}

	protected setDetails(detailsDto: Dto<INativeMcpDiscoveryData> | undefined) {
		if (!detailsDto) {
			return;
		}

		const details: INativeMcpDiscoveryData = {
			...detailsDto,
			homedir: URI.revive(detailsDto.homedir),
			xdgHome: detailsDto.xdgHome ? URI.revive(detailsDto.xdgHome) : undefined,
			winAppData: detailsDto.winAppData ? URI.revive(detailsDto.winAppData) : undefined,
		};

		for (const adapter of this.adapters) {
			const file = adapter.getFilePath(details);
			if (!file) {
				continue;
			}

			const collection: WritableMcpCollectionDefinition = {
				id: adapter.id,
				label: discoverySourceLabel[adapter.discoverySource] + this.suffix,
				remoteAuthority: adapter.remoteAuthority,
				configTarget: ConfigurationTarget.USER,
				scope: StorageScope.PROFILE,
				trustBehavior: McpServerTrust.Kind.TrustedOnNonce,
				serverDefinitions: observableValue<readonly McpServerDefinition[]>(this, []),
				presentation: {
					origin: file,
					order: adapter.order + (adapter.remoteAuthority ? McpCollectionSortOrder.RemoteBoost : 0),
				},
			};

			this._register(this.watchFile(file, collection, adapter.discoverySource, contents => adapter.adaptFile(contents, details)));
		}
	}
}
