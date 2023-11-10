"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.releaseAndProvision = exports.Sequencer = exports.Temp = void 0;
const identity_1 = require("@azure/identity");
const https = require("https");
const cp = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
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
exports.Temp = Temp;
class Sequencer {
    current = Promise.resolve(null);
    queue(promiseTask) {
        return this.current = this.current.then(() => promiseTask(), () => promiseTask());
    }
}
exports.Sequencer = Sequencer;
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
        const res = await this.request('POST', '/api/v2/ProvisionedFiles/CreateProvisionedFiles', { body });
        if (!res.IsSuccess) {
            throw new Error(`Failed to submit provisioning request: ${JSON.stringify(res.ErrorDetails)}`);
        }
        this.log(`Successfully provisioned ${fileName}`);
    }
    async request(method, url, options) {
        return await new Promise((c, e) => {
            const headers = {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            };
            if (options?.body) {
                headers['Content-Length'] = String(options.body.length);
            }
            const req = https.request(`https://dsprovisionapi.microsoft.com${url}`, { method, headers }, res => {
                if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 500) {
                    return e(new Error(`Unexpected status code: ${res.statusCode}`));
                }
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => {
                    const body = Buffer.concat(chunks).toString();
                    try {
                        c(JSON.parse(body));
                    }
                    catch (err) {
                        e(err);
                    }
                });
            });
            req.on('error', e);
            if (options?.body) {
                req.write(options?.body);
            }
            req.end();
        });
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
        // Poll every 5 seconds, wait 30 minutes max -> poll 60/5*30=360 times
        for (let i = 0; i < 360; i++) {
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
    const tmp = new Temp();
    process.on('exit', () => tmp.dispose());
    log('releaseTenantId', releaseTenantId);
    log('releaseClientId', releaseClientId);
    log('releaseAuthCertSubjectName', releaseAuthCertSubjectName);
    log('releaseRequestSigningCertSubjectName', releaseRequestSigningCertSubjectName);
    log('provisionTenantId', provisionTenantId);
    log('provisionAADUsername', provisionAADUsername);
    log('provisionAADPassword', provisionAADPassword);
    log('version', version);
    log('quality', quality);
    log('filePath', filePath);
    const esrpclient = new ESRPClient(log, tmp, releaseTenantId, releaseClientId, releaseAuthCertSubjectName, releaseRequestSigningCertSubjectName);
    const release = await esrpclient.release(version, filePath);
    const credential = new identity_1.ClientSecretCredential(provisionTenantId, provisionAADUsername, provisionAADPassword);
    const accessToken = await credential.getToken(['https://microsoft.onmicrosoft.com/DS.Provisioning.WebApi/.default']);
    const service = new ProvisionService(log, accessToken.token);
    await service.provision(release.releaseId, release.fileId, `${quality}/${version}/${path.basename(filePath)}`);
}
exports.releaseAndProvision = releaseAndProvision;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJzcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsOENBQXlEO0FBQ3pELCtCQUErQjtBQUMvQixvQ0FBb0M7QUFDcEMseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3QixpQ0FBaUM7QUFFakMseUJBQXlCO0FBRXpCLE1BQWEsSUFBSTtJQUNSLE1BQU0sR0FBYSxFQUFFLENBQUM7SUFFOUIsV0FBVztRQUNWLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxFQUFFLE1BQU0sQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDNUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdkIsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsT0FBTztRQUNOLEtBQUssTUFBTSxJQUFJLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2hDLElBQUksQ0FBQztnQkFDSixFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JCLENBQUM7WUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO2dCQUNkLE9BQU87WUFDUixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7Q0FDRDtBQWxCRCxvQkFrQkM7QUFFRCxNQUFhLFNBQVM7SUFFYixPQUFPLEdBQXFCLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFMUQsS0FBSyxDQUFJLFdBQTZCO1FBQ3JDLE9BQU8sSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxXQUFXLEVBQUUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO0lBQ25GLENBQUM7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