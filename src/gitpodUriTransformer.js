/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Typefox. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

const path = require('path');
const { userDataDir } = require('./gitpodPaths');

/** @type {(remoteAuthority: string) => import('./vs/base/common/uriIpc').IRawURITransformer} */
module.exports = (remoteAuthority) => {
	return {
		/** @param {import('./vs/base/common/uri').UriComponents} uri */
		transformIncoming: uri => {
			if (uri.scheme === 'vscode-remote') {
				if (uri.path.startsWith('/gitpod-user-data')) {
					const resourcePath = uri.path.substring('/gitpod-user-data'.length);
					return {
						scheme: 'file',
						path: path.join(userDataDir, resourcePath)
					};
				}
				if (uri.path.startsWith('/gitpod-folder')) {
					const resourcePath = uri.path.substring('/gitpod-folder'.length);
					if (process.env.GITPOD_CODE_FOLDER) {
						return {
							scheme: 'file',
							path: path.join(process.env.GITPOD_CODE_FOLDER, resourcePath)
						};
					}
					throw new Error('process.env.GITPOD_CODE_FOLDER is not defined, cannot transform an incoming path: "' + uri.path + '".');
				}
				if (uri.path.startsWith('/vscode-resource')) {
					// webview resources
					return {
						scheme: 'file',
						path: JSON.parse(uri.query).requestResourcePath
					};
				}
				return {
					scheme: 'file',
					path: uri.path
				};
			}
			if (uri.scheme === 'file') {
				return {
					scheme: 'vscode-local',
					path: uri.path
				};
			}
			return uri;
		},
		transformOutgoing: uri => {
			if (uri.scheme === 'file') {
				return {
					scheme: 'vscode-remote',
					authority: remoteAuthority,
					path: uri.path
				};
			}
			if (uri.scheme === 'vscode-local') {
				return {
					scheme: 'file',
					path: uri.path
				};
			}
			return uri;
		},
		transformOutgoingScheme: scheme => {
			if (scheme === 'file') {
				return 'vscode-remote';
			}
			if (scheme === 'vscode-local') {
				return 'file';
			}
			return scheme;
		}
	};
};
