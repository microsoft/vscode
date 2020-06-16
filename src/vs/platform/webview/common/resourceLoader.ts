/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer, VSBufferReadableStream } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { isUNC } from 'vs/base/common/extpath';
import { Schemas } from 'vs/base/common/network';
import { sep } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { IRemoteConnectionData } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';
import { IRequestService } from 'vs/platform/request/common/request';
import { getWebviewContentMimeType } from 'vs/platform/webview/common/mimeTypes';

export namespace WebviewResourceResponse {
	export enum Type { Success, Failed, AccessDenied }

	export class StreamSuccess {
		readonly type = Type.Success;

		constructor(
			public readonly stream: VSBufferReadableStream,
			public readonly mimeType: string
		) { }
	}

	export class BufferSuccess {
		readonly type = Type.Success;

		constructor(
			public readonly buffer: VSBuffer,
			public readonly mimeType: string
		) { }
	}

	export const Failed = { type: Type.Failed } as const;
	export const AccessDenied = { type: Type.AccessDenied } as const;

	export type BufferResponse = BufferSuccess | typeof Failed | typeof AccessDenied;
	export type StreamResponse = StreamSuccess | typeof Failed | typeof AccessDenied;
}

export async function loadLocalResource(
	requestUri: URI,
	fileService: IFileService,
	extensionLocation: URI | undefined,
	roots: ReadonlyArray<URI>
): Promise<WebviewResourceResponse.BufferResponse> {
	const resourceToLoad = getResourceToLoad(requestUri, extensionLocation, roots);
	if (!resourceToLoad) {
		return WebviewResourceResponse.AccessDenied;
	}

	try {
		const data = await fileService.readFile(resourceToLoad);
		const mime = getWebviewContentMimeType(requestUri); // Use the original path for the mime
		return new WebviewResourceResponse.BufferSuccess(data.value, mime);
	} catch (err) {
		console.log(err);
		return WebviewResourceResponse.Failed;
	}
}

export async function loadLocalResourceStream(
	requestUri: URI,
	options: {
		extensionLocation: URI | undefined;
		roots: ReadonlyArray<URI>;
		remoteConnectionData?: IRemoteConnectionData | null;
	},
	fileService: IFileService,
	requestService: IRequestService,
): Promise<WebviewResourceResponse.StreamResponse> {
	const resourceToLoad = getResourceToLoad(requestUri, options.extensionLocation, options.roots);
	if (!resourceToLoad) {
		return WebviewResourceResponse.AccessDenied;
	}
	const mime = getWebviewContentMimeType(requestUri); // Use the original path for the mime

	if (options.remoteConnectionData) {
		// Remote uris must go to the resolved server.
		if (resourceToLoad.scheme === Schemas.vscodeRemote || (options.extensionLocation?.scheme === REMOTE_HOST_SCHEME)) {
			const uri = URI.parse(`http://${options.remoteConnectionData.host}:${options.remoteConnectionData.port}`).with({
				path: '/vscode-remote-resource',
				query: `tkn=${options.remoteConnectionData.connectionToken}&path=${encodeURIComponent(resourceToLoad.path)}`,
			});

			const response = await requestService.request({ url: uri.toString(true) }, CancellationToken.None);
			if (response.res.statusCode === 200) {
				return new WebviewResourceResponse.StreamSuccess(response.stream, mime);
			}
			return WebviewResourceResponse.Failed;
		}
	}

	try {
		const contents = await fileService.readFileStream(resourceToLoad);
		return new WebviewResourceResponse.StreamSuccess(contents.value, mime);
	} catch (err) {
		console.log(err);
		return WebviewResourceResponse.Failed;
	}
}

function getResourceToLoad(
	requestUri: URI,
	extensionLocation: URI | undefined,
	roots: ReadonlyArray<URI>
): URI | undefined {
	const normalizedPath = normalizeRequestPath(requestUri);

	for (const root of roots) {
		if (containsResource(root, normalizedPath)) {
			return normalizedPath;
		}
	}

	return undefined;
}

function normalizeRequestPath(requestUri: URI) {
	if (requestUri.scheme === Schemas.vscodeWebviewResource) {
		// The `vscode-webview-resource` scheme has the following format:
		//
		// vscode-webview-resource://id/scheme//authority?/path
		//
		const resourceUri = URI.parse(requestUri.path.replace(/^\/([a-z0-9\-]+)\/{1,2}/i, '$1://'));

		return resourceUri.with({
			query: requestUri.query,
			fragment: requestUri.fragment
		});
	} else {
		return requestUri;
	}
}

function containsResource(root: URI, resource: URI): boolean {
	let rootPath = root.fsPath + (root.fsPath.endsWith(sep) ? '' : sep);
	let resourceFsPath = resource.fsPath;

	if (isUNC(root.fsPath) && isUNC(resource.fsPath)) {
		rootPath = rootPath.toLowerCase();
		resourceFsPath = resourceFsPath.toLowerCase();
	}

	return resourceFsPath.startsWith(rootPath);
}
