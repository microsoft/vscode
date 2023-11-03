"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.releaseAndProvision = void 0;
const identity_1 = require("@azure/identity");
const https = require("https");
const cp = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const util_1 = require("../../lib/util");
class ProvisionService {
    accessToken;
    constructor(accessToken) {
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
        console.log(`Provisioning ${fileName} (releaseId: ${releaseId}, fileId: ${fileId})...`);
        const res = await this.request('POST', '/api/v2/ProvisionedFiles/CreateProvisionedFiles', { body });
        if (!res.IsSuccess) {
            console.error(res.ErrorDetails);
            throw new Error(res.ErrorDetails.Message);
        }
        console.log(`Successfully provisioned ${fileName}`);
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
    tmp;
    authPath;
    constructor(tmp, tenantId, clientId, authCertSubjectName, requestSigningCertSubjectName) {
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
        console.log(`Submitting release for ${version}: ${filePath}`);
        const submitReleaseResult = await this.SubmitRelease(version, filePath);
        if (submitReleaseResult.submissionResponse.statusCode !== 'pass') {
            throw new Error(`Unexpected status code: ${submitReleaseResult.submissionResponse.statusCode}`);
        }
        const releaseId = submitReleaseResult.submissionResponse.operationId;
        console.log(`Successfully submitted release ${releaseId}`);
        let details;
        // Poll every 5 seconds, wait 6 minutes max -> poll 60/5*6=72 times
        for (let i = 0; i < 72; i++) {
            details = await this.ReleaseDetails(releaseId);
            console.log(`Release status code (${i + 1}/72): ${details.releaseDetails[0].statusCode}`);
            if (details.releaseDetails[0].statusCode === 'pass') {
                break;
            }
            else if (details.releaseDetails[0].statusCode !== 'inprogress') {
                console.error(details);
                throw new Error('Failed to submit release');
            }
            await new Promise(c => setTimeout(c, 5000));
        }
        const fileId = details.releaseDetails[0].fileDetails[0].publisherKey;
        console.log('Release completed successfully with fileId: ', fileId);
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
async function releaseAndProvision(releaseTenantId, releaseClientId, releaseAuthCertSubjectName, releaseRequestSigningCertSubjectName, provisionTenantId, provisionAADUsername, provisionAADPassword, version, quality, filePath) {
    const tmp = new util_1.Temp();
    process.on('exit', () => tmp.dispose());
    console.log('### Release and provision');
    console.log('  releaseTenantId:', releaseTenantId);
    console.log('  releaseClientId:', releaseClientId);
    console.log('  releaseAuthCertSubjectName:', releaseAuthCertSubjectName);
    console.log('  releaseRequestSigningCertSubjectName:', releaseRequestSigningCertSubjectName);
    console.log('  provisionTenantId:', provisionTenantId);
    console.log('  provisionAADUsername:', provisionAADUsername);
    console.log('  version:', version);
    console.log('  quality:', quality);
    console.log('  filePath:', filePath);
    const esrpclient = new ESRPClient(tmp, releaseTenantId, releaseClientId, releaseAuthCertSubjectName, releaseRequestSigningCertSubjectName);
    const release = await esrpclient.release(version, filePath);
    const credential = new identity_1.ClientSecretCredential(provisionTenantId, provisionAADUsername, provisionAADPassword);
    const accessToken = await credential.getToken(['https://microsoft.onmicrosoft.com/DS.Provisioning.WebApi/.default']);
    const service = new ProvisionService(accessToken.token);
    await service.provision(release.releaseId, release.fileId, `${quality}/${version}/${path.basename(filePath)}`);
}
exports.releaseAndProvision = releaseAndProvision;
if (require.main === module) {
    const [releaseTenantId, releaseClientId, releaseAuthCertSubjectName, releaseRequestSigningCertSubjectName, provisionTenantId, provisionAADUsername, provisionAADPassword, version, quality, filePath] = process.argv.slice(2);
    releaseAndProvision(releaseTenantId, releaseClientId, releaseAuthCertSubjectName, releaseRequestSigningCertSubjectName, provisionTenantId, provisionAADUsername, provisionAADPassword, version, quality, filePath).then(() => {
        process.exit(0);
    }, err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJzcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsOENBQXlEO0FBQ3pELCtCQUErQjtBQUMvQixvQ0FBb0M7QUFDcEMseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3QixpQ0FBaUM7QUFFakMseUNBQXNDO0FBd0J0QyxNQUFNLGdCQUFnQjtJQUVRO0lBQTdCLFlBQTZCLFdBQW1CO1FBQW5CLGdCQUFXLEdBQVgsV0FBVyxDQUFRO0lBQUksQ0FBQztJQUVyRCxLQUFLLENBQUMsU0FBUyxDQUFDLFNBQWlCLEVBQUUsTUFBYyxFQUFFLFFBQWdCO1FBQ2xFLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUM7WUFDM0IsU0FBUyxFQUFFLFNBQVM7WUFDcEIsVUFBVSxFQUFFLFFBQVE7WUFDcEIsYUFBYSxFQUFFLFFBQVE7WUFDdkIsMEJBQTBCLEVBQUUsQ0FBQztvQkFDNUIsWUFBWSxFQUFFLE1BQU07b0JBQ3BCLHdCQUF3QixFQUFFLElBQUk7b0JBQzlCLGdCQUFnQixFQUFFLFFBQVE7b0JBQzFCLE1BQU0sRUFBRSxNQUFNO29CQUNkLFdBQVcsRUFBRSxDQUFDLEtBQUssQ0FBQztpQkFDcEIsQ0FBQztTQUNGLENBQUMsQ0FBQztRQUVILE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLFFBQVEsZ0JBQWdCLFNBQVMsYUFBYSxNQUFNLE1BQU0sQ0FBQyxDQUFDO1FBQ3hGLE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBaUMsTUFBTSxFQUFFLGlEQUFpRCxFQUFFLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUVwSSxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3BCLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQ2hDLE1BQU0sSUFBSSxLQUFLLENBQUMsR0FBRyxD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