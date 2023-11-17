"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Limiter = void 0;
const fs = require("fs");
const path = require("path");
const stream_1 = require("stream");
const promises_1 = require("node:stream/promises");
const yauzl = require("yauzl");
const crypto = require("crypto");
const retry_1 = require("./retry");
const storage_blob_1 = require("@azure/storage-blob");
const mime = require("mime");
const cosmos_1 = require("@azure/cosmos");
const identity_1 = require("@azure/identity");
const cp = require("child_process");
const os = require("os");
function e(name) {
    const result = process.env[name];
    if (typeof result !== 'string') {
        throw new Error(`Missing env: ${name}`);
    }
    return result;
}
class Temp {
    _files = [];
    tmpNameSync() {
        const file = path.join(os.tmpdir(), crypto.randomBytes(20).toString('hex'));
        this._files.push(file);
        return file;
    }
    dispose() {
        for (const file of this._files) {
            try {
                fs.unlinkSync(file);
            }
            catch (err) {
                // noop
            }
        }
    }
}
class Limiter {
    _size = 0;
    runningPromises;
    maxDegreeOfParalellism;
    outstandingPromises;
    constructor(maxDegreeOfParalellism) {
        this.maxDegreeOfParalellism = maxDegreeOfParalellism;
        this.outstandingPromises = [];
        this.runningPromises = 0;
    }
    queue(factory) {
        this._size++;
        return new Promise((c, e) => {
            this.outstandingPromises.push({ factory, c, e });
            this.consume();
        });
    }
    consume() {
        while (this.outstandingPromises.length && this.runningPromises < this.maxDegreeOfParalellism) {
            const iLimitedTask = this.outstandingPromises.shift();
            this.runningPromises++;
            const promise = iLimitedTask.factory();
            promise.then(iLimitedTask.c, iLimitedTask.e);
            promise.then(() => this.consumed(), () => this.consumed());
        }
    }
    consumed() {
        this._size--;
        this.runningPromises--;
        if (this.outstandingPromises.length > 0) {
            this.consume();
        }
    }
}
exports.Limiter = Limiter;
class ProvisionService {
    log;
    accessToken;
    constructor(log, accessToken) {
        this.log = log;
        this.accessToken = accessToken;
    }
    async provision(releaseId, fileId, fileName) {
        const body = JSON.stringify({
            ReleaseId: releaseId,
            PortalName: 'VSCode',
            PublisherCode: 'VSCode',
            ProvisionedFilesCollection: [{
                    PublisherKey: fileId,
                    IsStaticFriendlyFileName: true,
                    FriendlyFileName: fileName,
                    MaxTTL: '1440',
                    CdnMappings: ['ECN']
                }]
        });
        this.log(`Provisioning ${fileName} (releaseId: ${releaseId}, fileId: ${fileId})...`);
        const res = await (0, retry_1.retry)(() => this.request('POST', '/api/v2/ProvisionedFiles/CreateProvisionedFiles', { body }));
        if (!res.IsSuccess) {
            throw new Error(`Failed to submit provisioning request: ${JSON.stringify(res.ErrorDetails)}`);
        }
        this.log(`Successfully provisioned ${fileName}`);
    }
    async request(method, url, options) {
        const opts = {
            method,
            body: options?.body,
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            }
        };
        const res = await fetch(`https://dsprovisionapi.microsoft.com${url}`, opts);
        if (!res.ok || res.status < 200 || res.status >= 500) {
            throw new Error(`Unexpected status code: ${res.status}`);
        }
        return await res.json();
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
class ESRPClient {
    log;
    tmp;
    static Limiter = new Limiter(1);
    authPath;
    constructor(log, tmp, tenantId, clientId, authCertSubjectName, requestSigningCertSubjectName) {
        this.log = log;
        this.tmp = tmp;
        this.authPath = this.tmp.tmpNameSync();
        fs.writeFileSync(this.authPath, JSON.stringify({
            Version: '1.0.0',
            AuthenticationType: 'AAD_CERT',
            TenantId: tenantId,
            ClientId: clientId,
            AuthCert: {
                SubjectName: authCertSubjectName,
                StoreLocation: 'LocalMachine',
                StoreName: 'My',
                SendX5c: 'true'
            },
            RequestSigningCert: {
                SubjectName: requestSigningCertSubjectName,
                StoreLocation: 'LocalMachine',
                StoreName: 'My'
            }
        }));
    }
    async release(version, filePath) {
        const submitReleaseResult = await ESRPClient.Limiter.queue(async () => {
            this.log(`Submitting release for ${version}: ${filePath}`);
            return await this.SubmitRelease(version, filePath);
        });
        if (submitReleaseResult.submissionResponse.statusCode !== 'pass') {
            throw new Error(`Unexpected status code: ${submitReleaseResult.submissionResponse.statusCode}`);
        }
        const releaseId = submitReleaseResult.submissionResponse.operationId;
        this.log(`Successfully submitted release ${releaseId}. Polling for completion...`);
        let details;
        // Poll every 5 seconds, wait 60 minutes max -> poll 60/5*60=720 times
        for (let i = 0; i < 720; i++) {
            details = await this.ReleaseDetails(releaseId);
            if (details.releaseDetails[0].statusCode === 'pass') {
                break;
            }
            else if (details.releaseDetails[0].statusCode !== 'inprogress') {
                throw new Error(`Failed to submit release: ${JSON.stringify(details)}`);
            }
            await new Promise(c => setTimeout(c, 5000));
        }
        if (details.releaseDetails[0].statusCode !== 'pass') {
            throw new Error(`Timed out waiting for release ${releaseId}: ${JSON.stringify(details)}`);
        }
        const fileId = details.releaseDetails[0].fileDetails[0].publisherKey;
        this.log('Release completed successfully with fileId: ', fileId);
        return { releaseId, fileId };
    }
    async SubmitRelease(version, filePath) {
        const policyPath = this.tmp.tmpNameSync();
        fs.writeFileSync(policyPath, JSON.stringify({
            Version: '1.0.0',
            Audience: 'InternalLimited',
            Intent: 'distribution',
            ContentType: 'InstallPackage'
        }));
        const inputPath = this.tmp.tmpNameSync();
        const size = fs.statSync(filePath).size;
        const istream = fs.createReadStream(filePath);
        const sha256 = await hashStream('sha256', istream);
        fs.writeFileSync(inputPath, JSON.stringify({
            Version: '1.0.0',
            ReleaseInfo: {
                ReleaseMetadata: {
                    Title: 'VS Code',
                    Properties: {
                        ReleaseContentType: 'InstallPackage'
                    },
                    MinimumNumberOfApprovers: 1
                },
                ProductInfo: {
                    Name: 'VS Code',
                    Version: version,
                    Description: path.basename(filePath, path.extname(filePath)),
                },
                Owners: [
                    {
                        Owner: {
                            UserPrincipalName: 'jomo@microsoft.com'
                        }
                    }
                ],
                Approvers: [
                    {
                        Approver: {
                            UserPrincipalName: 'jomo@microsoft.com'
                        },
                        IsAutoApproved: true,
                        IsMandatory: false
                    }
                ],
                AccessPermissions: {
                    MainPublisher: 'VSCode',
                    ChannelDownloadEntityDetails: {
                        Consumer: ['VSCode']
                    }
                },
                CreatedBy: {
                    UserPrincipalName: 'jomo@microsoft.com'
                }
            },
            ReleaseBatches: [
                {
                    ReleaseRequestFiles: [
                        {
                            SizeInBytes: size,
                            SourceHash: sha256,
                            HashType: 'SHA256',
                            SourceLocation: path.basename(filePath)
                        }
                    ],
                    SourceLocationType: 'UNC',
                    SourceRootDirectory: path.dirname(filePath),
                    DestinationLocationType: 'AzureBlob'
                }
            ]
        }));
        const outputPath = this.tmp.tmpNameSync();
        cp.execSync(`ESRPClient SubmitRelease -a ${this.authPath} -p ${policyPath} -i ${inputPath} -o ${outputPath}`, { stdio: 'inherit' });
        const output = fs.readFileSync(outputPath, 'utf8');
        return JSON.parse(output);
    }
    async ReleaseDetails(releaseId) {
        const inputPath = this.tmp.tmpNameSync();
        fs.writeFileSync(inputPath, JSON.stringify({
            Version: '1.0.0',
            OperationIds: [releaseId]
        }));
        const outputPath = this.tmp.tmpNameSync();
        cp.execSync(`ESRPClient ReleaseDetails -a ${this.authPath} -i ${inputPath} -o ${outputPath}`, { stdio: 'inherit' });
        const output = fs.readFileSync(outputPath, 'utf8');
        return JSON.parse(output);
    }
}
async function releaseAndProvision(log, releaseTenantId, releaseClientId, releaseAuthCertSubjectName, releaseRequestSigningCertSubjectName, provisionTenantId, provisionAADUsername, provisionAADPassword, version, quality, filePath) {
    const fileName = `${quality}/${version}/${path.basename(filePath)}`;
    const result = `${e('PRSS_CDN_URL')}/${fileName}`;
    const res = await (0, retry_1.retry)(() => fetch(result));
    if (res.status === 200) {
        log(`Already released and provisioned: ${result}`);
        return result;
    }
    const tmp = new Temp();
    process.on('exit', () => tmp.dispose());
    const esrpclient = new ESRPClient(log, tmp, releaseTenantId, releaseClientId, releaseAuthCertSubjectName, releaseRequestSigningCertSubjectName);
    const release = await esrpclient.release(version, filePath);
    const credential = new identity_1.ClientSecretCredential(provisionTenantId, provisionAADUsername, provisionAADPassword);
    const accessToken = await credential.getToken(['https://microsoft.onmicrosoft.com/DS.Provisioning.WebApi/.default']);
    const service = new ProvisionService(log, accessToken.token);
    await service.provision(release.releaseId, release.fileId, fileName);
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
        yauzl.open(packagePath, { lazyEntries: true }, (err, zipfile) => {
            if (err) {
                return reject(err);
            }
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
                            zipfile.close();
                            resolve(filePath);
                        });
                        istream?.on('error', err => reject(err));
                        istream.pipe(ostream);
                    });
                }
            });
            zipfile.readEntry();
        });
    });
}
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
const azureLimiter = new Limiter(1);
const mooncakeLimiter = new Limiter(1);
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
            await (0, retry_1.retry)(attempt => azureLimiter.queue(async () => {
                log(`Uploading blobs to Azure storage (attempt ${attempt})...`);
                await blobClient.uploadFile(filePath, blobOptions);
                log('Blob successfully uploaded to Azure storage.');
            }));
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
                await (0, retry_1.retry)(attempt => mooncakeLimiter.queue(async () => {
                    log(`Uploading blobs to Mooncake Azure storage (attempt ${attempt})...`);
                    await mooncakeBlobClient.uploadFile(filePath, blobOptions);
                    log('Blob successfully uploaded to Mooncake Azure storage.');
                }));
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
    return { assetUrl, mooncakeUrl };
}
const downloadLimiter = new Limiter(5);
const cosmosLimiter = new Limiter(1);
async function processArtifact(artifact) {
    const match = /^vscode_(?<product>[^_]+)_(?<os>[^_]+)_(?<arch>[^_]+)_(?<unprocessedType>[^_]+)$/.exec(artifact.name);
    if (!match) {
        throw new Error(`Invalid artifact name: ${artifact.name}`);
    }
    const { product, os, arch, unprocessedType } = match.groups;
    const log = (...args) => console.log(`[${product} ${os} ${arch} ${unprocessedType}]`, ...args);
    const start = Date.now();
    const filePath = await (0, retry_1.retry)(async (attempt) => {
        const artifactZipPath = path.join(e('AGENT_TEMPDIRECTORY'), `${artifact.name}.zip`);
        const start = Date.now();
        log(`Downloading ${artifact.resource.downloadUrl} (attempt ${attempt})...`);
        try {
            await downloadLimiter.queue(() => downloadArtifact(artifact, artifactZipPath));
        }
        catch (err) {
            log(`Download failed: ${err.message}`);
            throw err;
        }
        const archiveSize = fs.statSync(artifactZipPath).size;
        const downloadDurationS = (Date.now() - start) / 1000;
        const downloadSpeedKBS = Math.round((archiveSize / 1024) / downloadDurationS);
        log(`Successfully downloaded ${artifact.resource.downloadUrl} after ${Math.floor(downloadDurationS)} seconds (${downloadSpeedKBS} KB/s).`);
        const filePath = await unzip(artifactZipPath, e('AGENT_TEMPDIRECTORY'));
        const artifactSize = fs.statSync(filePath).size;
        if (artifactSize !== Number(artifact.resource.properties.artifactsize)) {
            log(`Artifact size mismatch. Expected ${artifact.resource.properties.artifactsize}. Actual ${artifactSize}`);
            throw new Error(`Artifact size mismatch.`);
        }
        return filePath;
    });
    log(`Successfully downloaded and extracted after ${(Date.now() - start) / 1000} seconds.`);
    // getPlatform needs the unprocessedType
    const quality = e('VSCODE_QUALITY');
    const commit = e('BUILD_SOURCEVERSION');
    const platform = getPlatform(product, os, arch, unprocessedType);
    const type = getRealType(unprocessedType);
    const size = fs.statSync(filePath).size;
    const stream = fs.createReadStream(filePath);
    const [sha1hash, sha256hash] = await Promise.all([hashStream('sha1', stream), hashStream('sha256', stream)]);
    const [{ assetUrl, mooncakeUrl }, prssUrl] = await Promise.all([
        uploadAssetLegacy(log, quality, commit, filePath),
        releaseAndProvision(log, e('RELEASE_TENANT_ID'), e('RELEASE_CLIENT_ID'), e('RELEASE_AUTH_CERT_SUBJECT_NAME'), e('RELEASE_REQUEST_SIGNING_CERT_SUBJECT_NAME'), e('PROVISION_TENANT_ID'), e('PROVISION_AAD_USERNAME'), e('PROVISION_AAD_PASSWORD'), commit, quality, filePath)
    ]);
    const asset = { platform, type, url: assetUrl, hash: sha1hash, mooncakeUrl, prssUrl, sha256hash, size, supportsFastUpdate: true };
    log('Creating asset...', JSON.stringify(asset));
    await (0, retry_1.retry)(async (attempt) => {
        await cosmosLimiter.queue(async () => {
            log(`Creating asset in Cosmos DB (attempt ${attempt})...`);
            const aadCredentials = new identity_1.ClientSecretCredential(e('AZURE_TENANT_ID'), e('AZURE_CLIENT_ID'), e('AZURE_CLIENT_SECRET'));
            const client = new cosmos_1.CosmosClient({ endpoint: e('AZURE_DOCUMENTDB_ENDPOINT'), aadCredentials });
            const scripts = client.database('builds').container(quality).scripts;
            await scripts.storedProcedure('createAsset').execute('', [commit, asset, true]);
        });
    });
    log('Asset successfully created');
}
async function main() {
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
    if (e('VSCODE_BUILD_STAGE_ALPINE') === 'True') {
        stages.add('Alpine');
    }
    if (e('VSCODE_BUILD_STAGE_MACOS') === 'True') {
        stages.add('macOS');
    }
    if (e('VSCODE_BUILD_STAGE_WEB') === 'True') {
        stages.add('Web');
    }
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
            console.log(`Found new artifact: ${artifact.name}`);
            processing.add(artifact.name);
            const operation = processArtifact(artifact).then(() => {
                processing.delete(artifact.name);
                done.add(artifact.name);
                console.log(`\u2705 ${artifact.name}`);
            });
            operations.push({ name: artifact.name, operation });
        }
        await new Promise(c => setTimeout(c, 10000));
    }
    console.log(`Found all ${done.size + processing.size} artifacts, waiting for ${processing.size} artifacts to finish publishing...`);
    const artifactsInProgress = operations.filter(o => processing.has(o.name));
    if (artifactsInProgress.length > 0) {
        console.log('Artifacts in progress:', artifactsInProgress.map(a => a.name).join(', '));
    }
    const results = await Promise.allSettled(operations.map(o => o.operation));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHVibGlzaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInB1Ymxpc2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3QixtQ0FBa0M7QUFFbEMsbURBQWdEO0FBQ2hELCtCQUErQjtBQUMvQixpQ0FBaUM7QUFDakMsbUNBQWdDO0FBQ2hDLHNEQUF3STtBQUN4SSw2QkFBNkI7QUFDN0IsMENBQTZDO0FBQzdDLDhDQUF5RDtBQUN6RCxvQ0FBb0M7QUFDcEMseUJBQXlCO0FBRXpCLFNBQVMsQ0FBQyxDQUFDLElBQVk7SUFDdEIsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUVqQyxJQUFJLE9BQU8sTUFBTSxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sSUFBSSxLQUFLLENBQUMsZ0JBQWdCLElBQUksRUFBRSxDQUFDLENBQUM7SUFDekMsQ0FBQztJQUVELE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQztBQUVELE1BQU0sSUFBSTtJQUNELE1BQU0sR0FBYSxFQUFFLENBQUM7SUFFOUIsV0FBVztRQUNWLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxFQUFFLE1BQU0sQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDNUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdkIsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsT0FBTztRQUNOLEtBQUssTUFBTSxJQUFJLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2hDLElBQUksQ0FBQztnQkFDSixFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JCLENBQUM7WUFBQyxPQUFP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