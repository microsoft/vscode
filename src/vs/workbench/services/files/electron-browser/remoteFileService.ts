/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { FileService } from 'vs/workbench/services/files/electron-browser/fileService';
import { IContent, IStreamContent, IFileStat, IResolveContentOptions, IUpdateContentOptions, IResolveFileOptions, IResolveFileResult, FileOperationEvent, FileOperation, IFileSystemProvider, IStat, FileType, IImportResult, FileChangesEvent, ICreateFileOptions } from 'vs/platform/files/common/files';
import { TPromise } from 'vs/base/common/winjs.base';
import { basename, join } from 'path';
import { IDisposable } from 'vs/base/common/lifecycle';
import { groupBy, isFalsyOrEmpty, distinct } from 'vs/base/common/arrays';
import { compare } from 'vs/base/common/strings';
import { Schemas } from 'vs/base/common/network';
import { Progress } from 'vs/platform/progress/common/progress';
import { decodeStream, encode } from 'vs/base/node/encoding';
import { TrieMap } from 'vs/base/common/map';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IMessageService } from 'vs/platform/message/common/message';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';

function toIFileStat(provider: IFileSystemProvider, stat: IStat, recurse?: (stat: IStat) => boolean): TPromise<IFileStat> {
	const ret: IFileStat = {
		isDirectory: false,
		hasChildren: false,
		resource: stat.resource,
		name: basename(stat.resource.path),
		mtime: stat.mtime,
		size: stat.size,
		etag: stat.mtime.toString(29) + stat.size.toString(31),
	};

	if (stat.type === FileType.File) {
		// done
		return TPromise.as(ret);

	} else {
		// dir -> resolve
		return provider.readdir(stat.resource).then(items => {
			ret.isDirectory = true;
			ret.hasChildren = items.length > 0;

			if (recurse && recurse(stat)) {
				// resolve children if requested
				return TPromise.join(items.map(stat => toIFileStat(provider, stat, recurse))).then(children => {
					ret.children = children;
					return ret;
				});
			} else {
				return ret;
			}
		});
	}
}

export function toDeepIFileStat(provider: IFileSystemProvider, stat: IStat, to: URI[]): TPromise<IFileStat> {

	const trie = new TrieMap<true>();
	trie.insert(stat.resource.toString(), true);

	if (!isFalsyOrEmpty(to)) {
		to.forEach(uri => trie.insert(uri.toString(), true));
	}

	return toIFileStat(provider, stat, candidate => {
		const sub = trie.findSuperstr(candidate.resource.toString());
		return !!sub;
	});
}

export class RemoteFileService extends FileService {

