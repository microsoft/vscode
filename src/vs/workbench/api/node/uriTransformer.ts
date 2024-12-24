/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriParts, IRawURITransformer, URITransformer, IURITransformer } from '../../../base/common/uriIpc.js';

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
function createRawURITransformer(remoteAuthority: string): IRawURITransformer {
	return {
		transformIncoming: (uri: UriParts): UriParts => {
			if (uri.scheme === 'vscode-remote') {
				return { scheme: 'file', path: uri.path, query: uri.query, fragment: uri.fragment };
			}
			if (uri.scheme === 'file') {
				return { scheme: 'vscode-local', path: uri.path, query: uri.query, fragment: uri.fragment };
			}
			return uri;
		},
		transformOutgoing: (uri: UriParts): UriParts => {
			if (uri.scheme === 'file') {
				return { scheme: 'vscode-remote', authority: remoteAuthority, path: uri.path, query: uri.query, fragment: uri.fragment };
			}
			if (uri.scheme === 'vscode-local') {
				return { scheme: 'file', path: uri.path, query: uri.query, fragment: uri.fragment };
			}
			return uri;
		},
		transformOutgoingScheme: (scheme: string): string => {
			if (scheme === 'file') {
				return 'vscode-remote';
			} else if (scheme === 'vscode-local') {
				return 'file';
			}
			return scheme;
		}
	};
}

export function createURITransformer(remoteAuthority: string): IURITransformer {
	return new URITransformer(createRawURITransformer(remoteAuthority));
}
