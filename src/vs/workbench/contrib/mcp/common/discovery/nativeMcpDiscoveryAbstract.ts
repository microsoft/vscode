/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, IObservable, IReader, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { INativeMcpDiscoveryData } from '../../../../../platform/mcp/common/nativeMcpDiscoveryHelper.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { Dto } from '../../../../services/extensions/common/proxyIdentifier.js';
import { DiscoverySource, discoverySourceLabel, mcpDiscoverySection } from '../mcpConfiguration.js';
import { IMcpRegistry } from '../mcpRegistryTypes.js';
import { McpCollectionDefinition, McpCollectionSortOrder, McpDiscoveryFormat, McpDiscoveryScope, McpDiscoverySource, McpServerDefinition, McpServerTrust } from '../mcpTypes.js';
import { IMcpDiscovery, IMcpDiscoveryTelemetrySnapshot } from './mcpDiscovery.js';
import { emptyMcpDiscoveryTelemetrySnapshot, mcpCandidate, mcpHost } from './mcpDiscoveryTelemetry.js';
import { ClaudeDesktopMpcDiscoveryAdapter, CursorDesktopMpcDiscoveryAdapter, NativeMpcDiscoveryAdapter, WindsurfDesktopMpcDiscoveryAdapter } from './nativeMcpDiscoveryAdapters.js';

export type WritableMcpCollectionDefinition = McpCollectionDefinition & { serverDefinitions: ISettableObservable<readonly McpServerDefinition[]> };

export abstract class FilesystemMcpDiscovery extends Disposable implements IMcpDiscovery {

	readonly fromGallery: boolean = false;
	private readonly _fileTelemetry = new Map<string, IMcpDiscoveryTelemetrySnapshot | undefined>();
	private _telemetryRegistrationComplete = false;
	private readonly _telemetrySnapshot = observableValue<IMcpDiscoveryTelemetrySnapshot | undefined>(this, undefined);
	readonly telemetrySnapshot = this._telemetrySnapshot;

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
		const telemetryKey = `${discoverySource}:${file.toString()}`;
		this._fileTelemetry.set(telemetryKey, undefined);
		store.add(toDisposable(() => {
			this._fileTelemetry.delete(telemetryKey);
			this._publishTelemetry();
		}));
		let updateGeneration = 0;
		let readGeneration = 0;
		const updateFile = async (generation: number) => {
			const currentReadGeneration = ++readGeneration;
			const isCurrent = () => generation === updateGeneration && currentReadGeneration === readGeneration && !store.isDisposed;
			let definitions: McpServerDefinition[] = [];
			let configurationPresent = 0;
			let parseErrorCount = 0;
			let unreadableCount = 0;
			try {
				const contents = await this._fileService.readFile(file);
				if (!isCurrent()) {
					return;
				}
				configurationPresent = 1;
				try {
					const adapted = await adaptFile(contents.value);
					if (!isCurrent()) {
						return;
					}
					if (adapted) {
						definitions = adapted;
					} else {
						parseErrorCount = 1;
					}
				} catch {
					parseErrorCount = 1;
				}
			} catch (error) {
				if (!isCurrent()) {
					return;
				}
				if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
					configurationPresent = 1;
					unreadableCount = 1;
				}
			}
			if (!isCurrent()) {
				return;
			}
			const metadata = getFilesystemDiscoveryMetadata(discoverySource, collection);
			this._fileTelemetry.set(telemetryKey, {
				candidates: definitions.map(() => mcpCandidate(metadata.source, metadata.format, metadata.scope, metadata.host, 'loaded')).concat(
					parseErrorCount ? [mcpCandidate(metadata.source, metadata.format, metadata.scope, metadata.host, 'parseError')] : [],
					unreadableCount ? [mcpCandidate(metadata.source, metadata.format, metadata.scope, metadata.host, 'unreadable')] : [],
				),
				configurations: [{
					...metadata,
					configurationPresent,
					configuredEntryCount: definitions.length,
					parseErrorCount,
					unreadableCount,
				}],
			});
			this._publishTelemetry();
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
			const generation = ++updateGeneration;
			reader.store.add(toDisposable(() => {
				if (updateGeneration === generation) {
					updateGeneration++;
				}
			}));
			if (!this._isDiscoveryEnabled(reader, discoverySource)) {
				collectionRegistration.clear();
				this._fileTelemetry.set(telemetryKey, emptyMcpDiscoveryTelemetrySnapshot);
				this._publishTelemetry();
				return;
			}

			const throttler = reader.store.add(new RunOnceScheduler(() => updateFile(generation), 500));
			const watcher = reader.store.add(this._fileService.createWatcher(file, { recursive: false, excludes: [] }));
			reader.store.add(watcher.onDidChange(() => throttler.schedule()));
			updateFile(generation);
		}));

		return store;
	}

	protected completeTelemetryRegistration(): void {
		this._telemetryRegistrationComplete = true;
		this._publishTelemetry();
	}

	private _publishTelemetry(): void {
		if (!this._telemetryRegistrationComplete) {
			return;
		}
		const snapshots = [...this._fileTelemetry.values()];
		if (snapshots.some(snapshot => snapshot === undefined)) {
			return;
		}
		this._telemetrySnapshot.set({
			candidates: snapshots.flatMap(snapshot => snapshot?.candidates ?? []),
			configurations: snapshots.flatMap(snapshot => snapshot?.configurations ?? []),
		}, undefined);
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
			this.completeTelemetryRegistration();
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
				order: adapter.order + (adapter.remoteAuthority ? McpCollectionSortOrder.RemoteBoost : 0),
				discovery: {
					...getFilesystemDiscoveryMetadata(adapter.discoverySource, {
						remoteAuthority: adapter.remoteAuthority,
						configTarget: ConfigurationTarget.USER,
					}),
				},
				presentation: {
					origin: file,
				},
			};

			this._register(this.watchFile(file, collection, adapter.discoverySource, contents => adapter.adaptFile(contents, details)));
		}
		this.completeTelemetryRegistration();
	}
}

function getFilesystemDiscoveryMetadata(
	discoverySource: DiscoverySource,
	collection: Pick<McpCollectionDefinition, 'remoteAuthority' | 'configTarget'>,
): { source: McpDiscoverySource; format: McpDiscoveryFormat; scope: McpDiscoveryScope; host: ReturnType<typeof mcpHost> } {
	const source = discoverySource === DiscoverySource.ClaudeDesktop
		? McpDiscoverySource.ClaudeDesktop
		: discoverySource === DiscoverySource.CursorGlobal
			? McpDiscoverySource.CursorGlobal
			: discoverySource === DiscoverySource.CursorWorkspace
				? McpDiscoverySource.CursorWorkspace
				: McpDiscoverySource.Windsurf;
	const scope = collection.configTarget === ConfigurationTarget.WORKSPACE_FOLDER
		? McpDiscoveryScope.WorkspaceFolder
		: collection.configTarget === ConfigurationTarget.WORKSPACE
			? McpDiscoveryScope.Workspace
			: McpDiscoveryScope.Profile;
	return {
		source,
		format: McpDiscoveryFormat.ClaudeMcpServers,
		scope,
		host: mcpHost(collection.remoteAuthority),
	};
}
