/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { IFileService, IResolveFileOptions, IResourceEncodings, FileChangesEvent, FileOperationEvent, IFileSystemProviderRegistrationEvent, IFileSystemProvider, IFileStat, IResolveFileResult, IResolveContentOptions, IContent, IStreamContent, ITextSnapshot, IUpdateContentOptions, ICreateFileOptions, IFileSystemProviderActivationEvent, FileOperationError, FileOperationResult, FileOperation, FileSystemProviderCapabilities, FileType, toFileSystemProviderErrorCode, FileSystemProviderErrorCode, IStat, IFileStatWithMetadata, IResolveMetadataFileOptions, etag } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { isAbsolutePath, dirname, basename, joinPath, isEqual, isEqualOrParent } from 'vs/base/common/resources';
import { localize } from 'vs/nls';
import { TernarySearchTree } from 'vs/base/common/map';
import { isNonEmptyArray, coalesce } from 'vs/base/common/arrays';
import { getBaseLabel } from 'vs/base/common/labels';
import { ILogService } from 'vs/platform/log/common/log';

export class FileService2 extends Disposable implements IFileService {

	//#region TODO@Ben HACKS

	private _legacy: IFileService | null;

	setLegacyService(legacy: IFileService): void {
		this._legacy = this._register(legacy);

		this._register(legacy.onFileChanges(e => this._onFileChanges.fire(e)));
		this._register(legacy.onAfterOperation(e => this._onAfterOperation.fire(e)));

		this.provider.forEach((provider, scheme) => {
			legacy.registerProvider(scheme, provider);
		});

		this.joinOnImplResolve(legacy);
	}

	//#endregion

	_serviceBrand: ServiceIdentifier<any>;

	private joinOnLegacy: Promise<IFileService>;
	private joinOnImplResolve: (service: IFileService) => void;

	constructor(@ILogService private logService: ILogService) {
		super();

		this.joinOnLegacy = new Promise(resolve => {
			this.joinOnImplResolve = resolve;
		});
	}

	//#region File System Provider

	private _onDidChangeFileSystemProviderRegistrations: Emitter<IFileSystemProviderRegistrationEvent> = this._register(new Emitter<IFileSystemProviderRegistrationEvent>());
	get onDidChangeFileSystemProviderRegistrations(): Event<IFileSystemProviderRegistrationEvent> { return this._onDidChangeFileSystemProviderRegistrations.event; }

	private _onWillActivateFileSystemProvider: Emitter<IFileSystemProviderActivationEvent> = this._register(new Emitter<IFileSystemProviderActivationEvent>());
	get onWillActivateFileSystemProvider(): Event<IFileSystemProviderActivationEvent> { return this._onWillActivateFileSystemProvider.event; }

	private readonly provider = new Map<string, IFileSystemProvider>();

	registerProvider(scheme: string, provider: IFileSystemProvider): IDisposable {
		if (this.provider.has(scheme)) {
			throw new Error(`A provider for the scheme ${scheme} is already registered.`);
		}

		let legacyDisposal: IDisposable;
		if (this._legacy) {
			legacyDisposal = this._legacy.registerProvider(scheme, provider);
		} else {
			legacyDisposal = Disposable.None;
		}

		// Add provider with event
		this.provider.set(scheme, provider);
		this._onDidChangeFileSystemProviderRegistrations.fire({ added: true, scheme, provider });

		// Forward change events from provider
		const providerFileListener = provider.onDidChangeFile(changes => this._onFileChanges.fire(new FileChangesEvent(changes)));

		return combinedDisposable([
			toDisposable(() => {
				this._onDidChangeFileSystemProviderRegistrations.fire({ added: false, scheme, provider });
				this.provider.delete(scheme);

				providerFileListener.dispose();
			}),
			legacyDisposal
		]);
	}

	async activateProvider(scheme: string): Promise<void> {

		// Emit an event that we are about to activate a provider with the given scheme.
		// Listeners can participate in the activation by registering a provider for it.
		const joiners: Promise<void>[] = [];
		this._onWillActivateFileSystemProvider.fire({
			scheme,
			join(promise) {
				if (promise) {
					joiners.push(promise);
				}
			},
		});

		if (this.provider.has(scheme)) {
			return Promise.resolve(); // provider is already here so we can return directly
		}

		// If the provider is not yet there, make sure to join on the listeners assuming
		// that it takes a bit longer to register the file system provider.
		await Promise.all(joiners);
	}

	canHandleResource(resource: URI): boolean {
		return this.provider.has(resource.scheme);
	}

