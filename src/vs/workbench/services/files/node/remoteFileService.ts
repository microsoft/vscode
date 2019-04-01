/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import * as resources from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IDecodeStreamOptions, toDecodeStream, encodeStream } from 'vs/base/node/encoding';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { FileOperation, FileOperationError, FileOperationEvent, FileOperationResult, FileWriteOptions, FileSystemProviderCapabilities, IContent, ICreateFileOptions, IFileSystemProvider, IFilesConfiguration, IResolveContentOptions, IStreamContent, ITextSnapshot, IUpdateContentOptions, StringSnapshot, IWatchOptions, ILegacyFileService, IFileService, toFileOperationResult, IFileStatWithMetadata } from 'vs/platform/files/common/files';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { FileService } from 'vs/workbench/services/files/node/fileService';
import { createReadableOfProvider, createReadableOfSnapshot, createWritableOfProvider } from 'vs/workbench/services/files/node/streams';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

class WorkspaceWatchLogic extends Disposable {

	private _watches = new Map<string, URI>();

	constructor(
		private _fileService: RemoteFileService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
	) {
		super();

		this._refresh();

		this._register(this._contextService.onDidChangeWorkspaceFolders(e => {
			for (const removed of e.removed) {
				this._unwatchWorkspace(removed.uri);
			}
			for (const added of e.added) {
				this._watchWorkspace(added.uri);
			}
		}));
		this._register(this._contextService.onDidChangeWorkbenchState(e => {
			this._refresh();
		}));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('files.watcherExclude')) {
				this._refresh();
			}
		}));
	}

	dispose(): void {
		this._unwatchWorkspaces();
		super.dispose();
	}

	private _refresh(): void {
		this._unwatchWorkspaces();
		for (const folder of this._contextService.getWorkspace().folders) {
			if (folder.uri.scheme !== Schemas.file) {
				this._watchWorkspace(folder.uri);
			}
		}
	}

	private _watchWorkspace(resource: URI) {
		let excludes: string[] = [];
		let config = this._configurationService.getValue<IFilesConfiguration>({ resource });
		if (config.files && config.files.watcherExclude) {
			for (const key in config.files.watcherExclude) {
				if (config.files.watcherExclude[key] === true) {
					excludes.push(key);
				}
			}
		}
		this._watches.set(resource.toString(), resource);
		this._fileService.watch(resource, { recursive: true, excludes });
	}

	private _unwatchWorkspace(resource: URI) {
		if (this._watches.has(resource.toString())) {
			this._fileService.unwatch(resource);
			this._watches.delete(resource.toString());
		}
	}

	private _unwatchWorkspaces() {
		this._watches.forEach(uri => this._fileService.unwatch(uri));
		this._watches.clear();
	}
}

export class RemoteFileService extends FileService {

