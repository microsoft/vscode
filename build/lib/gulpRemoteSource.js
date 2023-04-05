"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.remote = void 0;
const es = require("event-stream");
const node_fetch_1 = require("node-fetch");
const File = require("vinyl");
const through2 = require("through2");
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
        fetchToFile(url, options).then(file => {
            cb(undefined, file);
        }, error => {
            cb(error);
        });
        return undefined;
    }));
}
exports.remote = remote;
async function fetchToFile(url, options, retries = 3, retryDelay = 1000) {
    try {
        const response = await (0, node_fetch_1.default)(url, options.fetchOptions);
        if (response.ok && (response.status >= 200 && response.status < 300)) {
            // request must be piped out once created, or we'll get this error: "You cannot pipe after data has been emitted from the response."
            const contents = options.buffer ? await response.buffer() : response.body.pipe(through2());
            return new File({
                cwd: '/',
                base: options.base,
                path: url,
                contents
            });
        }
        throw new Error(`Request ${url} failed with status code: ${response.status}`);
    }
    catch (e) {
        if (retries > 0) {
            await new Promise(c => setTimeout(c, 1000));
            return fetchToFile(url, options, retries - 1, retryDelay * 3);
        }
        throw e;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3VscFJlbW90ZVNvdXJjZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImd1bHBSZW1vdGVTb3VyY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsbUNBQW1DO0FBQ25DLDJDQUFnRDtBQUNoRCw4QkFBOEI7QUFDOUIscUNBQXFDO0FBUXJDLFNBQWdCLE1BQU0sQ0FBQyxJQUF1QixFQUFFLE9BQWlCO0lBQ2hFLElBQUksT0FBTyxLQUFLLFNBQVMsRUFBRTtRQUMxQixPQUFPLEdBQUcsRUFBRSxDQUFDO0tBQ2I7SUFFRCxJQUFJLE9BQU8sT0FBTyxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxJQUFJLEVBQUU7UUFDOUQsT0FBTyxDQUFDLElBQUksR0FBRyxHQUFHLENBQUM7S0FDbkI7SUFFRCxJQUFJLE9BQU8sT0FBTyxDQUFDLE1BQU0sS0FBSyxTQUFTLEVBQUU7UUFDeEMsT0FBTyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7S0FDdEI7SUFFRCxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUN6QixJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUNkO0lBRUQsT0FBTyxFQUFFLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUEyQixDQUFDLElBQVksRUFBRSxFQUFFLEVBQUUsRUFBRTtRQUNwRixNQUFNLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzFDLFdBQVcsQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQ3JDLEVBQUUsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDckIsQ0FBQyxFQUFFLEtBQUssQ0FBQyxFQUFFO1lBQ1YsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ1gsQ0FBQyxDQUFDLENBQUM7UUFDSCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQztBQTFCRCx3QkEwQkM7QUFFRCxLQUFLLFVBQVUsV0FBVyxDQUFDLEdBQVcsRUFBRSxPQUFpQixFQUFFLE9BQU8sR0FBRyxDQUFDLEVBQUUsVUFBVSxHQUFHLElBQUk7SUFDeEYsSUFBSTtRQUNILE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSxvQkFBSyxFQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDeEQsSUFBSSxRQUFRLENBQUMsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sSUFBSSxHQUFHLElBQUksUUFBUSxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUMsRUFBRTtZQUNyRSxvSUFBb0k7WUFDcEksTUFBTSxRQUFRLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDM0YsT0FBTyxJQUFJLElBQUksQ0FBQztnQkFDZixHQUFHLEVBQUUsR0FBRztnQkFDUixJQUFJLEVBQUUsT0FBTyxDQUFDLElBQUk7Z0JBQ2xCLElBQUksRUFBRSxHQUFHO2dCQUNULFFBQVE7YUFDUixDQUFDLENBQUM7U0FDSDtRQUNELE1BQU0sSUFBSSxLQUFLLENBQUMsV0FBVyxHQUFHLDZCQUE2QixRQUFRLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztLQUM5RTtJQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ1gsSUFBSSxPQUFPLEdBQUcsQ0FBQyxFQUFFO1lBQ2hCLE1BQU0sSUFBSSxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDNUMsT0FBTyxXQUFXLENBQUMsR0FBRyxFQUFFLE9BQU8sRUFBRSxPQUFPLEdBQUcsQ0FBQyxFQUFFLFVBQVUsR0FBRyxDQUFDLENBQUMsQ0FBQztTQUM5RDtRQUNELE1BQU0sQ0FBQyxDQUFDO0tBQ1I7QUFDRixDQUFDIn0=