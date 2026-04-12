/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../base/common/uri.js';
import { LogLevel as LogServiceLevel } from '../../../platform/log/common/log.js';
import { LogLevel, createHttpPatch, createProxyResolver, createTlsPatch, createNetPatch, loadSystemCertificates } from '@vscode/proxy-agent';
import { systemCertificatesNodeDefault } from '../../../platform/request/common/request.js';
import { createRequire } from 'node:module';
import { lookupKerberosAuthorization } from '../../../platform/request/node/requestService.js';
import * as proxyAgent from '@vscode/proxy-agent';
const require = createRequire(import.meta.url);
const http = require('http');
const https = require('https');
const tls = require('tls');
const net = require('net');
const systemCertificatesV2Default = false;
const useElectronFetchDefault = false;
export function connectProxyResolver(extHostWorkspace, configProvider, extensionService, extHostLogService, mainThreadTelemetry, initData, disposables) {
    const isRemote = initData.remote.isRemote;
    const useHostProxyDefault = initData.environment.useHostProxy ?? !isRemote;
    const fallbackToLocalKerberos = useHostProxyDefault;
    const loadLocalCertificates = useHostProxyDefault;
    const isUseHostProxyEnabled = () => !isRemote || configProvider.getConfiguration('http').get('useLocalProxyConfiguration', useHostProxyDefault);
    const timedResolveProxy = createTimedResolveProxy(extHostWorkspace, mainThreadTelemetry);
    const params = {
        resolveProxy: timedResolveProxy,
        lookupProxyAuthorization: lookupProxyAuthorization.bind(undefined, extHostWorkspace, extHostLogService, mainThreadTelemetry, configProvider, {}, {}, initData.remote.isRemote, fallbackToLocalKerberos),
        getProxyURL: () => getExtHostConfigValue(configProvider, isRemote, 'http.proxy'),
        getProxySupport: () => getExtHostConfigValue(configProvider, isRemote, 'http.proxySupport') || 'off',
        getNoProxyConfig: () => getExtHostConfigValue(configProvider, isRemote, 'http.noProxy') || [],
        isAdditionalFetchSupportEnabled: () => getExtHostConfigValue(configProvider, isRemote, 'http.fetchAdditionalSupport', true),
        isWebSocketPatchEnabled: () => getExtHostConfigValue(configProvider, isRemote, 'http.webSocketAdditionalSupport', true),
        addCertificatesV1: () => certSettingV1(configProvider, isRemote),
        addCertificatesV2: () => certSettingV2(configProvider, isRemote),
        loadSystemCertificatesFromNode: () => getExtHostConfigValue(configProvider, isRemote, 'http.systemCertificatesNode', systemCertificatesNodeDefault),
        log: extHostLogService,
        getLogLevel: () => {
            const level = extHostLogService.getLevel();
            switch (level) {
                case LogServiceLevel.Trace: return LogLevel.Trace;
                case LogServiceLevel.Debug: return LogLevel.Debug;
                case LogServiceLevel.Info: return LogLevel.Info;
                case LogServiceLevel.Warning: return LogLevel.Warning;
                case LogServiceLevel.Error: return LogLevel.Error;
                case LogServiceLevel.Off: return LogLevel.Off;
                default: return never(level);
            }
            function never(level) {
                extHostLogService.error('Unknown log level', level);
                return LogLevel.Debug;
            }
        },
        proxyResolveTelemetry: () => { },
        isUseHostProxyEnabled,
        getNetworkInterfaceCheckInterval: () => {
            const intervalSeconds = getExtHostConfigValue(configProvider, isRemote, 'http.experimental.networkInterfaceCheckInterval', 300);
            return intervalSeconds * 1000;
        },
        loadAdditionalCertificates: async () => {
            const useNodeSystemCerts = getExtHostConfigValue(configProvider, isRemote, 'http.systemCertificatesNode', systemCertificatesNodeDefault);
            const promises = [];
            if (isRemote) {
                promises.push(loadSystemCertificates({
                    loadSystemCertificatesFromNode: () => useNodeSystemCerts,
                    log: extHostLogService,
                }));
            }
            if (loadLocalCertificates) {
                if (!isRemote && useNodeSystemCerts) {
                    promises.push(loadSystemCertificates({
                        loadSystemCertificatesFromNode: () => useNodeSystemCerts,
                        log: extHostLogService,
                    }));
                }
                else {
                    extHostLogService.trace('ProxyResolver#loadAdditionalCertificates: Loading certificates from main process');
                    const certs = extHostWorkspace.loadCertificates(); // Loading from main process to share cache.
                    certs.then(certs => extHostLogService.trace('ProxyResolver#loadAdditionalCertificates: Loaded certificates from main process', certs.length));
                    promises.push(certs);
                }
            }
            // Using https.globalAgent because it is shared with proxy.test.ts and mutable.
            if (initData.environment.extensionTestsLocationURI && https.globalAgent.testCertificates?.length) {
                extHostLogService.trace('ProxyResolver#loadAdditionalCertificates: Loading test certificates');
                promises.push(Promise.resolve(https.globalAgent.testCertificates));
            }
            const result = (await Promise.all(promises)).flat();
            const nodeSystemCertErrors = collectNodeSystemCertErrors(useNodeSystemCerts, extHostLogService);
            mainThreadTelemetry.$publicLog2('additionalCertificates', {
                count: result.length,
                isRemote,
                loadLocalCertificates,
                useNodeSystemCerts,
                nodeSystemCertErrors,
            });
            return result;
        },
        env: process.env,
    };
    const { resolveProxyWithRequest, resolveProxyURL } = createProxyResolver(params);
    // eslint-disable-next-line local/code-no-any-casts
    const target = proxyAgent.default || proxyAgent;
    target.resolveProxyURL = resolveProxyURL;
    patchGlobalFetch(params, configProvider, mainThreadTelemetry, initData, resolveProxyURL, disposables);
    patchGlobalWebSocket(params, resolveProxyURL);
    const lookup = createPatchedModules(params, resolveProxyWithRequest);
    return configureModuleLoading(extensionService, lookup);
}
const unsafeHeaders = [
    'content-length',
    'host',
    'trailer',
    'te',
    'upgrade',
    'cookie2',
    'keep-alive',
    'transfer-encoding',
    'set-cookie',
];
function patchGlobalFetch(params, configProvider, mainThreadTelemetry, initData, resolveProxyURL, disposables) {
    // eslint-disable-next-line local/code-no-any-casts
    if (!globalThis.__vscodeOriginalFetch) {
        const originalFetch = globalThis.fetch;
        // eslint-disable-next-line local/code-no-any-casts
        globalThis.__vscodeOriginalFetch = originalFetch;
        const patchedFetch = proxyAgent.createFetchPatch(params, originalFetch, resolveProxyURL);
        // eslint-disable-next-line local/code-no-any-casts
        globalThis.__vscodePatchedFetch = patchedFetch;
        let useElectronFetch = false;
        if (!initData.remote.isRemote) {
            useElectronFetch = configProvider.getConfiguration('http').get('electronFetch', useElectronFetchDefault);
            disposables.add(configProvider.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('http.electronFetch')) {
                    useElectronFetch = configProvider.getConfiguration('http').get('electronFetch', useElectronFetchDefault);
                }
            }));
        }
        // https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
        globalThis.fetch = async function fetch(input, init) {
            function getRequestProperty(name) {
                return init && name in init ? init[name] : typeof input === 'object' && 'cache' in input ? input[name] : undefined;
            }
            // Limitations: https://github.com/electron/electron/pull/36733#issuecomment-1405615494
            // net.fetch fails on manual redirect: https://github.com/electron/electron/issues/43715
            const urlString = typeof input === 'string' ? input : 'cache' in input ? input.url : input.toString();
            const isDataUrl = urlString.startsWith('data:');
            if (isDataUrl) {
                recordFetchFeatureUse(mainThreadTelemetry, 'data');
            }
            const isBlobUrl = urlString.startsWith('blob:');
            if (isBlobUrl) {
                recordFetchFeatureUse(mainThreadTelemetry, 'blob');
            }
            const isManualRedirect = getRequestProperty('redirect') === 'manual';
            if (isManualRedirect) {
                recordFetchFeatureUse(mainThreadTelemetry, 'manualRedirect');
            }
            const integrity = getRequestProperty('integrity');
            if (integrity) {
                recordFetchFeatureUse(mainThreadTelemetry, 'integrity');
            }
            if (!useElectronFetch || isDataUrl || isBlobUrl || isManualRedirect || integrity) {
                const response = await patchedFetch(input, init);
                monitorResponseProperties(mainThreadTelemetry, response, urlString);
                return response;
            }
            // Unsupported headers: https://source.chromium.org/chromium/chromium/src/+/main:services/network/public/cpp/header_util.cc;l=32;drc=ee7299f8961a1b05a3554efcc496b6daa0d7f6e1
            if (init?.headers) {
                const headers = new Headers(init.headers);
                for (const header of unsafeHeaders) {
                    headers.delete(header);
                }
                init = { ...init, headers };
            }
            // Support for URL: https://github.com/electron/electron/issues/43712
            const electronInput = input instanceof URL ? input.toString() : input;
            const electron = require('electron');
            const response = await electron.net.fetch(electronInput, init);
            monitorResponseProperties(mainThreadTelemetry, response, urlString);
            return response;
        };
    }
}
function patchGlobalWebSocket(params, resolveProxyURL) {
    // eslint-disable-next-line local/code-no-any-casts
    if (!globalThis.__vscodeOriginalWebSocket) {
        const originalWebSocket = globalThis.WebSocket;
        // eslint-disable-next-line local/code-no-any-casts
        globalThis.__vscodeOriginalWebSocket = originalWebSocket;
        globalThis.WebSocket = proxyAgent.createWebSocketPatch(params, originalWebSocket, resolveProxyURL);
    }
}
function monitorResponseProperties(mainThreadTelemetry, response, urlString) {
    const originalUrl = response.url;
    Object.defineProperty(response, 'url', {
        get() {
            recordFetchFeatureUse(mainThreadTelemetry, 'url');
            return originalUrl || urlString;
        }
    });
    const originalType = response.type;
    Object.defineProperty(response, 'type', {
        get() {
            recordFetchFeatureUse(mainThreadTelemetry, 'typeProperty');
            return originalType !== 'default' ? originalType : 'basic';
        }
    });
}
const fetchFeatureUse = {
    url: 0,
    typeProperty: 0,
    data: 0,
    blob: 0,
    integrity: 0,
    manualRedirect: 0,
};
let timer;
const enableFeatureUseTelemetry = false;
function recordFetchFeatureUse(mainThreadTelemetry, feature) {
    if (enableFeatureUseTelemetry && !fetchFeatureUse[feature]++) {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            mainThreadTelemetry.$publicLog2('fetchFeatureUse', fetchFeatureUse);
        }, 10000); // collect additional features for 10 seconds
        timer.unref?.();
    }
}
function collectNodeSystemCertErrors(useNodeSystemCerts, logService) {
    if (!useNodeSystemCerts) {
        const result = 'Not using Node.js system certificates';
        logService.debug(`ProxyResolver#collectNodeSystemCertErrors: ${result}`);
        return result;
    }
    // eslint-disable-next-line local/code-no-any-casts
    if (typeof tls.getSystemCACertificatesErrors !== 'function') {
        const result = 'tls.getSystemCACertificatesErrors is not available';
        logService.debug(`ProxyResolver#collectNodeSystemCertErrors: ${result}`);
        return result;
    }
    try {
        // eslint-disable-next-line local/code-no-any-casts
        const errors = tls.getSystemCACertificatesErrors();
        if (!errors || typeof errors !== 'object') {
            const result = 'tls.getSystemCACertificatesErrors() did not return an object';
            logService.debug(`ProxyResolver#collectNodeSystemCertErrors: ${result}`);
            return result;
        }
        const counts = new Map();
        for (const [category, entries] of Object.entries(errors)) {
            if (Array.isArray(entries)) {
                for (const entry of entries) {
                    const code = entry.errorCode ?? 'missing code';
                    const error = `${category}: ${sanitizeCertErrorMessage(entry.errorMessage ?? 'missing message')}`;
                    const key = `${error} (${code})`;
                    const existing = counts.get(key);
                    if (existing) {
                        existing.count++;
                    }
                    else {
                        counts.set(key, { error, code, count: 1 });
                    }
                }
            }
        }
        const result = JSON.stringify([...counts.values()].sort((a, b) => b.count - a.count));
        logService.trace(`ProxyResolver#collectNodeSystemCertErrors: ${result}`);
        return result;
    }
    catch (err) {
        logService.debug('ProxyResolver#collectNodeSystemCertErrors: Failed to get certificate errors', err);
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
}
// Sanitize known error messages to avoid false-positive redaction by the
// telemetry scrubbing regex in telemetryUtils.ts (the Generic Secret pattern
// matches "key", "sig", "signature" followed by a non-alphanumeric character).
// Source strings from Node.js RecordCertError() and OpenSSL's x509_err.c / asn1_err.c.
const certErrorReplacements = [
    // Node.js RecordCertError:
    ['key usage flags', 'k usage flags'],
    // x509_err.c:
    ['check dh key', 'check dh k'],
    ['key type mismatch', 'k type mismatch'],
    ['key values mismatch', 'k values mismatch'],
    ['public key decode error', 'public k decode error'],
    ['public key encode error', 'public k encode error'],
    ['unable to get certs public key', 'unable to get certs public k'],
    ['unknown key type', 'unknown k type'],
    // asn1_err.c:
    ['key type not supported', 'k type not supported'],
    ['public key type', 'public k type'],
    ['sig parse error', 's parse error'],
    ['sig invalid mime type', 's invalid mime type'],
    ['sig content type', 's content type'],
    ['signature algorithm', 's algorithm'],
];
function sanitizeCertErrorMessage(message) {
    for (const [search, replacement] of certErrorReplacements) {
        message = message.replaceAll(search, replacement);
    }
    return message;
}
const proxyResolveStats = {
    count: 0,
    totalDuration: 0,
    minDuration: Number.MAX_SAFE_INTEGER,
    maxDuration: 0,
    lastSentTime: 0,
};
const telemetryInterval = 60 * 60 * 1000; // 1 hour
function sendProxyResolveStats(mainThreadTelemetry) {
    if (proxyResolveStats.count > 0) {
        const avgDuration = proxyResolveStats.totalDuration / proxyResolveStats.count;
        mainThreadTelemetry.$publicLog2('proxyResolveStats', {
            count: proxyResolveStats.count,
            totalDuration: proxyResolveStats.totalDuration,
            minDuration: proxyResolveStats.minDuration,
            maxDuration: proxyResolveStats.maxDuration,
            avgDuration,
        });
        // Reset stats after sending
        proxyResolveStats.count = 0;
        proxyResolveStats.totalDuration = 0;
        proxyResolveStats.minDuration = Number.MAX_SAFE_INTEGER;
        proxyResolveStats.maxDuration = 0;
    }
    proxyResolveStats.lastSentTime = Date.now();
}
function createTimedResolveProxy(extHostWorkspace, mainThreadTelemetry) {
    return async (url) => {
        const startTime = performance.now();
        try {
            return await extHostWorkspace.resolveProxy(url);
        }
        finally {
            const duration = performance.now() - startTime;
            proxyResolveStats.count++;
            proxyResolveStats.totalDuration += duration;
            proxyResolveStats.minDuration = Math.min(proxyResolveStats.minDuration, duration);
            proxyResolveStats.maxDuration = Math.max(proxyResolveStats.maxDuration, duration);
            // Send telemetry if at least an hour has passed since last send
            const now = Date.now();
            if (now - proxyResolveStats.lastSentTime >= telemetryInterval) {
                sendProxyResolveStats(mainThreadTelemetry);
            }
        }
    };
}
function createPatchedModules(params, resolveProxy) {
    function mergeModules(module, patch) {
        const target = module.default || module;
        target.__vscodeOriginal = Object.assign({}, target);
        return Object.assign(target, patch);
    }
    return {
        http: mergeModules(http, createHttpPatch(params, http, resolveProxy)),
        https: mergeModules(https, createHttpPatch(params, https, resolveProxy)),
        net: mergeModules(net, createNetPatch(params, net)),
        tls: mergeModules(tls, createTlsPatch(params, tls))
    };
}
function certSettingV1(configProvider, isRemote) {
    return !getExtHostConfigValue(configProvider, isRemote, 'http.experimental.systemCertificatesV2', systemCertificatesV2Default) && !!getExtHostConfigValue(configProvider, isRemote, 'http.systemCertificates');
}
function certSettingV2(configProvider, isRemote) {
    return !!getExtHostConfigValue(configProvider, isRemote, 'http.experimental.systemCertificatesV2', systemCertificatesV2Default) && !!getExtHostConfigValue(configProvider, isRemote, 'http.systemCertificates');
}
const modulesCache = new Map();
function configureModuleLoading(extensionService, lookup) {
    return extensionService.getExtensionPathIndex()
        .then(extensionPaths => {
        const node_module = require('module');
        const original = node_module._load;
        node_module._load = function load(request, parent, isMain) {
            if (request === 'net') {
                return lookup.net;
            }
            if (request === 'tls') {
                return lookup.tls;
            }
            if (request !== 'http' && request !== 'https' && request !== 'undici') {
                return original.apply(this, arguments);
            }
            const ext = extensionPaths.findSubstr(URI.file(parent.filename));
            let cache = modulesCache.get(ext);
            if (!cache) {
                modulesCache.set(ext, cache = {});
            }
            if (!cache[request]) {
                if (request === 'undici') {
                    const undici = original.apply(this, arguments);
                    proxyAgent.patchUndici(undici);
                    cache[request] = undici;
                }
                else {
                    const mod = lookup[request];
                    cache[request] = { ...mod }; // Copy to work around #93167.
                }
            }
            return cache[request];
        };
    });
}
async function lookupProxyAuthorization(extHostWorkspace, extHostLogService, mainThreadTelemetry, configProvider, proxyAuthenticateCache, basicAuthCache, isRemote, fallbackToLocalKerberos, proxyURL, proxyAuthenticate, state) {
    proxyURL = proxyURL.replace(/\/+$/, '');
    const cached = proxyAuthenticateCache[proxyURL];
    if (proxyAuthenticate) {
        proxyAuthenticateCache[proxyURL] = proxyAuthenticate;
    }
    extHostLogService.trace('ProxyResolver#lookupProxyAuthorization callback', `proxyURL:${proxyURL}`, `proxyAuthenticate:${proxyAuthenticate}`, `proxyAuthenticateCache:${cached}`);
    const header = proxyAuthenticate || cached;
    const authenticate = Array.isArray(header) ? header : typeof header === 'string' ? [header] : [];
    sendTelemetry(mainThreadTelemetry, authenticate, isRemote);
    if (authenticate.some(a => /^(Negotiate|Kerberos)( |$)/i.test(a)) && !state.kerberosRequested) {
        state.kerberosRequested = true;
        try {
            const spnConfig = getExtHostConfigValue(configProvider, isRemote, 'http.proxyKerberosServicePrincipal');
            const response = await lookupKerberosAuthorization(proxyURL, spnConfig, extHostLogService, 'ProxyResolver#lookupProxyAuthorization');
            return 'Negotiate ' + response;
        }
        catch (err) {
            extHostLogService.debug('ProxyResolver#lookupProxyAuthorization Kerberos authentication failed', err);
        }
        if (isRemote && fallbackToLocalKerberos) {
            extHostLogService.debug('ProxyResolver#lookupProxyAuthorization Kerberos authentication lookup on host', `proxyURL:${proxyURL}`);
            const auth = await extHostWorkspace.lookupKerberosAuthorization(proxyURL);
            if (auth) {
                return 'Negotiate ' + auth;
            }
        }
    }
    const basicAuthHeader = authenticate.find(a => /^Basic( |$)/i.test(a));
    if (basicAuthHeader) {
        try {
            const cachedAuth = basicAuthCache[proxyURL];
            if (cachedAuth) {
                if (state.basicAuthCacheUsed) {
                    extHostLogService.debug('ProxyResolver#lookupProxyAuthorization Basic authentication deleting cached credentials', `proxyURL:${proxyURL}`);
                    delete basicAuthCache[proxyURL];
                }
                else {
                    extHostLogService.debug('ProxyResolver#lookupProxyAuthorization Basic authentication using cached credentials', `proxyURL:${proxyURL}`);
                    state.basicAuthCacheUsed = true;
                    return cachedAuth;
                }
            }
            state.basicAuthAttempt = (state.basicAuthAttempt || 0) + 1;
            const realm = / realm="([^"]+)"/i.exec(basicAuthHeader)?.[1];
            extHostLogService.debug('ProxyResolver#lookupProxyAuthorization Basic authentication lookup', `proxyURL:${proxyURL}`, `realm:${realm}`);
            const url = new URL(proxyURL);
            const authInfo = {
                scheme: 'basic',
                host: url.hostname,
                port: Number(url.port),
                realm: realm || '',
                isProxy: true,
                attempt: state.basicAuthAttempt,
            };
            const credentials = await extHostWorkspace.lookupAuthorization(authInfo);
            if (credentials) {
                extHostLogService.debug('ProxyResolver#lookupProxyAuthorization Basic authentication received credentials', `proxyURL:${proxyURL}`, `realm:${realm}`);
                const auth = 'Basic ' + Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
                basicAuthCache[proxyURL] = auth;
                return auth;
            }
            else {
                extHostLogService.debug('ProxyResolver#lookupProxyAuthorization Basic authentication received no credentials', `proxyURL:${proxyURL}`, `realm:${realm}`);
            }
        }
        catch (err) {
            extHostLogService.error('ProxyResolver#lookupProxyAuthorization Basic authentication failed', err);
        }
    }
    return undefined;
}
let telemetrySent = false;
const enableProxyAuthenticationTelemetry = false;
function sendTelemetry(mainThreadTelemetry, authenticate, isRemote) {
    if (!enableProxyAuthenticationTelemetry || telemetrySent || !authenticate.length) {
        return;
    }
    telemetrySent = true;
    mainThreadTelemetry.$publicLog2('proxyAuthenticationRequest', {
        authenticationType: authenticate.map(a => a.split(' ')[0]).join(','),
        extensionHostType: isRemote ? 'remote' : 'local',
    });
}
function getExtHostConfigValue(configProvider, isRemote, key, fallback) {
    if (isRemote) {
        return configProvider.getConfiguration().get(key) ?? fallback;
    }
    const values = configProvider.getConfiguration().inspect(key);
    return values?.globalLocalValue ?? values?.defaultValue ?? fallback;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJveHlSZXNvbHZlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvbm9kZS9wcm94eVJlc29sdmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBT2hHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEVBQWUsUUFBUSxJQUFJLGVBQWUsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRS9GLE9BQU8sRUFBRSxRQUFRLEVBQUUsZUFBZSxFQUFFLG1CQUFtQixFQUFFLGNBQWMsRUFBeUMsY0FBYyxFQUFFLHNCQUFzQixFQUEyQixNQUFNLHFCQUFxQixDQUFDO0FBQzdNLE9BQU8sRUFBWSw2QkFBNkIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRXRHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFHNUMsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDL0YsT0FBTyxLQUFLLFVBQVUsTUFBTSxxQkFBcUIsQ0FBQztBQUVsRCxNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUMvQyxNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDN0IsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQy9CLE1BQU0sR0FBRyxHQUFtQixPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDM0MsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBRTNCLE1BQU0sMkJBQTJCLEdBQUcsS0FBSyxDQUFDO0FBQzFDLE1BQU0sdUJBQXVCLEdBQUcsS0FBSyxDQUFDO0FBRXRDLE1BQU0sVUFBVSxvQkFBb0IsQ0FDbkMsZ0JBQTJD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