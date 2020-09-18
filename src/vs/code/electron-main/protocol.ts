/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IEnvironmentService, INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { session } from 'electron';

export class FileProtocolHandler extends Disposable {

	constructor(
		@IEnvironmentService private readonly environmentService: INativeEnvironmentService
	) {
		super();

		const { defaultSession } = session;

		defaultSession.protocol.registerFileProtocol(
			Schemas.vscodeFileResource,
			(request, callback) => this.handleResourceRequest(request, callback));

		defaultSession.protocol.interceptFileProtocol('file', (request: Electron.Request, callback: any) => {
			const uri = URI.parse(request.url);
			console.error(`Refused to load resource ${uri.path} from file: protocol`);
			callback({ error: -3 /* ABORTED */ });
		});

		this._register(toDisposable(() => {
			defaultSession.protocol.unregisterProtocol(Schemas.vscodeFileResource);
		}));
	}

	private async handleResourceRequest(
		request: Electron.Request,
		callback: any) {
		const uri = URI.parse(request.url);
		const appRoot = this.environmentService.appRoot;
		const extensionsPath = this.environmentService.extensionsPath;
		if (uri.path.startsWith(appRoot) ||
			(extensionsPath && uri.path.startsWith(extensionsPath))) {
			return callback({
				path: decodeURIComponent(uri.path)
			});
		}
		console.error(`vscode-file: Refused to load resource ${uri.path}`);
		callback({ error: -3 /* ABORTED */ });
	}
}
