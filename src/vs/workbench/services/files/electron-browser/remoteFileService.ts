/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { FileService } from 'vs/workbench/services/files/electron-browser/fileService';
import { IContent, IStreamContent, IFileStat, IResolveContentOptions, IUpdateContentOptions, FileChangesEvent, FileChangeType, IResolveFileOptions, IResolveFileResult } from 'vs/platform/files/common/files';
import { TPromise } from 'vs/base/common/winjs.base';
import Event from 'vs/base/common/event';
import { EventEmitter } from 'events';
import { basename } from 'path';
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


export interface IStat {
	resource: URI;
	mtime: number;
	size: number;
	isDirectory: boolean;
}

function toIFileStat(provider: IRemoteFileSystemProvider, stat: IStat, recurse: boolean): TPromise<IFileStat> {
	const ret: IFileStat = {
		isDirectory: false,
		hasChildren: false,
		resource: stat.resource,
		name: basename(stat.resource.path),
		mtime: stat.mtime,
		size: stat.size,
		etag: stat.mtime.toString(3) + stat.size.toString(7),
	};

	if (!stat.isDirectory) {
		// done
		return TPromise.as(ret);

	} else {
		// dir -> resolve
		return provider.readdir(stat.resource).then(items => {
			ret.isDirectory = true;
			ret.hasChildren = items.length > 0;

			if (recurse) {
				// resolve children if requested
				return TPromise.join(items.map(item => toIFileStat(provider, item, false))).then(children => {
					ret.children = children;
					return ret;
				});
			} else {
				return ret;
			}

		});
	}
}

export interface IRemoteFileSystemProvider {
	onDidChange?: Event<URI>;
	stat(resource: URI): TPromise<IStat>;
	readdir(resource: URI): TPromise<IStat[]>;
	write(resource: URI, content: string): TPromise<void>;
	read(resource: URI): TPromise<string>;
}

export class RemoteFileService extends FileService {

	// public existsFile(resource: URI): TPromise<boolean, any> {
	// 	throw new Error("Method not implemented.");
	// }
	// public moveFile(source: URI, target: URI, overwrite?: boolean): TPromise<IFileStat, any> {
	// 	throw new Error("Method not implemented.");
	// }
	// public copyFile(source: URI, target: URI, overwrite?: boolean): TPromise<IFileStat, any> {
	// 	throw new Error("Method not implemented.");
	// }
	// public createFile(resource: URI, content?: string): TPromise<IFileStat, any> {
	// 	throw new Error("Method not implemented.");
	// }
	// public createFolder(resource: URI): TPromise<IFileStat, any> {
	// 	throw new Error("Method not implemented.");
	// }
	// public touchFile(resource: URI): TPromise<IFileStat, any> {
	// 	throw new Error("Method not implemented.");
	// }
	// public rename(resource: URI, newName: string): TPromise<IFileStat, any> {
	// 	throw new Error("Method not implemented.");
	// }
	// public del(resource: URI, useTrash?: boolean): TPromise<void, any> {
	// 	throw new Error("Method not implemented.");
	// }


	private readonly _provider = new Map<string, IRemoteFileSystemProvider>();

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

	registerProvider(authority: string, provider: IRemoteFileSystemProvider): IDisposable {
		if (this._provider.has(authority)) {
			throw new Error();
		}

		this._provider.set(authority, provider);
		const reg = provider.onDidChange(e => {
			// forward change events
			this._onFileChanges.fire(new FileChangesEvent([{ resource: e, type: FileChangeType.UPDATED }]));
		});
		return {
			dispose: () => {
				this._provider.delete(authority);
				reg.dispose();
			}
		};
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
		}
		return super.resolveFile(resource, options);
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

	private _doResolveFiles(provider: IRemoteFileSystemProvider, toResolve: { resource: URI; options?: IResolveFileOptions; }[]): TPromise<IResolveFileResult[], any> {
		let result: IResolveFileResult[] = [];
		let promises: TPromise<any>[] = [];
		for (const item of toResolve) {
			promises.push(provider.stat(item.resource)
				.then(stat => toIFileStat(provider, stat, true))
				.then(stat => result.push({ stat, success: true })));
		}
		return TPromise.join(promises).then(() => result);
	}

	// --- resolve

	resolveContent(resource: URI, options?: IResolveContentOptions): TPromise<IContent> {
		const provider = this._provider.get(resource.scheme);
		if (provider) {
			return this._doResolveContent(provider, resource);
		}

		return super.resolveContent(resource, options);
	}

	resolveStreamContent(resource: URI, options?: IResolveContentOptions): TPromise<IStreamContent> {

		const provider = this._provider.get(resource.scheme);
		if (provider) {
			return this._doResolveContent(provider, resource).then(RemoteFileService._asStreamContent);
		}

		return super.resolveStreamContent(resource, options);
	}

	private _doResolveContent(provider: IRemoteFileSystemProvider, resource: URI): TPromise<IContent> {

		return provider.stat(resource).then(stat => {
			return provider.read(resource).then(value => {
				return <any>{
					...stat,
					value,
				};
			});
		});
	}

	// --- saving

	updateContent(resource: URI, value: string, options?: IUpdateContentOptions): TPromise<IFileStat> {
		const provider = this._provider.get(resource.scheme);
		if (provider) {
			return this._doUpdateContent(provider, resource, value);
		}
		return super.updateContent(resource, value, options);
	}

	private async _doUpdateContent(provider: IRemoteFileSystemProvider, resource: URI, content: string): TPromise<IFileStat> {
		await provider.write(resource, content);
		const stat = await provider.stat(resource);
		const fileStat = await toIFileStat(provider, stat, false);
		return fileStat;
	}

	private static _asStreamContent(content: IContent): IStreamContent {
		const emitter = new EventEmitter();
		const { value } = content;
		const result = <IStreamContent><any>content;
		result.value = emitter;
		setTimeout(() => {
			emitter.emit('data', value);
			emitter.emit('end');
		}, 0);
		return result;
	}
}
