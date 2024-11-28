"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const stream_1 = require("stream");
const promises_1 = require("node:stream/promises");
const yauzl = require("yauzl");
const crypto = require("crypto");
const retry_1 = require("./retry");
const cosmos_1 = require("@azure/cosmos");
const cp = require("child_process");
const os = require("os");
const node_worker_threads_1 = require("node:worker_threads");
const msal_node_1 = require("@azure/msal-node");
const storage_blob_1 = require("@azure/storage-blob");
const jws = require("jws");
function e(name) {
    const result = process.env[name];
    if (typeof result !== 'string') {
        throw new Error(`Missing env: ${name}`);
    }
    return result;
}
function hashStream(hashName, stream) {
    return new Promise((c, e) => {
        const shasum = crypto.createHash(hashName);
        stream
            .on('data', shasum.update.bind(shasum))
            .on('error', e)
            .on('close', () => c(shasum.digest()));
    });
}
var StatusCode;
(function (StatusCode) {
    StatusCode["Pass"] = "pass";
    StatusCode["Inprogress"] = "inprogress";
    StatusCode["FailCanRetry"] = "failCanRetry";
    StatusCode["FailDoNotRetry"] = "failDoNotRetry";
    StatusCode["PendingAnalysis"] = "pendingAnalysis";
    StatusCode["Cancelled"] = "cancelled";
})(StatusCode || (StatusCode = {}));
function getCertificateBuffer(input) {
    return Buffer.from(input.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\n/g, ''), 'base64');
}
function getThumbprint(input, algorithm) {
    const buffer = getCertificateBuffer(input);
    return crypto.createHash(algorithm).update(buffer).digest();
}
function getKeyFromPFX(pfx) {
    const pfxCertificatePath = path.join(os.tmpdir(), 'cert.pfx');
    const pemKeyPath = path.join(os.tmpdir(), 'key.pem');
    try {
        const pfxCertificate = Buffer.from(pfx, 'base64');
        fs.writeFileSync(pfxCertificatePath, pfxCertificate);
        cp.execSync(`openssl pkcs12 -in "${pfxCertificatePath}" -nocerts -nodes -out "${pemKeyPath}" -passin pass:`);
        const raw = fs.readFileSync(pemKeyPath, 'utf-8');
        const result = raw.match(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/g)[0];
        return result;
    }
    finally {
        fs.rmSync(pfxCertificatePath, { force: true });
        fs.rmSync(pemKeyPath, { force: true });
    }
}
function getCertificatesFromPFX(pfx) {
    const pfxCertificatePath = path.join(os.tmpdir(), 'cert.pfx');
    const pemCertificatePath = path.join(os.tmpdir(), 'cert.pem');
    try {
        const pfxCertificate = Buffer.from(pfx, 'base64');
        fs.writeFileSync(pfxCertificatePath, pfxCertificate);
        cp.execSync(`openssl pkcs12 -in "${pfxCertificatePath}" -nokeys -out "${pemCertificatePath}" -passin pass:`);
        const raw = fs.readFileSync(pemCertificatePath, 'utf-8');
        const matches = raw.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
        return matches ? matches.reverse() : [];
    }
    finally {
        fs.rmSync(pfxCertificatePath, { force: true });
        fs.rmSync(pemCertificatePath, { force: true });
    }
}
class ESRPReleaseService {
    log;
    clientId;
    accessToken;
    requestSigningCertificates;
    requestSigningKey;
    containerClient;
    static async create(log, tenantId, clientId, authCertificatePfx, requestSigningCertificatePfx, containerClient) {
        const authKey = getKeyFromPFX(authCertificatePfx);
        const authCertificate = getCertificatesFromPFX(authCertificatePfx)[0];
        const requestSigningKey = getKeyFromPFX(requestSigningCertificatePfx);
        const requestSigningCertificates = getCertificatesFromPFX(requestSigningCertificatePfx);
        const app = new msal_node_1.ConfidentialClientApplication({
            auth: {
                clientId,
                authority: `https://login.microsoftonline.com/${tenantId}`,
                clientCertificate: {
                    thumbprintSha256: getThumbprint(authCertificate, 'sha256').toString('hex'),
                    privateKey: authKey,
                    x5c: authCertificate
                }
            }
        });
        const response = await app.acquireTokenByClientCredential({
            scopes: ['https://api.esrp.microsoft.com/.default']
        });
        return new ESRPReleaseService(log, clientId, response.accessToken, requestSigningCertificates, requestSigningKey, containerClient);
    }
    static API_URL = 'https://api.esrp.microsoft.com/api/v3/releaseservices/clients/';
    constructor(log, clientId, accessToken, requestSigningCertificates, requestSigningKey, containerClient) {
        this.log = log;
        this.clientId = clientId;
        this.accessToken = accessToken;
        this.requestSigningCertificates = requestSigningCertificates;
        this.requestSigningKey = requestSigningKey;
        this.containerClient = containerClient;
    }
    async createRelease(version, filePath, friendlyFileName) {
        const correlationId = crypto.randomUUID();
        const blobClient = this.containerClient.getBlockBlobClient(correlationId);
        this.log(`Uploading ${filePath} to ${blobClient.url}`);
        await blobClient.uploadFile(filePath);
        this.log('Uploaded blob successfully');
        try {
            this.log(`Submitting release for ${version}: ${filePath}`);
            const submitReleaseResult = await this.submitRelease(version, filePath, friendlyFileName, correlationId, blobClient);
            this.log(`Successfully submitted release ${submitReleaseResult.operationId}. Polling for completion...`);
            // Poll every 5 seconds, wait 60 minutes max -> poll 60/5*60=720 times
            for (let i = 0; i < 720; i++) {
                await new Promise(c => setTimeout(c, 5000));
                const releaseStatus = await this.getReleaseStatus(submitReleaseResult.operationId);
                if (releaseStatus.status === 'pass') {
                    break;
                }
                else if (releaseStatus.status !== 'inprogress') {
                    throw new Error(`Failed to submit release: ${JSON.stringify(releaseStatus)}`);
                }
            }
            const releaseDetails = await this.getReleaseDetails(submitReleaseResult.operationId);
            if (releaseDetails.status !== 'pass') {
                throw new Error(`Timed out waiting for release: ${JSON.stringify(releaseDetails)}`);
            }
            this.log('Successfully created release:', releaseDetails.files[0].fileDownloadDetails[0].downloadUrl);
            return releaseDetails.files[0].fileDownloadDetails[0].downloadUrl;
        }
        finally {
            this.log(`Deleting blob ${blobClient.url}`);
            await blobClient.delete();
            this.log('Deleted blob successfully');
        }
    }
    async submitRelease(version, filePath, friendlyFileName, correlationId, blobClient) {
        const size = fs.statSync(filePath).size;
        const hash = await hashStream('sha256', fs.createReadStream(filePath));
        const message = {
            customerCorrelationId: correlationId,
            esrpCorrelationId: correlationId,
            driEmail: ['joao.moreno@microsoft.com'],
            createdBy: { userPrincipalName: 'jomo@microsoft.com' },
            owners: [{ owner: { userPrincipalName: 'jomo@microsoft.com' } }],
            approvers: [{ approver: { userPrincipalName: 'jomo@microsoft.com' }, isAutoApproved: true, isMandatory: false }],
            releaseInfo: {
                title: 'VS Code',
                properties: {
                    'ReleaseContentType': 'InstallPackage'
                },
                minimumNumberOfApprovers: 1
            },
            productInfo: {
                name: 'VS Code',
                version,
                description: 'VS Code'
            },
            accessPermissionsInfo: {
                mainPublisher: 'VSCode',
                channelDownloadEntityDetails: {
                    AllDownloadEntities: ['VSCode']
                }
            },
            routingInfo: {
                intent: 'filedownloadlinkgeneration'
            },
            files: [{
                    name: path.basename(filePath),
                    friendlyFileName,
                    tenantFileLocation: blobClient.url,
                    tenantFileLocationType: 'AzureBlob',
                    sourceLocation: {
                        type: 'azureBlob',
                        blobUrl: blobClient.url
                    },
                    hashType: 'sha256',
                    hash: Array.from(hash),
                    sizeInBytes: size
                }]
        };
        message.jwsToken = await this.generateJwsToken(message);
        const res = await fetch(`${ESRPReleaseService.API_URL}${this.clientId}/workflows/release/operations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.accessToken}`
            },
            body: JSON.stringify(message)
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Failed to submit release: ${res.statusText}\n${text}`);
        }
        return await res.json();
    }
    async getReleaseStatus(releaseId) {
        const url = `${ESRPReleaseService.API_URL}${this.clientId}/workflows/release/operations/grs/${releaseId}`;
        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Failed to get release status: ${res.statusText}\n${text}`);
        }
        return await res.json();
    }
    async getReleaseDetails(releaseId) {
        const url = `${ESRPReleaseService.API_URL}${this.clientId}/workflows/release/operations/grd/${releaseId}`;
        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Failed to get release status: ${res.statusText}\n${text}`);
        }
        return await res.json();
    }
    async generateJwsToken(message) {
        return jws.sign({
            header: {
                alg: 'RS256',
                crit: ['exp', 'x5t'],
                // Release service uses ticks, not seconds :roll_eyes: (https://stackoverflow.com/a/7968483)
                exp: ((Date.now() + (6 * 60 * 1000)) * 10000) + 621355968000000000,
                // Release service uses hex format, not base64url :roll_eyes:
                x5t: getThumbprint(this.requestSigningCertificates[0], 'sha1').toString('hex'),
                // Release service uses a '.' separated string, not an array of strings :roll_eyes:
                x5c: this.requestSigningCertificates.map(c => getCertificateBuffer(c).toString('base64url')).join('.'),
            },
            payload: message,
            privateKey: this.requestSigningKey,
        });
    }
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
        fs.writeFileSync(this.statePath, [...this.set.values()].map(name => `${name}\n`).join(''));
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
const azdoFetchOptions = {
    headers: {
        // Pretend we're a web browser to avoid download rate limits
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://dev.azure.com',
        Authorization: `Bearer ${e('SYSTEM_ACCESSTOKEN')}`
    }
};
async function requestAZDOAPI(path) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 2 * 60 * 1000);
    try {
        const res = await fetch(`${e('BUILDS_API_URL')}${path}?api-version=6.0`, { ...azdoFetchOptions, signal: abortController.signal });
        if (!res.ok) {
            throw new Error(`Unexpected status code: ${res.status}`);
        }
        return await res.json();
    }
    finally {
        clearTimeout(timeout);
    }
}
async function getPipelineArtifacts() {
    const result = await requestAZDOAPI('artifacts');
    return result.value.filter(a => /^vscode_/.test(a.name) && !/sbom$/.test(a.name));
}
async function getPipelineTimeline() {
    return await requestAZDOAPI('timeline');
}
async function downloadArtifact(artifact, downloadPath) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 4 * 60 * 1000);
    try {
        const res = await fetch(artifact.resource.downloadUrl, { ...azdoFetchOptions, signal: abortController.signal });
        if (!res.ok) {
            throw new Error(`Unexpected status code: ${res.status}`);
        }
        await (0, promises_1.pipeline)(stream_1.Readable.fromWeb(res.body), fs.createWriteStream(downloadPath));
    }
    finally {
        clearTimeout(timeout);
    }
}
async function unzip(packagePath, outputPath) {
    return new Promise((resolve, reject) => {
        yauzl.open(packagePath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
            if (err) {
                return reject(err);
            }
            const result = [];
            zipfile.on('entry', entry => {
                if (/\/$/.test(entry.fileName)) {
                    zipfile.readEntry();
                }
                else {
                    zipfile.openReadStream(entry, (err, istream) => {
                        if (err) {
                            return reject(err);
                        }
                        const filePath = path.join(outputPath, entry.fileName);
                        fs.mkdirSync(path.dirname(filePath), { recursive: true });
                        const ostream = fs.createWriteStream(filePath);
                        ostream.on('finish', () => {
                            result.push(filePath);
                            zipfile.readEntry();
                        });
                        istream?.on('error', err => reject(err));
                        istream.pipe(ostream);
                    });
                }
            });
            zipfile.on('close', () => resolve(result));
            zipfile.readEntry();
        });
    });
}
// Contains all of the logic for mapping details to our actual product names in CosmosDB
function getPlatform(product, os, arch, type, isLegacy) {
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
                    return `server-win32-${arch}`;
                case 'web':
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
                            return isLegacy ? `server-linux-legacy-${arch}` : `server-linux-${arch}`;
                        case 'web':
                            if (arch === 'standalone') {
                                return 'web-standalone';
                            }
                            return isLegacy ? `server-linux-legacy-${arch}-web` : `server-linux-${arch}-web`;
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
async function processArtifact(artifact, filePath) {
    const match = /^vscode_(?<product>[^_]+)_(?<os>[^_]+)(?:_legacy)?_(?<arch>[^_]+)_(?<unprocessedType>[^_]+)$/.exec(artifact.name);
    if (!match) {
        throw new Error(`Invalid artifact name: ${artifact.name}`);
    }
    // getPlatform needs the unprocessedType
    const { cosmosDBAccessToken, blobServiceAccessToken } = JSON.parse(e('PUBLISH_AUTH_TOKENS'));
    const quality = e('VSCODE_QUALITY');
    const version = e('BUILD_SOURCEVERSION');
    const { product, os, arch, unprocessedType } = match.groups;
    const isLegacy = artifact.name.includes('_legacy');
    const platform = getPlatform(product, os, arch, unprocessedType, isLegacy);
    const type = getRealType(unprocessedType);
    const size = fs.statSync(filePath).size;
    const stream = fs.createReadStream(filePath);
    const [hash, sha256hash] = await Promise.all([hashStream('sha1', stream), hashStream('sha256', stream)]); // CodeQL [SM04514] Using SHA1 only for legacy reasons, we are actually only respecting SHA256
    const log = (...args) => console.log(`[${artifact.name}]`, ...args);
    const blobServiceClient = new storage_blob_1.BlobServiceClient(`https://${e('VSCODE_STAGING_BLOB_STORAGE_ACCOUNT_NAME')}.blob.core.windows.net/`, { getToken: async () => blobServiceAccessToken });
    const containerClient = blobServiceClient.getContainerClient('staging');
    const releaseService = await ESRPReleaseService.create(log, e('RELEASE_TENANT_ID'), e('RELEASE_CLIENT_ID'), e('RELEASE_AUTH_CERT'), e('RELEASE_REQUEST_SIGNING_CERT'), containerClient);
    const friendlyFileName = `${quality}/${version}/${path.basename(filePath)}`;
    const url = `${e('PRSS_CDN_URL')}/${friendlyFileName}`;
    const res = await (0, retry_1.retry)(() => fetch(url));
    if (res.status === 200) {
        log(`Already released and provisioned: ${url}`);
    }
    else {
        await releaseService.createRelease(version, filePath, friendlyFileName);
    }
    const asset = { platform, type, url, hash: hash.toString('hex'), sha256hash: sha256hash.toString('hex'), size, supportsFastUpdate: true };
    log('Creating asset...', JSON.stringify(asset, undefined, 2));
    await (0, retry_1.retry)(async (attempt) => {
        log(`Creating asset in Cosmos DB (attempt ${attempt})...`);
        const client = new cosmos_1.CosmosClient({ endpoint: e('AZURE_DOCUMENTDB_ENDPOINT'), tokenProvider: () => Promise.resolve(`type=aad&ver=1.0&sig=${cosmosDBAccessToken.token}`) });
        const scripts = client.database('builds').container(quality).scripts;
        await scripts.storedProcedure('createAsset').execute('', [version, asset, true]);
    });
    log('Asset successfully created');
}
// It is VERY important that we don't download artifacts too much too fast from AZDO.
// AZDO throttles us SEVERELY if we do. Not just that, but they also close open
// sockets, so the whole things turns to a grinding halt. So, downloading and extracting
// happens serially in the main thread, making the downloads are spaced out
// properly. For each extracted artifact, we spawn a worker thread to upload it to
// the CDN and finally update the build in Cosmos DB.
async function main() {
    if (!node_worker_threads_1.isMainThread) {
        const { artifact, artifactFilePath } = node_worker_threads_1.workerData;
        await processArtifact(artifact, artifactFilePath);
        return;
    }
    const done = new State();
    const processing = new Set();
    for (const name of done) {
        console.log(`\u2705 ${name}`);
    }
    const stages = new Set(['Compile', 'CompileCLI']);
    if (e('VSCODE_BUILD_STAGE_WINDOWS') === 'True') {
        stages.add('Windows');
    }
    if (e('VSCODE_BUILD_STAGE_LINUX') === 'True') {
        stages.add('Linux');
    }
    if (e('VSCODE_BUILD_STAGE_LINUX_LEGACY_SERVER') === 'True') {
        stages.add('LinuxLegacyServer');
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
    let resultPromise = Promise.resolve([]);
    const operations = [];
    while (true) {
        const [timeline, artifacts] = await Promise.all([(0, retry_1.retry)(() => getPipelineTimeline()), (0, retry_1.retry)(() => getPipelineArtifacts())]);
        const stagesCompleted = new Set(timeline.records.filter(r => r.type === 'Stage' && r.state === 'completed' && stages.has(r.name)).map(r => r.name));
        const stagesInProgress = [...stages].filter(s => !stagesCompleted.has(s));
        const artifactsInProgress = artifacts.filter(a => processing.has(a.name));
        if (stagesInProgress.length === 0 && artifacts.length === done.size + processing.size) {
            break;
        }
        else if (stagesInProgress.length > 0) {
            console.log('Stages in progress:', stagesInProgress.join(', '));
        }
        else if (artifactsInProgress.length > 0) {
            console.log('Artifacts in progress:', artifactsInProgress.map(a => a.name).join(', '));
        }
        else {
            console.log(`Waiting for a total of ${artifacts.length}, ${done.size} done, ${processing.size} in progress...`);
        }
        for (const artifact of artifacts) {
            if (done.has(artifact.name) || processing.has(artifact.name)) {
                continue;
            }
            console.log(`[${artifact.name}] Found new artifact`);
            const artifactZipPath = path.join(e('AGENT_TEMPDIRECTORY'), `${artifact.name}.zip`);
            await (0, retry_1.retry)(async (attempt) => {
                const start = Date.now();
                console.log(`[${artifact.name}] Downloading (attempt ${attempt})...`);
                await downloadArtifact(artifact, artifactZipPath);
                const archiveSize = fs.statSync(artifactZipPath).size;
                const downloadDurationS = (Date.now() - start) / 1000;
                const downloadSpeedKBS = Math.round((archiveSize / 1024) / downloadDurationS);
                console.log(`[${artifact.name}] Successfully downloaded after ${Math.floor(downloadDurationS)} seconds(${downloadSpeedKBS} KB/s).`);
            });
            const artifactFilePaths = await unzip(artifactZipPath, e('AGENT_TEMPDIRECTORY'));
            const artifactFilePath = artifactFilePaths.filter(p => !/_manifest/.test(p))[0];
            processing.add(artifact.name);
            const promise = new Promise((resolve, reject) => {
                const worker = new node_worker_threads_1.Worker(__filename, { workerData: { artifact, artifactFilePath } });
                worker.on('error', reject);
                worker.on('exit', code => {
                    if (code === 0) {
                        resolve();
                    }
                    else {
                        reject(new Error(`[${artifact.name}] Worker stopped with exit code ${code}`));
                    }
                });
            });
            const operation = promise.then(() => {
                processing.delete(artifact.name);
                done.add(artifact.name);
                console.log(`\u2705 ${artifact.name} `);
            });
            operations.push({ name: artifact.name, operation });
            resultPromise = Promise.allSettled(operations.map(o => o.operation));
        }
        await new Promise(c => setTimeout(c, 10_000));
    }
    console.log(`Found all ${done.size + processing.size} artifacts, waiting for ${processing.size} artifacts to finish publishing...`);
    const artifactsInProgress = operations.filter(o => processing.has(o.name));
    if (artifactsInProgress.length > 0) {
        console.log('Artifacts in progress:', artifactsInProgress.map(a => a.name).join(', '));
    }
    const results = await resultPromise;
    for (let i = 0; i < operations.length; i++) {
        const result = results[i];
        if (result.status === 'rejected') {
            console.error(`[${operations[i].name}]`, result.reason);
        }
    }
    if (results.some(r => r.status === 'rejected')) {
        throw new Error('Some artifacts failed to publish');
    }
    console.log(`All ${done.size} artifacts published!`);
}
if (require.main === module) {
    main().then(() => {
        process.exit(0);
    }, err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=publish.js.map