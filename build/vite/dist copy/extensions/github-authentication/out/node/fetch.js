"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetching = void 0;
exports.createFetch = createFetch;
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const vscode_1 = require("vscode");
const stream_1 = require("stream");
const _fetchers = [];
try {
    _fetchers.push({
        name: 'Electron fetch',
        fetch: require('electron').net.fetch
    });
}
catch {
    // ignore
}
const nodeFetch = {
    name: 'Node fetch',
    fetch,
};
const useElectronFetch = vscode_1.workspace.getConfiguration('github-authentication').get('useElectronFetch', true);
if (useElectronFetch) {
    _fetchers.push(nodeFetch);
}
else {
    _fetchers.unshift(nodeFetch);
}
_fetchers.push({
    name: 'Node http/s',
    fetch: nodeHTTP,
});
function createFetch() {
    let fetchers = _fetchers;
    return async (url, options) => {
        const result = await fetchWithFallbacks(fetchers, url, options, options.logger);
        if (result.updatedFetchers) {
            fetchers = result.updatedFetchers;
        }
        return result.response;
    };
}
function shouldNotRetry(status) {
    // Don't retry with other fetchers for these HTTP status codes:
    // - 429 Too Many Requests (rate limiting)
    // - 401 Unauthorized (authentication issue)
    // - 403 Forbidden (authorization issue)
    // - 404 Not Found (resource doesn't exist)
    // These are application-level errors where retrying with a different fetcher won't help
    return status === 429 || status === 401 || status === 403 || status === 404;
}
async function fetchWithFallbacks(availableFetchers, url, options, logService) {
    if (options.retryFallbacks && availableFetchers.length > 1) {
        let firstResult;
        for (const fetcher of availableFetchers) {
            const result = await tryFetch(fetcher, url, options, logService);
            if (fetcher === availableFetchers[0]) {
                firstResult = result;
            }
            if (!result.ok) {
                // For certain HTTP status codes, don't retry with other fetchers
                // These are application-level errors, not network-level errors
                if ('response' in result && shouldNotRetry(result.response.status)) {
                    return { response: result.response };
                }
                continue;
            }
            if (fetcher !== availableFetchers[0]) {
                const retry = await tryFetch(availableFetchers[0], url, options, logService);
                if (retry.ok) {
                    return { response: retry.response };
                }
                logService.info(`FetcherService: using ${fetcher.name} from now on`);
                const updatedFetchers = availableFetchers.slice();
                updatedFetchers.splice(updatedFetchers.indexOf(fetcher), 1);
                updatedFetchers.unshift(fetcher);
                return { response: result.response, updatedFetchers };
            }
            return { response: result.response };
        }
        if ('response' in firstResult) {
            return { response: firstResult.response };
        }
        throw firstResult.err;
    }
    return { response: await availableFetchers[0].fetch(url, options) };
}
async function tryFetch(fetcher, url, options, logService) {
    try {
        logService.debug(`FetcherService: trying fetcher ${fetcher.name} for ${url}`);
        const response = await fetcher.fetch(url, options);
        if (!response.ok) {
            logService.info(`FetcherService: ${fetcher.name} failed with status: ${response.status} ${response.statusText}`);
            return { ok: false, response };
        }
        if (!options.expectJSON) {
            logService.debug(`FetcherService: ${fetcher.name} succeeded (not JSON)`);
            return { ok: response.ok, response };
        }
        const text = await response.text();
        try {
            const json = JSON.parse(text); // Verify JSON
            logService.debug(`FetcherService: ${fetcher.name} succeeded (JSON)`);
            return { ok: true, response: new FetchResponseImpl(response.status, response.statusText, response.headers, async () => text, async () => json, async () => stream_1.Readable.from([text])) };
        }
        catch (err) {
            logService.info(`FetcherService: ${fetcher.name} failed to parse JSON: ${err.message}`);
            return { ok: false, err, response: new FetchResponseImpl(response.status, response.statusText, response.headers, async () => text, async () => { throw err; }, async () => stream_1.Readable.from([text])) };
        }
    }
    catch (err) {
        logService.info(`FetcherService: ${fetcher.name} failed with error: ${err.message}`);
        return { ok: false, err };
    }
}
exports.fetching = createFetch();
class FetchResponseImpl {
    status;
    statusText;
    headers;
    text;
    json;
    body;
    ok;
    constructor(status, statusText, headers, text, json, body) {
        this.status = status;
        this.statusText = statusText;
        this.headers = headers;
        this.text = text;
        this.json = json;
        this.body = body;
        this.ok = this.status >= 200 && this.status < 300;
    }
}
async function nodeHTTP(url, options) {
    return new Promise((resolve, reject) => {
        const { method, headers, body, signal } = options;
        const module = url.startsWith('https:') ? https : http;
        const req = module.request(url, { method, headers }, res => {
            if (signal?.aborted) {
                res.destroy();
                req.destroy();
                reject(makeAbortError(signal));
                return;
            }
            const nodeFetcherResponse = new NodeFetcherResponse(req, res, signal);
            resolve(new FetchResponseImpl(res.statusCode || 0, res.statusMessage || '', nodeFetcherResponse.headers, async () => nodeFetcherResponse.text(), async () => nodeFetcherResponse.json(), async () => nodeFetcherResponse.body()));
        });
        req.setTimeout(60 * 1000); // time out after 60s of receiving no data
        req.on('error', reject);
        if (body) {
            req.write(body);
        }
        req.end();
    });
}
class NodeFetcherResponse {
    req;
    res;
    signal;
    headers;
    constructor(req, res, signal) {
        this.req = req;
        this.res = res;
        this.signal = signal;
        this.headers = new class {
            get(name) {
                const result = res.headers[name];
                return Array.isArray(result) ? result[0] : result ?? null;
            }
            [Symbol.iterator]() {
                const keys = Object.keys(res.headers);
                let index = 0;
                return {
                    next: () => {
                        if (index >= keys.length) {
                            return { done: true, value: undefined };
                        }
                        const key = keys[index++];
                        return { done: false, value: [key, this.get(key)] };
                    }
                };
            }
        };
    }
    text() {
        return new Promise((resolve, reject) => {
            const chunks = [];
            this.res.on('data', chunk => chunks.push(chunk));
            this.res.on('end', () => resolve(Buffer.concat(chunks).toString()));
            this.res.on('error', reject);
            this.signal?.addEventListener('abort', () => {
                this.res.destroy();
                this.req.destroy();
                reject(makeAbortError(this.signal));
            });
        });
    }
    async json() {
        const text = await this.text();
        return JSON.parse(text);
    }
    async body() {
        this.signal?.addEventListener('abort', () => {
            this.res.emit('error', makeAbortError(this.signal));
            this.res.destroy();
            this.req.destroy();
        });
        return this.res;
    }
}
function makeAbortError(signal) {
    // see https://github.com/nodejs/node/issues/38361#issuecomment-1683839467
    return signal.reason;
}
//# sourceMappingURL=fetch.js.map