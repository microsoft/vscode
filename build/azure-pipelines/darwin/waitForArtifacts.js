"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const retry_1 = require("../common/retry");
const artifacts = [
    'unsigned_vscode_client_darwin_x64_archive',
    'unsigned_vscode_client_darwin_arm64_archive'
];
function e(name) {
    const result = process.env[name];
    if (typeof result !== 'string') {
        throw new Error(`Missing env: ${name}`);
    }
    return result;
}
const azdoFetchOptions = {
    headers: {
        // Pretend we're a web browser to avoid download rate limits
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://dev.azure.com',
        Authorization: `Bearer ${e('SYSTEM_ACCESSTOKEN')}`
    }
};
async function requestAZDOAPI(path) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 2 * 60 * 1000);
    try {
        const res = await fetch(`${e('BUILDS_API_URL')}${path}?api-version=6.0`, { ...azdoFetchOptions, signal: abortController.signal });
        if (!res.ok) {
            throw new Error(`Unexpected status code: ${res.status}`);
        }
        return await res.json();
    }
    finally {
        clearTimeout(timeout);
    }
}
async function getPipelineArtifacts() {
    const result = await requestAZDOAPI('artifacts');
    return result.value.filter(a => /^vscode_/.test(a.name) && !/sbom$/.test(a.name));
}
async function main() {
    // Wait for artifacts for 30 minutes
    for (let index = 0; index < 60; index++) {
        const allArtifacts = await (0, retry_1.retry)(() => getPipelineArtifacts());
        console.log(`A total of ${allArtifacts.length} artifacts attached to the pipeline`);
        const foundArtifacts = allArtifacts.filter(a => artifacts.includes(a.name));
        console.log(`Found ${foundArtifacts.length} of ${artifacts.length} artifacts${foundArtifacts.length > 0 ? `: ${foundArtifacts.map(a => a.name).join(', ')}` : ''}`);
        if (foundArtifacts.length === artifacts.length) {
            console.log(`All required artifacts (${artifacts.join(', ')}) were found.`);
            return;
        }
        await new Promise(c => setTimeout(c, 30_000));
    }
    throw new Error(`Required artifacts (${artifacts.join(', ')}) were not uploaded within 30 minutes.`);
}
if (require.main === module) {
    main().then(() => {
        process.exit(0);
    }, err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=waitForArtifacts.js.map