"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.remote = void 0;
const es = require("event-stream");
const node_fetch_1 = require("node-fetch");
const VinylFile = require("vinyl");
const through2 = require("through2");
const log = require("fancy-log");
const ansiColors = require("ansi-colors");
function remote(urls, options) {
    if (options === undefined) {
        options = {};
    }
    if (typeof options.base !== 'string' && options.base !== null) {
        options.base = '/';
    }
    if (typeof options.buffer !== 'boolean') {
        options.buffer = true;
    }
    if (!Array.isArray(urls)) {
        urls = [urls];
    }
    return es.readArray(urls).pipe(es.map((data, cb) => {
        const url = [options.base, data].join('');
        fetchWithRetry(url, options).then(file => {
            cb(undefined, file);
        }, error => {
            cb(error);
        });
    }));
}
exports.remote = remote;
async function fetchWithRetry(url, options, retries = 10, retryDelay = 1000) {
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
                ...options.fetchOptions,
                signal: controller.signal /* Typings issue with lib.dom.d.ts */
            });
            if (options.verbose) {
                log(`Fetch completed: Status ${response.status}. Took ${ansiColors.magenta(`${new Date().getTime() - startTime} ms`)}`);
            }
            if (response.ok && (response.status >= 200 && response.status < 300)) {
                // request must be piped out once created, or we'll get this error: "You cannot pipe after data has been emitted from the response."
                const contents = options.buffer ? await response.buffer() : response.body.pipe(through2());
                if (options.buffer && options.verbose) {
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
            return fetchWithRetry(url, options, retries - 1, retryDelay);
        }
        throw e;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3VscFJlbW90ZVNvdXJjZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImd1bHBSZW1vdGVTb3VyY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsbUNBQW1DO0FBQ25DLDJDQUFnRDtBQUNoRCxtQ0FBbUM7QUFDbkMscUNBQXFDO0FBQ3JDLGlDQUFpQztBQUNqQywwQ0FBMEM7QUFTMUMsU0FBZ0IsTUFBTSxDQUFDLElBQXVCLEVBQUUsT0FBaUI7SUFDaEUsSUFBSSxPQUFPLEtBQUssU0FBUyxFQUFFO1FBQzFCLE9BQU8sR0FBRyxFQUFFLENBQUM7S0FDYjtJQUVELElBQUksT0FBTyxPQUFPLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLElBQUksRUFBRTtRQUM5RCxPQUFPLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQztLQUNuQjtJQUVELElBQUksT0FBTyxPQUFPLENBQUMsTUFBTSxLQUFLLFNBQVMsRUFBRTtRQUN4QyxPQUFPLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztLQUN0QjtJQUVELElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFO1FBQ3pCLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ2Q7SUFFRCxPQUFPLEVBQUUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQTJCLENBQUMsSUFBWSxFQUFFLEVBQUUsRUFBRSxFQUFFO1FBQ3BGLE1BQU0sR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDMUMsY0FBYyxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDeEMsRUFBRSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMs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