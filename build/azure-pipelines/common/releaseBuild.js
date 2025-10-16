"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const cosmos_1 = require("@azure/cosmos");
const retry_1 = require("./retry");
function getEnv(name) {
    const result = process.env[name];
    if (typeof result === 'undefined') {
        throw new Error('Missing env: ' + name);
    }
    return result;
}
function createDefaultConfig(quality) {
    return {
        id: quality,
        frozen: false
    };
}
async function getConfig(client, quality) {
    const query = `SELECT TOP 1 * FROM c WHERE c.id = "${quality}"`;
    const res = await client.database('builds').container('config').items.query(query).fetchAll();
    if (res.resources.length === 0) {
        return createDefaultConfig(quality);
    }
    return res.resources[0];
}
async function main(force) {
    const commit = getEnv('BUILD_SOURCEVERSION');
    const quality = getEnv('VSCODE_QUALITY');
    const { cosmosDBAccessToken } = JSON.parse(getEnv('PUBLISH_AUTH_TOKENS'));
    const client = new cosmos_1.CosmosClient({ endpoint: process.env['AZURE_DOCUMENTDB_ENDPOINT'], tokenProvider: () => Promise.resolve(`type=aad&ver=1.0&sig=${cosmosDBAccessToken.token}`) });
    if (!force) {
        const config = await getConfig(client, quality);
        console.log('Quality config:', config);
        if (config.frozen) {
            console.log(`Skipping release because quality ${quality} is frozen.`);
            return;
        }
    }
    console.log(`Releasing build ${commit}...`);
    const scripts = client.database('builds').container(quality).scripts;
    await (0, retry_1.retry)(() => scripts.storedProcedure('releaseBuild').execute('', [commit]));
}
const [, , force] = process.argv;
console.log(process.argv);
main(/^true$/i.test(force)).then(() => {
    console.log('Build successfully released');
    process.exit(0);
}, err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=releaseBuild.js.map