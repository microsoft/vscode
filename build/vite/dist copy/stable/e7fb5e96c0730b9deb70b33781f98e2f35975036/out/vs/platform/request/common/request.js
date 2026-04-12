/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { streamToBuffer } from '../../../base/common/buffer.js';
import { getErrorMessage } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { Extensions } from '../../configuration/common/configurationRegistry.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Registry } from '../../registry/common/platform.js';
export const IRequestService = createDecorator('requestService');
/**
 * Use as the {@link IRequestOptions.callSite} value to prevent
 * request telemetry from being emitted. This is needed for
 * callers such as the telemetry sender to avoid cyclical calls.
 */
export const NO_FETCH_TELEMETRY = 'NO_FETCH_TELEMETRY';
class LoggableHeaders {
    constructor(original) {
        this.original = original;
    }
    toJSON() {
        if (!this.headers) {
            const headers = Object.create(null);
            for (const key in this.original) {
                if (key.toLowerCase() === 'authorization' || key.toLowerCase() === 'proxy-authorization') {
                    headers[key] = '*****';
                }
                else {
                    headers[key] = this.original[key];
                }
            }
            this.headers = headers;
        }
        return this.headers;
    }
}
export class AbstractRequestService extends Disposable {
    constructor(logService) {
        super();
        this.logService = logService;
        this.counter = 0;
        this._onDidCompleteRequest = this._register(new Emitter());
        this.onDidCompleteRequest = this._onDidCompleteRequest.event;
    }
    async logAndRequest(options, request) {
        const prefix = `#${++this.counter}: ${options.url}`;
        this.logService.trace(`${prefix} - begin`, options.type, new LoggableHeaders(options.headers ?? {}));
        const startTime = Date.now();
        try {
            const result = await request();
            this.logService.trace(`${prefix} - end`, options.type, result.res.statusCode, result.res.headers);
            this._onDidCompleteRequest.fire({
                callSite: options.callSite,
                latency: Date.now() - startTime,
                statusCode: result.res.statusCode,
            });
            return result;
        }
        catch (error) {
            this.logService.error(`${prefix} - error`, options.type, getErrorMessage(error));
            throw error;
        }
    }
}
export function isSuccess(context) {
    return (context.res.statusCode && context.res.statusCode >= 200 && context.res.statusCode < 300) || context.res.statusCode === 1223;
}
export function isClientError(context) {
    return !!context.res.statusCode && context.res.statusCode >= 400 && context.res.statusCode < 500;
}
export function isServerError(context) {
    return !!context.res.statusCode && context.res.statusCode >= 500 && context.res.statusCode < 600;
}
export function hasNoContent(context) {
    return context.res.statusCode === 204;
}
export async function asText(context) {
    if (hasNoContent(context)) {
        return null;
    }
    const buffer = await streamToBuffer(context.stream);
    return buffer.toString();
}
export async function asTextOrError(context) {
    if (!isSuccess(context)) {
        throw new Error('Server returned ' + context.res.statusCode);
    }
    return asText(context);
}
export async function asJson(context) {
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
    }
    catch (err) {
        err.message += ':\n' + str;
        throw err;
    }
}
export function updateProxyConfigurationsScope(useHostProxy, useHostProxyDefault) {
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
let proxyConfiguration = [];
let previousUseHostProxy = undefined;
let previousUseHostProxyDefault = undefined;
function registerProxyConfigurations(useHostProxy = true, useHostProxyDefault = true) {
    if (previousUseHostProxy === useHostProxy && previousUseHostProxyDefault === useHostProxyDefault) {
        return;
    }
    previousUseHostProxy = useHostProxy;
    previousUseHostProxyDefault = useHostProxyDefault;
    const configurationRegistry = Registry.as(Extensions.Configuration);
    const oldProxyConfiguration = proxyConfiguration;
    proxyConfiguration = [
        {
            id: 'http',
            order: 15,
            title: localize('httpConfigurationTitle', "HTTP"),
            type: 'object',
            scope: 2 /* ConfigurationScope.MACHINE */,
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
            scope: 1 /* ConfigurationScope.APPLICATION */,
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
            scope: useHostProxy ? 1 /* ConfigurationScope.APPLICATION */ : 2 /* ConfigurationScope.MACHINE */,
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
                'http.webSocketAdditionalSupport': {
                    type: 'boolean',
                    default: true,
                    markdownDescription: localize('webSocketAdditionalSupport', "Controls whether the built-in WebSocket implementation should be extended with additional support. Currently proxy support ({1}) and system certificates ({2}) are added when the corresponding settings are enabled. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", '`#http.useLocalProxyConfiguration#`', '`#http.proxySupport#`', '`#http.systemCertificates#`'),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVxdWVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRWhFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRS9ELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMzQyxPQUFPLEVBQXNCLFVBQVUsRUFBOEMsTUFBTSxxREFBcUQsQ0FBQztBQUNqSixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFOUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRTdELE1BQU0sQ0FBQyxNQUFNLGVBQWUsR0FBRyxlQUFlLENBQWtCLGdCQUFnQixDQUFDLENBQUM7QUFFbEY7Ozs7R0FJRztBQUNILE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHLG9CQUFvQixDQUFDO0FBc0N2RCxNQUFNLGVBQWU7SUFJcEIsWUFBNkIsUUFBa0I7UUFBbEIsYUFBUSxHQUFSLFFBQVEsQ0FBVTtJQUFJLENBQUM7SUFFcEQsTUFBTTtRQUNMLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDbkIsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNwQyxLQUFLLE1BQU0sR0FBRyxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDakMsSUFBSSxHQUFHLENBQUMsV0FBVyxFQUFF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