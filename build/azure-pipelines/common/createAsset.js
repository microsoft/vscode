"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const crypto = require("crypto");
const storage_blob_1 = require("@azure/storage-blob");
const mime = require("mime");
const cosmos_1 = require("@azure/cosmos");
const identity_1 = require("@azure/identity");
const retry_1 = require("./retry");
if (process.argv.length !== 8) {
    console.error('Usage: node createAsset.js PRODUCT OS ARCH TYPE NAME FILE');
    process.exit(-1);
}
// Contains all of the logic for mapping details to our actual product names in CosmosDB
function getPlatform(product, os, arch, type) {
    switch (os) {
        case 'win32':
            switch (product) {
                case 'client': {
                    const asset = arch === 'ia32' ? 'win32' : `win32-${arch}`;
                    switch (type) {
                        case 'archive':
                            return `${asset}-archive`;
                        case 'setup':
                            return asset;
                        case 'user-setup':
                            return `${asset}-user`;
                        default:
                            throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
                    }
                }
                case 'server':
                    if (arch === 'arm64') {
                        throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
                    }
                    return arch === 'ia32' ? 'server-win32' : `server-win32-${arch}`;
                case 'web':
                    if (arch === 'arm64') {
                        throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
                    }
                    return arch === 'ia32' ? 'server-win32-web' : `server-win32-${arch}-web`;
                case 'cli':
                    return `cli-win32-${arch}`;
                default:
                    throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
            }
        case 'alpine':
            switch (product) {
                case 'server':
                    return `server-alpine-${arch}`;
                case 'web':
                    return `server-alpine-${arch}-web`;
                case 'cli':
                    return `cli-alpine-${arch}`;
                default:
                    throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
            }
        case 'linux':
            switch (type) {
                case 'snap':
                    return `linux-snap-${arch}`;
                case 'archive-unsigned':
                    switch (product) {
                        case 'client':
                            return `linux-${arch}`;
                        case 'server':
                            return `server-linux-${arch}`;
                        case 'web':
                            return arch === 'standalone' ? 'web-standalone' : `server-linux-${arch}-web`;
                        default:
                            throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
                    }
                case 'deb-package':
                    return `linux-deb-${arch}`;
                case 'rpm-package':
                    return `linux-rpm-${arch}`;
                case 'cli':
                    return `cli-linux-${arch}`;
                default:
                    throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
            }
        case 'darwin':
            switch (product) {
                case 'client':
                    if (arch === 'x64') {
                        return 'darwin';
                    }
                    return `darwin-${arch}`;
                case 'server':
                    if (arch === 'x64') {
                        return 'server-darwin';
                    }
                    return `server-darwin-${arch}`;
                case 'web':
                    if (arch === 'x64') {
                        return 'server-darwin-web';
                    }
                    return `server-darwin-${arch}-web`;
                case 'cli':
                    return `cli-darwin-${arch}`;
                default:
                    throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
            }
        default:
            throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
    }
}
// Contains all of the logic for mapping types to our actual types in CosmosDB
function getRealType(type) {
    switch (type) {
        case 'user-setup':
            return 'setup';
        case 'deb-package':
        case 'rpm-package':
            return 'package';
        default:
            return type;
    }
}
function hashStream(hashName, stream) {
    return new Promise((c, e) => {
        const shasum = crypto.createHash(hashName);
        stream
            .on('data', shasum.update.bind(shasum))
            .on('error', e)
            .on('close', () => c(shasum.digest('hex')));
    });
}
function getEnv(name) {
    const result = process.env[name];
    if (typeof result === 'undefined') {
        throw new Error('Missing env: ' + name);
    }
    return result;
}
async function main() {
    const [, , product, os, arch, unprocessedType, fileName, filePath] = process.argv;
    // getPlatform needs the unprocessedType
    const platform = getPlatform(product, os, arch, unprocessedType);
    const type = getRealType(unprocessedType);
    const quality = getEnv('VSCODE_QUALITY');
    const commit = getEnv('BUILD_SOURCEVERSION');
    console.log('Creating asset...');
    const stat = await new Promise((c, e) => fs.stat(filePath, (err, stat) => err ? e(err) : c(stat)));
    const size = stat.size;
    console.log('Size:', size);
    const stream = fs.createReadStream(filePath);
    const [sha1hash, sha256hash] = await Promise.all([hashStream('sha1', stream), hashStream('sha256', stream)]);
    console.log('SHA1:', sha1hash);
    console.log('SHA256:', sha256hash);
    const blobName = commit + '/' + fileName;
    const storagePipelineOptions = { retryOptions: { retryPolicyType: storage_blob_1.StorageRetryPolicyType.EXPONENTIAL, maxTries: 6, tryTimeoutInMs: 10 * 60 * 1000 } };
    const credential = new identity_1.ClientSecretCredential(process.env['AZURE_TENANT_ID'], process.env['AZURE_CLIENT_ID'], process.env['AZURE_CLIENT_SECRET']);
    const blobServiceClient = new storage_blob_1.BlobServiceClient(`https://vscode.blob.core.windows.net`, credential, storagePipelineOptions);
    const containerClient = blobServiceClient.getContainerClient(quality);
    const blobClient = containerClient.getBlockBlobClient(blobName);
    const blobOptions = {
        blobHTTPHeaders: {
            blobContentType: mime.lookup(filePath),
            blobContentDisposition: `attachment; filename="${fileName}"`,
            blobCacheControl: 'max-age=31536000, public'
        }
    };
    const uploadPromises = [];
    uploadPromises.push((async () => {
        console.log(`Checking for blob in Azure...`);
        if (await (0, retry_1.retry)(() => blobClient.exists())) {
            throw new Error(`Blob ${quality}, ${blobName} already exists, not publishing again.`);
        }
        else {
            await (0, retry_1.retry)(async (attempt) => {
                console.log(`Uploading blobs to Azure storage (attempt ${attempt})...`);
                await blobClient.uploadFile(filePath, blobOptions);
                console.log('Blob successfully uploaded to Azure storage.');
            });
        }
    })());
    const shouldUploadToMooncake = /true/i.test(process.env['VSCODE_PUBLISH_TO_MOONCAKE'] ?? 'true');
    if (shouldUploadToMooncake) {
        const mooncakeCredential = new identity_1.ClientSecretCredential(process.env['AZURE_MOONCAKE_TENANT_ID'], process.env['AZURE_MOONCAKE_CLIENT_ID'], process.env['AZURE_MOONCAKE_CLIENT_SECRET']);
        const mooncakeBlobServiceClient = new storage_blob_1.BlobServiceClient(`https://vscode.blob.core.chinacloudapi.cn`, mooncakeCredential, storagePipelineOptions);
        const mooncakeContainerClient = mooncakeBlobServiceClient.getContainerClient(quality);
        const mooncakeBlobClient = mooncakeContainerClient.getBlockBlobClient(blobName);
        uploadPromises.push((async () => {
            console.log(`Checking for blob in Mooncake Azure...`);
            if (await (0, retry_1.retry)(() => mooncakeBlobClient.exists())) {
                throw new Error(`Mooncake Blob ${quality}, ${blobName} already exists, not publishing again.`);
            }
            else {
                await (0, retry_1.retry)(async (attempt) => {
                    console.log(`Uploading blobs to Mooncake Azure storage (attempt ${attempt})...`);
                    await mooncakeBlobClient.uploadFile(filePath, blobOptions);
                    console.log('Blob successfully uploaded to Mooncake Azure storage.');
                });
            }
        })());
    }
    const promiseResults = await Promise.allSettled(uploadPromises);
    const rejectedPromiseResults = promiseResults.filter(result => result.status === 'rejected');
    if (rejectedPromiseResults.length === 0) {
        console.log('All blobs successfully uploaded.');
    }
    else if (rejectedPromiseResults[0]?.reason?.message?.includes('already exists')) {
        console.warn(rejectedPromiseResults[0].reason.message);
        console.log('Some blobs successfully uploaded.');
    }
    else {
        // eslint-disable-next-line no-throw-literal
        throw rejectedPromiseResults[0]?.reason;
    }
    const assetUrl = `${process.env['AZURE_CDN_URL']}/${quality}/${blobName}`;
    const blobPath = new URL(assetUrl).pathname;
    const mooncakeUrl = `${process.env['MOONCAKE_CDN_URL']}${blobPath}`;
    const asset = {
        platform,
        type,
        url: assetUrl,
        hash: sha1hash,
        mooncakeUrl,
        sha256hash,
        size
    };
    // Remove this if we ever need to rollback fast updates for windows
    if (/win32/.test(platform)) {
        asset.supportsFastUpdate = true;
    }
    console.log('Asset:', JSON.stringify(asset, null, '  '));
    const client = new cosmos_1.CosmosClient({ endpoint: process.env['AZURE_DOCUMENTDB_ENDPOINT'], aadCredentials: credential });
    const scripts = client.database('builds').container(quality).scripts;
    await (0, retry_1.retry)(() => scripts.storedProcedure('createAsset').execute('', [commit, asset, true]));
    console.log(`  Done ✔️`);
}
main().then(() => {
    console.log('Asset successfully created');
    process.exit(0);
}, err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlQXNzZXQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjcmVhdGVBc3NldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7O0FBRWhHLHlCQUF5QjtBQUV6QixpQ0FBaUM7QUFDakMsc0RBQXdJO0FBQ3hJLDZCQUE2QjtBQUM3QiwwQ0FBNkM7QUFDN0MsOENBQXlEO0FBQ3pELG1DQUFnQztBQWFoQyxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTtJQUM5QixPQUFPLENBQUMsS0FBSyxDQUFDLDJEQUEyRCxDQUFDLENBQUM7SUFDM0UsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0NBQ2pCO0FBRUQsd0ZBQXdGO0FBQ3hGLFNBQVMsV0FBVyxDQUFDLE9BQWUsRUFBRSxFQUFVLEVBQUUsSUFBWSxFQUFFLElBQVk7SUFDM0UsUUFBUSxFQUFFLEVBQUU7UUFDWCxLQUFLLE9BQU87WUFDWCxRQUFRLE9BQU8sRUFBRTtnQkFDaEIsS0FBSyxRQUFRLENBQUMsQ0FBQztvQkFDZCxNQUFNLEtBQUssR0FBRyxJQUFJLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFNBQVMsSUFBSSxFQUFFLENBQUM7b0JBQzFELFFBQVEsSUFBSSxFQUFFO3dCQUNiLEtBQUssU0FBUzs0QkFDYixPQUFPLEdBQUcsS0FBSyxVQUFVLENBQUM7d0JBQzNCLEtBQUssT0FBTzs0QkFDWCxPQUFPLEtBQUssQ0FBQzt3QkFDZCxLQUFLLFlBQVk7NEJBQ2hCLE9BQU8sR0FBRyxLQUFLLE9BQU8sQ0FBQzt3QkFDeEI7NEJBQ0MsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsT0FBTyxJQUFJLEVBQUUsSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFLENBQUMsQ0FBQztxQkFDbkU7aUJBQ0Q7Z0JBQ0QsS0FBSyxRQUFRO29CQUNaLElBQUksSUFBSSxLQUFLLE9BQU8s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