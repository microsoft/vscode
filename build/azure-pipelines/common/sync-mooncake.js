/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const url = require("url");
const azure = require("azure-storage");
const mime = require("mime");
const cosmos_1 = require("@azure/cosmos");
const retry_1 = require("./retry");
function log(...args) {
    console.log(...[`[${new Date().toISOString()}]`, ...args]);
}
function error(...args) {
    console.error(...[`[${new Date().toISOString()}]`, ...args]);
}
if (process.argv.length < 3) {
    error('Usage: node sync-mooncake.js <quality>');
    process.exit(-1);
}
async function sync(commit, quality) {
    log(`Synchronizing Mooncake assets for ${quality}, ${commit}...`);
    const client = new cosmos_1.CosmosClient({ endpoint: process.env['AZURE_DOCUMENTDB_ENDPOINT'], key: process.env['AZURE_DOCUMENTDB_MASTERKEY'] });
    const container = client.database('builds').container(quality);
    const query = `SELECT TOP 1 * FROM c WHERE c.id = "${commit}"`;
    const res = await container.items.query(query, {}).fetchAll();
    if (res.resources.length !== 1) {
        throw new Error(`No builds found for ${commit}`);
    }
    const build = res.resources[0];
    log(`Found build for ${commit}, with ${build.assets.length} assets`);
    const storageAccount = process.env['AZURE_STORAGE_ACCOUNT_2'];
    const blobService = azure.createBlobService(storageAccount, process.env['AZURE_STORAGE_ACCESS_KEY_2'])
        .withFilter(new azure.ExponentialRetryPolicyFilter(20));
    const mooncakeBlobService = azure.createBlobService(storageAccount, process.env['MOONCAKE_STORAGE_ACCESS_KEY'], `${storageAccount}.blob.core.chinacloudapi.cn`)
        .withFilter(new azure.ExponentialRetryPolicyFilter(20));
    // mooncake is fussy and far away, this is needed!
    blobService.defaultClientRequestTimeoutInMs = 10 * 60 * 1000;
    mooncakeBlobService.defaultClientRequestTimeoutInMs = 10 * 60 * 1000;
    for (const asset of build.assets) {
        try {
            const blobPath = url.parse(asset.url).path;
            if (!blobPath) {
                throw new Error(`Failed to parse URL: ${asset.url}`);
            }
            const blobName = blobPath.replace(/^\/\w+\//, '');
            log(`Found ${blobName}`);
            if (asset.mooncakeUrl) {
                log(`  Already in Mooncake ✔️`);
                continue;
            }
            const readStream = blobService.createReadStream(quality, blobName, undefined);
            const blobOptions = {
                contentSettings: {
                    contentType: mime.lookup(blobPath),
                    cacheControl: 'max-age=31536000, public'
                }
            };
            const writeStream = mooncakeBlobService.createWriteStreamToBlockBlob(quality, blobName, blobOptions, undefined);
            log(`  Uploading to Mooncake...`);
            await new Promise((c, e) => readStream.pipe(writeStream).on('finish', c).on('error', e));
            log(`  Updating build in DB...`);
            const mooncakeUrl = `${process.env['MOONCAKE_CDN_URL']}${blobPath}`;
            await retry_1.retry(() => container.scripts.storedProcedure('setAssetMooncakeUrl')
                .execute('', [commit, asset.platform, asset.type, mooncakeUrl]));
            log(`  Done ✔️`);
        }
        catch (err) {
            error(err);
        }
    }
    log(`All done ✔️`);
}
function main() {
    const commit = process.env['BUILD_SOURCEVERSION'];
    if (!commit) {
        error('Skipping publish due to missing BUILD_SOURCEVERSION');
        return;
    }
    const quality = process.argv[2];
    sync(commit, quality).catch(err => {
        error(err);
        process.exit(1);
    });
}
main();
