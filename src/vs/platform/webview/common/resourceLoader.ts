/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBufferReadableStream } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { isUNC } from 'vs/base/common/extpath';
import { Schemas } from 'vs/base/common/network';
import { sep } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import { ILogService } from 'vs/platform/log/common/log';
import { IRemoteConnectionData } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IRequestService } from 'vs/platform/request/common/request';
import { getWebviewContentMimeType } from 'vs/platform/webview/common/mimeTypes';


export const webviewPartitionId = 'webview';

export namespace WebviewResourceResponse {
	export enum Type { Success, Failed, AccessDenied }

	export class StreamSuccess {
		readonly type = Type.Success;

		constructor(
			public readonly stream: VSBufferReadableStream,
			public readonly etag: string | undefined,
			public readonly mimeType: string,
		) { }
	}

	export const Failed = { type: Type.Failed } as const;
	export const AccessDenied = { type: Type.AccessDenied } as const;

	export type StreamResponse = StreamSuccess | typeof Failed | typeof AccessDenied;
}

interface FileReader {
	readFileStream(resource: URI): Promise<{ stream: VSBufferReadableStream, etag?: string }>;
}

export async function loadLocalResource(
	requestUri: URI,
	options: {
		extensionLocation: URI | undefined;
		roots: ReadonlyArray<URI>;
		remoteConnectionData?: IRemoteConnectionData | null;
		rewriteUri?: (uri: URI) => URI,
	},
	fileReader: FileReader,
	requestService: IRequestService,
	logService: ILogService,
): Promise<WebviewResourceResponse.StreamResponse> {
	logService.debug(`loadLocalResource - being. requestUri=${requestUri}`);

	let resourceToLoad = getResourceToLoad(requestUri, options.roots);

	logService.debug(`loadLocalResource - found resource to load. requestUri=${requestUri}, resourceToLoad=${resourceToLoad}`);

	if (!resourceToLoad) {
		return WebviewResourceResponse.AccessDenied;
	}

	const mime = getWebviewContentMimeType(requestUri); // Use the original path for the mime

	// Perform extra normalization if needed
	if (options.rewriteUri) {
		resourceToLoad = options.rewriteUri(resourceToLoad);
	}

	if (resourceToLoad.scheme === Schemas.http || resourceToLoad.scheme === Schemas.https) {
		const response = await requestService.request({ url: resourceToLoad.toString(true) }, CancellationToken.None);
		logService.debug(`loadLocalResource - Loaded over http(s). requestUri=${requestUri}, response=${response.res.statusCode}`);

		if (response.res.statusCode === 200) {
			return new WebviewResourceResponse.StreamSuccess(response.stream, undefined, mime);
		}
		return WebviewResourceResponse.Failed;
	}

	try {
		const contents = await fileReader.readFileStream(resourceToLoad);
		logService.debug(`loadLocalResource - Loaded using fileReader. requestUri=${requestUri}`);

		return new WebviewResourceResponse.StreamSuccess(contents.stream, contents.etag, mime);
	} catch (err) {
		logService.debug(`loadLocalResource - Error using fileReader. requestUri=${requestUri}`);
		console.log(err);

		return WebviewResourceResponse.Failed;
	}
}

function getResourceToLoad(
	requestUri: URI,
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

		// Encode requestUri.path so that URI.parse can properly parse special characters like '#', '?', etc.
		const resourceUri = URI.parse(encodeURIComponent(requestUri.path).replace(/%2F/gi, '/').replace(/^\/([a-z0-9\-]+)(\/{1,2})/i, (_: string, scheme: string, sep: string) => {
			if (sep.length === 1) {
				return `${scheme}:///`; // Add empty authority.
			} else {
				return `${scheme}://`; // Url has own authority.
			}
		}));
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
