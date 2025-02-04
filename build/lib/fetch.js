"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchUrls = fetchUrls;
exports.fetchUrl = fetchUrl;
exports.fetchGithub = fetchGithub;
const event_stream_1 = __importDefault(require("event-stream"));
const vinyl_1 = __importDefault(require("vinyl"));
const fancy_log_1 = __importDefault(require("fancy-log"));
const ansi_colors_1 = __importDefault(require("ansi-colors"));
const crypto_1 = __importDefault(require("crypto"));
const through2_1 = __importDefault(require("through2"));
function fetchUrls(urls, options) {
    if (options === undefined) {
        options = {};
    }
    if (typeof options.base !== 'string' && options.base !== null) {
        options.base = '/';
    }
    if (!Array.isArray(urls)) {
        urls = [urls];
    }
    return event_stream_1.default.readArray(urls).pipe(event_stream_1.default.map((data, cb) => {
        const url = [options.base, data].join('');
        fetchUrl(url, options).then(file => {
            cb(undefined, file);
        }, error => {
            cb(error);
        });
    }));
}
async function fetchUrl(url, options, retries = 10, retryDelay = 1000) {
    const verbose = !!options.verbose || !!process.env['CI'] || !!process.env['BUILD_ARTIFACTSTAGINGDIRECTORY'];
    try {
        let startTime = 0;
        if (verbose) {
            (0, fancy_log_1.default)(`Start fetching ${ansi_colors_1.default.magenta(url)}${retries !== 10 ? ` (${10 - retries} retry)` : ''}`);
            startTime = new Date().getTime();
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30 * 1000);
        try {
            const response = await fetch(url, {
                ...options.nodeFetchOptions,
                signal: controller.signal /* Typings issue with lib.dom.d.ts */
            });
            if (verbose) {
                (0, fancy_log_1.default)(`Fetch completed: Status ${response.status}. Took ${ansi_colors_1.default.magenta(`${new Date().getTime() - startTime} ms`)}`);
            }
            if (response.ok && (response.status >= 200 && response.status < 300)) {
                const contents = Buffer.from(await response.arrayBuffer());
                if (options.checksumSha256) {
                    const actualSHA256Checksum = crypto_1.default.createHash('sha256').update(contents).digest('hex');
                    if (actualSHA256Checksum !== options.checksumSha256) {
                        throw new Error(`Checksum mismatch for ${ansi_colors_1.default.cyan(url)} (expected ${options.checksumSha256}, actual ${actualSHA256Checksum}))`);
                    }
                    else if (verbose) {
                        (0, fancy_log_1.default)(`Verified SHA256 checksums match for ${ansi_colors_1.default.cyan(url)}`);
                    }
                }
                else if (verbose) {
                    (0, fancy_log_1.default)(`Skipping checksum verification for ${ansi_colors_1.default.cyan(url)} because no expected checksum was provided`);
                }
                if (verbose) {
                    (0, fancy_log_1.default)(`Fetched response body buffer: ${ansi_colors_1.default.magenta(`${contents.byteLength} bytes`)}`);
                }
                return new vinyl_1.default({
                    cwd: '/',
                    base: options.base,
                    path: url,
                    contents
                });
            }
            let err = `Request ${ansi_colors_1.default.magenta(url)} failed with status code: ${response.status}`;
            if (response.status === 403) {
                err += ' (you may be rate limited)';
            }
            throw new Error(err);
        }
        finally {
            clearTimeout(timeout);
        }
    }
    catch (e) {
        if (verbose) {
            (0, fancy_log_1.default)(`Fetching ${ansi_colors_1.default.cyan(url)} failed: ${e}`);
        }
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            return fetchUrl(url, options, retries - 1, retryDelay);
        }
        throw e;
    }
}
const ghApiHeaders = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'VSCode Build',
};
if (process.env.GITHUB_TOKEN) {
    ghApiHeaders.Authorization = 'Basic ' + Buffer.from(process.env.GITHUB_TOKEN).toString('base64');
}
const ghDownloadHeaders = {
    ...ghApiHeaders,
    Accept: 'application/octet-stream',
};
/**
 * @param repo for example `Microsoft/vscode`
 * @param version for example `16.17.1` - must be a valid releases tag
 * @param assetName for example (name) => name === `win-x64-node.exe` - must be an asset that exists
 * @returns a stream with the asset as file
 */
function fetchGithub(repo, options) {
    return fetchUrls(`/repos/${repo.replace(/^\/|\/$/g, '')}/releases/tags/v${options.version}`, {
        base: 'https://api.github.com',
        verbose: options.verbose,
        nodeFetchOptions: { headers: ghApiHeaders }
    }).pipe(through2_1.default.obj(async function (file, _enc, callback) {
        const assetFilter = typeof options.name === 'string' ? (name) => name === options.name : options.name;
        const asset = JSON.parse(file.contents.toString()).assets.find((a) => assetFilter(a.name));
        if (!asset) {
            return callback(new Error(`Could not find asset in release of ${repo} @ ${options.version}`));
        }
        try {
            callback(null, await fetchUrl(asset.url, {
                nodeFetchOptions: { headers: ghDownloadHeaders },
                verbose: options.verbose,
                checksumSha256: options.checksumSha256
            }));
        }
        catch (error) {
            callback(error);
        }
    }));
}
//# sourceMappingURL=fetch.js.map