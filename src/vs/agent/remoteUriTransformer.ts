/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';
import { IURITransformer } from 'vs/base/common/uriIpc';

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
	return new class implements IURITransformer {
		transformIncoming(uri: UriComponents): UriComponents {
			if (uri.scheme === 'vscode-remote') {
				return toJSON(URI.from({ scheme: 'file', path: uri.path }));
			}
			if (uri.scheme === 'file') {
				return toJSON(URI.from({ scheme: 'vscode-local', path: uri.path }));
			}
			return uri;
		}

		transformOutgoing(uri: UriComponents): UriComponents {
			if (uri.scheme === 'file') {
				return toJSON(URI.from({ scheme: 'vscode-remote', authority: remoteAuthority, path: uri.path }));
			}
			if (uri.scheme === 'vscode-local') {
				return toJSON(URI.from({ scheme: 'file', path: uri.path }));
			}
			return uri;
		}

		transformOutgoingURI(uri: URI): URI {
			if (uri.scheme === 'file') {
				return URI.from({ scheme: 'vscode-remote', authority: remoteAuthority, path: uri.path });
			}
			if (uri.scheme === 'vscode-local') {
				return URI.from({ scheme: 'file', path: uri.path });
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
}

function toJSON(uri: URI): UriComponents {
	return <UriComponents><any>uri.toJSON();
}
