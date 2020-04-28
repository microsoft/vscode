/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPath, win32, posix } from 'vs/base/common/path';
import { OperatingSystem, OS } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

export const IPathService = createDecorator<IPathService>('path');

/**
 * Provides access to path related properties that will match the
 * environment. If the environment is connected to a remote, the
 * path properties will match that of the remotes operating system.
 */
export interface IPathService {

	_serviceBrand: undefined;

	/**
	 * The correct path library to use for the target environment. If
	 * the environment is connected to a remote, this will be the
	 * path library of the remote file system. Otherwise it will be
	 * the local file system's path library depending on the OS.
	 */
	readonly path: Promise<IPath>;

	/**
	 * Converts the given path to a file URI to use for the target
	 * environment. If the environment is connected to a remote, it
	 * will use the path separators according to the remote file
	 * system. Otherwise it will use the local file system's path
	 * separators.
	 */
	fileURI(path: string): Promise<URI>;

	/**
	 * Resolves the user-home directory for the target environment.
	 * If the envrionment is connected to a remote, this will be the
	 * remote's user home directory, otherwise the local one.
	 */
	readonly userHome: Promise<URI>;

	/**
	 * Access to `userHome` in a sync fashion. This may be `undefined`
	 * as long as the remote environment was not resolved.
	 */
	readonly resolvedUserHome: URI | undefined;
}

export abstract class AbstractPathService implements IPathService {

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
