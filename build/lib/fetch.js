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
    const verbose = !!options.verbose ?? (!!process.env['CI'] || !!process.env['BUILD_ARTIFACTSTAGINGDIRECTORY']);
    try {
        let startTime = 0;
        if (verbose) {
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
            if (verbose) {
                log(`Fetch completed: Status ${response.status}. Took ${ansiColors.magenta(`${new Date().getTime() - startTime} ms`)}`);
            }
            if (response.ok && (response.status >= 200 && response.status < 300)) {
                const contents = await response.buffer();
                if (options.checksumSha256) {
                    const actualSHA256Checksum = crypto.createHash('sha256').update(contents).digest('hex');
                    if (actualSHA256Checksum !== options.checksumSha256) {
                        throw new Error(`Checksum mismatch for ${ansiColors.cyan(url)} (expected ${options.checksumSha256}, actual ${actualSHA256Checksum}))`);
                    }
                    else if (verbose) {
                        log(`Verified SHA256 checksums match for ${ansiColors.cyan(url)}`);
                    }
                }
                else if (verbose) {
                    log(`Skipping checksum verification for ${ansiColors.cyan(url)} because no expected checksum was provided`);
                }
                if (verbose) {
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
        if (verbose) {
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
        verbose: options.verbose,
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
                verbose: options.verbose,
                checksumSha256: options.checksumSha256
            }));
        }
        catch (error) {
            callback(error);
        }
    }));
}
exports.fetchGithub = fetchGithub;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmV0Y2guanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJmZXRjaC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyxtQ0FBbUM7QUFDbkMsMkNBQWdEO0FBQ2hELG1DQUFtQztBQUNuQyxpQ0FBaUM7QUFDakMsMENBQTBDO0FBQzFDLGlDQUFpQztBQUNqQyxxQ0FBcUM7QUFVckMsU0FBZ0IsU0FBUyxDQUFDLElBQXVCLEVBQUUsT0FBc0I7SUFDeEUsSUFBSSxPQUFPLEtBQUssU0FBUyxFQUFFLENBQUM7UUFDM0IsT0FBTyxHQUFHLEVBQUUsQ0FBQztJQUNkLENBQUM7SUFFRCxJQUFJLE9BQU8sT0FBTyxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUMvRCxPQUFPLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQztJQUNwQixDQUFDO0lBRUQsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUMxQixJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNmLENBQUM7SUFFRCxPQUFPLEVBQUUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQTJCLENBQUMsSUFBWSxFQUFFLEVBQUUsRUFBRSxFQUFFO1FBQ3BGLE1BQU0sR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDMUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDbEMsRUFBRSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNyQixDQUFDLEVBQUUsS0FBSyxDQUFDLEVBQUU7WUFDVixFQUFFLENBQUMsS0FBSyxDQUFDLENBQUM7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