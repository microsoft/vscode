/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { shell } from 'electron';
import { localize } from '../../../nls.js';
import { isWindows } from '../../../base/common/platform.js';
import { Emitter } from '../../../base/common/event.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { IFileDeleteOptions, IFileChange, IWatchOptions, createFileSystemProviderError, FileSystemProviderErrorCode } from '../common/files.js';
import { DiskFileSystemProvider } from '../node/diskFileSystemProvider.js';
import { basename, normalize } from '../../../base/common/path.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { AbstractDiskFileSystemProviderChannel, AbstractSessionFileWatcher, ISessionFileWatcher } from '../node/diskFileSystemProviderServer.js';
import { DefaultURITransformer, IURITransformer } from '../../../base/common/uriIpc.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';

export class DiskFileSystemProviderChannel extends AbstractDiskFileSystemProviderChannel<unknown> {

	constructor(
		provider: DiskFileSystemProvider,
		logService: ILogService,
		private readonly environmentService: IEnvironmentService,
		private readonly configurationService: IConfigurationService
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

	protected override async delete(uriTransformer: IURITransformer, _resource: UriComponents, opts: IFileDeleteOptions): Promise<void> {
		if (!opts.useTrash) {
			return super.delete(uriTransformer, _resource, opts);
		}

		const resource = this.transformIncoming(uriTransformer, _resource);
		const filePath = normalize(resource.fsPath);
		try {
			await shell.trashItem(filePath);
		} catch (error) {
			throw createFileSystemProviderError(isWindows ? localize('binFailed', "Failed to move '{0}' to the recycle bin ({1})", basename(filePath), toErrorMessage(error)) : localize('trashFailed', "Failed to move '{0}' to the trash ({1})", basename(filePath), toErrorMessage(error)), FileSystemProviderErrorCode.Unknown);
		}
	}

	//#endregion

	//#region File Watching

	protected createSessionFileWatcher(uriTransformer: IURITransformer, emitter: Emitter<IFileChange[] | string>): ISessionFileWatcher {
		return new SessionFileWatcher(uriTransformer, emitter, this.logService, this.environmentService, this.configurationService);
	}

	//#endregion

}

class SessionFileWatcher extends AbstractSessionFileWatcher {

	override watch(req: number, resource: URI, opts: IWatchOptions): IDisposable {
		if (opts.recursive) {
			throw createFileSystemProviderError('Recursive file watching is not supported from main process for performance reasons.', FileSystemProviderErrorCode.Unavailable);
		}

		return super.watch(req, resource, opts);
	}
}
