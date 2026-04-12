/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { parse as parseUrl } from 'url';
import { Promises, timeout } from '../../../base/common/async.js';
import { streamToBufferReadableStream } from '../../../base/common/buffer.js';
import { CancellationError, getErrorMessage } from '../../../base/common/errors.js';
import { isBoolean, isNumber } from '../../../base/common/types.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { getResolvedShellEnv } from '../../shell/node/shellEnv.js';
import { ILogService } from '../../log/common/log.js';
import { AbstractRequestService, systemCertificatesNodeDefault } from '../common/request.js';
import { getProxyAgent } from './proxy.js';
import { createGunzip } from 'zlib';
const TRANSIENT_ERROR_CODES = new Set([
    'EAI_AGAIN', // DNS lookup timed out
    'ECONNREFUSED', // Connection refused by server
    'EHOSTDOWN', // Host is down
    'EHOSTUNREACH', // No route to host
    'ENETDOWN', // Network is down
    'ENETUNREACH', // Network is unreachable
    'EPROTO' // Protocol error (TLS/SSL handshake failure)
]);
const IDEMPOTENT_HTTP_METHODS_REGEX = /^(GET|HEAD|OPTIONS)$/i;
function isTransientError(error) {
    if (error instanceof Error) {
        const code = error.code;
        return !!code && TRANSIENT_ERROR_CODES.has(code);
    }
    return false;
}
/**
 * This service exposes the `request` API, while using the global
 * or configured proxy settings.
 */
