/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { streamToBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { getErrorMessage } from '../../../base/common/errors.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IHeaders, IRequestContext, IRequestOptions } from '../../../base/parts/request/common/request.js';
import { localize } from '../../../nls.js';
import { ConfigurationScope, Extensions, IConfigurationNode, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { Registry } from '../../registry/common/platform.js';

export const IRequestService = createDecorator<IRequestService>('requestService');

export interface AuthInfo {
	isProxy: boolean;
	scheme: string;
	host: string;
	port: number;
	realm: string;
	attempt: number;
}

export interface Credentials {
	username: string;
	password: string;
}

export interface IRequestService {
	readonly _serviceBrand: undefined;

	request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext>;

	resolveProxy(url: string): Promise<string | undefined>;
	lookupAuthorization(authInfo: AuthInfo): Promise<Credentials | undefined>;
	lookupKerberosAuthorization(url: string): Promise<string | undefined>;
	loadCertificates(): Promise<string[]>;
}

class LoggableHeaders {

	private headers: IHeaders | undefined;

	constructor(private readonly original: IHeaders) { }

	toJSON(): any {
		if (!this.headers) {
			const headers = Object.create(null);
			for (const key in this.original) {
				if (key.toLowerCase() === 'authorization' || key.toLowerCase() === 'proxy-authorization') {
					headers[key] = '*****';
				} else {
					headers[key] = this.original[key];
				}
			}
			this.headers = headers;
		}
		return this.headers;
	}

}

export abstract class AbstractRequestService extends Disposable implements IRequestService {

	declare readonly _serviceBrand: undefined;

	private counter = 0;

	constructor(protected readonly logService: ILogService) {
		super();
	}

	protected async logAndRequest(options: IRequestOptions, request: () => Promise<IRequestContext>): Promise<IRequestContext> {
		const prefix = `#${++this.counter}: ${options.url}`;
		this.logService.trace(`${prefix} - begin`, options.type, new LoggableHeaders(options.headers ?? {}));
		try {
			const result = await request();
			this.logService.trace(`${prefix} - end`, options.type, result.res.statusCode, result.res.headers);
			return result;
		} catch (error) {
			this.logService.error(`${prefix} - error`, options.type, getErrorMessage(error));
			throw error;
		}
	}

	abstract request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext>;
	abstract resolveProxy(url: string): Promise<string | undefined>;
	abstract lookupAuthorization(authInfo: AuthInfo): Promise<Credentials | undefined>;
	abstract lookupKerberosAuthorization(url: string): Promise<string | undefined>;
	abstract loadCertificates(): Promise<string[]>;
}

export function isSuccess(context: IRequestContext): boolean {
	return (context.res.statusCode && context.res.statusCode >= 200 && context.res.statusCode < 300) || context.res.statusCode === 1223;
}

export function isClientError(context: IRequestContext): boolean {
	return !!context.res.statusCode && context.res.statusCode >= 400 && context.res.statusCode < 500;
}

export function isServerError(context: IRequestContext): boolean {
	return !!context.res.statusCode && context.res.statusCode >= 500 && context.res.statusCode < 600;
}

export function hasNoContent(context: IRequestContext): boolean {
	return context.res.statusCode === 204;
}

export async function asText(context: IRequestContext): Promise<string | null> {
	if (hasNoContent(context)) {
		return null;
	}
	const buffer = await streamToBuffer(context.stream);
	return buffer.toString();
}

export async function asTextOrError(context: IRequestContext): Promise<string | null> {
	if (!isSuccess(context)) {
		throw new Error('Server returned ' + context.res.statusCode);
	}
	return asText(context);
}

export async function asJson<T = {}>(context: IRequestContext): Promise<T | null> {
	if (!isSuccess(context)) {
		throw new Error('Server returned ' + context.res.statusCode);
	}
	if (hasNoContent(context)) {
		return null;
	}
	const buffer = await streamToBuffer(context.stream);
	const str = buffer.toString();
	try {
		return JSON.parse(str);
	} catch (err) {
		err.message += ':\n' + str;
		throw err;
	}
}

export function updateProxyConfigurationsScope(useHostProxy: boolean, useHostProxyDefault: boolean): void {
	registerProxyConfigurations(useHostProxy, useHostProxyDefault);
}

export const USER_LOCAL_AND_REMOTE_SETTINGS = [
	'http.proxy',
	'http.proxyStrictSSL',
	'http.proxyKerberosServicePrincipal',
	'http.noProxy',
	'http.proxyAuthorization',
	'http.proxySupport',
	'http.systemCertificates',
	'http.systemCertificatesNode',
	'http.experimental.systemCertificatesV2',
	'http.fetchAdditionalSupport',
	'http.experimental.networkInterfaceCheckInterval',
];

export const systemCertificatesNodeDefault = false;

let proxyConfiguration: IConfigurationNode[] = [];
let previousUseHostProxy: boolean | undefined = undefined;
let previousUseHostProxyDefault: boolean | undefined = undefined;
function registerProxyConfigurations(useHostProxy = true, useHostProxyDefault = true): void {
	if (previousUseHostProxy === useHostProxy && previousUseHostProxyDefault === useHostProxyDefault) {
		return;
	}

	previousUseHostProxy = useHostProxy;
	previousUseHostProxyDefault = useHostProxyDefault;

	const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	const oldProxyConfiguration = proxyConfiguration;
	proxyConfiguration = [
		{
			id: 'http',
			order: 15,
			title: localize('httpConfigurationTitle', "HTTP"),
			type: 'object',
			scope: ConfigurationScope.MACHINE,
			properties: {
				'http.useLocalProxyConfiguration': {
					type: 'boolean',
					default: useHostProxyDefault,
					markdownDescription: localize('useLocalProxy', "Controls whether in the remote extension host the local proxy configuration should be used. This setting only applies as a remote setting during [remote development](https://aka.ms/vscode-remote)."),
					restricted: true
				},
			}
		},
		{
			id: 'http',
			order: 15,
			title: localize('httpConfigurationTitle', "HTTP"),
			type: 'object',
			scope: ConfigurationScope.APPLICATION,
			properties: {
				'http.electronFetch': {
					type: 'boolean',
					default: false,
					description: localize('electronFetch', "Controls whether use of Electron's fetch implementation instead of Node.js' should be enabled. All local extensions will get Electron's fetch implementation for the global fetch API."),
					restricted: true
				},
			}
		},
		{
			id: 'http',
			order: 15,
			title: localize('httpConfigurationTitle', "HTTP"),
			type: 'object',
			scope: useHostProxy ? ConfigurationScope.APPLICATION : ConfigurationScope.MACHINE,
			properties: {
				'http.proxy': {
					type: 'string',
					pattern: '^(https?|socks|socks4a?|socks5h?)://([^:]*(:[^@]*)?@)?([^:]+|\\[[:0-9a-fA-F]+\\])(:\\d+)?/?$|^$',
					markdownDescription: localize('proxy', "The proxy setting to use. If not set, will be inherited from the `http_proxy` and `https_proxy` environment variables. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", '`#http.useLocalProxyConfiguration#`'),
					restricted: true
				},
				'http.proxyStrictSSL': {
					type: 'boolean',
					default: true,
					markdownDescription: localize('strictSSL', "Controls whether the proxy server certificate should be verified against the list of supplied CAs. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", '`#http.useLocalProxyConfiguration#`'),
					restricted: true
				},
				'http.proxyKerberosServicePrincipal': {
					type: 'string',
					markdownDescription: localize('proxyKerberosServicePrincipal', "Overrides the principal service name for Kerberos authentication with the HTTP proxy. A default based on the proxy hostname is used when this is not set. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", '`#http.useLocalProxyConfiguration#`'),
					restricted: true
				},
				'http.noProxy': {
					type: 'array',
					items: { type: 'string' },
					markdownDescription: localize('noProxy', "Specifies domain names for which proxy settings should be ignored for HTTP/HTTPS requests. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", '`#http.useLocalProxyConfiguration#`'),
					restricted: true
				},
				'http.proxyAuthorization': {
					type: ['null', 'string'],
					default: null,
					markdownDescription: localize('proxyAuthorization', "The value to send as the `Proxy-Authorization` header for every network request. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", '`#http.useLocalProxyConfiguration#`'),
					restricted: true
				},
				'http.proxySupport': {
					type: 'string',
					enum: ['off', 'on', 'fallback', 'override'],
					enumDescriptions: [
						localize('proxySupportOff', "Disable proxy support for extensions."),
						localize('proxySupportOn', "Enable proxy support for extensions."),
						localize('proxySupportFallback', "Enable proxy support for extensions, fall back to request options, when no proxy found."),
						localize('proxySupportOverride', "Enable proxy support for extensions, override request options."),
					],
					default: 'override',
					markdownDescription: localize('proxySupport', "Use the proxy support for extensions. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", '`#http.useLocalProxyConfiguration#`'),
					restricted: true
				},
				'http.systemCertificates': {
					type: 'boolean',
					default: true,
					markdownDescription: localize('systemCertificates', "Controls whether CA certificates should be loaded from the OS. On Windows and macOS, a reload of the window is required after turning this off. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", '`#http.useLocalProxyConfiguration#`'),
					restricted: true
				},
				'http.systemCertificatesNode': {
					type: 'boolean',
					tags: ['experimental'],
					default: systemCertificatesNodeDefault,
					markdownDescription: localize('systemCertificatesNode', "Controls whether system certificates should be loaded using Node.js built-in support. Reload the window after changing this setting. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", '`#http.useLocalProxyConfiguration#`'),
					restricted: true,
					experiment: {
						mode: 'auto'
					}
				},
				'http.experimental.systemCertificatesV2': {
					type: 'boolean',
					tags: ['experimental'],
					default: false,
					markdownDescription: localize('systemCertificatesV2', "Controls whether experimental loading of CA certificates from the OS should be enabled. This uses a more general approach than the default implementation. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", '`#http.useLocalProxyConfiguration#`'),
					restricted: true
				},
				'http.fetchAdditionalSupport': {
					type: 'boolean',
					default: true,
					markdownDescription: localize('fetchAdditionalSupport', "Controls whether Node.js' fetch implementation should be extended with additional support. Currently proxy support ({1}) and system certificates ({2}) are added when the corresponding settings are enabled. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", '`#http.useLocalProxyConfiguration#`', '`#http.proxySupport#`', '`#http.systemCertificates#`'),
					restricted: true
				},
				'http.experimental.networkInterfaceCheckInterval': {
					type: 'number',
					default: 300,
					minimum: -1,
					tags: ['experimental'],
					markdownDescription: localize('networkInterfaceCheckInterval', "Controls the interval in seconds for checking network interface changes to invalidate the proxy cache. Set to -1 to disable. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", '`#http.useLocalProxyConfiguration#`'),
					restricted: true,
					experiment: {
						mode: 'auto'
					}
				}
			}
		}
	];
	configurationRegistry.updateConfigurations({ add: proxyConfiguration, remove: oldProxyConfiguration });
}

registerProxyConfigurations();
