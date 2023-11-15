"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const node_fetch_1 = require("node-fetch");
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
class Sequencer {
    current = Promise.resolve(null);
    queue(promiseTask) {
        return this.current = this.current.then(() => promiseTask(), () => promiseTask());
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
        const res = await (0, node_fetch_1.default)(`https://dsprovisionapi.microsoft.com${url}`, opts);
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
    static Sequencer = new Sequencer();
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
        const submitReleaseResult = await ESRPClient.Sequencer.queue(() => this.SubmitRelease(version, filePath));
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
    const res = await (0, retry_1.retry)(() => (0, node_fetch_1.default)(result));
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
    await (0, retry_1.retry)(async (attempt) => {
        console.log(`[downloadArtifact] [${artifact.name}] Downloading (attempt ${attempt})...`);
        const res = await (0, node_fetch_1.default)(artifact.resource.downloadUrl, { ...azdoOptions, timeout: 10000 });
        if (!res.ok) {
            throw new Error(`Unexpected status code: ${res.status}`);
        }
        console.log(`[downloadArtifact] [${artifact.name}] ${res.status} ${res.statusText}`);
        await Promise.race([
            (0, promises_1.pipeline)(res.body, fs.createWriteStream(downloadPath)),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5 * 60 * 1000))
        ]);
        console.log(`[downloadArtifact] [${artifact.name}] Completed`);
    });
}
async function unzip(packagePath, outputPath) {
    const name = path.basename(packagePath);
    return new Promise((resolve, reject) => {
        console.log(`[yauzl] [${name}] Opening archive...`);
        yauzl.open(packagePath, { lazyEntries: true }, (err, zipfile) => {
            if (err) {
                return reject(err);
            }
            console.log(`[yauzl] [${name}] Opened archive`);
            zipfile.on('entry', entry => {
                if (/\/$/.test(entry.fileName)) {
                    console.log(`[yauzl] [${name}] Skipping entry: ${entry.fileName}`);
                    zipfile.readEntry();
                }
                else {
                    console.log(`[yauzl] [${name}] Reading entry: ${entry.fileName}...`);
                    zipfile.openReadStream(entry, (err, istream) => {
                        if (err) {
                            return reject(err);
                        }
                        console.log(`[yauzl] [${name}] Got stream for entry: ${entry.fileName}...`);
                        const filePath = path.join(outputPath, entry.fileName);
                        fs.mkdirSync(path.dirname(filePath), { recursive: true });
                        const ostream = fs.createWriteStream(filePath);
                        istream?.on('end', () => {
                            console.log(`[yauzl] [${name}] Done reading stream for entry: ${entry.fileName}...`);
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
    return { assetUrl, mooncakeUrl };
}
const cosmosSequencer = new Sequencer();
async function processArtifact(product, os, arch, unprocessedType, filePath) {
    const log = (...args) => console.log(`[${product} ${os} ${arch} ${unprocessedType}]`, ...args);
    // getPlatform needs the unprocessedType
    const quality = e('VSCODE_QUALITY');
    const commit = e('BUILD_SOURCEVERSION');
    const platform = getPlatform(product, os, arch, unprocessedType);
    const type = getRealType(unprocessedType);
    const size = fs.statSync(filePath).size;
    log('Size:', size);
    const stream = fs.createReadStream(filePath);
    const [sha1hash, sha256hash] = await Promise.all([hashStream('sha1', stream), hashStream('sha256', stream)]);
    log('SHA1:', sha1hash);
    log('SHA256:', sha256hash);
    const [{ assetUrl, mooncakeUrl }, prssUrl] = await Promise.all([
        uploadAssetLegacy(log, quality, commit, filePath),
        releaseAndProvision(log, e('RELEASE_TENANT_ID'), e('RELEASE_CLIENT_ID'), e('RELEASE_AUTH_CERT_SUBJECT_NAME'), e('RELEASE_REQUEST_SIGNING_CERT_SUBJECT_NAME'), e('PROVISION_TENANT_ID'), e('PROVISION_AAD_USERNAME'), e('PROVISION_AAD_PASSWORD'), commit, quality, filePath)
    ]);
    const asset = {
        platform,
        type,
        url: assetUrl,
        hash: sha1hash,
        mooncakeUrl,
        prssUrl,
        sha256hash,
        size,
        supportsFastUpdate: true
    };
    log('Creating asset:', JSON.stringify(asset, null, '  '));
    await cosmosSequencer.queue(async () => {
        const aadCredentials = new identity_1.ClientSecretCredential(e('AZURE_TENANT_ID'), e('AZURE_CLIENT_ID'), e('AZURE_CLIENT_SECRET'));
        const client = new cosmos_1.CosmosClient({ endpoint: e('AZURE_DOCUMENTDB_ENDPOINT'), aadCredentials });
        const scripts = client.database('builds').container(quality).scripts;
        await (0, retry_1.retry)(async (attempt) => {
            log(`Creating asset in Cosmos DB (attempt ${attempt})...`);
            await scripts.storedProcedure('createAsset').execute('', [commit, asset, true]);
        });
    });
    log('Asset successfully created');
}
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
                    console.log(`Downloading ${artifact.name} (${artifact.resource.downloadUrl})...`);
                    const artifactZipPath = path.join(e('AGENT_TEMPDIRECTORY'), `${artifact.name}.zip`);
                    await downloadArtifact(artifact, artifactZipPath);
                    console.log(`Extracting ${artifact.name}...`);
                    artifactPath = await unzip(artifactZipPath, e('AGENT_TEMPDIRECTORY'));
                    const artifactSize = fs.statSync(artifactPath).size;
                    console.log(`Extracted ${artifact.name}: ${artifactSize}...`);
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
                publishPromises.push(processArtifact(product, os, arch, type, artifactPath).then(() => {
                    processing.delete(artifact.name);
                    done.add(artifact.name);
                }));
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
if (require.main === module) {
    process.on('beforeExit', (code) => {
        console.log('Process beforeExit event with code: ', code);
    });
    process.on('exit', (code) => {
        console.log(`About to exit with code: ${code}`);
    });
    const [] = process.argv.slice(2);
    main().then(() => {
        process.exit(0);
    }, err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHVibGlzaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInB1Ymxpc2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOztBQUVoRyx5QkFBeUI7QUFDekIsNkJBQTZCO0FBQzdCLDJDQUFnRDtBQUVoRCxtREFBZ0Q7QUFDaEQsK0JBQStCO0FBQy9CLGlDQUFpQztBQUNqQyxtQ0FBZ0M7QUFDaEMsc0RBQXdJO0FBQ3hJLDZCQUE2QjtBQUM3QiwwQ0FBNkM7QUFDN0MsOENBQXlEO0FBQ3pELG9DQUFvQztBQUNwQyx5QkFBeUI7QUFFekIsU0FBUyxDQUFDLENBQUMsSUFBWTtJQUN0QixNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRWpDLElBQUksT0FBTyxNQUFNLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDaEMsTUFBTSxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRUQsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBRUQsTUFBTSxJQUFJO0lBQ0QsTUFBTSxHQUFhLEVBQUUsQ0FBQztJQUU5QixXQUFXO1FBQ1YsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLEVBQUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUM1RSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2QixPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxPQUFPO1FBQ04sS0FBSyxNQUFNLElBQUksSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDaEMsSUFBSSxDQUFDO2dCQUNKLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDckIsQ0FBQztZQUFDLE9BQU8s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