/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRawURITransformer, UriParts, URITransformer } from 'vs/base/common/uriIpc';

class RawURITransformer implements IRawURITransformer {
	constructor(private readonly authority: string) { }

	transformIncoming(uri: UriParts): UriParts {
		switch (uri.scheme) {
			case 'vscode-remote':
				return { scheme: 'file', path: uri.path };
			default:
				return uri;
		}
	}

	transformOutgoing(uri: UriParts): UriParts {
		switch (uri.scheme) {
			case 'file':
				return { scheme: 'vscode-remote', authority: this.authority, path: uri.path };
			default:
				return uri;
		}
	}

	transformOutgoingScheme(scheme: string): string {
		switch (scheme) {
			case 'file':
				return 'vscode-remote';
			default:
				return scheme;
		}
	}
}

/**
 * Convenience function, given that a server's raw URI transformer is often wrapped
 * by VSCode's `URITransformer`.
 */
export function createServerURITransformer(authority: string) {
	return new URITransformer(new RawURITransformer(authority));
}
