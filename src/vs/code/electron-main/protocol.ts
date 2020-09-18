/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { session } from 'electron';
import { ILogService } from 'vs/platform/log/common/log';

export class FileProtocolHandler extends Disposable {

	constructor(
		private readonly environmentService: INativeEnvironmentService,
		private readonly logService: ILogService
	) {
		super();

		const { defaultSession } = session;

		// Register vscode-file:// handler
		defaultSession.protocol.registerFileProtocol(
			Schemas.vscodeFileResource,
			(request, callback) => this.handleResourceRequest(request, callback));

		// Block any file:// access
		defaultSession.protocol.interceptFileProtocol(Schemas.file, (request, callback: any /* TODO@deepak TODO@electron electron typing */) => {
			const uri = URI.parse(request.url);
			this.logService.error(`Refused to load resource ${uri.fsPath} from ${Schemas.file}: protocol`);
			callback({ error: -3 /* ABORTED */ });
		});

		this._register(toDisposable(() => {
			defaultSession.protocol.unregisterProtocol(Schemas.vscodeFileResource);
		}));
	}

	private async handleResourceRequest(
		request: Electron.Request,
		callback: any /* TODO@deepak TODO@electron electron typing */) {
		const uri = URI.parse(request.url);
		const appRoot = this.environmentService.appRoot;
		const extensionsPath = this.environmentService.extensionsPath;
		if (uri.path.startsWith(appRoot) ||
			(extensionsPath && uri.path.startsWith(extensionsPath))) {
			return callback({
				path: decodeURIComponent(uri.path)
			});
		}
		this.logService.error(`${Schemas.vscodeFileResource}: Refused to load resource ${uri.path}`);
		callback({ error: -3 /* ABORTED */ });
	}
}
