/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable, dispose } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IURITransformer } from 'vs/base/common/uriIpc';
import { IFileChange, IWatchOptions } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { createRemoteURITransformer } from 'vs/server/remoteUriTransformer';
import { RemoteAgentConnectionContext } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { DiskFileSystemProvider, IWatcherOptions } from 'vs/platform/files/node/diskFileSystemProvider';
import { posix, delimiter } from 'vs/base/common/path';
import { IServerEnvironmentService } from 'vs/server/serverEnvironmentService';
import { AbstractDiskFileSystemProviderChannel, ISessionFileWatcher } from 'vs/platform/files/node/diskFileSystemProviderIpc';

export class RemoteAgentFileSystemProviderChannel extends AbstractDiskFileSystemProviderChannel<RemoteAgentConnectionContext> {

	private readonly uriTransformerCache = new Map<string, IURITransformer>();

	constructor(
		logService: ILogService,
		private readonly environmentService: IServerEnvironmentService
	) {
		super(new DiskFileSystemProvider(logService), logService);

		this._register(this.provider);
	}

	protected override getUriTransformer(ctx: RemoteAgentConnectionContext): IURITransformer {
		let transformer = this.uriTransformerCache.get(ctx.remoteAuthority);
		if (!transformer) {
			transformer = createRemoteURITransformer(ctx.remoteAuthority);
			this.uriTransformerCache.set(ctx.remoteAuthority, transformer);
		}

		return transformer;
	}

	protected override transformIncoming(uriTransformer: IURITransformer, _resource: UriComponents, supportVSCodeResource = false): URI {
		if (supportVSCodeResource && _resource.path === '/vscode-resource' && _resource.query) {
			const requestResourcePath = JSON.parse(_resource.query).requestResourcePath;

			return URI.from({ scheme: 'file', path: requestResourcePath });
		}

		return URI.revive(uriTransformer.transformIncoming(_resource));
	}

	//#region File Watching

	protected createSessionFileWatcher(uriTransformer: IURITransformer, emitter: Emitter<IFileChange[] | string>): ISessionFileWatcher {
		return new SessionFileWatcher(uriTransformer, emitter, this.logService, this.environmentService);
	}

	//#endregion
}

class SessionFileWatcher extends Disposable implements ISessionFileWatcher {

	private readonly watcherRequests = new Map<number, IDisposable>();
	private readonly fileWatcher = this._register(new DiskFileSystemProvider(this.logService, { watcher: this.getWatcherOptions() }));

	constructor(
		private readonly uriTransformer: IURITransformer,
		sessionEmitter: Emitter<IFileChange[] | string>,
		private readonly logService: ILogService,
		private readonly environmentService: IServerEnvironmentService
	) {
		super();

		this.registerListeners(sessionEmitter);
	}

	private registerListeners(sessionEmitter: Emitter<IFileChange[] | string>): void {
		const localChangeEmitter = this._register(new Emitter<readonly IFileChange[]>());

		this._register(localChangeEmitter.event((events) => {
			sessionEmitter.fire(
				events.map(e => ({
					resource: this.uriTransformer.transformOutgoingURI(e.resource),
					type: e.type
				}))
			);
		}));

		this._register(this.fileWatcher.onDidChangeFile(events => localChangeEmitter.fire(events)));
		this._register(this.fileWatcher.onDidErrorOccur(error => sessionEmitter.fire(error)));
	}

	private getWatcherOptions(): IWatcherOptions | undefined {
		const fileWatcherPolling = this.environmentService.args['fileWatcherPolling'];
		if (fileWatcherPolling) {
			const segments = fileWatcherPolling.split(delimiter);
			const pollingInterval = Number(segments[0]);
			if (pollingInterval > 0) {
				const usePolling = segments.length > 1 ? segments.slice(1) : true;
				return { usePolling, pollingInterval };
			}
		}

		return undefined;
	}

	watch(req: number, resource: URI, opts: IWatchOptions): IDisposable {
		if (this.environmentService.extensionsPath) {
			// when opening the $HOME folder, we end up watching the extension folder
			// so simply exclude watching the extensions folder
			opts.excludes = [...(opts.excludes || []), posix.join(this.environmentService.extensionsPath, '**')];
		}

		this.watcherRequests.set(req, this.fileWatcher.watch(resource, opts));

		return toDisposable(() => {
			dispose(this.watcherRequests.get(req));
			this.watcherRequests.delete(req);
		});
	}

	override dispose(): void {
		super.dispose();

		this.watcherRequests.forEach(disposable => dispose(disposable));
		this.watcherRequests.clear();
	}
}
