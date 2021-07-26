/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as http from "http"
import * as proxyAgent from "proxy-agent"
import * as proxyFromEnv from "proxy-from-env"

/**
 * This file has nothing to do with the code-server proxy.
 * It is to support $HTTP_PROXY, $HTTPS_PROXY and $NO_PROXY.
 *
 * - https://github.com/cdr/code-server/issues/124
 * - https://www.npmjs.com/package/proxy-agent
 * - https://www.npmjs.com/package/proxy-from-env
 *
 * This file exists in two locations:
 * - src/node/proxy_agent.ts
 * - lib/vscode/src/vs/base/node/proxy_agent.ts
 * The second is a symlink to the first.
 */

/**
 * monkeyPatch patches the node http,https modules to route all requests through the
 * agent we get from the proxy-agent package.
 *
 * This approach only works if there is no code specifying an explicit agent when making
 * a request.
 *
 * None of our code ever passes in a explicit agent to the http,https modules.
 * VS Code's does sometimes but only when a user sets the http.proxy configuration.
 * See https://code.visualstudio.com/docs/setup/network#_legacy-proxy-server-support
 *
 * Even if they do, it's probably the same proxy so we should be fine! And those knobs
 * are deprecated anyway.
 */
export function monkeyPatch(inVSCode: boolean): void {
	if (shouldEnableProxy()) {
		const http = require("http")
		const https = require("https")

		// If we do not pass in a proxy URL, proxy-agent will get the URL from the environment.
		// See https://www.npmjs.com/package/proxy-from-env.
		// Also see shouldEnableProxy.
		const pa = newProxyAgent(inVSCode)
		http.globalAgent = pa
		https.globalAgent = pa
	}
}

function newProxyAgent(inVSCode: boolean): http.Agent {
	// The reasoning for this split is that VS Code's build process does not have
	// esModuleInterop enabled but the code-server one does. As a result depending on where
	// we execute, we either have a default attribute or we don't.
	//
	// I can't enable esModuleInterop in VS Code's build process as it breaks and spits out
	// a huge number of errors. And we can't use require as otherwise the modules won't be
	// included in the final product.
	if (inVSCode) {
		return new (proxyAgent as any)()
	} else {
		return new (proxyAgent as any).default()
	}
}

// If they have $NO_PROXY set to example.com then this check won't work!
// But that's drastically unlikely.
function shouldEnableProxy(): boolean {
	let shouldEnable = false

	const httpProxy = proxyFromEnv.getProxyForUrl(`http://example.com`)
	if (httpProxy) {
		shouldEnable = true
		console.debug(`using $HTTP_PROXY ${httpProxy}`)
	}

	const httpsProxy = proxyFromEnv.getProxyForUrl(`https://example.com`)
	if (httpsProxy) {
		shouldEnable = true
		console.debug(`using $HTTPS_PROXY ${httpsProxy}`)
	}

	return shouldEnable
}
