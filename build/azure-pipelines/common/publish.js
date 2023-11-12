"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = exports.processArtifact = exports.uploadAssetLegacy = exports.Sequencer = void 0;
const fs = require("fs");
const path = require("path");
const node_fetch_1 = require("node-fetch");
const promises_1 = require("stream/promises");
const yauzl = require("yauzl");
const crypto = require("crypto");
const retry_1 = require("./retry");
const storage_blob_1 = require("@azure/storage-blob");
const mime = require("mime");
const cosmos_1 = require("@azure/cosmos");
const identity_1 = require("@azure/identity");
const prss_1 = require("./prss");
function e(name) {
    const result = process.env[name];
    if (typeof result !== 'string') {
        throw new Error(`Missing env: ${name}`);
    }
    return result;
}
class State {
    statePath;
    set = new Set();
    constructor() {
        const pipelineWorkspacePath = e('PIPELINE_WORKSPACE');
        const previousState = fs.readdirSync(pipelineWorkspacePath)
            .map(name => /^artifacts_processed_(\d+)$/.exec(name))
            .filter((match) => !!match)
            .map(match => ({ name: match[0], attempt: Number(match[1]) }))
            .sort((a, b) => b.attempt - a.attempt)[0];
        if (previousState) {
            const previousStatePath = path.join(pipelineWorkspacePath, previousState.name, previousState.name + '.txt');
            fs.readFileSync(previousStatePath, 'utf8').split(/\n/).filter(name => !!name).forEach(name => this.set.add(name));
        }
        const stageAttempt = e('SYSTEM_STAGEATTEMPT');
        this.statePath = path.join(pipelineWorkspacePath, `artifacts_processed_${stageAttempt}`, `artifacts_processed_${stageAttempt}.txt`);
        fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
        fs.writeFileSync(this.statePath, [...this.set.values()].join('\n'));
    }
    get size() {
        return this.set.size;
    }
    has(name) {
        return this.set.has(name);
    }
    add(name) {
        this.set.add(name);
        fs.appendFileSync(this.statePath, `${name}\n`);
    }
    [Symbol.iterator]() {
        return this.set[Symbol.iterator]();
    }
}
const azdoOptions = { headers: { Authorization: `Bearer ${e('SYSTEM_ACCESSTOKEN')}` } };
async function requestAZDOAPI(path) {
    const res = await (0, node_fetch_1.default)(`${e('BUILDS_API_URL')}${path}?api-version=6.0`, azdoOptions);
    if (!res.ok) {
        throw new Error(`Unexpected status code: ${res.status}`);
    }
    return await res.json();
}
async function getPipelineArtifacts() {
    const result = await (0, retry_1.retry)(() => requestAZDOAPI('artifacts'));
    return result.value.filter(a => /^vscode_/.test(a.name) && !/sbom$/.test(a.name));
}
async function getPipelineTimeline() {
    return await (0, retry_1.retry)(() => requestAZDOAPI('timeline'));
}
async function downloadArtifact(artifact, downloadPath) {
    return await (0, retry_1.retry)(async () => {
        const res = await (0, node_fetch_1.default)(artifact.resource.downloadUrl, azdoOptions);
        if (!res.ok) {
            throw new Error(`Unexpected status code: ${res.status}`);
        }
        const ostream = fs.createWriteStream(downloadPath);
        await (0, promises_1.finished)(res.body.pipe(ostream));
    });
}
async function unzip(packagePath, outputPath) {
    return new Promise((resolve, reject) => {
        let lastFilePath;
        yauzl.open(packagePath, { lazyEntries: true }, (err, zipfile) => {
            if (err) {
                return reject(err);
            }
            zipfile.on('entry', async (entry) => {
                if (!/\/$/.test(entry.fileName)) {
                    await new Promise((resolve, reject) => {
                        zipfile.openReadStream(entry, async (err, istream) => {
                            if (err) {
                                return reject(err);
                            }
                            try {
                                const filePath = path.join(outputPath, entry.fileName);
                                await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
                                const ostream = fs.createWriteStream(filePath);
                                await (0, promises_1.finished)(istream.pipe(ostream));
                                lastFilePath = filePath;
                                resolve(undefined);
                            }
                            catch (err) {
                                reject(err);
                            }
                        });
                    });
                }
                zipfile.readEntry();
            });
            zipfile.on('end', () => resolve(lastFilePath));
            zipfile.readEntry();
        });
    });
}
class Sequencer {
    current = Promise.resolve(null);
    queue(promiseTask) {
        return this.current = this.current.then(() => promiseTask(), () => promiseTask());
    }
}
exports.Sequencer = Sequencer;
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
const azureSequencer = new Sequencer();
const mooncakeSequencer = new Sequencer();
async function uploadAssetLegacy(log, quality, commit, filePath) {
    const fileName = path.basename(filePath);
    const blobName = commit + '/' + fileName;
    const storagePipelineOptions = { retryOptions: { retryPolicyType: storage_blob_1.StorageRetryPolicyType.EXPONENTIAL, maxTries: 6, tryTimeoutInMs: 10 * 60 * 1000 } };
    const credential = new identity_1.ClientSecretCredential(e('AZURE_TENANT_ID'), e('AZURE_CLIENT_ID'), e('AZURE_CLIENT_SECRET'));
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
        log(`Checking for blob in Azure...`);
        if (await (0, retry_1.retry)(() => blobClient.exists())) {
            throw new Error(`Blob ${quality}, ${blobName} already exists, not publishing again.`);
        }
        else {
            await (0, retry_1.retry)(async (attempt) => {
                log(`Uploading blobs to Azure storage (attempt ${attempt})...`);
                await azureSequencer.queue(() => blobClient.uploadFile(filePath, blobOptions));
                log('Blob successfully uploaded to Azure storage.');
            });
        }
    })());
    const shouldUploadToMooncake = /true/i.test(e('VSCODE_PUBLISH_TO_MOONCAKE'));
    if (shouldUploadToMooncake) {
        const mooncakeCredential = new identity_1.ClientSecretCredential(e('AZURE_MOONCAKE_TENANT_ID'), e('AZURE_MOONCAKE_CLIENT_ID'), e('AZURE_MOONCAKE_CLIENT_SECRET'));
        const mooncakeBlobServiceClient = new storage_blob_1.BlobServiceClient(`https://vscode.blob.core.chinacloudapi.cn`, mooncakeCredential, storagePipelineOptions);
        const mooncakeContainerClient = mooncakeBlobServiceClient.getContainerClient(quality);
        const mooncakeBlobClient = mooncakeContainerClient.getBlockBlobClient(blobName);
        uploadPromises.push((async () => {
            log(`Checking for blob in Mooncake Azure...`);
            if (await (0, retry_1.retry)(() => mooncakeBlobClient.exists())) {
                throw new Error(`Mooncake Blob ${quality}, ${blobName} already exists, not publishing again.`);
            }
            else {
                await (0, retry_1.retry)(async (attempt) => {
                    log(`Uploading blobs to Mooncake Azure storage (attempt ${attempt})...`);
                    await mooncakeSequencer.queue(() => mooncakeBlobClient.uploadFile(filePath, blobOptions));
                    log('Blob successfully uploaded to Mooncake Azure storage.');
                });
            }
        })());
    }
    const promiseResults = await Promise.allSettled(uploadPromises);
    const rejectedPromiseResults = promiseResults.filter(result => result.status === 'rejected');
    if (rejectedPromiseResults.length === 0) {
        log('All blobs successfully uploaded.');
    }
    else if (rejectedPromiseResults[0]?.reason?.message?.includes('already exists')) {
        log(rejectedPromiseResults[0].reason.message);
        log('Some blobs successfully uploaded.');
    }
    else {
        // eslint-disable-next-line no-throw-literal
        throw rejectedPromiseResults[0]?.reason;
    }
    const assetUrl = `${e('AZURE_CDN_URL')}/${quality}/${blobName}`;
    const blobPath = new URL(assetUrl).pathname;
    const mooncakeUrl = `${e('MOONCAKE_CDN_URL')}${blobPath}`;
    return { blobName, assetUrl, mooncakeUrl };
}
exports.uploadAssetLegacy = uploadAssetLegacy;
const cosmosSequencer = new Sequencer();
async function processArtifact(product, os, arch, unprocessedType, filePath) {
    const log = (...args) => console.log(`[${product} ${os} ${arch} ${unprocessedType}]`, ...args);
    // getPlatform needs the unprocessedType
    const quality = e('VSCODE_QUALITY');
    const commit = e('BUILD_SOURCEVERSION');
    const platform = getPlatform(product, os, arch, unprocessedType);
    const type = getRealType(unprocessedType);
    const stat = await new Promise((c, e) => fs.stat(filePath, (err, stat) => err ? e(err) : c(stat)));
    const size = stat.size;
    log('Size:', size);
    const stream = fs.createReadStream(filePath);
    const [sha1hash, sha256hash] = await Promise.all([hashStream('sha1', stream), hashStream('sha256', stream)]);
    log('SHA1:', sha1hash);
    log('SHA256:', sha256hash);
    const [{ blobName, assetUrl, mooncakeUrl }] = await Promise.all([
        uploadAssetLegacy(log, quality, commit, filePath),
        (0, prss_1.releaseAndProvision)(log, e('RELEASE_TENANT_ID'), e('RELEASE_CLIENT_ID'), e('RELEASE_AUTH_CERT_SUBJECT_NAME'), e('RELEASE_REQUEST_SIGNING_CERT_SUBJECT_NAME'), e('PROVISION_TENANT_ID'), e('PROVISION_AAD_USERNAME'), e('PROVISION_AAD_PASSWORD'), commit, quality, filePath)
    ]);
    const asset = {
        platform,
        type,
        url: assetUrl,
        hash: sha1hash,
        mooncakeUrl,
        prssUrl: `${e('PRSS_CDN_URL')}/${quality}/${blobName}`,
        sha256hash,
        size,
        supportsFastUpdate: true
    };
    log('Creating asset:', JSON.stringify(asset, null, '  '));
    await cosmosSequencer.queue(async () => {
        const aadCredentials = new identity_1.ClientSecretCredential(e('AZURE_TENANT_ID'), e('AZURE_CLIENT_ID'), e('AZURE_CLIENT_SECRET'));
        const client = new cosmos_1.CosmosClient({ endpoint: e('AZURE_DOCUMENTDB_ENDPOINT'), aadCredentials });
        const scripts = client.database('builds').container(quality).scripts;
        await scripts.storedProcedure('createAsset').execute('', [commit, asset, true]);
    });
    log('Asset successfully created');
}
exports.processArtifact = processArtifact;
async function main() {
    const done = new State();
    const processing = new Set();
    for (const name of done) {
        console.log(`Already processed artifact: ${name}`);
    }
    const stages = new Set();
    if (e('VSCODE_BUILD_STAGE_WINDOWS') === 'True') {
        stages.add('Windows');
    }
    if (e('VSCODE_BUILD_STAGE_LINUX') === 'True') {
        stages.add('Linux');
    }
    if (e('VSCODE_BUILD_STAGE_ALPINE') === 'True') {
        stages.add('Alpine');
    }
    if (e('VSCODE_BUILD_STAGE_MACOS') === 'True') {
        stages.add('macOS');
    }
    if (e('VSCODE_BUILD_STAGE_WEB') === 'True') {
        stages.add('Web');
    }
    const publishPromises = [];
    while (true) {
        const artifacts = await getPipelineArtifacts();
        for (const artifact of artifacts) {
            if (!done.has(artifact.name) && !processing.has(artifact.name)) {
                const match = /^vscode_(?<product>[^_]+)_(?<os>[^_]+)_(?<arch>[^_]+)_(?<type>[^_]+)$/.exec(artifact.name);
                if (!match) {
                    throw new Error(`Invalid artifact name: ${artifact.name}`);
                }
                let artifactPath;
                try {
                    console.log(`Downloading and extracting ${artifact.name} (${artifact.resource.downloadUrl})...`);
                    const artifactZipPath = path.join(e('AGENT_TEMPDIRECTORY'), `${artifact.name}.zip`);
                    await downloadArtifact(artifact, artifactZipPath);
                    artifactPath = await unzip(artifactZipPath, e('AGENT_TEMPDIRECTORY'));
                    const artifactSize = fs.statSync(artifactPath).size;
                    if (artifactSize !== Number(artifact.resource.properties.artifactsize)) {
                        throw new Error(`Artifact size mismatch. Expected ${artifact.resource.properties.artifactsize}. Actual ${artifactSize}`);
                    }
                }
                catch (err) {
                    console.error(err);
                    continue;
                }
                const { product, os, arch, type } = match.groups;
                console.log('Submitting artifact for publish:', { path: artifactPath, product, os, arch, type });
                processing.add(artifact.name);
                publishPromises.push((async () => {
                    await processArtifact(product, os, arch, type, artifactPath);
                    processing.delete(artifact.name);
                    done.add(artifact.name);
                })());
            }
        }
        const [timeline, artifacts2] = await Promise.all([getPipelineTimeline(), getPipelineArtifacts()]);
        const stagesCompleted = new Set(timeline.records.filter(r => r.type === 'Stage' && r.state === 'completed' && stages.has(r.name)).map(r => r.name));
        if (stagesCompleted.size === stages.size && artifacts2.length === done.size) {
            break;
        }
        console.log(`Stages completed: ${stagesCompleted.size}/${stages.size}`);
        console.log(`Artifacts processed: ${done.size}/${artifacts2.length}`);
        await new Promise(c => setTimeout(c, 10000));
    }
    console.log(`Waiting for all artifacts to be published...`);
    const results = await Promise.allSettled(publishPromises);
    const rejected = results.filter((r) => r.status === 'rejected');
    if (rejected.length > 0) {
        for (const result of rejected) {
            console.error('***');
            console.error(result.reason);
        }
        throw new Error('Some artifacts failed to publish');
    }
    console.log(`All ${done.size} artifacts published!`);
}
exports.main = main;
if (require.main === module) {
    const [] = process.argv.slice(2);
    main().then(() => {
        process.exit(0);
    }, err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHVibGlzaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInB1Ymxpc2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3QiwyQ0FBK0I7QUFFL0IsOENBQTJDO0FBQzNDLCtCQUErQjtBQUMvQixpQ0FBaUM7QUFDakMsbUNBQWdDO0FBQ2hDLHNEQUF3STtBQUN4SSw2QkFBNkI7QUFDN0IsMENBQTZDO0FBQzdDLDhDQUF5RDtBQUN6RCxpQ0FBNkM7QUFFN0MsU0FBUyxDQUFDLENBQUMsSUFBWTtJQUN0QixNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRWpDLElBQUksT0FBTyxNQUFNLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDaEMsTUFBTSxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRUQsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBRUQsTUFBTSxLQUFLO0lBRUYsU0FBUyxDQUFTO0lBQ2xCLEdBQUcsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO0lBRWhDO1FBQ0MsTUFBTSxxQkFBcUIsR0FBRyxDQUFDLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUN0RCxNQUFNLGFBQWEsR0FBRyxFQUFFLENBQUMsV0FBVyxDQUFDLHFCQUFxQixDQUFDO2FBQ3pELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLDZCQUE2QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUNyRCxNQUFNLENBQUMsQ0FBQyxLQUFLLEVBQTRCLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO2FBQ3BELEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxNQUFNLENBQUMsS0FB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