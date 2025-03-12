/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorunWithStore, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { INativeMcpDiscoveryData } from '../../../../../platform/mcp/common/nativeMcpDiscoveryHelper.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { Dto } from '../../../../services/extensions/common/proxyIdentifier.js';
import { mcpDiscoverySection } from '../mcpConfiguration.js';
import { IMcpRegistry } from '../mcpRegistryTypes.js';
import { McpCollectionDefinition, McpCollectionSortOrder, McpServerDefinition } from '../mcpTypes.js';
import { IMcpDiscovery } from './mcpDiscovery.js';
import { ClaudeDesktopMpcDiscoveryAdapter, NativeMpcDiscoveryAdapter } from './nativeMcpDiscoveryAdapters.js';

/**
 * Base class that discovers MCP servers on a filesystem, outside of the ones
 * defined in VS Code settings.
 */
export abstract class FilesystemMpcDiscovery extends Disposable implements IMcpDiscovery {
	private readonly adapters: readonly NativeMpcDiscoveryAdapter[];
	private _fsDiscoveryEnabled: IObservable<boolean>;
	private suffix = '';

	constructor(
		remoteAuthority: string | null,
		@ILabelService labelService: ILabelService,
		@IFileService private readonly fileService: IFileService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMcpRegistry private readonly mcpRegistry: IMcpRegistry,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		if (remoteAuthority) {
			this.suffix = ' ' + localize('onRemoteLabel', ' on {0}', labelService.getHostLabel(Schemas.vscodeRemote, remoteAuthority));
		}

		this._fsDiscoveryEnabled = observableConfigValue(mcpDiscoverySection, false, configurationService);

		this.adapters = [
			instantiationService.createInstance(ClaudeDesktopMpcDiscoveryAdapter, remoteAuthority)
		];
	}

	public abstract start(): void;

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

			const collection = {
				id: adapter.id,
				label: adapter.label + this.suffix,
				remoteAuthority: adapter.remoteAuthority,
				scope: StorageScope.PROFILE,
				isTrustedByDefault: false,
				serverDefinitions: observableValue<readonly McpServerDefinition[]>(this, []),
				presentation: {
					origin: file,
					order: adapter.order + (adapter.remoteAuthority ? McpCollectionSortOrder.RemotePenalty : 0),
				},
			} satisfies McpCollectionDefinition;

			const collectionRegistration = this._register(new MutableDisposable());
			const updateFile = async () => {
				let definitions: McpServerDefinition[] = [];
				try {
					const contents = await this.fileService.readFile(file);
					definitions = adapter.adaptFile(contents.value, details) || [];
				} catch {
					// ignored
				}
				if (!definitions.length) {
					collectionRegistration.clear();
				} else {
					collection.serverDefinitions.set(definitions, undefined);
					if (!collectionRegistration.value) {
						collectionRegistration.value = this.mcpRegistry.registerCollection(collection);
					}
				}
			};

			this._register(autorunWithStore((reader, store) => {
				if (!this._fsDiscoveryEnabled.read(reader)) {
					collectionRegistration.clear();
					return;
				}

				const throttler = store.add(new RunOnceScheduler(updateFile, 500));
				const watcher = store.add(this.fileService.createWatcher(file, { recursive: false, excludes: [] }));
				store.add(watcher.onDidChange(() => throttler.schedule()));
				updateFile();
			}));
		}
	}
}
