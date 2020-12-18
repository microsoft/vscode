/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const cosmos_1 = require("@azure/cosmos");
const retry_1 = require("./retry");
if (process.argv.length !== 3) {
    console.error('Usage: node createBuild.js VERSION');
    process.exit(-1);
}
function getEnv(name) {
    const result = process.env[name];
    if (typeof result === 'undefined') {
        throw new Error('Missing env: ' + name);
    }
    return result;
}
async function main() {
    const [, , _version] = process.argv;
    const quality = getEnv('VSCODE_QUALITY');
    const commit = getEnv('BUILD_SOURCEVERSION');
    const queuedBy = getEnv('BUILD_QUEUEDBY');
    const sourceBranch = getEnv('BUILD_SOURCEBRANCH');
    const version = _version + (quality === 'stable' ? '' : `-${quality}`);
    console.log('Creating build...');
    console.log('Quality:', quality);
    console.log('Version:', version);
    console.log('Commit:', commit);
    const build = {
        id: commit,
        timestamp: (new Date()).getTime(),
        version,
        isReleased: false,
        sourceBranch,
        queuedBy,
        assets: [],
        updates: {}
    };
    const client = new cosmos_1.CosmosClient({ endpoint: process.env['AZURE_DOCUMENTDB_ENDPOINT'], key: process.env['AZURE_DOCUMENTDB_MASTERKEY'] });
    const scripts = client.database('builds').container(quality).scripts;
    await retry_1.retry(() => scripts.storedProcedure('createBuild').execute('', [Object.assign(Object.assign({}, build), { _partitionKey: '' })]));
}
main().then(() => {
    console.log('Build successfully created');
    process.exit(0);
}, err => {
    console.error(err);
    process.exit(1);
});
