/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

/**
 * ```
 * --------------------------------
 * |    UI SIDE    |  AGENT SIDE  |
 * |---------------|--------------|
 * | vscode-remote | file         |
 * | file          | vscode-local |
 * --------------------------------
 * ```
 */
module.exports = function(remoteAuthority) {
	return {
		transformIncoming: (uri) => {
			if (uri.scheme === 'vscode-remote') {
				return { scheme: 'file', path: uri.path };
			}
			if (uri.scheme === 'file') {
				return { scheme: 'vscode-local', path: uri.path };
			}
			return uri;
		},

		transformOutgoing: (uri) => {
			if (uri.scheme === 'file') {
				return { scheme: 'vscode-remote', authority: remoteAuthority, path: uri.path };
			}
			if (uri.scheme === 'vscode-local') {
				return { scheme: 'file', path: uri.path };
			}
			return uri;
		},

		transformOutgoingScheme: (scheme) => {
			if (scheme === 'file') {
				return 'vscode-remote';
			} else if (scheme === 'vscode-local') {
				return 'file';
			}
			return scheme;
		}
	};
};