let RequestService = class RequestService extends AbstractRequestService {
    constructor(machine, configurationService, environmentService, logService) {
        super(logService);
        this.machine = machine;
        this.configurationService = configurationService;
        this.environmentService = environmentService;
        this.configure();
        this._register(configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('http')) {
                this.configure();
            }
        }));
    }
    configure() {
        this.proxyUrl = this.getConfigValue('http.proxy');
        this.strictSSL = !!this.getConfigValue('http.proxyStrictSSL');
        this.authorization = this.getConfigValue('http.proxyAuthorization');
    }
    async request(options, token) {
        const { proxyUrl, strictSSL } = this;
        let shellEnv = undefined;
        try {
            shellEnv = await getResolvedShellEnv(this.configurationService, this.logService, this.environmentService.args, process.env);
        }
        catch (error) {
            if (!this.shellEnvErrorLogged) {
                this.shellEnvErrorLogged = true;
                this.logService.error(`resolving shell environment failed`, getErrorMessage(error));
            }
        }
        const env = {
            ...process.env,
            ...shellEnv
        };
        const agent = options.agent ? options.agent : await getProxyAgent(options.url || '', env, { proxyUrl, strictSSL });
        options.agent = agent;
        options.strictSSL = strictSSL;
        if (this.authorization) {
            options.headers = {
                ...(options.headers || {}),
                'Proxy-Authorization': this.authorization
            };
        }
        return this.logAndRequest(options, () => nodeRequest(options, token));
    }
    async resolveProxy(url) {
        return undefined; // currently not implemented in node
    }
    async lookupAuthorization(authInfo) {
        return undefined; // currently not implemented in node
    }
    async lookupKerberosAuthorization(urlStr) {
        try {
            const spnConfig = this.getConfigValue('http.proxyKerberosServicePrincipal');
            const response = await lookupKerberosAuthorization(urlStr, spnConfig, this.logService, 'RequestService#lookupKerberosAuthorization');
            return 'Negotiate ' + response;
        }
        catch (err) {
            this.logService.debug('RequestService#lookupKerberosAuthorization Kerberos authentication failed', err);
            return undefined;
        }
    }
    async loadCertificates() {
        const proxyAgent = await import('@vscode/proxy-agent');
        return proxyAgent.loadSystemCertificates({
            loadSystemCertificatesFromNode: () => this.getConfigValue('http.systemCertificatesNode', systemCertificatesNodeDefault),
            log: this.logService,
        });
    }
    getConfigValue(key, fallback) {
        if (this.machine === 'remote') {
            return this.configurationService.getValue(key);
        }
        const values = this.configurationService.inspect(key);
        return values.userLocalValue ?? values.defaultValue ?? fallback;
    }
};
RequestService = __decorate([
    __param(1, IConfigurationService),
    __param(2, INativeEnvironmentService),
    __param(3, ILogService)
], RequestService);
export { RequestService };
export async function lookupKerberosAuthorization(urlStr, spnConfig, logService, logPrefix) {
    const importKerberos = await import('kerberos');
    const kerberos = importKerberos.default || importKerberos;
    const url = new URL(urlStr);
    const spn = spnConfig
        || (process.platform === 'win32' ? `HTTP/${url.hostname}` : `HTTP@${url.hostname}`);
    logService.debug(`${logPrefix} Kerberos authentication lookup`, `proxyURL:${url}`, `spn:${spn}`);
    const client = await kerberos.initializeClient(spn);
    return client.step('');
}
async function getNodeRequest(options) {
    const endpoint = parseUrl(options.url);
    const module = endpoint.protocol === 'https:' ? await import('https') : await import('http');
    return module.request;
}
export async function nodeRequest(options, token) {
    const maxRetries = 3;
    let lastError;
    const isIdempotent = IDEMPOTENT_HTTP_METHODS_REGEX.test(options.type || 'GET');
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await nodeRequestAttempt(options, token);
        }
        catch (error) {
            lastError = error;
            if (error instanceof CancellationError) {
                throw error;
            }
            if (!isIdempotent || !isTransientError(error) || attempt === maxRetries) {
                throw error;
            }
            await timeout(100 * attempt, token);
        }
    }
    throw lastError;
}
async function nodeRequestAttempt(options, token) {
    return Promises.withAsyncBody(async (resolve, reject) => {
        const endpoint = parseUrl(options.url);
        const rawRequest = options.getRawRequest
            ? options.getRawRequest(options)
            : await getNodeRequest(options);
        const opts = {
            hostname: endpoint.hostname,
            port: endpoint.port ? parseInt(endpoint.port) : (endpoint.protocol === 'https:' ? 443 : 80),
            protocol: endpoint.protocol,
            path: endpoint.path,
            method: options.type || 'GET',
            headers: options.headers,
            agent: options.agent,
            rejectUnauthorized: isBoolean(options.strictSSL) ? options.strictSSL : true
        };
        if (options.user && options.password) {
            opts.auth = options.user + ':' + options.password;
        }
        if (options.disableCache) {
            opts.cache = 'no-store';
        }
        const req = rawRequest(opts, (res) => {
            const followRedirects = isNumber(options.followRedirects) ? options.followRedirects : 3;
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && followRedirects > 0 && res.headers['location']) {
                nodeRequest({
                    ...options,
                    url: res.headers['location'],
                    followRedirects: followRedirects - 1
                }, token).then(resolve, reject);
            }
            else {
                let stream = res;
                // Responses from Electron net module should be treated as response
                // from browser, which will apply gzip filter and decompress the response
                // using zlib before passing the result to us. Following step can be bypassed
                // in this case and proceed further.
                // Refs https://source.chromium.org/chromium/chromium/src/+/main:net/url_request/url_request_http_job.cc;l=1266-1318
                if (!options.isChromiumNetwork && res.headers['content-encoding'] === 'gzip') {
                    stream = res.pipe(createGunzip());
                }
                resolve({ res, stream: streamToBufferReadableStream(stream) });
            }
        });
        req.on('error', reject);
        // Handle timeout
        if (options.timeout) {
            // Chromium network requests do not support the `timeout` option
            if (options.isChromiumNetwork) {
                // Use Node's setTimeout for Chromium network requests
                const timeout = setTimeout(() => {
                    req.abort();
                    reject(new Error(`Request timeout after ${options.timeout}ms`));
                }, options.timeout);
                // Clear timeout when request completes
                req.on('response', () => clearTimeout(timeout));
                req.on('error', () => clearTimeout(timeout));
                req.on('abort', () => clearTimeout(timeout));
            }
            else {
                req.setTimeout(options.timeout);
            }
        }
        // Chromium will abort the request if forbidden headers are set.
        // Ref https://source.chromium.org/chromium/chromium/src/+/main:services/network/public/cpp/header_util.cc;l=14-48;
        // for additional context.
        if (options.isChromiumNetwork) {
            req.removeHeader('Content-Length');
        }
        if (options.data) {
            if (typeof options.data === 'string') {
                req.write(options.data);
            }
        }
        req.end();
        const cancellationListener = token.onCancellationRequested(() => {
            cancellationListener.dispose();
            req.abort();
            reject(new CancellationError());
        });
        req.on('response', () => cancellationListener.dispose());
        req.on('error', () => cancellationListener.dispose());
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVxdWVzdFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9yZXF1ZXN0L25vZGUvcmVxdWVzdFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFJaEcsT0FBTyxFQUFFLEtBQUssSUFBSSxRQUFRLEVBQUUsTUFBTSxLQUFLLENBQUM7QUFDeEMsT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNsRSxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUU5RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFcEYsT0FBTyxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUVwRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNwRixPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNwRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNuRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdEQsT0FBTyxFQUFFLHNCQUFzQixFQUEwQyw2QkFBNkIsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3JJLE9BQU8sRUFBUyxhQUFhLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDbEQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLE1BQU0sQ0FBQztBQUVwQyxNQUFNLHFCQUFxQixHQUFHLElBQUksR0FBRyxDQUFDO0lBQ3JDLFdBQVcsRUFBTSx1QkFBdUI7SUFDeEMsY0FBYyxFQUFHLCtCQUErQjtJQUNoRCxXQUFXLEVBQU0sZUFBZTtJQUNoQyxjQUFjLEVBQUcsbUJBQW1C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