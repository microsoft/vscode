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
import { isUNC } from 'vs/base/common/extpath';

export const WebviewResourceScheme = 'vscode-resource';

export namespace WebviewResourceResponse {
	export enum Type { Success, Failed, AccessDenied }

	export class Success {
		readonly type = Type.Success;

		constructor(
			public readonly data: VSBuffer,
			public readonly mimeType: string
		) { }
	}

	export const Failed = { type: Type.Failed } as const;
	export const AccessDenied = { type: Type.AccessDenied } as const;

	export type Response = Success | typeof Failed | typeof AccessDenied;

}
async function resolveContent(
	fileService: IFileService,
	resource: URI,
	mime: string
): Promise<WebviewResourceResponse.Response> {
	try {
		const contents = await fileService.readFile(resource);
		return new WebviewResourceResponse.Success(contents.value, mime);
	} catch (err) {
		console.log(err);
		return WebviewResourceResponse.Failed;
	}
}

export async function loadLocalResource(
	requestUri: URI,
	fileService: IFileService,
	extensionLocation: URI | undefined,
	getRoots: () => ReadonlyArray<URI>
): Promise<WebviewResourceResponse.Response> {
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

	return WebviewResourceResponse.AccessDenied;
}

function normalizeRequestPath(requestUri: URI) {
	if (requestUri.scheme !== WebviewResourceScheme) {
		return requestUri;
	}

	// Modern vscode-resources uris put the scheme of the requested resource as the authority
	if (requestUri.authority) {
		return URI.parse(`${requestUri.authority}:${encodeURIComponent(requestUri.path).replace(/%2F/g, '/')}`).with({
			query: requestUri.query,
			fragment: requestUri.fragment
		});
	}

	// Old style vscode-resource uris lose the scheme of the resource which means they are unable to
	// load a mix of local and remote content properly.
	return requestUri.with({ scheme: 'file' });
}

function containsResource(root: URI, resource: URI): boolean {
	let rootPath = root.fsPath + (endsWith(root.fsPath, sep) ? '' : sep);
	let resourceFsPath = resource.fsPath;

	if (isUNC(root.fsPath) && isUNC(resource.fsPath)) {
		rootPath = rootPath.toLowerCase();
		resourceFsPath = resourceFsPath.toLowerCase();
	}

	return startsWith(resource.fsPath, rootPath);
}
