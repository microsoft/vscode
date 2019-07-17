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
	const normalizedPath = requestUri.with({
		scheme: 'file',
		fragment: '',
		query: '',
	});

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
					requestResourcePath: requestUri.path
				})
			});
			return resolveContent(fileService, redirectedUri, getWebviewContentMimeType(requestUri));
		} else {
			return resolveContent(fileService, normalizedPath, getWebviewContentMimeType(normalizedPath));
		}
	}

	return AccessDenied;
}

function containsResource(root: URI, resource: URI): boolean {
	const rootPath = root.fsPath + (endsWith(root.fsPath, sep) ? '' : sep);
	return startsWith(resource.fsPath, rootPath);
}
