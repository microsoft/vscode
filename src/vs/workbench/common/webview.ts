/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from 'vs/base/common/charCode';
import { Schemas } from 'vs/base/common/network';
import { isWeb } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';

export interface WebviewRemoteInfo {
	readonly isRemote: boolean;
	readonly authority: string | undefined;
}

// This is required so that webview resources load sucessfully in firefox
// Firefox is more strict regarding CSP rules and it will complain if we left
// the `webviewResourceBaseHost` set to 'vscode-cdn.net' as the service worker
// is served from a different domain in this case `gitpodHost`.
// This change only affects the server part as it uses `process.env`,
// for the front end there are some replace rules in gitpod blobserve config
// that will replace 'vscode-cdn.net' with the proper host value
// See https://github.com/gitpod-io/gitpod/blob/8c7cb822ed5c670c102335f76b269f00895c8876/chart/templates/blobserve-configmap.yaml#L28-L39
// and https://github.com/gitpod-io/gitpod/blob/8c7cb822ed5c670c102335f76b269f00895c8876/installer/pkg/components/blobserve/configmap.go#L41-L61
let gitpodHost;
if (!isWeb) {
	gitpodHost = process.env['GITPOD_CODE_HOST'];
	try {
		gitpodHost = gitpodHost && new URL(gitpodHost).host;
	} catch { }
}

/**
 * Root from which resources in webviews are loaded.
 *
 * This is hardcoded because we never expect to actually hit it. Instead these requests
 * should always go to a service worker.
 */
export const webviewResourceBaseHost = gitpodHost || 'vscode-cdn.net';

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
