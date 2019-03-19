/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { IFileService, IResolveFileOptions, IResourceEncodings, FileChangesEvent, FileOperationEvent, IFileSystemProviderRegistrationEvent, IFileSystemProvider, IFileStat, IResolveFileResult, IResolveContentOptions, IContent, IStreamContent, ITextSnapshot, IUpdateContentOptions, ICreateFileOptions, IFileSystemProviderActivationEvent } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Schemas } from 'vs/base/common/network';

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

	//#region File System Provider

	private _onDidChangeFileSystemProviderRegistrations: Emitter<IFileSystemProviderRegistrationEvent> = this._register(new Emitter<IFileSystemProviderRegistrationEvent>());
	get onDidChangeFileSystemProviderRegistrations(): Event<IFileSystemProviderRegistrationEvent> { return this._onDidChangeFileSystemProviderRegistrations.event; }

	private _onWillActivateFileSystemProvider: Emitter<IFileSystemProviderActivationEvent> = this._register(new Emitter<IFileSystemProviderActivationEvent>());
	get onWillActivateFileSystemProvider(): Event<IFileSystemProviderActivationEvent> { return this._onWillActivateFileSystemProvider.event; }

	private readonly provider = new Map<string, IFileSystemProvider>();

	registerProvider(scheme: string, provider: IFileSystemProvider): IDisposable {
		if (this.provider.has(scheme)) {
			throw new Error('a provider for that scheme is already registered');
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

	activateProvider(scheme: string): Promise<void> {
		if (this.provider.has(scheme)) {
			return Promise.resolve(); // provider is already here! TODO@ben should we still activate by event but not wait for it?
		}

		const joiners: Promise<void>[] = [];

		this._onWillActivateFileSystemProvider.fire({
			scheme,
			join(promise) {
				if (promise) {
					joiners.push(promise);
				}
			},
		});

		return Promise.all(joiners).then(() => undefined);
	}

	canHandleResource(resource: URI): boolean {
		return this.provider.has(resource.scheme) || resource.scheme === Schemas.file; // TODO@ben proper file:// registration
	}

	//#endregion

	private _onAfterOperation: Emitter<FileOperationEvent> = this._register(new Emitter<FileOperationEvent>());
	get onAfterOperation(): Event<FileOperationEvent> { return this._onAfterOperation.event; }

	//#region File Metadata Resolving

	readFolder(resource: URI): Promise<string[]> {
		return this._impl.readFolder(resource);
	}

	resolveFile(resource: URI, options?: IResolveFileOptions): Promise<IFileStat> {
		return this._impl.resolveFile(resource, options);
	}

	resolveFiles(toResolve: { resource: URI; options?: IResolveFileOptions; }[]): Promise<IResolveFileResult[]> {
		return this._impl.resolveFiles(toResolve);
	}

	existsFile(resource: URI): Promise<boolean> {
		return this._impl.existsFile(resource);
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

	createFolder(resource: URI): Promise<IFileStat> {
		return this._impl.createFolder(resource);
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
}

registerSingleton(IFileService, FileService2);