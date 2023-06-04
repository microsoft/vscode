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
async function fetchWithRetry(url, options, retries = 3, retryDelay = 250) {
    try {
        let startTime = 0;
        if (options.verbose) {
            log(`Start fetching ${ansiColors.magenta(url)}${retries !== 3 ? `(${3 - retries} retry}` : ''}`);
            startTime = new Date().getTime();
        }
        const response = await (0, node_fetch_1.default)(url, options.fetchOptions);
        if (options.verbose) {
            log(`Fetch completed: Status ${response.status}. Took ${ansiColors.magenta(`${new Date().getTime() - startTime} ms`)}`);
        }
        if (response.ok && (response.status >= 200 && response.status < 300)) {
            // request must be piped out once created, or we'll get this error: "You cannot pipe after data has been emitted from the response."
            const contents = options.buffer ? await response.buffer() : response.body.pipe(through2());
            return new VinylFile({
                cwd: '/',
                base: options.base,
                path: url,
                contents
            });
        }
        throw new Error(`Request ${ansiColors.magenta(url)} failed with status code: ${response.status}`);
    }
    catch (e) {
        if (retries > 0) {
            await new Promise(c => setTimeout(c, retryDelay));
            return fetchWithRetry(url, options, retries - 1, retryDelay * 3);
        }
        if (options.verbose) {
            log(`Fetching ${ansiColors.cyan(url)} failed: ${e}`);
        }
        throw e;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3VscFJlbW90ZVNvdXJjZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImd1bHBSZW1vdGVTb3VyY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsbUNBQW1DO0FBQ25DLDJDQUFnRDtBQUNoRCxtQ0FBbUM7QUFDbkMscUNBQXFDO0FBQ3JDLGlDQUFpQztBQUNqQywwQ0FBMEM7QUFTMUMsU0FBZ0IsTUFBTSxDQUFDLElBQXVCLEVBQUUsT0FBaUI7SUFDaEUsSUFBSSxPQUFPLEtBQUssU0FBUyxFQUFFO1FBQzFCLE9BQU8sR0FBRyxFQUFFLENBQUM7S0FDYjtJQUVELElBQUksT0FBTyxPQUFPLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLElBQUksRUFBRTtRQUM5RCxPQUFPLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQztLQUNuQjtJQUVELElBQUksT0FBTyxPQUFPLENBQUMsTUFBTSxLQUFLLFNBQVMsRUFBRTtRQUN4QyxPQUFPLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztLQUN0QjtJQUVELElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFO1FBQ3pCLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ2Q7SUFFRCxPQUFPLEVBQUUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQTJCLENBQUMsSUFBWSxFQUFFLEVBQUUsRUFBRSxFQUFFO1FBQ3BGLE1BQU0sR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDMUMsY0FBYyxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDeEMsRUFBRSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMs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