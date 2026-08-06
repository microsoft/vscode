/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URL } from 'url';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { window } from 'vscode';

export const proxyFetch = getProxyFetch();

/**
 * Return a fetch function that routes through the given proxy URL, or
 * return the default undici fetch if the URL was empty or invalid.
 */
function getProxyFetch(url: string | undefined = process.env.HTTPS_PROXY): typeof undiciFetch {
	if (!url) {
		return undiciFetch;
	}
	try {
		const { username, password } = new URL(url);
		const token = username && password ? `Basic ${Buffer.from(`${decodeURIComponent(username)}:${decodeURIComponent(password)}`).toString('base64')}` : undefined;
		const dispatcher = new ProxyAgent(token ? { uri: url, token } : url);
		return (input, init) => undiciFetch(input, { ...init, dispatcher });
	} catch (e) {
		window.showErrorMessage(`HTTPS_PROXY environment variable ignored: ${e.message}`);
		return undiciFetch;
	}
}
