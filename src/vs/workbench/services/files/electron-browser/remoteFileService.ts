/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { FileService } from 'vs/workbench/services/files/electron-browser/fileService';
import { IContent, IStreamContent, IFileStat, IResolveContentOptions, IUpdateContentOptions, IResolveFileOptions, IResolveFileResult, FileOperationEvent, FileOperation, IFileSystemProvider, IStat, FileType, IImportResult } from 'vs/platform/files/common/files';
import { TPromise } from 'vs/base/common/winjs.base';
import { basename, join } from 'path';
import { IDisposable } from 'vs/base/common/lifecycle';
import * as Ftp from './ftpFileSystemProvider';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IMessageService } from 'vs/platform/message/common/message';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { groupBy, isFalsyOrEmpty } from 'vs/base/common/arrays';
import { compare } from 'vs/base/common/strings';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { Progress } from 'vs/platform/progress/common/progress';
import { decodeStream, encode } from 'vs/base/node/encoding';

function toIFileStat(provider: IFileSystemProvider, stat: IStat, recurse: boolean): TPromise<IFileStat> {
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

			if (recurse) {
				// resolve children if requested
				return TPromise.join(items.map(resource => provider.stat(resource).then(stat => toIFileStat(provider, stat, false)))).then(children => {
					ret.children = children;
					return ret;
				});
			} else {
				return ret;
			}
		});
	}
}

async function toDeepIFileStat(provider: IFileSystemProvider, stat: IFileStat, to: URI[]): TPromise<IFileStat> {
	if (isFalsyOrEmpty(to)) {
		return TPromise.as(stat);
	}

	return TPromise.as(stat);
}

export class RemoteFileService extends FileService {

	// public touchFile(resource: URI): TPromise<IFileStat, any> {
	// 	throw new Error("Method not implemented.");
	// }
	// public watchFileChanges(resource: URI): void {
	// 	throw new Error("Method not implemented.");
	// }
	// public unwatchFileChanges(resource: URI): void {
	// 	throw new Error("Method not implemented.");
	// }