	private readonly _provider = new Map<string, IFileSystemProvider>();
	private _supportedSchemes: string[];

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IStorageService private readonly _storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IMessageService messageService: IMessageService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
	) {
		super(
			configurationService,
			contextService,
			environmentService,
			lifecycleService,
			messageService,
			_storageService,
			textResourceConfigurationService,
		);

		this._supportedSchemes = JSON.parse(this._storageService.get('remote_schemes', undefined, '[]'));
	}

	registerProvider(authority: string, provider: IFileSystemProvider): IDisposable {
		if (this._provider.has(authority)) {
			throw new Error();
		}

		this._supportedSchemes.push(authority);
		this._storageService.store('remote_schemes', JSON.stringify(distinct(this._supportedSchemes)));

		this._provider.set(authority, provider);
		const reg = provider.onDidChange(changes => {
			// forward change events
			this._onFileChanges.fire(new FileChangesEvent(changes));
		});
		return {
			dispose: () => {
				this._provider.delete(authority);
				reg.dispose();
			}
		};
	}

	supportResource(resource: URI): boolean {
		return resource.scheme === Schemas.file
			|| this._provider.has(resource.scheme)
			// TODO@remote
			|| this._supportedSchemes.indexOf(resource.scheme) >= 0;
	}

	// --- stat

	private _withProvider(resource: URI): TPromise<IFileSystemProvider> {
		return this._extensionService.activateByEvent('onFileSystemAccess:' + resource.scheme).then(() => {
			const provider = this._provider.get(resource.scheme);
			if (!provider) {
				throw new Error('ENOPRO - no provider known for ' + resource);
			}
			return provider;
		});
	}

	async existsFile(resource: URI): TPromise<boolean, any> {
		if (resource.scheme === Schemas.file) {
			return super.existsFile(resource);
		} else {
			const provider = await this._withProvider(resource);
			return provider
				? this._doResolveFiles(provider, [{ resource }]).then(data => data.length > 0)
				: true;
		}
	}

	async resolveFile(resource: URI, options?: IResolveFileOptions): TPromise<IFileStat, any> {
		if (resource.scheme === Schemas.file) {
			return super.resolveFile(resource, options);
		} else {
			const provider = await this._withProvider(resource);
			if (!provider) {
				throw new Error('ENOENT');
			}
			return this._doResolveFiles(provider, [{ resource, options }]).then(data => {
				if (isFalsyOrEmpty(data)) {
					throw new Error('NotFound');
				}
				return data[0].stat;
			});
		}
	}

	async resolveFiles(toResolve: { resource: URI; options?: IResolveFileOptions; }[]): TPromise<IResolveFileResult[], any> {
		const groups = groupBy(toResolve, (a, b) => compare(a.resource.scheme, b.resource.scheme));
		const promises: TPromise<IResolveFileResult[], any>[] = [];
		for (const group of groups) {
			if (group[0].resource.scheme === Schemas.file) {
				promises.push(super.resolveFiles(group));
			} else {
				const provider = await this._withProvider(group[0].resource);
				if (provider) {
					promises.push(this._doResolveFiles(provider, group));
				}
			}
		}
		return TPromise.join(promises).then(data => {
			return [].concat(...data);
		});
	}

	private _doResolveFiles(provider: IFileSystemProvider, toResolve: { resource: URI; options?: IResolveFileOptions; }[]): TPromise<IResolveFileResult[], any> {
		let result: IResolveFileResult[] = [];
		let promises: TPromise<any>[] = [];
		for (const item of toResolve) {
			promises.push(provider.stat(item.resource)
				.then(stat => toDeepIFileStat(provider, stat, item.options && item.options.resolveTo))
				.then(stat => result.push({ stat, success: true })));
		}
		return TPromise.join(promises).then(() => result);
	}

	// --- resolve

	async resolveContent(resource: URI, options?: IResolveContentOptions): TPromise<IContent> {
		if (resource.scheme === Schemas.file) {
			return super.resolveContent(resource, options);
		} else {
			const provider = await this._withProvider(resource);
			return this._doResolveContent(provider, resource).then(RemoteFileService._asContent);
		}
	}

	async resolveStreamContent(resource: URI, options?: IResolveContentOptions): TPromise<IStreamContent> {
		if (resource.scheme === Schemas.file) {
			return super.resolveStreamContent(resource, options);
		} else {
			const provider = await this._withProvider(resource);
			return this._doResolveContent(provider, resource);
		}
	}

	private async _doResolveContent(provider: IFileSystemProvider, resource: URI): TPromise<IStreamContent> {

		const stat = await toIFileStat(provider, await provider.stat(resource));

		const encoding = this.getEncoding(resource);
		const stream = decodeStream(encoding);
		await provider.read(resource, new Progress<Buffer>(chunk => stream.write(chunk)));
		stream.end();

		return {
			encoding,
			value: stream,
			resource: stat.resource,
			name: stat.name,
			etag: stat.etag,
			mtime: stat.mtime,
		};
	}

	// --- saving

	async createFile(resource: URI, content?: string, options?: ICreateFileOptions): TPromise<IFileStat> {
		if (resource.scheme === Schemas.file) {
			return super.createFile(resource, content, options);
		} else {
			const provider = await this._withProvider(resource);
			const stat = await this._doUpdateContent(provider, resource, content || '', {});
			this._onAfterOperation.fire(new FileOperationEvent(resource, FileOperation.CREATE, stat));
			return stat;
		}
	}

	async updateContent(resource: URI, value: string, options?: IUpdateContentOptions): TPromise<IFileStat> {
		if (resource.scheme === Schemas.file) {
			return super.updateContent(resource, value, options);
		} else {
			const provider = await this._withProvider(resource);
			return this._doUpdateContent(provider, resource, value, options || {});
		}
	}

	private async _doUpdateContent(provider: IFileSystemProvider, resource: URI, content: string, options: IUpdateContentOptions): TPromise<IFileStat> {
		const encoding = this.getEncoding(resource, options.encoding);
		await provider.write(resource, encode(content, encoding));
		const stat = await provider.stat(resource);
		const fileStat = await toIFileStat(provider, stat);
		return fileStat;
	}

	private static _asContent(content: IStreamContent): TPromise<IContent> {
		return new TPromise<IContent>((resolve, reject) => {
			let result: IContent = {
				value: '',
				encoding: content.encoding,
				etag: content.etag,
				mtime: content.mtime,
				name: content.name,
				resource: content.resource
			};
			content.value.on('data', chunk => result.value += chunk);
			content.value.on('error', reject);
			content.value.on('end', () => resolve(result));
		});
	}

	// --- delete

	async del(resource: URI, useTrash?: boolean): TPromise<void> {
		if (resource.scheme === Schemas.file) {
			return super.del(resource, useTrash);
		} else {
			const provider = await this._withProvider(resource);
			const stat = await provider.stat(resource);
			await stat.type === FileType.Dir ? provider.rmdir(resource) : provider.unlink(resource);
			this._onAfterOperation.fire(new FileOperationEvent(resource, FileOperation.DELETE));
		}
	}

	async createFolder(resource: URI): TPromise<IFileStat, any> {
		if (resource.scheme === Schemas.file) {
			return super.createFolder(resource);
		} else {
			const provider = await this._withProvider(resource);
			await provider.mkdir(resource);
			const stat = await toIFileStat(provider, await provider.stat(resource));
			this._onAfterOperation.fire(new FileOperationEvent(resource, FileOperation.CREATE, stat));
			return stat;
		}
	}

	async rename(resource: URI, newName: string): TPromise<IFileStat, any> {
		if (resource.scheme === Schemas.file) {
			return super.rename(resource, newName);
		} else {
			const provider = await this._withProvider(resource);
			const target = resource.with({ path: join(resource.path, '..', newName) });
			return this._doMove(provider, resource, target, false);
		}
	}

	async moveFile(source: URI, target: URI, overwrite?: boolean): TPromise<IFileStat> {
		if (source.scheme !== target.scheme) {
			return this._manualMove(source, target);
		} else if (source.scheme === Schemas.file) {
			return super.moveFile(source, target, overwrite);
		} else {
			const provider = await this._withProvider(source);
			return this._doMove(provider, source, target, overwrite);
		}
	}

	private async _doMove(provider: IFileSystemProvider, source: URI, target: URI, overwrite?: boolean): TPromise<IFileStat> {
		if (overwrite) {
			try {
				await this.del(target);
			} catch (e) {
				// TODO@Joh Better errors
				// ignore not_exists error
				// abort on other errors
			}
		}
		await provider.rename(source, target);
		const stat = await this.resolveFile(target);
		this._onAfterOperation.fire(new FileOperationEvent(source, FileOperation.MOVE, stat));
		return stat;
	}

	private async _manualMove(source: URI, target: URI, overwrite?: boolean): TPromise<IFileStat> {
		await this.copyFile(source, target, overwrite);
		await this.del(source);
		const stat = await this.resolveFile(target);
		this._onAfterOperation.fire(new FileOperationEvent(source, FileOperation.MOVE, stat));
		return stat;
	}

	importFile(source: URI, targetFolder: URI): TPromise<IImportResult> {
		if (source.scheme === targetFolder.scheme && source.scheme === Schemas.file) {
			return super.importFile(source, targetFolder);
		} else {
			const target = targetFolder.with({ path: join(targetFolder.path, basename(source.path)) });
			return this.copyFile(source, target, false).then(stat => ({ stat, isNew: false }));
		}
	}

	async copyFile(source: URI, target: URI, overwrite?: boolean): TPromise<IFileStat> {
		if (source.scheme === target.scheme && source.scheme === Schemas.file) {
			return super.copyFile(source, target, overwrite);
		}

		if (overwrite) {
			try {
				await this.del(target);
			} catch (e) {
				// TODO@Joh Better errors
				// ignore not_exists error
				// abort on other errors
			}
		}
		// TODO@Joh This does only work for textfiles
		// because the content turns things into a string
		// and all binary data will be broken
		const content = await this.resolveContent(source);
		const targetProvider = await this._withProvider(target);

		if (targetProvider) {
			const stat = await this._doUpdateContent(targetProvider, target, content.value, { encoding: content.encoding });
			this._onAfterOperation.fire(new FileOperationEvent(source, FileOperation.COPY, stat));
			return stat;
		} else {
			return super.updateContent(target, content.value, { encoding: content.encoding });
		}
	}

	async touchFile(resource: URI): TPromise<IFileStat, any> {
		if (resource.scheme === Schemas.file) {
			return super.touchFile(resource);
		} else {
			const provider = await this._withProvider(resource);
			return this._doTouchFile(provider, resource);
		}
	}

	private async _doTouchFile(provider: IFileSystemProvider, resource: URI): TPromise<IFileStat> {
		let stat: IStat;
		try {
			await provider.stat(resource);
			stat = await provider.utimes(resource, Date.now());
		} catch (e) {
			// TODO@Joh, if ENOENT
			await provider.write(resource, new Uint8Array(0));
			stat = await provider.stat(resource);
		}
		return toIFileStat(provider, stat);
	}

	// TODO@Joh - file watching on demand!
	public watchFileChanges(resource: URI): void {
		if (resource.scheme === Schemas.file) {
			super.watchFileChanges(resource);
		}
	}
	public unwatchFileChanges(resource: URI): void {
		if (resource.scheme === Schemas.file) {
			super.unwatchFileChanges(resource);
		}
	}
}
