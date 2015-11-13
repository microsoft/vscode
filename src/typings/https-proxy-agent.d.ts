/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'https-proxy-agent' {

	class HttpsProxyAgent {
		constructor(proxy: string);
	}
	export = HttpsProxyAgent;
}