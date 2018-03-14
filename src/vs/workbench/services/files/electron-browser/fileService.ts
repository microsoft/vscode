/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import paths = require('vs/base/common/paths');
import encoding = require('vs/base/node/encoding');
import errors = require('vs/base/common/errors');
import uri from 'vs/base/common/uri';
import { FileOperation, FileOperationEvent, IFileService, IFilesConfiguration, IResolveFileOptions, IFileStat, IResolveFileResult, IContent, IStreamContent, IImportResult, IResolveContentOptions, IUpdateContentOptions, FileChangesEvent, ICreateFileOptions, ITextSnapshot } from 'vs/platform/files/common/files';
import { FileService as NodeFileService, IFileServiceOptions, IEncodingOverride } from 'vs/workbench/services/files/node/fileService';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { Event, Emitter } from 'vs/base/common/event';
import { shell } from 'electron';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { isMacintosh, isWindows } from 'vs/base/common/platform';
import product from 'vs/platform/node/product';
import { Schemas } from 'vs/base/common/network';
import { Severity, INotificationService, PromptOption } from 'vs/platform/notification/common/notification';

export class FileService implements IFileService {

	public _serviceBrand: any;

	// If we run with .NET framework < 4.5, we need to detect this error to inform the user
	private static readonly NET_VERSION_ERROR = 'System.MissingMethodException';
	private static readonly NET_VERSION_ERROR_IGNORE_KEY = 'ignoreNetVersionError';

	private static readonly ENOSPC_ERROR = 'ENOSPC';
	private static readonly ENOSPC_ERROR_IGNORE_KEY = 'ignoreEnospcError';

	private raw: NodeFileService;

	private toUnbind: IDisposable[];

