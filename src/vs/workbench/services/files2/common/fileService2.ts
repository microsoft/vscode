/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { IFileService, IResolveFileOptions, IResourceEncodings, FileChangesEvent, FileOperationEvent, IFileSystemProviderRegistrationEvent, IFileSystemProvider, IFileStat, IResolveFileResult, IResolveContentOptions, IContent, IStreamContent, ITextSnapshot, IUpdateContentOptions, ICreateFileOptions, IFileSystemProviderActivationEvent, FileOperationError, FileOperationResult, FileOperation, FileSystemProviderCapabilities, FileType, toFileSystemProviderErrorCode, FileSystemProviderErrorCode, IStat } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { isAbsolutePath, dirname, basename, joinPath, isEqual } from 'vs/base/common/resources';
import { localize } from 'vs/nls';
import { TernarySearchTree } from 'vs/base/common/map';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { getBaseLabel } from 'vs/base/common/labels';
import { ILogService } from 'vs/platform/log/common/log';

export class FileService2 extends Disposable implements IFileService {

	//#region TODO@Ben HACKS

	private _impl: IFileService;

	setImpl(service: IFileService): void {
		this._impl = this._register(service);

		this._register(service.onFileChanges(e => this._onFileChanges.fire(e)));
		this._register(service.onAfterOperation(e => this._onAfterOperation.fire(e)));
	}

	//#endregion

	_serviceBrand: ServiceIdentifier<any>;

	constructor(@ILogService private logService: ILogService) {
		super();
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
		if (this._impl) {
			legacyDisposal = this._impl.registerProvider(scheme, provider);
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
			throw new FileOperationError(
				localize('invalidPath', "The path of resource '{0}' must be absolute", resource.toString(true)),
				FileOperationResult.FILE_INVALID_PATH
			);
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

	private async doResolveFile(resource: URI, options?: IResolveFileOptions): Promise<IFileStat> {
		const provider = await this.withProvider(resource);

		// leverage a trie to check for recursive resolving
		const to = options && options.resolveTo;
		const trie = TernarySearchTree.forPaths<true>();
		trie.set(resource.toString(), true);
		if (isNonEmptyArray(to)) {
			to.forEach(uri => trie.set(uri.toString(), true));
		}

		const stat = await provider.stat(resource);

		return await this.toFileStat(provider, resource, stat, undefined, (stat, siblings) => {

			// check for recursive resolving
			if (Boolean(trie.findSuperstr(stat.resource.toString()) || trie.get(stat.resource.toString()))) {
				return true;
			}

			// check for resolving single child folders
			if (stat.isDirectory && options && options.resolveSingleChildDescendants) {
				return siblings === 1;
			}

			return false;
		});
	}

	private async toFileStat(provider: IFileSystemProvider, resource: URI, stat: IStat, siblings: number | undefined, recurse: (stat: IFileStat, siblings?: number) => boolean): Promise<IFileStat> {

		// convert to file stat
		const fileStat: IFileStat = {
			resource,
			name: getBaseLabel(resource),
			isDirectory: (stat.type & FileType.Directory) !== 0,
			isSymbolicLink: (stat.type & FileType.SymbolicLink) !== 0,
			isReadonly: !!(provider.capabilities & FileSystemProviderCapabilities.Readonly),
			mtime: stat.mtime,
			size: stat.size,
			etag: stat.mtime.toString(29) + stat.size.toString(31),
		};

		// check to recurse for directories
		if (fileStat.isDirectory && recurse(fileStat, siblings)) {
			try {
				const entries = await provider.readdir(resource);

				fileStat.children = await Promise.all(entries.map(async entry => {
					const childResource = joinPath(resource, entry[0]);
					const childStat = await provider.stat(childResource);

					return this.toFileStat(provider, childResource, childStat, entries.length, recurse);
				}));
			} catch (error) {
				this.logService.trace(error);

				fileStat.children = []; // gracefully handle errors, we may not have permissions to read
			}

			return fileStat;
		}

		return Promise.resolve(fileStat);
	}

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

		// resolve files
		const result: IResolveFileResult[] = [];
		for (const group of groups) {
			for (const groupEntry of group) {
				try {
					const stat = await this.doResolveFile(groupEntry.resource, groupEntry.options);
					result.push({ stat, success: true });
				} catch (error) {
					this.logService.trace(error);

					result.push({ stat: undefined, success: false });
				}
			}
		}

		return result;
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

	get encoding(): IResourceEncodings { return this._impl.encoding; }

	createFile(resource: URI, content?: string, options?: ICreateFileOptions): Promise<IFileStat> {
		return this._impl.createFile(resource, content, options);
	}

	resolveContent(resource: URI, options?: IResolveContentOptions): Promise<IContent> {
		return this._impl.resolveContent(resource, options);
	}

	resolveStreamContent(resource: URI, options?: IResolveContentOptions): Promise<IStreamContent> {
		return this._impl.resolveStreamContent(resource, options);
	}

	updateContent(resource: URI, value: string | ITextSnapshot, options?: IUpdateContentOptions): Promise<IFileStat> {
		return this._impl.updateContent(resource, value, options);
	}

	//#endregion

	//#region Move/Copy/Delete/Create Folder

	moveFile(source: URI, target: URI, overwrite?: boolean): Promise<IFileStat> {
		return this._impl.moveFile(source, target, overwrite);
	}

	copyFile(source: URI, target: URI, overwrite?: boolean): Promise<IFileStat> {
		return this._impl.copyFile(source, target, overwrite);
	}

	async createFolder(resource: URI): Promise<IFileStat> {
		const provider = this.throwIfFileSystemIsReadonly(await this.withProvider(resource));

		// mkdir recursively
		await this.mkdirp(provider, resource);

		// events
		const fileStat = await this.resolveFile(resource);
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
					throw new Error(`${directory.toString()} exists, but is not a directory`);
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

	del(resource: URI, options?: { useTrash?: boolean; recursive?: boolean; }): Promise<void> {
		return this._impl.del(resource, options);
	}

	//#endregion

	//#region File Watching

	private _onFileChanges: Emitter<FileChangesEvent> = this._register(new Emitter<FileChangesEvent>());
	get onFileChanges(): Event<FileChangesEvent> { return this._onFileChanges.event; }

	watchFileChanges(resource: URI): void {
		this._impl.watchFileChanges(resource);
	}

	unwatchFileChanges(resource: URI): void {
		this._impl.unwatchFileChanges(resource);
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

registerSingleton(IFileService, FileService2);