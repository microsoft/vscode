/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from '../../../base/common/event.js';
import { vNumber, vObj, vOptionalProp, vString } from '../../../base/common/validation.js';
import type { Credentials } from '../../request/common/request.js';

/** Host → client: the client's raw proxy resolution for a URL; sent only to clients advertising `vscode.clientProxy`. */
export const ResolveClientProxyExtensionMethod = 'vscode/resolveProxy';
export const resolveClientProxyParamsValidator = vObj({ url: vString() });
export const resolveClientProxyResultValidator = vObj({ proxy: vOptionalProp(vString()) });

/** Host → client: a Kerberos `Proxy-Authorization` value for a proxy; sent only to clients advertising `vscode.clientProxy`. */
export const LookupClientProxyKerberosAuthorizationExtensionMethod = 'vscode/lookupProxyKerberosAuthorization';
export const lookupClientProxyKerberosAuthorizationParamsValidator = vObj({ proxyUrl: vString() });
export const lookupClientProxyKerberosAuthorizationResultValidator = vObj({ authorization: vOptionalProp(vString()) });

/**
 * Host → client: Basic credentials for a proxy that challenged a request; sent only to clients advertising
 * `vscode.clientProxy`. `attempt` is 1 for the first credentials a request asks for and higher after the proxy rejected
 * earlier ones, and `realm` comes from the proxy, so it is untrusted. An omitted or empty `username` means the client has
 * none; an omitted `password` is empty.
 */
export const LookupClientProxyBasicAuthorizationExtensionMethod = 'vscode/lookupProxyBasicAuthorization';
export const lookupClientProxyBasicAuthorizationParamsValidator = vObj({ proxyUrl: vString(), realm: vOptionalProp(vString()), attempt: vNumber() });
export const lookupClientProxyBasicAuthorizationResultValidator = vObj({ username: vOptionalProp(vString()), password: vOptionalProp(vString()) });

/**
 * Client → host: the client's proxy resolution may have changed, so the host drops cached resolutions and refreshes the
 * proxy it applies to agent processes; sent only to hosts that confirmed `vscode.clientProxy` in their initialize result.
 */
export const ClientProxyChangedExtensionMethod = 'vscode/clientProxyChanged';

/**
 * Proxy support a client offers an agent host that shares its network, such as one in WSL or a local container,
 * like a remote extension host that uses the local proxy configuration.
 */
export interface IAgentHostClientProxyProvider {
	/** Whether to advertise the capability when connecting. */
	isEnabled(): boolean;
	/** Fires when {@link resolveProxy} may return different results, such as after `http.useLocalProxyConfiguration` changes. */
	readonly onDidChange: Event<void>;
	/** The client's raw proxy resolution for `url`, such as `PROXY proxy:8080; DIRECT`. */
	resolveProxy(url: string): Promise<string | undefined>;
	/** A `Negotiate` `Proxy-Authorization` value for `proxyUrl`, or `undefined` when the client declines or has no ticket. */
	lookupKerberosAuthorization(proxyUrl: string): Promise<string | undefined>;
	/** Basic credentials for `proxyUrl`, or `undefined` when the client declines or has none. */
	lookupBasicAuthorization(proxyUrl: string, realm: string | undefined, attempt: number): Promise<Credentials | undefined>;
}
