/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPath, win32, posix } from 'vs/base/common/path';
import { OperatingSystem, OS } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

const REMOTE_PATH_SERVICE_ID = 'remotePath';
export const IRemotePathService = createDecorator<IRemotePathService>(REMOTE_PATH_SERVICE_ID);

export interface IRemotePathService {

	_serviceBrand: undefined;

	/**
	 * The path library to use for the target remote environment.
	 */
	readonly path: Promise<IPath>;

	/**
	 * Converts the given path to a file URI in the remote environment.
	 */
	fileURI(path: string): Promise<URI>;

	/**
	 * Resolves the user home of the remote environment if defined.
	 */
	readonly userHome: Promise<URI>;

	/**
	 * Provides access to the user home of the remote environment
	 * if defined. The variable will be `undefined` as long as the
	 * remote environment has not been resolved yet.
	 */
	readonly resolvedUserHome: URI | undefined;
}

/**
 * Provides the correct IPath implementation for dealing with paths that refer to locations in the extension host
 */
export abstract class AbstractRemotePathService implements IRemotePathService {

	_serviceBrand: undefined;

	private remoteOS: Promise<OperatingSystem>;

	private resolveUserHome: Promise<URI>;
	private maybeUnresolvedUserHome: URI | undefined;

	constructor(
		fallbackUserHome: () => URI,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService
	) {
		this.remoteOS = this.remoteAgentService.getEnvironment().then(env => env?.os || OS);

		this.resolveUserHome = this.remoteAgentService.getEnvironment().then(env => {
			const userHome = this.maybeUnresolvedUserHome = env?.userHome || fallbackUserHome();

			return userHome;
		});
	}

	get userHome(): Promise<URI> {
		return this.resolveUserHome;
	}

	get resolvedUserHome(): URI | undefined {
		return this.maybeUnresolvedUserHome;
	}

	get path(): Promise<IPath> {
		return this.remoteOS.then(os => {
			return os === OperatingSystem.Windows ?
				win32 :
				posix;
		});
	}

	async fileURI(_path: string): Promise<URI> {
		let authority = '';

		// normalize to fwd-slashes on windows,
		// on other systems bwd-slashes are valid
		// filename character, eg /f\oo/ba\r.txt
		if ((await this.remoteOS) === OperatingSystem.Windows) {
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
