/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Agent, globalAgent } from 'https';
import { URL } from 'url';
import { httpsOverHttp } from 'tunnel';
import { window } from 'vscode';

export const agent = getAgent();

/**
 * Return an https agent for the given proxy URL, or return the
 * global https agent if the URL was empty or invalid.
 */
function getAgent(url: string | undefined = process.env.HTTPS_PROXY): Agent {
	if (!url) {
		return globalAgent;
	}
	try {
		const { hostname, port, username, password } = new URL(url);
		const auth = username && password && `${username}:${password}`;
		return httpsOverHttp({ proxy: { host: hostname, port, proxyAuth: auth } });
	} catch (e) {
		window.showErrorMessage(`HTTPS_PROXY environment variable ignored: ${e.message}`);
		return globalAgent;
	}
}