	private async withProvider(resource: URI): Promise<IFileSystemProvider> {

		// Assert path is absolute
		if (!isAbsolutePath(resource)) {
			throw new FileOperationError(localize('invalidPath', "The path of resource '{0}' must be absolute", resource.toString(true)), FileOperationResult.FILE_INVALID_PATH);
		}

		// Activate provider
		await this.activateProvider(resource.scheme);

		// Assert provider
		const provider = this.provider.get(resource.scheme);
		if (!provider) {
			const err = new Error();
			err.name = 'ENOPRO';
			err.message = `no provider for ${resource.toString()}`;

			return Promise.reject(err);
		}

		return provider;
	}

	//#endregion

	private _onAfterOperation: Emitter<FileOperationEvent> = this._register(new Emitter<FileOperationEvent>());
	get onAfterOperation(): Event<FileOperationEvent> { return this._onAfterOperation.event; }

	//#region File Metadata Resolving

	async resolveFile(resource: URI, options: IResolveMetadataFileOptions): Promise<IFileStatWithMetadata>;
	async resolveFile(resource: URI, options?: IResolveFileOptions): Promise<IFileStat>;
	async resolveFile(resource: URI, options?: IResolveFileOptions): Promise<IFileStat> {
		try {
			return await this.doResolveFile(resource, options);
		} catch (error) {

			// Specially handle file not found case as file operation result
			if (toFileSystemProviderErrorCode(error) === FileSystemProviderErrorCode.FileNotFound) {
				throw new FileOperationError(
					localize('fileNotFoundError', "File not found ({0})", resource.toString(true)),
					FileOperationResult.FILE_NOT_FOUND
				);
			}

			// Bubble up any other error as is
			throw error;
		}
	}

	private async doResolveFile(resource: URI, options: IResolveMetadataFileOptions): Promise<IFileStatWithMetadata>;
	private async doResolveFile(resource: URI, options?: IResolveFileOptions): Promise<IFileStat>;
	private async doResolveFile(resource: URI, options?: IResolveFileOptions): Promise<IFileStat> {
		const provider = await this.withProvider(resource);

		// leverage a trie to check for recursive resolving
		const resolveTo = options && options.resolveTo;
		const trie = TernarySearchTree.forPaths<true>();
		trie.set(resource.toString(), true);
		if (isNonEmptyArray(resolveTo)) {
			resolveTo.forEach(uri => trie.set(uri.toString(), true));
		}

		const resolveSingleChildDescendants = !!(options && options.resolveSingleChildDescendants);
		const resolveMetadata = !!(options && options.resolveMetadata);

		const stat = await provider.stat(resource);

		return await this.toFileStat(provider, resource, stat, undefined, resolveMetadata, (stat, siblings) => {

			// check for recursive resolving
			if (Boolean(trie.findSuperstr(stat.resource.toString()) || trie.get(stat.resource.toString()))) {
				return true;
			}

			// check for resolving single child folders
			if (stat.isDirectory && resolveSingleChildDescendants) {
				return siblings === 1;
			}

			return false;
		});
	}

	private async toFileStat(provider: IFileSystemProvider, resource: URI, stat: IStat, siblings: number | undefined, resolveMetadata: boolean, recurse: (stat: IFileStat, siblings?: number) => boolean): Promise<IFileStat> {

		// convert to file stat
		const fileStat: IFileStat = {
			resource,
			name: getBaseLabel(resource),
			isDirectory: (stat.type & FileType.Directory) !== 0,
			isSymbolicLink: (stat.type & FileType.SymbolicLink) !== 0,
			isReadonly: !!(provider.capabilities & FileSystemProviderCapabilities.Readonly),
			mtime: stat.mtime,
			size: stat.size,
			etag: etag(stat.mtime, stat.size)
		};

		// check to recurse for directories
		if (fileStat.isDirectory && recurse(fileStat, siblings)) {
			try {
				const entries = await provider.readdir(resource);
				const resolvedEntries = await Promise.all(entries.map(async ([name, type]) => {
					try {
						const childResource = joinPath(resource, name);
						const childStat = resolveMetadata ? await provider.stat(childResource) : { type };

						return this.toFileStat(provider, childResource, childStat, entries.length, resolveMetadata, recurse);
					} catch (error) {
						this.logService.trace(error);

						return null; // can happen e.g. due to permission errors
					}
				}));

				// make sure to get rid of null values that signal a failure to resolve a particular entry
				fileStat.children = coalesce(resolvedEntries);
			} catch (error) {
				this.logService.trace(error);

				fileStat.children = []; // gracefully handle errors, we may not have permissions to read
			}

			return fileStat;
		}

		return Promise.resolve(fileStat);
	}

