/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URL } from 'url';
import { fetch as undiciFetch, ProxyAgent, type Dispatcher, type RequestInit as UndiciRequestInit } from 'undici';
import { window } from 'vscode';

const dispatcher = getDispatcher();
export const fetch = createFetch(dispatcher);

/**
 * Return an undici dispatcher for the given proxy URL, or undefined
 * if the URL was empty or invalid.
 */
function getDispatcher(url: string | undefined = process.env.HTTPS_PROXY): Dispatcher | undefined {
	if (!url) {
		return undefined;
	}
	try {
		const { username, password } = new URL(url);
		const auth = username && password ? `${decodeURIComponent(username)}:${decodeURIComponent(password)}` : undefined;
		const token = auth ? `Basic ${Buffer.from(auth).toString('base64')}` : undefined;
		return new ProxyAgent({ uri: url, token });
	} catch (e) {
		window.showErrorMessage(`HTTPS_PROXY environment variable ignored: ${e.message}`);
		return undefined;
	}
}

function createFetch(dispatcher: Dispatcher | undefined): typeof undiciFetch {
	if (!dispatcher) {
		return undiciFetch;
	}

	return (url, options) => {
		const requestInit: UndiciRequestInit = options ? { ...options } : {};
		requestInit.dispatcher = dispatcher;
		return undiciFetch(url, requestInit);
	};
}
