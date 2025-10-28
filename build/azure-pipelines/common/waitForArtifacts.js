"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const publish_1 = require("../common/publish");
const retry_1 = require("../common/retry");
async function getPipelineArtifacts() {
    const result = await (0, publish_1.requestAZDOAPI)('artifacts');
    return result.value.filter(a => !/sbom$/.test(a.name));
}
async function main(artifacts) {
    if (artifacts.length === 0) {
        throw new Error(`Usage: node waitForArtifacts.js <artifactName1> <artifactName2> ...`);
    }
    // This loop will run for 30 minutes and waits to the x64 and arm64 artifacts
    // to be uploaded to the pipeline by the `macOS` and `macOSARM64` jobs. As soon
    // as these artifacts are found, the loop completes and the `macOSUnivesrsal`
    // job resumes.
    for (let index = 0; index < 60; index++) {
        try {
            console.log(`Waiting for artifacts (${artifacts.join(', ')}) to be uploaded (${index + 1}/60)...`);
            const allArtifacts = await (0, retry_1.retry)(() => getPipelineArtifacts());
            console.log(`  * Artifacts attached to the pipelines: ${allArtifacts.length > 0 ? allArtifacts.map(a => a.name).join(', ') : 'none'}`);
            const foundArtifacts = allArtifacts.filter(a => artifacts.includes(a.name));
            console.log(`  * Found artifacts: ${foundArtifacts.length > 0 ? foundArtifacts.map(a => a.name).join(', ') : 'none'}`);
            if (foundArtifacts.length === artifacts.length) {
                console.log(`  * All artifacts were found`);
                return;
            }
        }
        catch (err) {
            console.error(`ERROR: Failed to get pipeline artifacts: ${err}`);
        }
        await new Promise(c => setTimeout(c, 30_000));
    }
    throw new Error(`ERROR: Artifacts (${artifacts.join(', ')}) were not uploaded within 30 minutes.`);
}
main(process.argv.splice(2)).then(() => {
    process.exit(0);
}, err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=waitForArtifacts.js.map