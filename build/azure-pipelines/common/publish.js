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
const storage_blob_1 = require("@azure/storage-blob");
const mime = require("mime");
const cosmos_1 = require("@azure/cosmos");
const identity_1 = require("@azure/identity");
const cp = require("child_process");
const os = require("os");
const node_worker_threads_1 = require("node:worker_threads");
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
        this.log(`Submitting release for ${version}: ${filePath}`);
        const submitReleaseResult = await this.SubmitRelease(version, filePath);
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
async function uploadAssetLegacy(log, quality, commit, filePath) {
    const fileName = path.basename(filePath);
    const blobName = commit + '/' + fileName;
    const credential = new identity_1.ClientSecretCredential(e('AZURE_TENANT_ID'), e('AZURE_CLIENT_ID'), e('AZURE_CLIENT_SECRET'));
    const blobServiceClient = new storage_blob_1.BlobServiceClient(`https://vscode.blob.core.windows.net`, credential, { retryOptions: { retryPolicyType: storage_blob_1.StorageRetryPolicyType.FIXED, tryTimeoutInMs: 2 * 60 * 1000 } });
    const containerClient = blobServiceClient.getContainerClient(quality);
    const blobClient = containerClient.getBlockBlobClient(blobName);
    const blobOptions = {
        blobHTTPHeaders: {
            blobContentType: mime.lookup(filePath),
            blobContentDisposition: `attachment; filename="${fileName}"`,
            blobCacheControl: 'max-age=31536000, public'
        }
    };
    log(`Checking for blob in Azure...`);
    if (await blobClient.exists()) {
        log(`Blob ${quality}, ${blobName} already exists, not publishing again.`);
    }
    else {
        log(`Uploading blobs to Azure storage...`);
        await blobClient.uploadFile(filePath, blobOptions);
        log('Blob successfully uploaded to Azure storage.');
    }
    return `${e('AZURE_CDN_URL')}/${quality}/${blobName}`;
}
async function processArtifact(artifact, artifactFilePath) {
    const log = (...args) => console.log(`[${artifact.name}]`, ...args);
    const match = /^vscode_(?<product>[^_]+)_(?<os>[^_]+)_(?<arch>[^_]+)_(?<unprocessedType>[^_]+)$/.exec(artifact.name);
    if (!match) {
        throw new Error(`Invalid artifact name: ${artifact.name}`);
    }
    // getPlatform needs the unprocessedType
    const quality = e('VSCODE_QUALITY');
    const commit = e('BUILD_SOURCEVERSION');
    const { product, os, arch, unprocessedType } = match.groups;
    const platform = getPlatform(product, os, arch, unprocessedType);
    const type = getRealType(unprocessedType);
    const size = fs.statSync(artifactFilePath).size;
    const stream = fs.createReadStream(artifactFilePath);
    const [sha1hash, sha256hash] = await Promise.all([hashStream('sha1', stream), hashStream('sha256', stream)]);
    const [cdnSettledResult, prssSettledResult] = await Promise.allSettled([
        uploadAssetLegacy(log, quality, commit, artifactFilePath),
        releaseAndProvision(log, e('RELEASE_TENANT_ID'), e('RELEASE_CLIENT_ID'), e('RELEASE_AUTH_CERT_SUBJECT_NAME'), e('RELEASE_REQUEST_SIGNING_CERT_SUBJECT_NAME'), e('PROVISION_TENANT_ID'), e('PROVISION_AAD_USERNAME'), e('PROVISION_AAD_PASSWORD'), commit, quality, artifactFilePath)
    ]);
    if (cdnSettledResult.status === 'rejected') {
        throw cdnSettledResult.reason;
    }
    else if (prssSettledResult.status === 'rejected') { // TODO@joaomoreno, let's temporarily ignore these errors
        console.error(prssSettledResult.reason);
    }
    const assetUrl = cdnSettledResult.value;
    const prssUrl = prssSettledResult.status === 'fulfilled' ? prssSettledResult.value : undefined;
    const asset = { platform, type, url: assetUrl, hash: sha1hash, mooncakeUrl: prssUrl, prssUrl, sha256hash, size, supportsFastUpdate: true };
    log('Creating asset...', JSON.stringify(asset));
    await (0, retry_1.retry)(async (attempt) => {
        log(`Creating asset in Cosmos DB (attempt ${attempt})...`);
        const aadCredentials = new identity_1.ClientSecretCredential(e('AZURE_TENANT_ID'), e('AZURE_CLIENT_ID'), e('AZURE_CLIENT_SECRET'));
        const client = new cosmos_1.CosmosClient({ endpoint: e('AZURE_DOCUMENTDB_ENDPOINT'), aadCredentials });
        const scripts = client.database('builds').container(quality).scripts;
        await scripts.storedProcedure('createAsset').execute('', [commit, asset, true]);
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
            const artifactFilePath = await unzip(artifactZipPath, e('AGENT_TEMPDIRECTORY'));
            const artifactSize = fs.statSync(artifactFilePath).size;
            if (artifactSize !== Number(artifact.resource.properties.artifactsize)) {
                console.log(`[${artifact.name}] Artifact size mismatch.Expected ${artifact.resource.properties.artifactsize}. Actual ${artifactSize} `);
                throw new Error(`Artifact size mismatch.`);
            }
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
        await new Promise(c => setTimeout(c, 10000));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHVibGlzaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInB1Ymxpc2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOztBQUVoRyx5QkFBeUI7QUFDekIsNkJBQTZCO0FBQzdCLG1DQUFrQztBQUVsQyxtREFBZ0Q7QUFDaEQsK0JBQStCO0FBQy9CLGlDQUFpQztBQUNqQyxtQ0FBZ0M7QUFDaEMsc0RBQWdIO0FBQ2hILDZCQUE2QjtBQUM3QiwwQ0FBNkM7QUFDN0MsOENBQXlEO0FBQ3pELG9DQUFvQztBQUNwQyx5QkFBeUI7QUFDekIsNkRBQXVFO0FBRXZFLFNBQVMsQ0FBQyxDQUFDLElBQVk7SUFDdEIsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUVqQyxJQUFJLE9BQU8sTUFBTSxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sSUFBSSxLQUFLLENBQUMsZ0JBQWdCLElBQUksRUFBRSxDQUFDLENBQUM7SUFDekMsQ0FBQztJQUVELE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQztBQUVELE1BQU0sSUFBSTtJQUNELE1BQU0sR0FBYSxFQUFFLENBQUM7SUFFOUIsV0FBVztRQUNWLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxFQUFFLE1BQU0sQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDNUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdkIsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsT0FBTztRQUNOLEtBQUssTUFBTSxJQUFJLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2hDLElBQUksQ0FBQztnQkFDSixFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JCLENB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