	async resolveFiles(toResolve: { resource: URI, options?: IResolveFileOptions }[]): Promise<IResolveFileResult[]>;
	async resolveFiles(toResolve: { resource: URI, options: IResolveMetadataFileOptions }[]): Promise<IResolveFileResult[]>;
	async resolveFiles(toResolve: { resource: URI; options?: IResolveFileOptions; }[]): Promise<IResolveFileResult[]> {

		// soft-groupBy, keep order, don't rearrange/merge groups
		const groups: Array<typeof toResolve> = [];
		let group: typeof toResolve | undefined;
		for (const request of toResolve) {
			if (!group || group[0].resource.scheme !== request.resource.scheme) {
				group = [];
				groups.push(group);
			}

			group.push(request);
		}

		// resolve files (in parallel)
		const result: Promise<IResolveFileResult>[] = [];
		for (const group of groups) {
			for (const groupEntry of group) {
				result.push((async () => {
					try {
						return { stat: await this.doResolveFile(groupEntry.resource, groupEntry.options), success: true };
					} catch (error) {
						this.logService.trace(error);

						return { stat: undefined, success: false };
					}
				})());
			}
		}

		return Promise.all(result);
	}

	async existsFile(resource: URI): Promise<boolean> {
		try {
			await this.resolveFile(resource);

			return true;
		} catch (error) {
			return false;
		}
	}

	//#endregion

	//#region File Reading/Writing

	get encoding(): IResourceEncodings {
		if (!this._legacy) {
			throw new Error('Legacy file service not ready yet');
		}

		return this._legacy.encoding;
	}

	createFile(resource: URI, content?: string, options?: ICreateFileOptions): Promise<IFileStatWithMetadata> {
		return this.joinOnLegacy.then(legacy => legacy.createFile(resource, content, options));
	}

	resolveContent(resource: URI, options?: IResolveContentOptions): Promise<IContent> {
		return this.joinOnLegacy.then(legacy => legacy.resolveContent(resource, options));
	}

	resolveStreamContent(resource: URI, options?: IResolveContentOptions): Promise<IStreamContent> {
		return this.joinOnLegacy.then(legacy => legacy.resolveStreamContent(resource, options));
	}

	updateContent(resource: URI, value: string | ITextSnapshot, options?: IUpdateContentOptions): Promise<IFileStatWithMetadata> {
		return this.joinOnLegacy.then(legacy => legacy.updateContent(resource, value, options));
	}

	//#endregion

	//#region Move/Copy/Delete/Create Folder

	moveFile(source: URI, target: URI, overwrite?: boolean): Promise<IFileStatWithMetadata> {
		if (source.scheme === target.scheme) {
			return this.doMoveCopyWithSameProvider(source, target, false /* just move */, overwrite);
		}

		return this.doMoveWithDifferentProvider(source, target);
	}

	private async doMoveWithDifferentProvider(source: URI, target: URI, overwrite?: boolean): Promise<IFileStatWithMetadata> {

		// copy file source => target
		await this.copyFile(source, target, overwrite);

		// delete source
		await this.del(source, { recursive: true });

		// resolve and send events
		const fileStat = await this.resolveFile(target, { resolveMetadata: true });
		this._onAfterOperation.fire(new FileOperationEvent(source, FileOperation.MOVE, fileStat));

		return fileStat;
	}

	async copyFile(source: URI, target: URI, overwrite?: boolean): Promise<IFileStatWithMetadata> {
		if (source.scheme === target.scheme) {
			return this.doCopyWithSameProvider(source, target, overwrite);
		}

		return this.doCopyWithDifferentProvider(source, target);
	}

	private async doCopyWithSameProvider(source: URI, target: URI, overwrite: boolean = false): Promise<IFileStatWithMetadata> {
		const provider = this.throwIfFileSystemIsReadonly(await this.withProvider(source));

		// check if provider supports fast file/folder copy
		if (provider.capabilities & FileSystemProviderCapabilities.FileFolderCopy && typeof provider.copy === 'function') {
			return this.doMoveCopyWithSameProvider(source, target, true /* keep copy */, overwrite);
		}

		return this.joinOnLegacy.then(legacy => legacy.copyFile(source, target, overwrite));
	}

	private async doCopyWithDifferentProvider(source: URI, target: URI, overwrite?: boolean): Promise<IFileStatWithMetadata> {
		return this.joinOnLegacy.then(legacy => legacy.copyFile(source, target, overwrite));
	}

