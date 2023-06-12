"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchGithub = exports.fetchUrl = exports.fetchUrls = void 0;
const es = require("event-stream");
const node_fetch_1 = require("node-fetch");
const VinylFile = require("vinyl");
const log = require("fancy-log");
const ansiColors = require("ansi-colors");
const crypto = require("crypto");
const through2 = require("through2");
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
    return es.readArray(urls).pipe(es.map((data, cb) => {
        const url = [options.base, data].join('');
        fetchUrl(url, options).then(file => {
            cb(undefined, file);
        }, error => {
            cb(error);
        });
    }));
}
exports.fetchUrls = fetchUrls;
async function fetchUrl(url, options, retries = 10, retryDelay = 1000) {
    try {
        let startTime = 0;
        if (options.verbose) {
            log(`Start fetching ${ansiColors.magenta(url)}${retries !== 10 ? `(${10 - retries} retry}` : ''}`);
            startTime = new Date().getTime();
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30 * 1000);
        try {
            const response = await (0, node_fetch_1.default)(url, {
                ...options.nodeFetchOptions,
                signal: controller.signal /* Typings issue with lib.dom.d.ts */
            });
            if (options.verbose) {
                log(`Fetch completed: Status ${response.status}. Took ${ansiColors.magenta(`${new Date().getTime() - startTime} ms`)}`);
            }
            if (response.ok && (response.status >= 200 && response.status < 300)) {
                const contents = await response.buffer();
                if (options.checksumSha256) {
                    const hash = crypto.createHash('sha256');
                    hash.update(contents);
                    if (hash.digest('hex') !== options.checksumSha256) {
                        throw new Error(`Checksum mismatch for ${url}`);
                    }
                }
                if (options.verbose) {
                    log(`Fetched response body buffer: ${ansiColors.magenta(`${contents.byteLength} bytes`)}`);
                }
                return new VinylFile({
                    cwd: '/',
                    base: options.base,
                    path: url,
                    contents
                });
            }
            throw new Error(`Request ${ansiColors.magenta(url)} failed with status code: ${response.status}`);
        }
        finally {
            clearTimeout(timeout);
        }
    }
    catch (e) {
        if (options.verbose) {
            log(`Fetching ${ansiColors.cyan(url)} failed: ${e}`);
        }
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            return fetchUrl(url, options, retries - 1, retryDelay);
        }
        throw e;
    }
}
exports.fetchUrl = fetchUrl;
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
        verbose: true,
        nodeFetchOptions: { headers: ghApiHeaders }
    }).pipe(through2.obj(async function (file, _enc, callback) {
        const assetFilter = typeof options.name === 'string' ? (name) => name === options.name : options.name;
        const asset = JSON.parse(file.contents.toString()).assets.find((a) => assetFilter(a.name));
        if (!asset) {
            return callback(new Error(`Could not find asset in release of ${repo} @ ${options.version}`));
        }
        try {
            callback(null, await fetchUrl(asset.url, {
                nodeFetchOptions: { headers: ghDownloadHeaders },
                verbose: true,
                checksumSha256: options.checksumSha256
            }));
        }
        catch (error) {
            callback(error);
        }
    }));
}
exports.fetchGithub = fetchGithub;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmV0Y2guanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJmZXRjaC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyxtQ0FBbUM7QUFDbkMsMkNBQWdEO0FBQ2hELG1DQUFtQztBQUNuQyxpQ0FBaUM7QUFDakMsMENBQTBDO0FBQzFDLGlDQUFpQztBQUNqQyxxQ0FBcUM7QUFVckMsU0FBZ0IsU0FBUyxDQUFDLElBQXVCLEVBQUUsT0FBc0I7SUFDeEUsSUFBSSxPQUFPLEtBQUssU0FBUyxFQUFFO1FBQzFCLE9BQU8sR0FBRyxFQUFFLENBQUM7S0FDYjtJQUVELElBQUksT0FBTyxPQUFPLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLElBQUksRUFBRTtRQUM5RCxPQUFPLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQztLQUNuQjtJQUVELElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFO1FBQ3pCLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ2Q7SUFFRCxPQUFPLEVBQUUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQTJCLENBQUMsSUFBWSxFQUFFLEVBQUUsRUFBRSxFQUFFO1FBQ3BGLE1BQU0sR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDMUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDbEMsRUFBRSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNyQixDQUFDLEVBQUUsS0FBSyxDQUFDLEVBQUU7WUFDVixFQUFFLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDWCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMs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