	protected _onFileChanges: Emitter<FileChangesEvent>;
	protected _onAfterOperation: Emitter<FileOperationEvent>;

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@INotificationService private notificationService: INotificationService,
		@IStorageService private storageService: IStorageService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService
	) {
		this.toUnbind = [];

		this._onFileChanges = new Emitter<FileChangesEvent>();
		this.toUnbind.push(this._onFileChanges);

		this._onAfterOperation = new Emitter<FileOperationEvent>();
		this.toUnbind.push(this._onAfterOperation);

		const configuration = this.configurationService.getValue<IFilesConfiguration>();

		let watcherIgnoredPatterns: string[] = [];
		if (configuration.files && configuration.files.watcherExclude) {
			watcherIgnoredPatterns = Object.keys(configuration.files.watcherExclude).filter(k => !!configuration.files.watcherExclude[k]);
		}

		// build config
		const fileServiceConfig: IFileServiceOptions = {
			errorLogger: (msg: string) => this.onFileServiceError(msg),
			encodingOverride: this.getEncodingOverrides(),
			watcherIgnoredPatterns,
			verboseLogging: environmentService.verbose,
			useExperimentalFileWatcher: configuration.files.useExperimentalFileWatcher,
			elevationSupport: {
				cliPath: this.environmentService.cliPath,
				promptTitle: this.environmentService.appNameLong,
				promptIcnsPath: (isMacintosh && this.environmentService.isBuilt) ? paths.join(paths.dirname(this.environmentService.appRoot), `${product.nameShort}.icns`) : void 0
			}
		};

		// create service
		this.raw = new NodeFileService(contextService, environmentService, textResourceConfigurationService, configurationService, lifecycleService, fileServiceConfig);

		// Listeners
		this.registerListeners();
	}

	public get onFileChanges(): Event<FileChangesEvent> {
		return this._onFileChanges.event;
	}

	public get onAfterOperation(): Event<FileOperationEvent> {
		return this._onAfterOperation.event;
	}

	private onFileServiceError(error: string | Error): void {
		const msg = error ? error.toString() : void 0;
		if (!msg) {
			return;
		}

		// Forward to unexpected error handler
		errors.onUnexpectedError(msg);

		// Detect if we run < .NET Framework 4.5 (TODO@ben remove with new watcher impl)
		if (msg.indexOf(FileService.NET_VERSION_ERROR) >= 0 && !this.storageService.getBoolean(FileService.NET_VERSION_ERROR_IGNORE_KEY, StorageScope.WORKSPACE)) {
			const choices: PromptOption[] = [nls.localize('installNet', "Download .NET Framework 4.5"), { label: nls.localize('neverShowAgain', "Don't Show Again") }];
			this.notificationService.prompt(Severity.Warning, nls.localize('netVersionError', "The Microsoft .NET Framework 4.5 is required. Please follow the link to install it."), choices).then(choice => {
				switch (choice) {
					case 0 /* Read More */:
						window.open('https://go.microsoft.com/fwlink/?LinkId=786533');
						break;
					case 1 /* Never show again */:
						this.storageService.store(FileService.NET_VERSION_ERROR_IGNORE_KEY, true, StorageScope.WORKSPACE);
						break;
				}
			});
		}

		// Detect if we run into ENOSPC issues
		if (msg.indexOf(FileService.ENOSPC_ERROR) >= 0 && !this.storageService.getBoolean(FileService.ENOSPC_ERROR_IGNORE_KEY, StorageScope.WORKSPACE)) {
			const choices: PromptOption[] = [nls.localize('learnMore', "Instructions"), { label: nls.localize('neverShowAgain', "Don't Show Again") }];
			this.notificationService.prompt(Severity.Warning, nls.localize('enospcError', "{0} is unable to watch for file changes in this large workspace. Please follow the instructions link to resolve this issue.", product.nameLong), choices).then(choice => {
				switch (choice) {
					case 0 /* Read More */:
						window.open('https://go.microsoft.com/fwlink/?linkid=867693');
						break;
					case 1 /* Never show again */:
						this.storageService.store(FileService.ENOSPC_ERROR_IGNORE_KEY, true, StorageScope.WORKSPACE);
						break;
				}
			});
		}
	}

	private registerListeners(): void {

		// File events
		this.toUnbind.push(this.raw.onFileChanges(e => this._onFileChanges.fire(e)));
		this.toUnbind.push(this.raw.onAfterOperation(e => this._onAfterOperation.fire(e)));

		// Config changes
		this.toUnbind.push(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationChange(e)));

		// Root changes
		this.toUnbind.push(this.contextService.onDidChangeWorkspaceFolders(() => this.onDidChangeWorkspaceFolders()));

		// Lifecycle
		this.lifecycleService.onShutdown(this.dispose, this);
	}

	private onDidChangeWorkspaceFolders(): void {
		this.updateOptions({ encodingOverride: this.getEncodingOverrides() });
	}

	private getEncodingOverrides(): IEncodingOverride[] {
		const encodingOverride: IEncodingOverride[] = [];
		encodingOverride.push({ resource: uri.file(this.environmentService.appSettingsHome), encoding: encoding.UTF8 });
		this.contextService.getWorkspace().folders.forEach(folder => {
			encodingOverride.push({ resource: uri.file(paths.join(folder.uri.fsPath, '.vscode')), encoding: encoding.UTF8 });
		});

		return encodingOverride;
	}

	private onConfigurationChange(event: IConfigurationChangeEvent): void {
		if (event.affectsConfiguration('files.useExperimentalFileWatcher')) {
			this.updateOptions({ useExperimentalFileWatcher: this.configurationService.getValue<boolean>('files.useExperimentalFileWatcher') });
		}
	}

	public updateOptions(options: object): void {
		this.raw.updateOptions(options);
	}

	public resolveFile(resource: uri, options?: IResolveFileOptions): TPromise<IFileStat> {
		return this.raw.resolveFile(resource, options);
	}

	public resolveFiles(toResolve: { resource: uri, options?: IResolveFileOptions }[]): TPromise<IResolveFileResult[]> {
		return this.raw.resolveFiles(toResolve);
	}

	public existsFile(resource: uri): TPromise<boolean> {
		return this.raw.existsFile(resource);
	}

	public resolveContent(resource: uri, options?: IResolveContentOptions): TPromise<IContent> {
		return this.raw.resolveContent(resource, options);
	}

	public resolveStreamContent(resource: uri, options?: IResolveContentOptions): TPromise<IStreamContent> {
		return this.raw.resolveStreamContent(resource, options);
	}

	public updateContent(resource: uri, value: string | ITextSnapshot, options?: IUpdateContentOptions): TPromise<IFileStat> {
		return this.raw.updateContent(resource, value, options);
	}

	public moveFile(source: uri, target: uri, overwrite?: boolean): TPromise<IFileStat> {
		return this.raw.moveFile(source, target, overwrite);
	}

	public copyFile(source: uri, target: uri, overwrite?: boolean): TPromise<IFileStat> {
		return this.raw.copyFile(source, target, overwrite);
	}

	public createFile(resource: uri, content?: string, options?: ICreateFileOptions): TPromise<IFileStat> {
		return this.raw.createFile(resource, content, options);
	}

	public createFolder(resource: uri): TPromise<IFileStat> {
		return this.raw.createFolder(resource);
	}

	public touchFile(resource: uri): TPromise<IFileStat> {
		return this.raw.touchFile(resource);
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
		const absolutePath = resource.fsPath;
		const result = shell.moveItemToTrash(absolutePath);
		if (!result) {
			return TPromise.wrapError<void>(new Error(isWindows ? nls.localize('binFailed', "Failed to move '{0}' to the recycle bin", paths.basename(absolutePath)) : nls.localize('trashFailed', "Failed to move '{0}' to the trash", paths.basename(absolutePath))));
		}

		this._onAfterOperation.fire(new FileOperationEvent(resource, FileOperation.DELETE));

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

		if (resource.scheme !== Schemas.file) {
			return; // only support files
		}

		// return early if the resource is inside the workspace for which we have another watcher in place
		if (this.contextService.isInsideWorkspace(resource)) {
			return;
		}

		this.raw.watchFileChanges(resource);
	}

	public unwatchFileChanges(resource: uri): void {
		this.raw.unwatchFileChanges(resource);
	}

	public getEncoding(resource: uri, preferredEncoding?: string): string {
		return this.raw.getEncoding(resource, preferredEncoding);
	}

	public dispose(): void {
		this.toUnbind = dispose(this.toUnbind);

		// Dispose service
		this.raw.dispose();
	}
}
