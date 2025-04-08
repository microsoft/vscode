"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const publish_1 = require("../common/publish");
const retry_1 = require("../common/retry");
const artifacts = [
    'unsigned_vscode_client_darwin_x64_archive',
    'unsigned_vscode_client_darwin_arm64_archive'
];
async function main() {
    // Wait for artifacts for 30 minutes
    for (let index = 0; index < 60; index++) {
        const allArtifacts = await (0, retry_1.retry)(() => (0, publish_1.getPipelineArtifacts)());
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