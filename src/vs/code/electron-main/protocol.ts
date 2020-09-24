/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { LocalFileAccess, Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { session } from 'electron';
import { ILogService } from 'vs/platform/log/common/log';
import { coalesce } from 'vs/base/common/arrays';
import { extUriBiasedIgnorePathCase } from 'vs/base/common/resources';

type ProtocolCallback = { (result: string | Electron.FilePathWithHeaders | { error: number }): void };

export class FileProtocolHandler extends Disposable {

	constructor(
		environmentService: INativeEnvironmentService,
		private readonly logService: ILogService
	) {
		super();

		const { defaultSession } = session;

		// Define a set of roots we allow loading from
		const validRoots = coalesce([
			URI.file(environmentService.appRoot),
			environmentService.extensionsPath ? URI.file(environmentService.extensionsPath) : undefined
		]);

		// Register vscode-file:// handler
		defaultSession.protocol.registerFileProtocol(Schemas.vscodeFileResource, (request, callback) => this.handleResourceRequest(request, validRoots, callback as unknown as ProtocolCallback));

		// Block any file:// access
		defaultSession.protocol.interceptFileProtocol(Schemas.file, (request, callback) => this.handleFileRequest(request, callback as unknown as ProtocolCallback));

		// Cleanup
		this._register(toDisposable(() => {
			defaultSession.protocol.unregisterProtocol(Schemas.vscodeFileResource);
			defaultSession.protocol.uninterceptProtocol(Schemas.file);
		}));
	}

	private async handleFileRequest(request: Electron.Request, callback: ProtocolCallback) {
		const uri = URI.parse(request.url);

		this.logService.error(`Refused to load resource ${uri.fsPath} from ${Schemas.file}: protocol`);
		callback({ error: -3 /* ABORTED */ });
	}

	private async handleResourceRequest(request: Electron.Request, validRoots: URI[], callback: ProtocolCallback) {
		const uri = URI.parse(request.url);

		// Restore the `vscode-file` URI to a `file` URI so that we can
		// ensure the root is valid and properly tell Chrome where the
		// resource is at.
		const restoredUri = LocalFileAccess.restore(uri, false /* includeQuery */);
		if (validRoots.some(validRoot => extUriBiasedIgnorePathCase.isEqualOrParent(restoredUri, validRoot))) {
			return callback({
				path: restoredUri.fsPath
			});
		}

		this.logService.error(`${Schemas.vscodeFileResource}: Refused to load resource ${restoredUri.fsPath}}`);
		callback({ error: -3 /* ABORTED */ });
	}
}
