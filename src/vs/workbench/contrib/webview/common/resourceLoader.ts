/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { sep } from 'vs/base/common/path';
import { startsWith, endsWith } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';
import { getWebviewContentMimeType } from 'vs/workbench/contrib/webview/common/mimeTypes';

export const WebviewResourceScheme = 'vscode-resource';

class Success {
	readonly type = 'success';

	constructor(
		public readonly data: VSBuffer,
		public readonly mimeType: string
	) { }
}

const Failed = new class { readonly type = 'failed'; };
const AccessDenied = new class { readonly type = 'access-denied'; };

type LocalResourceResponse = Success | typeof Failed | typeof AccessDenied;

async function resolveContent(
	fileService: IFileService,
	resource: URI,
	mime: string
): Promise<LocalResourceResponse> {
	try {
		const contents = await fileService.readFile(resource);
		return new Success(contents.value, mime);
	} catch (err) {
		console.log(err);
		return Failed;
	}
}

export async function loadLocalResource(
	requestUri: URI,
	fileService: IFileService,
	extensionLocation: URI | undefined,
	getRoots: () => ReadonlyArray<URI>
): Promise<LocalResourceResponse> {
	const normalizedPath = normalizeRequestPath(requestUri);

	for (const root of getRoots()) {
		if (!containsResource(root, normalizedPath)) {
			continue;
		}

		if (extensionLocation && extensionLocation.scheme === REMOTE_HOST_SCHEME) {
			const redirectedUri = URI.from({
				scheme: REMOTE_HOST_SCHEME,
				authority: extensionLocation.authority,
				path: '/vscode-resource',
				query: JSON.stringify({
					requestResourcePath: normalizedPath.path
				})
			});
			return resolveContent(fileService, redirectedUri, getWebviewContentMimeType(requestUri));
		} else {
			return resolveContent(fileService, normalizedPath, getWebviewContentMimeType(normalizedPath));
		}
	}

	return AccessDenied;
}

function normalizeRequestPath(requestUri: URI) {
	if (requestUri.scheme !== WebviewResourceScheme) {
		return requestUri;
	}

	// Modern vscode-resources uris put the scheme of the requested resource as the authority
	if (requestUri.authority) {
		return URI.parse(requestUri.authority + ':' + requestUri.path);
	}

	// Old style vscode-resource uris lose the scheme of the resource which means they are unable to
	// load a mix of local and remote content properly.
	return requestUri.with({ scheme: 'file' });
}

function containsResource(root: URI, resource: URI): boolean {
	const rootPath = root.fsPath + (endsWith(root.fsPath, sep) ? '' : sep);
	return startsWith(resource.fsPath, rootPath);
}