	private async doMoveCopyWithSameProvider(source: URI, target: URI, keepCopy: boolean, overwrite?: boolean): Promise<IFileStatWithMetadata> {
		const provider = this.throwIfFileSystemIsReadonly(await this.withProvider(source));

		// validation
		const isPathCaseSensitive = !!(provider.capabilities & FileSystemProviderCapabilities.PathCaseSensitive);
		const isCaseChange = isPathCaseSensitive ? false : isEqual(source, target, true /* ignore case */);
		if (!isCaseChange && isEqualOrParent(target, source, !isPathCaseSensitive)) {
			return Promise.reject(new Error(localize('unableToMoveCopyError1', "Unable to move/copy when source path is equal or parent of target path")));
		}

		const exists = await this.existsFile(target);
		if (exists && !isCaseChange) {
			if (!overwrite) {
				throw new FileOperationError(localize('unableToMoveCopyError2', "Unable to move/copy. File already exists at destination."), FileOperationResult.FILE_MOVE_CONFLICT);
			}

			// Special case: if the target is a parent of the source, we cannot delete
			// it as it would delete the source as well. In this case we have to throw
			if (isEqualOrParent(source, target, !isPathCaseSensitive)) {
				return Promise.reject(new Error(localize('unableToMoveCopyError3', "Unable to move/copy. File would replace folder it is contained in.")));
			}

			await this.del(target, { recursive: true });
		}

		// create parent folders
		await this.mkdirp(provider, dirname(target));

		// rename/copy source => target
		if (keepCopy) {
			await provider.copy!(source, target, { overwrite: !!overwrite });
		} else {
			await provider.rename(source, target, { overwrite: !!overwrite });
		}

		// resolve and send events
		const fileStat = await this.resolveFile(target, { resolveMetadata: true });
		this._onAfterOperation.fire(new FileOperationEvent(source, keepCopy ? FileOperation.COPY : FileOperation.MOVE, fileStat));

		return fileStat;
	}

	async createFolder(resource: URI): Promise<IFileStatWithMetadata> {
		const provider = this.throwIfFileSystemIsReadonly(await this.withProvider(resource));

		// mkdir recursively
		await this.mkdirp(provider, resource);

		// events
		const fileStat = await this.resolveFile(resource, { resolveMetadata: true });
		this._onAfterOperation.fire(new FileOperationEvent(resource, FileOperation.CREATE, fileStat));

		return fileStat;
	}

	private async mkdirp(provider: IFileSystemProvider, directory: URI): Promise<void> {
		const directoriesToCreate: string[] = [];

		// mkdir until we reach root
		while (!isEqual(directory, dirname(directory))) {
			try {
				const stat = await provider.stat(directory);
				if ((stat.type & FileType.Directory) === 0) {
					throw new Error(localize('mkdirExistsError', "{0} exists, but is not a directory", directory.toString()));
				}

				break; // we have hit a directory that exists -> good
			} catch (error) {

				// Bubble up any other error that is not file not found
				if (toFileSystemProviderErrorCode(error) !== FileSystemProviderErrorCode.FileNotFound) {
					throw error;
				}

				// Upon error, remember directories that need to be created
				directoriesToCreate.push(basename(directory));

				// Continue up
				directory = dirname(directory);
			}
		}

		// Create directories as needed
		for (let i = directoriesToCreate.length - 1; i >= 0; i--) {
			directory = joinPath(directory, directoriesToCreate[i]);
			await provider.mkdir(directory);
		}
	}

	async del(resource: URI, options?: { useTrash?: boolean; recursive?: boolean; }): Promise<void> {
		if (options && options.useTrash) {
			//TODO@ben this is https://github.com/Microsoft/vscode/issues/48259
			return this.joinOnLegacy.then(legacy => legacy.del(resource, options));
		}

		const provider = this.throwIfFileSystemIsReadonly(await this.withProvider(resource));

		// Delete through provider
		await provider.delete(resource, { recursive: !!(options && options.recursive) });

		// Events
		this._onAfterOperation.fire(new FileOperationEvent(resource, FileOperation.DELETE));
	}

	//#endregion

	//#region File Watching

	private _onFileChanges: Emitter<FileChangesEvent> = this._register(new Emitter<FileChangesEvent>());
	get onFileChanges(): Event<FileChangesEvent> { return this._onFileChanges.event; }

	watchFileChanges(resource: URI): void {
		this.joinOnLegacy.then(legacy => legacy.watchFileChanges(resource));
	}

	unwatchFileChanges(resource: URI): void {
		this.joinOnLegacy.then(legacy => legacy.unwatchFileChanges(resource));
	}

	//#endregion

	//#region Helpers

	private throwIfFileSystemIsReadonly(provider: IFileSystemProvider): IFileSystemProvider {
		if (provider.capabilities & FileSystemProviderCapabilities.Readonly) {
			throw new FileOperationError(localize('err.readonly', "Resource can not be modified."), FileOperationResult.FILE_PERMISSION_DENIED);
		}

		return provider;
	}

	//#endregion
}