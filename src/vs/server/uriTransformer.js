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
 * @typedef { import('../base/common/uriIpc').IRawURITransformer } IRawURITransformer
 * @typedef { import('../base/common/uriIpc').UriParts } UriParts
 * @typedef { import('../base/common/uri').UriComponents } UriComponents
 * @param {string} remoteAuthority
 * @returns {IRawURITransformer}
 */
module.exports = function(remoteAuthority) {
	return {
		/**
		 * @param {UriParts} uri
		 * @returns {UriParts}
		 */
		transformIncoming: (uri) => {
			if (uri.scheme === 'vscode-remote') {
				return { scheme: 'file', path: uri.path, query: uri.query, fragment: uri.fragment };
			}
			if (uri.scheme === 'file') {
				return { scheme: 'vscode-local', path: uri.path, query: uri.query, fragment: uri.fragment };
			}
			return uri;
		},
		/**
		 * @param {UriParts} uri
		 * @returns {UriParts}
		 */
		transformOutgoing: (uri) => {
			if (uri.scheme === 'file') {
				return { scheme: 'vscode-remote', authority: remoteAuthority, path: uri.path, query: uri.query, fragment: uri.fragment };
			}
			if (uri.scheme === 'vscode-local') {
				return { scheme: 'file', path: uri.path, query: uri.query, fragment: uri.fragment };
			}
			return uri;
		},
		/**
		 * @param {string} scheme
		 * @returns {string}
		 */
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
