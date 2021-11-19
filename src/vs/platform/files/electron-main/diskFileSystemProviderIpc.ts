/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { shell } from 'electron';
import { localize } from 'vs/nls';
import { isWindows } from 'vs/base/common/platform';
import { Emitter } from 'vs/base/common/event';
import { URI, UriComponents } from 'vs/base/common/uri';
import { FileDeleteOptions, IFileChange, IWatchOptions, createFileSystemProviderError, FileSystemProviderErrorCode } from 'vs/platform/files/common/files';
import { FileWatcher as NodeJSWatcherService } from 'vs/platform/files/node/watcher/nodejs/watcherService';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { basename, normalize } from 'vs/base/common/path';
import { Disposable, DisposableStore, dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ILogMessage, toFileChanges } from 'vs/platform/files/common/watcher';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';
import { AbstractDiskFileSystemProviderChannel, ISessionFileWatcher } from 'vs/platform/files/node/diskFileSystemProviderIpc';
import { DefaultURITransformer, IURITransformer } from 'vs/base/common/uriIpc';

/**
 * A server implementation for a IPC based file system provider (see `IPCFileSystemProvider`)
 * client.
 */
export class DiskFileSystemProviderChannel extends AbstractDiskFileSystemProviderChannel<unknown> {

	constructor(
		provider: DiskFileSystemProvider,
		logService: ILogService
	) {
		super(provider, logService);
	}

	protected override getUriTransformer(ctx: unknown): IURITransformer {
		return DefaultURITransformer;
	}

	protected override transformIncoming(uriTransformer: IURITransformer, _resource: UriComponents): URI {
		return URI.revive(_resource);
	}

	//#region Delete: override to support Electron's trash support

	protected override async delete(uriTransformer: IURITransformer, _resource: UriComponents, opts: FileDeleteOptions): Promise<void> {
		if (!opts.useTrash) {
			return super.delete(uriTransformer, _resource, opts);
		}

		const resource = this.transformIncoming(uriTransformer, _resource);
		const filePath = normalize(resource.fsPath);
		try {
			await shell.trashItem(filePath);
		} catch (error) {
			throw createFileSystemProviderError(isWindows ? localize('binFailed', "Failed to move '{0}' to the recycle bin", basename(filePath)) : localize('trashFailed', "Failed to move '{0}' to the trash", basename(filePath)), FileSystemProviderErrorCode.Unknown);
		}
	}

	//#endregion

	//#region File Watching

	protected createSessionFileWatcher(uriTransformer: IURITransformer, emitter: Emitter<IFileChange[] | string>): ISessionFileWatcher {
		return new SessionFileWatcher(emitter, this.logService);
	}

	//#endregion

}

class SessionFileWatcher extends Disposable implements ISessionFileWatcher {

	private readonly watcherRequests = new Map<number /* request ID */, IDisposable>();

	constructor(
		private readonly sessionEmitter: Emitter<IFileChange[] | string>,
		private readonly logService: ILogService
	) {
		super();
	}

	watch(req: number, resource: URI, opts: IWatchOptions): IDisposable {
		if (opts.recursive) {
			throw createFileSystemProviderError('Recursive watcher is not supported from main process', FileSystemProviderErrorCode.Unavailable);
		}

		const disposable = new DisposableStore();

		this.watcherRequests.set(req, disposable);
		disposable.add(toDisposable(() => this.watcherRequests.delete(req)));

		const watcher = disposable.add(new NodeJSWatcherService(
			normalize(resource.fsPath),
			changes => this.sessionEmitter.fire(toFileChanges(changes)),
			msg => this.onWatcherLogMessage(msg),
			this.logService.getLevel() === LogLevel.Trace
		));

		disposable.add(this.logService.onDidChangeLogLevel(() => {
			watcher.setVerboseLogging(this.logService.getLevel() === LogLevel.Trace);
		}));

		return disposable;
	}

	private onWatcherLogMessage(msg: ILogMessage): void {
		if (msg.type === 'error') {
			this.sessionEmitter.fire(msg.message);
		}

		this.logService[msg.type](msg.message);
	}

	override dispose(): void {
		super.dispose();

		this.watcherRequests.forEach(disposable => dispose(disposable));
		this.watcherRequests.clear();
	}
}
