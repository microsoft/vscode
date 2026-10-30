/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vObj, vOptionalProp, vString } from '../../../base/common/validation.js';

/** Host → client: the client's raw proxy resolution for a URL; sent only to clients advertising `vscode.clientProxy`. */
export const ResolveClientProxyExtensionMethod = 'vscode/resolveProxy';
export const resolveClientProxyParamsValidator = vObj({ url: vString() });
export const resolveClientProxyResultValidator = vObj({ proxy: vOptionalProp(vString()) });

/** Host → client: a Kerberos `Proxy-Authorization` value for a proxy; sent only to clients advertising `vscode.clientProxy`. */
export const LookupClientProxyKerberosAuthorizationExtensionMethod = 'vscode/lookupProxyKerberosAuthorization';
export const lookupClientProxyKerberosAuthorizationParamsValidator = vObj({ proxyUrl: vString() });
export const lookupClientProxyKerberosAuthorizationResultValidator = vObj({ authorization: vOptionalProp(vString()) });

/**
 * Proxy support a client offers an agent host that shares its network, such as one in WSL or a local container,
 * like a remote extension host that uses the local proxy configuration.
 */
export interface IAgentHostClientProxyProvider {
	/** Whether to advertise the capability when connecting. */
	isEnabled(): boolean;
	/** The client's raw proxy resolution for `url`, such as `PROXY proxy:8080; DIRECT`. */
	resolveProxy(url: string): Promise<string | undefined>;
	/** A `Negotiate` `Proxy-Authorization` value for `proxyUrl`, or `undefined` when the client declines or has no ticket. */
	lookupKerberosAuthorization(proxyUrl: string): Promise<string | undefined>;
}
