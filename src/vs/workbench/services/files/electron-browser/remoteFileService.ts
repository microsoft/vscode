/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { FileService } from 'vs/workbench/services/files/electron-browser/fileService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IMessageService } from 'vs/platform/message/common/message';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IContent, IStreamContent, IFileStat, IResolveContentOptions, IUpdateContentOptions, FileChangesEvent, FileChangeType } from "vs/platform/files/common/files";
import { TPromise } from "vs/base/common/winjs.base";
import Event from "vs/base/common/event";
import { EventEmitter } from "events";
import { basename } from "path";
import { IDisposable } from "vs/base/common/lifecycle";

export interface IRemoteFileSystemProvider {
	onDidChange: Event<URI>;
	resolve(resource: URI): TPromise<string>;
	update(resource: URI, content: string): TPromise<any>;
}

export class RemoteFileService extends FileService {

	private _provider: IRemoteFileSystemProvider;
	private readonly _remoteAuthority: string;

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IMessageService messageService: IMessageService,
		@IStorageService storageService: IStorageService
	) {
		super(configurationService, contextService, editorService, environmentService, editorGroupService, lifecycleService, messageService, storageService);
		this._remoteAuthority = environmentService.args['remote'];
	}

	private _shouldIntercept(resource: URI): boolean {
		return this._provider && resource.authority === this._remoteAuthority;
	}

	registerProvider(authority: string, provider: IRemoteFileSystemProvider): IDisposable {
		// todo@joh make this actually work for N provider
		if (authority !== this._remoteAuthority) {
			throw new Error();
		}
		this._provider = provider;
		const reg = this._provider.onDidChange(e => {
			// forward change events
			this._onFileChanges.fire(new FileChangesEvent([{ resource: e, type: FileChangeType.UPDATED }]));
		});
		return {
			dispose: () => {
				reg.dispose();
				this._provider = undefined;
			}
		};
	}

	// --- resolve

	resolveContent(resource: URI, options?: IResolveContentOptions): TPromise<IContent> {
		if (this._shouldIntercept(resource)) {
			return this._doResolveContent(resource);
		}

		return super.resolveContent(resource, options);
	}

	resolveStreamContent(resource: URI, options?: IResolveContentOptions): TPromise<IStreamContent> {
		if (this._shouldIntercept(resource)) {
			return this._doResolveContent(resource).then(RemoteFileService._asStreamContent);
		}

		return super.resolveStreamContent(resource, options);
	}

	private async _doResolveContent(resource: URI): TPromise<IContent> {

		const stat = RemoteFileService._createFakeStat(resource);
		const value = await this._provider.resolve(resource);
		return <any>{ ...stat, value };
	}

	// --- saving

	updateContent(resource: URI, value: string, options?: IUpdateContentOptions): TPromise<IFileStat> {
		if (this._shouldIntercept(resource)) {
			return this._doUpdateContent(resource, value).then(RemoteFileService._createFakeStat);
		}

		return super.updateContent(resource, value, options);
	}

	private async _doUpdateContent(resource: URI, content: string): TPromise<URI> {
		await this._provider.update(resource, content);
		return resource;
	}

	// --- util

	private static _createFakeStat(resource: URI): IFileStat {

		return <IFileStat>{
			resource,
			name: basename(resource.path),
			encoding: 'utf8',
			mtime: Date.now(),
			etag: Date.now().toString(16),
			isDirectory: false,
			hasChildren: false
		};
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
