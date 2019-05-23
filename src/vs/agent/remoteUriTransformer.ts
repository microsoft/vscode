/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRawURITransformer, UriParts, URITransformer, IURITransformer } from 'vs/base/common/uriIpc';

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
export function createRemoteURITransformer(remoteAuthority: string): IURITransformer {
	const uriTransfomer = new class implements IRawURITransformer {
		transformIncoming(uri: UriParts): UriParts {
			if (uri.scheme === 'vscode-remote') {
				return { scheme: 'file', path: uri.path };
			}
			if (uri.scheme === 'file') {
				return { scheme: 'vscode-local', path: uri.path };
			}
			return uri;
		}

		transformOutgoing(uri: UriParts): UriParts {
			if (uri.scheme === 'file') {
				return { scheme: 'vscode-remote', authority: remoteAuthority, path: uri.path };
			}
			if (uri.scheme === 'vscode-local') {
				return { scheme: 'file', path: uri.path };
			}
			return uri;
		}

		transformOutgoingScheme(scheme: string): string {
			if (scheme === 'file') {
				return 'vscode-remote';
			} else if (scheme === 'vscode-local') {
				return 'file';
			}
			return scheme;
		}
	};

	return new URITransformer(uriTransfomer);
}
