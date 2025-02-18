/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from '../../../../base/common/charCode.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';

export interface WebviewRemoteInfo {
	readonly isRemote: boolean;
	readonly authority: string | undefined;
}

/**
 * Root from which resources in webviews are loaded.
 *
 * This is hardcoded because we never expect to actually hit it. Instead these requests
 * should always go to a service worker.
 */
export const webviewResourceBaseHost = 'vscode-cdn.net';

export const webviewRootResourceAuthority = `vscode-resource.${webviewResourceBaseHost}`;

export const webviewGenericCspSource = `'self' https://*.${webviewResourceBaseHost}`;

/**
 * Construct a uri that can load resources inside a webview
 *
 * We encode the resource component of the uri so that on the main thread
 * we know where to load the resource from (remote or truly local):
 *
 * ```txt
 * ${scheme}+${resource-authority}.vscode-resource.vscode-cdn.net/${path}
 * ```
 *
 * @param resource Uri of the resource to load.
 * @param remoteInfo Optional information about the remote that specifies where `resource` should be resolved from.
 */
export function asWebviewUri(resource: URI, remoteInfo?: WebviewRemoteInfo): URI {
	if (resource.scheme === Schemas.http || resource.scheme === Schemas.https) {
		return resource;
	}

	if (remoteInfo && remoteInfo.authority && remoteInfo.isRemote && resource.scheme === Schemas.file) {
		resource = URI.from({
			scheme: Schemas.vscodeRemote,
			authority: remoteInfo.authority,
			path: resource.path,
		});
	}

	return URI.from({
		scheme: Schemas.https,
		authority: `${resource.scheme}+${encodeAuthority(resource.authority)}.${webviewRootResourceAuthority}`,
		path: resource.path,
		fragment: resource.fragment,
		query: resource.query,
	});
}

function encodeAuthority(authority: string): string {
	return authority.replace(/./g, char => {
		const code = char.charCodeAt(0);
		if (
			(code >= CharCode.a && code <= CharCode.z)
			|| (code >= CharCode.A && code <= CharCode.Z)
			|| (code >= CharCode.Digit0 && code <= CharCode.Digit9)
		) {
			return char;
		}
		return '-' + code.toString(16).padStart(4, '0');
	});
}

export function decodeAuthority(authority: string) {
	return authority.replace(/-([0-9a-f]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}
