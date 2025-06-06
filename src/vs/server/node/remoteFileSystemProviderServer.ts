/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../base/common/event.js';
import { URI, UriComponents } from '../../base/common/uri.js';
import { IURITransformer } from '../../base/common/uriIpc.js';
import { IFileChange } from '../../platform/files/common/files.js';
import { ILogService } from '../../platform/log/common/log.js';
import { createURITransformer } from '../../workbench/api/node/uriTransformer.js';
import { RemoteAgentConnectionContext } from '../../platform/remote/common/remoteAgentEnvironment.js';
import { DiskFileSystemProvider } from '../../platform/files/node/diskFileSystemProvider.js';
import { posix, delimiter } from '../../base/common/path.js';
import { IServerEnvironmentService } from './serverEnvironmentService.js';
import { AbstractDiskFileSystemProviderChannel, AbstractSessionFileWatcher, ISessionFileWatcher } from '../../platform/files/node/diskFileSystemProviderServer.js';
import { IRecursiveWatcherOptions } from '../../platform/files/common/watcher.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';

export class RemoteAgentFileSystemProviderChannel extends AbstractDiskFileSystemProviderChannel<RemoteAgentConnectionContext> {

	private readonly uriTransformerCache = new Map<string, IURITransformer>();

	constructor(
		logService: ILogService,
		private readonly environmentService: IServerEnvironmentService,
		private readonly configurationService: IConfigurationService
	) {
		super(new DiskFileSystemProvider(logService), logService);

		this._register(this.provider);
	}

	protected override getUriTransformer(ctx: RemoteAgentConnectionContext): IURITransformer {
		let transformer = this.uriTransformerCache.get(ctx.remoteAuthority);
		if (!transformer) {
			transformer = createURITransformer(ctx.remoteAuthority);
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
		return new SessionFileWatcher(uriTransformer, emitter, this.logService, this.environmentService, this.configurationService);
	}

	//#endregion
}

class SessionFileWatcher extends AbstractSessionFileWatcher {

	constructor(
		uriTransformer: IURITransformer,
		sessionEmitter: Emitter<IFileChange[] | string>,
		logService: ILogService,
		environmentService: IServerEnvironmentService,
		configurationService: IConfigurationService
	) {
		super(uriTransformer, sessionEmitter, logService, environmentService);
	}

	protected override getRecursiveWatcherOptions(environmentService: IServerEnvironmentService): IRecursiveWatcherOptions | undefined {
		const fileWatcherPolling = environmentService.args['file-watcher-polling'];
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

	protected override getExtraExcludes(environmentService: IServerEnvironmentService): string[] | undefined {
		if (environmentService.extensionsPath) {
			// when opening the $HOME folder, we end up watching the extension folder
			// so simply exclude watching the extensions folder
			return [posix.join(environmentService.extensionsPath, '**')];
		}

		return undefined;
	}
}
