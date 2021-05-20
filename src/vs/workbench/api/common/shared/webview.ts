/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import type * as vscode from 'vscode';

export interface WebviewInitData {
	readonly remote: { readonly authority: string | undefined };
}

/**
 * Location where we load resources from
 *
 * There endpoints can be hardcoded because we never expect to actually hit them. Instead these requests
 * should always go to a service worker.
 */
export const webviewResourceOrigin = (id: string) => `https://${id}.vscode-webview-test.com`;

export const webviewResourceRoot = (id: string) => `${webviewResourceOrigin(id)}/vscode-resource/{{resource}}`;

export const webviewGenericCspSource = 'https://*.vscode-webview-test.com';

/**
 * Construct a uri that can load resources inside a webview
 *
 * We encode the resource component of the uri so that on the main thread
 * we know where to load the resource from (remote or truly local):
 *
 * ```txt
 * scheme/resource-authority/path...
 * ```
 *
 * @param uuid Unique id of the webview.
 * @param resource Uri of the resource to load.
 * @param fromAuthority Optional remote authority that specifies where `resource` should be resolved from.
 */
export function asWebviewUri(
	uuid: string,
	resource: vscode.Uri,
	fromAuthority: string | undefined
): vscode.Uri {
	if (resource.scheme === Schemas.http || resource.scheme === Schemas.https) {
		return resource;
	}

	if (fromAuthority && resource.scheme === Schemas.file) {
		resource = URI.from({
			scheme: Schemas.vscodeRemote,
			authority: fromAuthority,
			path: resource.path,
		});
	}

	const uri = webviewResourceRoot(uuid)
		.replace('{{resource}}', resource.scheme + '/' + encodeURIComponent(resource.authority) + resource.path)
		.replace('{{uuid}}', uuid);
	return URI.parse(uri).with({
		fragment: resource.fragment,
		query: resource.query,
	});
}
