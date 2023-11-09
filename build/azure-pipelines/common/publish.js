"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = exports.processArtifact = exports.uploadAssetLegacy = exports.Sequencer = void 0;
const fs = require("fs");
const path = require("path");
const stream_1 = require("stream");
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
async function getPipelineArtifacts() {
    const res = await fetch(`${e('BUILDS_API_URL')}artifacts?api-version=6.0`, { headers: { Authorization: `Bearer ${e('SYSTEM_ACCESSTOKEN')}` } });
    if (!res.ok) {
        throw new Error(`Failed to fetch artifacts: ${res.statusText}`);
    }
    const { value: artifacts } = await res.json();
    return artifacts.filter(a => /^vscode_/.test(a.name) && !/sbom$/.test(a.name));
}
async function getPipelineTimeline() {
    return await (0, retry_1.retry)(async () => {
        const res = await fetch(`${e('BUILDS_API_URL')}timeline?api-version=6.0`, { headers: { Authorization: `Bearer ${e('SYSTEM_ACCESSTOKEN')}` } });
        if (!res.ok) {
            throw new Error(`Failed to fetch artifacts: ${res.statusText}`);
        }
        const result = await res.json();
        return result;
    });
}
async function downloadArtifact(artifact, downloadPath) {
    return await (0, retry_1.retry)(async () => {
        const res = await fetch(artifact.resource.downloadUrl, { headers: { Authorization: `Bearer ${e('SYSTEM_ACCESSTOKEN')}` } });
        if (!res.ok) {
            throw new Error(`Failed to download artifact: ${res.statusText}`);
        }
        const istream = stream_1.Readable.fromWeb(res.body);
        const ostream = fs.createWriteStream(downloadPath);
        await (0, promises_1.finished)(istream.pipe(ostream));
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
    log('Asset:', JSON.stringify(asset, null, '  '));
    const aadCredentials = new identity_1.ClientSecretCredential(e('AZURE_TENANT_ID'), e('AZURE_CLIENT_ID'), e('AZURE_CLIENT_SECRET'));
    const client = new cosmos_1.CosmosClient({ endpoint: e('AZURE_DOCUMENTDB_ENDPOINT'), aadCredentials });
    const scripts = client.database('builds').container(quality).scripts;
    await (0, retry_1.retry)(() => scripts.storedProcedure('createAsset').execute('', [commit, asset, true]));
    log(`  Done ✔️`);
    log('Asset successfully created');
}
exports.processArtifact = processArtifact;
async function main() {
    const state = new State();
    for (const name of state) {
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
            if (!state.has(artifact.name)) {
                const match = /^vscode_(?<product>[^_]+)_(?<os>[^_]+)_(?<arch>[^_]+)_(?<type>[^_]+)$/.exec(artifact.name);
                if (!match) {
                    console.warn('Invalid artifact name:', artifact.name);
                    continue;
                }
                let artifactPath;
                try {
                    console.log(`Processing ${artifact.name} (${artifact.resource.downloadUrl})`);
                    const artifactZipPath = path.join(e('AGENT_TEMPDIRECTORY'), `${artifact.name}.zip`);
                    console.log(`Downloading artifact...`);
                    await downloadArtifact(artifact, artifactZipPath);
                    console.log(`Extracting artifact...`);
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
                publishPromises.push(processArtifact(product, os, arch, type, artifactPath));
                state.add(artifact.name);
            }
        }
        const [timeline, artifacts2] = await Promise.all([getPipelineTimeline(), getPipelineArtifacts()]);
        const stagesCompleted = new Set(timeline.records.filter(r => r.type === 'Stage' && r.state === 'completed' && stages.has(r.name)).map(r => r.name));
        if (stagesCompleted.size === stages.size && artifacts2.length === state.size) {
            break;
        }
        console.log(`Stages completed: ${stagesCompleted.size}/${stages.size}`);
        console.log(`Artifacts processed: ${state.size}/${artifacts2.length}`);
        await new Promise(c => setTimeout(c, 10000));
    }
    console.log(`Waiting for all artifacts to be published...`);
    await Promise.all(publishPromises);
    console.log(`All ${state.size} artifacts published!`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHVibGlzaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInB1Ymxpc2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3QixtQ0FBa0M7QUFDbEMsOENBQTJDO0FBQzNDLCtCQUErQjtBQUMvQixpQ0FBaUM7QUFDakMsbUNBQWdDO0FBQ2hDLHNEQUF3STtBQUN4SSw2QkFBNkI7QUFDN0IsMENBQTZDO0FBQzdDLDhDQUF5RDtBQUN6RCxpQ0FBNkM7QUFFN0MsU0FBUyxDQUFDLENBQUMsSUFBWTtJQUN0QixNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRWpDLElBQUksT0FBTyxNQUFNLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDaEMsTUFBTSxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRUQsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBRUQsTUFBTSxLQUFLO0lBRUYsU0FBUyxDQUFTO0lBQ2xCLEdBQUcsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO0lBRWhDO1FBQ0MsTUFBTSxxQkFBcUIsR0FBRyxDQUFDLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUN0RCxNQUFNLGFBQWEsR0FBRyxFQUFFLENBQUMsV0FBVyxDQUFDLHFCQUFxQixDQUFDO2FBQ3pELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLDZCQUE2QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUNyRCxNQUFNLENBQUMsQ0FBQyxLQUFLLEVBQTRCLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO2FBQ3BELEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxNQUFNLENBQUMsS0FB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