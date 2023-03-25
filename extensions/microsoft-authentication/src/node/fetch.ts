/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { workspace } from 'vscode';
import fetch, { RequestInfo, RequestInit, Response } from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

export function fetching(url: RequestInfo, init?: RequestInit | undefined): Promise<Response> {
	const instanceOptions: RequestInit = {
		...init
	};
	const httpProxy = workspace.getConfiguration('http').get('proxy', process.env.HTTP_PROXY);
	if (!init?.agent && httpProxy) {
		instanceOptions.agent = new HttpsProxyAgent(httpProxy);
	}

	return fetch(url, instanceOptions);
}
