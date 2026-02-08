/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import * as resources from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';

/**
 * Resolve file links of the shape `file://./relativeFile.txt` against the model URI.
 */
export function resolveRelativeFileLink(uri: string | URI, modelUri: URI): string | URI {
	if (typeof uri !== 'string' || modelUri.scheme !== Schemas.file || !uri.startsWith(`${Schemas.file}:`)) {
		return uri;
	}

	const parsedUri = URI.parse(uri);
	if (parsedUri.scheme !== Schemas.file) {
		return uri;
	}

	const fsPath = resources.originalFSPath(parsedUri);

	let relativePath: string | null = null;
	if (fsPath.startsWith('/./') || fsPath.startsWith('\\.\\')) {
		relativePath = `.${fsPath.substr(1)}`;
	} else if (fsPath.startsWith('//./') || fsPath.startsWith('\\\\.\\')) {
		relativePath = `.${fsPath.substr(2)}`;
	}

	if (!relativePath) {
		return uri;
	}

	return resources.joinPath(modelUri, relativePath).with({
		query: parsedUri.query,
		fragment: parsedUri.fragment
	});
}
