/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'vs/base/common/path';
import * as platform from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

const REMOTE_PATH_SERVICE_ID = 'remotePath';
export const IRemotePathService = createDecorator<IRemotePathService>(REMOTE_PATH_SERVICE_ID);

export interface IRemotePathService {
	_serviceBrand: undefined;

	path: Promise<path.IPath>;
	fileURI(path: string): Promise<URI>;
}

/**
 * Provides the correct IPath implementation for dealing with paths that refer to locations in the extension host
 */
export class RemotePathService implements IRemotePathService {
	_serviceBrand: undefined;

	private _extHostOS: Promise<platform.OperatingSystem>;

	constructor(
		@IRemoteAgentService readonly remoteAgentService: IRemoteAgentService
	) {
		this._extHostOS = remoteAgentService.getEnvironment().then(remoteEnvironment => {
			return remoteEnvironment ? remoteEnvironment.os : platform.OS;
		});
	}

	get path(): Promise<path.IPath> {
		return this._extHostOS.then(os => {
			return os === platform.OperatingSystem.Windows ?
				path.win32 :
				path.posix;
		});
	}

	async fileURI(_path: string): Promise<URI> {
		let authority = '';

		// normalize to fwd-slashes on windows,
		// on other systems bwd-slashes are valid
		// filename character, eg /f\oo/ba\r.txt
		if ((await this._extHostOS) === platform.OperatingSystem.Windows) {
			_path = _path.replace(/\\/g, '/');
		}

		// check for authority as used in UNC shares
		// or use the path as given
		if (_path[0] === '/' && _path[1] === '/') {
			const idx = _path.indexOf('/', 2);
			if (idx === -1) {
				authority = _path.substring(2);
				_path = '/';
			} else {
				authority = _path.substring(2, idx);
				_path = _path.substring(idx) || '/';
			}
		}

		// return new _URI('file', authority, path, '', '');
		return URI.from({
			scheme: 'file',
			authority,
			path: _path,
			query: '',
			fragment: ''
		});
	}
}

registerSingleton(IRemotePathService, RemotePathService, true);
