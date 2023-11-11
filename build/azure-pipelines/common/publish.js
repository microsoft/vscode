"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = exports.processArtifact = exports.uploadAssetLegacy = exports.Sequencer = void 0;
const fs = require("fs");
const path = require("path");
const https = require("https");
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
function requestAZDOAPI(path) {
    return new Promise((resolve, reject) => {
        https.get(`${e('BUILDS_API_URL')}${path}?api-version=6.0`, azdoOptions, res => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
        }).on('error', reject);
    });
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
        return new Promise((resolve, reject) => {
            https.get(artifact.resource.downloadUrl, azdoOptions, res => {
                const ostream = fs.createWriteStream(downloadPath);
                (0, promises_1.finished)(res.pipe(ostream)).then(resolve, reject);
            }).on('error', reject);
        });
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
                await blobClient.uploadFile(filePath, blobOptions);
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
                    await mooncakeBlobClient.uploadFile(filePath, blobOptions);
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
const sequencer = new Sequencer();
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
        sequencer.queue(() => uploadAssetLegacy(log, quality, commit, filePath)),
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
    const aadCredentials = new identity_1.ClientSecretCredential(e('AZURE_TENANT_ID'), e('AZURE_CLIENT_ID'), e('AZURE_CLIENT_SECRET'));
    const client = new cosmos_1.CosmosClient({ endpoint: e('AZURE_DOCUMENTDB_ENDPOINT'), aadCredentials });
    const scripts = client.database('builds').container(quality).scripts;
    await (0, retry_1.retry)(() => scripts.storedProcedure('createAsset').execute('', [commit, asset, true]));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHVibGlzaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInB1Ymxpc2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3QiwrQkFBK0I7QUFFL0IsOENBQTJDO0FBQzNDLCtCQUErQjtBQUMvQixpQ0FBaUM7QUFDakMsbUNBQWdDO0FBQ2hDLHNEQUF3STtBQUN4SSw2QkFBNkI7QUFDN0IsMENBQTZDO0FBQzdDLDhDQUF5RDtBQUN6RCxpQ0FBNkM7QUFFN0MsU0FBUyxDQUFDLENBQUMsSUFBWTtJQUN0QixNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRWpDLElBQUksT0FBTyxNQUFNLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDaEMsTUFBTSxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRUQsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBRUQsTUFBTSxLQUFLO0lBRUYsU0FBUyxDQUFTO0lBQ2xCLEdBQUcsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO0lBRWhDO1FBQ0MsTUFBTSxxQkFBcUIsR0FBRyxDQUFDLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUN0RCxNQUFNLGFBQWEsR0FBRyxFQUFFLENBQUMsV0FBVyxDQUFDLHFCQUFxQixDQUFDO2FBQ3pELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLDZCQUE2QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUNyRCxNQUFNLENBQUMsQ0FBQyxLQUFLLEVBQTRCLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO2FBQ3BELEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxNQUFNLENBQUMsS0FB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