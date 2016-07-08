/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import {IDisposable} from 'vs/base/common/lifecycle';
import paths = require('vs/base/common/paths');
import encoding = require('vs/base/node/encoding');
import errors = require('vs/base/common/errors');
import strings = require('vs/base/common/strings');
import uri from 'vs/base/common/uri';
import timer = require('vs/base/common/timer');
import {IFileService, IFilesConfiguration, IResolveFileOptions, IFileStat, IContent, IStreamContent, IImportResult, IResolveContentOptions, IUpdateContentOptions} from 'vs/platform/files/common/files';
import {FileService as NodeFileService, IFileServiceOptions, IEncodingOverride} from 'vs/workbench/services/files/node/fileService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IEventService} from 'vs/platform/event/common/event';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {Action} from 'vs/base/common/actions';
import {IMessageService, IMessageWithAction, Severity} from 'vs/platform/message/common/message';

import {shell} from 'electron';

// If we run with .NET framework < 4.5, we need to detect this error to inform the user
const NET_VERSION_ERROR = 'System.MissingMethodException';

export class FileService implements IFileService {

	public _serviceBrand: any;

	private raw: IFileService;

	private configurationChangeListenerUnbind: IDisposable;

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@IEventService private eventService: IEventService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IMessageService private messageService: IMessageService
	) {
		const configuration = this.configurationService.getConfiguration<IFilesConfiguration>();
		const env = this.contextService.getConfiguration().env;

		// adjust encodings (TODO@Ben knowledge on settings location ('.vscode') is hardcoded)
		let encodingOverride: IEncodingOverride[] = [];
		encodingOverride.push({ resource: uri.file(env.appSettingsHome), encoding: encoding.UTF8 });
		if (this.contextService.getWorkspace()) {
			encodingOverride.push({ resource: uri.file(paths.join(this.contextService.getWorkspace().resource.fsPath, '.vscode')), encoding: encoding.UTF8 });
		}

		let watcherIgnoredPatterns: string[] = [];
		if (configuration.files && configuration.files.watcherExclude) {
			watcherIgnoredPatterns = Object.keys(configuration.files.watcherExclude).filter(k => !!configuration.files.watcherExclude[k]);
		}

		// build config
		let fileServiceConfig: IFileServiceOptions = {
			errorLogger: (msg: string) => this.onFileServiceError(msg),
			encoding: configuration.files && configuration.files.encoding,
			encodingOverride: encodingOverride,
			watcherIgnoredPatterns: watcherIgnoredPatterns,
			verboseLogging: env.verboseLogging,
			debugBrkFileWatcherPort: env.debugBrkFileWatcherPort
		};

		if (typeof env.debugBrkFileWatcherPort === 'number') {
			console.warn(`File Watcher STOPPED on first line for debugging on port ${env.debugBrkFileWatcherPort}`);
		}

		// create service
		let workspace = this.contextService.getWorkspace();
		this.raw = new NodeFileService(workspace ? workspace.resource.fsPath : void 0, fileServiceConfig, this.eventService);

		// Listeners
		this.registerListeners();
	}

	private onFileServiceError(msg: string): void {
		errors.onUnexpectedError(msg);

		// Detect if we run < .NET Framework 4.5
		if (msg && msg.indexOf(NET_VERSION_ERROR) >= 0) {
			this.messageService.show(Severity.Warning, <IMessageWithAction>{
				message: nls.localize('netVersionError', "The Microsoft .NET Framework 4.5 is required. Please follow the link to install it."),
				actions: [
					new Action('install.net', nls.localize('installNet', "Download .NET Framework 4.5"), null, true, () => {
						shell.openExternal('https://go.microsoft.com/fwlink/?LinkId=786533');

						return TPromise.as(true);
					})
				]
			});
		}
	}

	private registerListeners(): void {

		// Config Changes
		this.configurationChangeListenerUnbind = this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationChange(e.config));
	}

	private onConfigurationChange(configuration: IFilesConfiguration): void {
		this.updateOptions(configuration.files);
	}

	public updateOptions(options: any): void {
		this.raw.updateOptions(options);
	}

	public resolveFile(resource: uri, options?: IResolveFileOptions): TPromise<IFileStat> {
		return this.raw.resolveFile(resource, options);
	}

	public existsFile(resource: uri): TPromise<boolean> {
		return this.raw.existsFile(resource);
	}

	public resolveContent(resource: uri, options?: IResolveContentOptions): TPromise<IContent> {
		let contentId = resource.toString();
		let timerEvent = timer.start(timer.Topic.WORKBENCH, strings.format('Load {0}', contentId));

		return this.raw.resolveContent(resource, options).then((result) => {
			timerEvent.stop();

			return result;
		});
	}

	public resolveStreamContent(resource: uri, options?: IResolveContentOptions): TPromise<IStreamContent> {
		let contentId = resource.toString();
		let timerEvent = timer.start(timer.Topic.WORKBENCH, strings.format('Load {0}', contentId));

		return this.raw.resolveStreamContent(resource, options).then((result) => {
			timerEvent.stop();

			return result;
		});
	}

	public resolveContents(resources: uri[]): TPromise<IContent[]> {
		return this.raw.resolveContents(resources);
	}

	public updateContent(resource: uri, value: string, options?: IUpdateContentOptions): TPromise<IFileStat> {
		let timerEvent = timer.start(timer.Topic.WORKBENCH, strings.format('Save {0}', resource.toString()));

		return this.raw.updateContent(resource, value, options).then((result) => {
			timerEvent.stop();

			return result;
		}, (error) => {
			timerEvent.stop();

			return TPromise.wrapError(error);
		});
	}

	public moveFile(source: uri, target: uri, overwrite?: boolean): TPromise<IFileStat> {
		return this.raw.moveFile(source, target, overwrite);
	}

	public copyFile(source: uri, target: uri, overwrite?: boolean): TPromise<IFileStat> {
		return this.raw.copyFile(source, target, overwrite);
	}

	public createFile(resource: uri, content?: string): TPromise<IFileStat> {
		return this.raw.createFile(resource, content);
	}

	public createFolder(resource: uri): TPromise<IFileStat> {
		return this.raw.createFolder(resource);
	}

	public rename(resource: uri, newName: string): TPromise<IFileStat> {
		return this.raw.rename(resource, newName);
	}

	public del(resource: uri, useTrash?: boolean): TPromise<void> {
		if (useTrash) {
			return this.doMoveItemToTrash(resource);
		}

		return this.raw.del(resource);
	}

	private doMoveItemToTrash(resource: uri): TPromise<void> {
		let workspace = this.contextService.getWorkspace();
		if (!workspace) {
			return TPromise.wrapError<void>('Need a workspace to use this');
		}

		let absolutePath = resource.fsPath;

		let result = shell.moveItemToTrash(absolutePath);
		if (!result) {
			return TPromise.wrapError<void>(new Error(nls.localize('trashFailed', "Failed to move '{0}' to the trash", paths.basename(absolutePath))));
		}

		return TPromise.as(null);
	}

	public importFile(source: uri, targetFolder: uri): TPromise<IImportResult> {
		return this.raw.importFile(source, targetFolder).then((result) => {
			return <IImportResult>{
				isNew: result && result.isNew,
				stat: result && result.stat
			};
		});
	}

	public watchFileChanges(resource: uri): void {
		if (!resource) {
			return;
		}

		if (resource.scheme !== 'file') {
			return; // only support files
		}

		// return early if the resource is inside the workspace for which we have another watcher in place
		if (this.contextService.isInsideWorkspace(resource)) {
			return;
		}

		this.raw.watchFileChanges(resource);
	}

	public unwatchFileChanges(resource: uri): void;
	public unwatchFileChanges(path: string): void;
	public unwatchFileChanges(arg1: any): void {
		this.raw.unwatchFileChanges(arg1);
	}

	public dispose(): void {

		// Listeners
		if (this.configurationChangeListenerUnbind) {
			this.configurationChangeListenerUnbind.dispose();
			this.configurationChangeListenerUnbind = null;
		}

		// Dispose service
		this.raw.dispose();
	}
}