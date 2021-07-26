/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// In a bit of a hack, this file is stored in two places
// - src/node/uri_transformer.ts
// - lib/vscode/src/vs/server/uriTransformer.ts

import { IRawURITransformer, UriParts } from 'vs/base/common/uriIpc'

// The reason for this is that we need a CommonJS-compiled
// version of this file to supply as a command line argument
// to extensionHostProcessSetup.ts; but we also need to include
// it ourselves cleanly in `lib/vscode/src/vs/server`.

// @oxy: Could not figure out how to compile as a CommonJS module
// in the same tree as VSCode, which is why I came up with the solution
// of storing it in two places.

class RawURITransformer implements IRawURITransformer {
	constructor(private readonly authority: string) { }

	transformIncoming(uri: UriParts): UriParts {
		switch (uri.scheme) {
			case "vscode-remote":
				return { scheme: "file", path: uri.path }
			default:
				return uri
		}
	}

	transformOutgoing(uri: UriParts): UriParts {
		switch (uri.scheme) {
			case "file":
				return { scheme: "vscode-remote", authority: this.authority, path: uri.path }
			default:
				return uri
		}
	}

	transformOutgoingScheme(scheme: string): string {
		switch (scheme) {
			case "file":
				return "vscode-remote"
			default:
				return scheme
		}
	}
}

// Using `export =` is deliberate.
// See lib/vscode/src/vs/workbench/services/extensions/node/extensionHostProcessSetup.ts;
// they include the file directly with a node require and expect a function as `module.exports`.
// `export =` in TypeScript is equivalent to `module.exports =` in vanilla JS.
export = function rawURITransformerFactory(authority: string) {
	return new RawURITransformer(authority)
}