	private readonly _provider = new Map<string, IFileSystemProvider>();

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IMessageService messageService: IMessageService,
		@IStorageService storageService: IStorageService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService
	) {
		super(
			configurationService,
			contextService,
			editorService,
			environmentService,
			editorGroupService,
			lifecycleService,
			messageService,
			storageService,
			textResourceConfigurationService,
		);
		this.registerProvider('ftp', new Ftp.FtpFileSystemProvider());
	}

	registerProvider(authority: string, provider: IFileSystemProvider): IDisposable {
		if (this._provider.has(authority)) {
			throw new Error();
		}

		this._provider.set(authority, provider);
		const reg = provider.onDidChange(e => {
			// forward change events
			this._onFileChanges.fire(e);
		});
		return {
			dispose: () => {
				this._provider.delete(authority);
				reg.dispose();
			}
		};
	}

	// --- stat

	existsFile(resource: URI): TPromise<boolean, any> {
		const provider = this._provider.get(resource.scheme);
		if (provider) {
			return this._doResolveFiles(provider, [{ resource }]).then(data => data.length > 0);
		} else {
			return super.existsFile(resource);
		}
	}

	resolveFile(resource: URI, options?: IResolveFileOptions): TPromise<IFileStat, any> {
		const provider = this._provider.get(resource.scheme);
		if (provider) {
			return this._doResolveFiles(provider, [{ resource, options }]).then(data => {
				if (isFalsyOrEmpty(data)) {
					throw new Error('NotFound');
				}
				return data[0].stat;
			});
		} else {
			return super.resolveFile(resource, options);
		}
	}

	resolveFiles(toResolve: { resource: URI; options?: IResolveFileOptions; }[]): TPromise<IResolveFileResult[], any> {
		const groups = groupBy(toResolve, (a, b) => compare(a.resource.scheme, b.resource.scheme));
		const promises: TPromise<IResolveFileResult[], any>[] = [];
		for (const group of groups) {
			const provider = this._provider.get(group[0].resource.scheme);
			if (!provider) {
				promises.push(super.resolveFiles(group));
			} else {
				promises.push(this._doResolveFiles(provider, group));
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
				.then(stat => toIFileStat(provider, stat, true))
				.then(stat => toDeepIFileStat(provider, stat, item.options && item.options.resolveTo))
				.then(stat => result.push({ stat, success: true })));
		}
		return TPromise.join(promises).then(() => result);
	}

	// --- resolve

	resolveContent(resource: URI, options?: IResolveContentOptions): TPromise<IContent> {
		const provider = this._provider.get(resource.scheme);
		if (provider) {
			return this._doResolveContent(provider, resource).then(RemoteFileService._asContent);
		} else {
			return super.resolveContent(resource, options);
		}
	}

	resolveStreamContent(resource: URI, options?: IResolveContentOptions): TPromise<IStreamContent> {
		const provider = this._provider.get(resource.scheme);
		if (provider) {
			return this._doResolveContent(provider, resource);
		} else {
			return super.resolveStreamContent(resource, options);
		}
	}

	private async _doResolveContent(provider: IFileSystemProvider, resource: URI): TPromise<IStreamContent> {

		const stat = await toIFileStat(provider, await provider.stat(resource), false);

		const encoding = this.getEncoding(resource);
		const stream = decodeStream(encoding);
		await provider.read(resource, new Progress<Uint8Array>(chunk => stream.write(<Buffer>chunk)));
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

	async createFile(resource: URI, content?: string): TPromise<IFileStat> {
		const provider = this._provider.get(resource.scheme);
		if (provider) {
			const stat = await this._doUpdateContent(provider, resource, content || '', {});
			this._onAfterOperation.fire(new FileOperationEvent(resource, FileOperation.CREATE, stat));
			return stat;
		} else {
			return super.createFile(resource, content);
		}
	}

	updateContent(resource: URI, value: string, options?: IUpdateContentOptions): TPromise<IFileStat> {
		const provider = this._provider.get(resource.scheme);
		if (provider) {
			return this._doUpdateContent(provider, resource, value, options || {});
		} else {
			return super.updateContent(resource, value, options);
		}
	}

	private async _doUpdateContent(provider: IFileSystemProvider, resource: URI, content: string, options: IUpdateContentOptions): TPromise<IFileStat> {
		const encoding = this.getEncoding(resource, options.encoding);
		await provider.write(resource, encode(content, encoding));
		const stat = await provider.stat(resource);
		const fileStat = await toIFileStat(provider, stat, false);
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
		const provider = this._provider.get(resource.scheme);
		if (provider) {
			const stat = await provider.stat(resource);
			await stat.type === FileType.Dir ? provider.rmdir(resource) : provider.unlink(resource);
			this._onAfterOperation.fire(new FileOperationEvent(resource, FileOperation.DELETE));
		} else {
			return super.del(resource, useTrash);
		}
	}

	async createFolder(resource: URI): TPromise<IFileStat, any> {
		const provider = this._provider.get(resource.scheme);
		if (provider) {
			await provider.mkdir(resource);
			const stat = await toIFileStat(provider, await provider.stat(resource), false);
			this._onAfterOperation.fire(new FileOperationEvent(resource, FileOperation.CREATE, stat));
			return stat;
		} else {
			return super.createFolder(resource);
		}
	}

	rename(resource: URI, newName: string): TPromise<IFileStat, any> {
		const provider = this._provider.get(resource.scheme);
		if (provider) {
			const target = resource.with({ path: join(resource.path, '..', newName) });
			return this._doMove(provider, resource, target, false);
		} else {
			return super.rename(resource, newName);
		}
	}

	moveFile(source: URI, target: URI, overwrite?: boolean): TPromise<IFileStat> {
		if (source.scheme !== target.scheme) {
			return this._manualMove(source, target);
		}
		const provider = this._provider.get(source.scheme);
		if (provider) {
			return this._doMove(provider, source, target, overwrite);
		} else {
			return super.moveFile(source, target, overwrite);
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
		if (source.scheme === targetFolder.scheme && !this._provider.has(source.scheme)) {
			return super.importFile(source, targetFolder);

		} else {
			const target = targetFolder.with({ path: join(targetFolder.path, basename(source.path)) });
			return this.copyFile(source, target, false).then(stat => ({ stat, isNew: false }));
		}
	}

	async copyFile(source: URI, target: URI, overwrite?: boolean): TPromise<IFileStat> {
		if (source.scheme === target.scheme && !this._provider.has(source.scheme)) {
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
		const targetProvider = this._provider.get(target.scheme);
		if (targetProvider) {
			const stat = await this._doUpdateContent(targetProvider, target, content.value, { encoding: content.encoding });
			this._onAfterOperation.fire(new FileOperationEvent(source, FileOperation.COPY, stat));
			return stat;
		} else {
			return super.updateContent(target, content.value, { encoding: content.encoding });
		}
	}
}
