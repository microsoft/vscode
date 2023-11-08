"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAsset = void 0;
const fs = require("fs");
const crypto = require("crypto");
const storage_blob_1 = require("@azure/storage-blob");
const mime = require("mime");
const cosmos_1 = require("@azure/cosmos");
const identity_1 = require("@azure/identity");
const retry_1 = require("./retry");
// Contains all of the logic for mapping details to our actual product names in CosmosDB
function getPlatform(product, os, arch, type) {
    switch (os) {
        case 'win32':
            switch (product) {
                case 'client': {
                    switch (type) {
                        case 'archive':
                            return `win32-${arch}-archive`;
                        case 'setup':
                            return `win32-${arch}`;
                        case 'user-setup':
                            return `win32-${arch}-user`;
                        default:
                            throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
                    }
                }
                case 'server':
                    if (arch === 'arm64') {
                        throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
                    }
                    return `server-win32-${arch}`;
                case 'web':
                    if (arch === 'arm64') {
                        throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
                    }
                    return `server-win32-${arch}-web`;
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
async function createAsset(product, os, arch, unprocessedType, fileName, filePath) {
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
    // if (quality === 'insider') {
    // 	await releaseAndProvision(
    // 		process.env['RELEASE_TENANT_ID']!,
    // 		process.env['RELEASE_CLIENT_ID']!,
    // 		process.env['RELEASE_AUTH_CERT_SUBJECT_NAME']!,
    // 		process.env['RELEASE_REQUEST_SIGNING_CERT_SUBJECT_NAME']!,
    // 		process.env['PROVISION_TENANT_ID']!,
    // 		process.env['PROVISION_AAD_USERNAME']!,
    // 		process.env['PROVISION_AAD_PASSWORD']!,
    // 		commit,
    // 		quality,
    // 		filePath
    // 	);
    // 	asset.prssUrl = `${process.env['PRSS_CDN_URL']}/${quality}/${blobName}`;
    // 	console.log(`Successfully released on PRSS: ${asset.prssUrl}`);
    // }
    // Remove this if we ever need to rollback fast updates for windows
    if (/win32/.test(platform)) {
        asset.supportsFastUpdate = true;
    }
    console.log('Asset:', JSON.stringify(asset, null, '  '));
    const client = new cosmos_1.CosmosClient({ endpoint: process.env['AZURE_DOCUMENTDB_ENDPOINT'], aadCredentials: credential });
    const scripts = client.database('builds').container(quality).scripts;
    await (0, retry_1.retry)(() => scripts.storedProcedure('createAsset').execute('', [commit, asset, true]));
    console.log(`  Done ✔️`);
    console.log('Asset successfully created');
}
exports.createAsset = createAsset;
if (require.main === module) {
    if (process.argv.length !== 8) {
        console.error('Usage: node createAsset.js PRODUCT OS ARCH TYPE NAME FILE');
        process.exit(-1);
    }
    const [, , product, os, arch, unprocessedType, fileName, filePath] = process.argv;
    createAsset(product, os, arch, unprocessedType, fileName, filePath).then(() => {
        process.exit(0);
    }, err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlQXNzZXQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjcmVhdGVBc3NldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyx5QkFBeUI7QUFFekIsaUNBQWlDO0FBQ2pDLHNEQUF3STtBQUN4SSw2QkFBNkI7QUFDN0IsMENBQTZDO0FBQzdDLDhDQUF5RDtBQUN6RCxtQ0FBZ0M7QUFlaEMsd0ZBQXdGO0FBQ3hGLFNBQVMsV0FBVyxDQUFDLE9BQWUsRUFBRSxFQUFVLEVBQUUsSUFBWSxFQUFFLElBQVk7SUFDM0UsUUFBUSxFQUFFLEVBQUUsQ0FBQztRQUNaLEtBQUssT0FBTztZQUNYLFFBQVEsT0FBTyxFQUFFLENBQUM7Z0JBQ2pCLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQztvQkFDZixRQUFRLElBQUksRUFBRSxDQUFDO3dCQUNkLEtBQUssU0FBUzs0QkFDYixPQUFPLFNBQVMsSUFBSSxVQUFVLENBQUM7d0JBQ2hDLEtBQUssT0FBTzs0QkFDWCxPQUFPLFNBQVMsSUFBSSxFQUFFLENBQUM7d0JBQ3hCLEtBQUssWUFBWTs0QkFDaEIsT0FBTyxTQUFTLElBQUksT0FBTyxDQUFDO3dCQUM3Qjs0QkFDQyxNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixPQUFPLElBQUksRUFBRSxJQUFJLElBQUksSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFDO29CQUNwRSxDQUFDO2dCQUNGLENBQUM7Z0JBQ0QsS0FBSyxRQUFRO29CQUNaLElBQUksSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDO3dCQUN0QixNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixPQUFPLElBQUksRUFBRSxJQUFJLElBQUksSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFDO29CQUNuRSxDQUFDO29CQUNELE9BQU8sZ0JBQWdCLElBQUksRUFBRSxDQUFDO2dCQUMvQixLQUFLLEtBQUs7b0JBQ1QsSUFBSSxJQUFJLEtBQUssT0FBTyxFQUFFLENBQUM7d0JB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