	private readonly _provider: Map<string, IFileSystemProvider>;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IStorageService storageService: IStorageService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@INotificationService notificationService: INotificationService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
	) {
		super(
			contextService,
			environmentService,
			textResourceConfigurationService,
			configurationService,
			lifecycleService,
			storageService,
			notificationService
		);

		this._provider = new Map<string, IFileSystemProvider>();
		this._register(new WorkspaceWatchLogic(this, configurationService, contextService));
	}

	registerProvider(scheme: string, provider: IFileSystemProvider): IDisposable {
		if (this._provider.has(scheme)) {
			throw new Error('a provider for that scheme is already registered');
		}

		this._provider.set(scheme, provider);

		return {
			dispose: () => {
				this._provider.delete(scheme);
			}
		};
	}

	// --- stat

	private _withProvider(resource: URI): Promise<IFileSystemProvider> {
		if (!resources.isAbsolutePath(resource)) {
			throw new FileOperationError(
				localize('invalidPath', "The path of resource '{0}' must be absolute", resource.toString(true)),
				FileOperationResult.FILE_INVALID_PATH
			);
		}

		return Promise.all([
			this._fileService.activateProvider(resource.scheme)
		]).then(() => {
			const provider = this._provider.get(resource.scheme);
			if (!provider) {
				const err = new Error();
				err.name = 'ENOPRO';
				err.message = `no provider for ${resource.toString()}`;
				throw err;
			}
			return provider;
		});
	}

	// --- resolve

	resolveContent(resource: URI, options?: IResolveContentOptions): Promise<IContent> {
		if (resource.scheme === Schemas.file) {
			return super.resolveContent(resource, options);
		} else {
			return this._readFile(resource, options).then(RemoteFileService._asContent);
		}
	}

	resolveStreamContent(resource: URI, options?: IResolveContentOptions): Promise<IStreamContent> {
		if (resource.scheme === Schemas.file) {
			return super.resolveStreamContent(resource, options);
		} else {
			return this._readFile(resource, options);
		}
	}

	private _readFile(resource: URI, options: IResolveContentOptions = Object.create(null)): Promise<IStreamContent> {
		return this._withProvider(resource).then(provider => {

			return this._fileService.resolve(resource).then(fileStat => {

				if (fileStat.isDirectory) {
					// todo@joh cannot copy a folder
					// https://github.com/Microsoft/vscode/issues/41547
					throw new FileOperationError(
						localize('fileIsDirectoryError', "File is directory"),
						FileOperationResult.FILE_IS_DIRECTORY,
						options
					);
				}
				if (typeof options.etag === 'string' && fileStat.etag === options.etag) {
					throw new FileOperationError(
						localize('fileNotModifiedError', "File not modified since"),
						FileOperationResult.FILE_NOT_MODIFIED_SINCE,
						options
					);
				}

				const decodeStreamOpts: IDecodeStreamOptions = {
					guessEncoding: options.autoGuessEncoding,
					overwriteEncoding: detected => {
						return this.encoding.getReadEncoding(resource, options, { encoding: detected, seemsBinary: false });
					}
				};

				const readable = createReadableOfProvider(provider, resource, options.position || 0);

				return toDecodeStream(readable, decodeStreamOpts).then(data => {

					if (options.acceptTextOnly && data.detected.seemsBinary) {
						return Promise.reject<any>(new FileOperationError(
							localize('fileBinaryError', "File seems to be binary and cannot be opened as text"),
							FileOperationResult.FILE_IS_BINARY,
							options
						));
					}

					return <IStreamContent>{
						encoding: data.detected.encoding,
						value: data.stream,
						resource: fileStat.resource,
						name: fileStat.name,
						etag: fileStat.etag,
						mtime: fileStat.mtime,
						isReadonly: fileStat.isReadonly,
						size: fileStat.size
					};
				});
			});
		});
	}

	// --- saving

	private static _throwIfFileSystemIsReadonly(provider: IFileSystemProvider): IFileSystemProvider {
		if (provider.capabilities & FileSystemProviderCapabilities.Readonly) {
			throw new FileOperationError(localize('err.readonly', "Resource can not be modified."), FileOperationResult.FILE_PERMISSION_DENIED);
		}
		return provider;
	}

	createFile(resource: URI, content?: string, options?: ICreateFileOptions): Promise<IFileStatWithMetadata> {
		if (resource.scheme === Schemas.file) {
			return super.createFile(resource, content, options);
		} else {

			return this._withProvider(resource).then(RemoteFileService._throwIfFileSystemIsReadonly).then(provider => {

				return this._fileService.createFolder(resources.dirname(resource)).then(() => {
					const { encoding } = this.encoding.getWriteEncoding(resource);
					return this._writeFile(provider, resource, new StringSnapshot(content || ''), encoding, { create: true, overwrite: Boolean(options && options.overwrite) });
				});

			}).then(fileStat => {
				this._onAfterOperation.fire(new FileOperationEvent(resource, FileOperation.CREATE, fileStat));
				return fileStat;
			}, err => {
				const message = localize('err.create', "Failed to create file {0}", resource.toString(false));
				const result = toFileOperationResult(err);
				throw new FileOperationError(message, result, options);
			});
		}
	}

	updateContent(resource: URI, value: string | ITextSnapshot, options?: IUpdateContentOptions): Promise<IFileStatWithMetadata> {
		if (resource.scheme === Schemas.file) {
			return super.updateContent(resource, value, options);
		} else {
			return this._withProvider(resource).then(RemoteFileService._throwIfFileSystemIsReadonly).then(provider => {
				return this._fileService.createFolder(resources.dirname(resource)).then(() => {
					const snapshot = typeof value === 'string' ? new StringSnapshot(value) : value;
					return this._writeFile(provider, resource, snapshot, options && options.encoding, { create: true, overwrite: true });
				});
			});
		}
	}

	private _writeFile(provider: IFileSystemProvider, resource: URI, snapshot: ITextSnapshot, preferredEncoding: string | undefined = undefined, options: FileWriteOptions): Promise<IFileStatWithMetadata> {
		const readable = createReadableOfSnapshot(snapshot);
		const { encoding, hasBOM } = this.encoding.getWriteEncoding(resource, preferredEncoding);
		const encoder = encodeStream(encoding, { addBOM: hasBOM });
		const target = createWritableOfProvider(provider, resource, options);
		return new Promise((resolve, reject) => {
			readable.pipe(encoder).pipe(target);
			target.once('error', err => reject(err));
			target.once('finish', (_: unknown) => resolve(undefined));
		}).then(_ => {
			return this._fileService.resolve(resource, { resolveMetadata: true }) as Promise<IFileStatWithMetadata>;
		});
	}

	private static _asContent(content: IStreamContent): Promise<IContent> {
		return new Promise<IContent>((resolve, reject) => {
			let result: IContent = {
				value: '',
				encoding: content.encoding,
				etag: content.etag,
				size: content.size,
				mtime: content.mtime,
				name: content.name,
				resource: content.resource,
				isReadonly: content.isReadonly
			};
			content.value.on('data', chunk => result.value += chunk);
			content.value.on('error', reject);
			content.value.on('end', () => resolve(result));
		});
	}

	private _activeWatches = new Map<string, { unwatch: Promise<IDisposable>, count: number }>();

	watch(resource: URI, opts: IWatchOptions = { recursive: false, excludes: [] }): void {
		if (resource.scheme === Schemas.file) {
			return super.watch(resource);
		}

		const key = resource.toString();
		const entry = this._activeWatches.get(key);
		if (entry) {
			entry.count += 1;
			return;
		}

		this._activeWatches.set(key, {
			count: 1,
			unwatch: this._withProvider(resource).then(provider => {
				return provider.watch(resource, opts);
			}, _err => {
				return { dispose() { } };
			})
		});
	}

	unwatch(resource: URI): void {
		if (resource.scheme === Schemas.file) {
			return super.unwatch(resource);
		}
		let entry = this._activeWatches.get(resource.toString());
		if (entry && --entry.count === 0) {
			entry.unwatch.then(dispose);
			this._activeWatches.delete(resource.toString());
		}
	}
}

registerSingleton(ILegacyFileService, RemoteFileService);