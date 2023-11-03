"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
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
                // https://vscode.download.prss.microsoft.com/dbazure/download/test/e7e037083ff4455cf320e344325dacb480062c3c/vscode_cli_linux_x64_cli.tar.gz
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
async function main([releaseTenantId, releaseClientId, releaseAuthCertSubjectName, releaseRequestSigningCertSubjectName, provisionTenantId, provisionAADUsername, provisionAADPassword, version, quality, filePath]) {
    const tmp = new util_1.Temp();
    process.on('exit', () => tmp.dispose());
    const esrpclient = new ESRPClient(tmp, releaseTenantId, releaseClientId, releaseAuthCertSubjectName, releaseRequestSigningCertSubjectName);
    const release = await esrpclient.release(version, filePath);
    const credential = new identity_1.ClientSecretCredential(provisionTenantId, provisionAADUsername, provisionAADPassword);
    const accessToken = await credential.getToken(['https://microsoft.onmicrosoft.com/DS.Provisioning.WebApi/.default']);
    const service = new ProvisionService(accessToken.token);
    const fileName = `_${quality}/${version}/${path.basename(filePath)}`;
    await service.provision(release.releaseId, release.fileId, `_${quality}/${version}/${path.basename(filePath)}`);
    console.log(`Done: https://vscode.download.prss.microsoft.com/dbazure/download/${fileName}`);
}
exports.main = main;
if (require.main === module) {
    main(process.argv.slice(2)).then(() => {
        process.exit(0);
    }, err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVsZWFzZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInJlbGVhc2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsOENBQXlEO0FBQ3pELCtCQUErQjtBQUMvQixvQ0FBb0M7QUFDcEMseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3QixpQ0FBaUM7QUFFakMseUNBQXNDO0FBd0J0QyxNQUFNLGdCQUFnQjtJQUVRO0lBQTdCLFlBQTZCLFdBQW1CO1FBQW5CLGdCQUFXLEdBQVgsV0FBVyxDQUFRO0lBQUksQ0FBQztJQUVyRCxLQUFLLENBQUMsU0FBUyxDQUFDLFNBQWlCLEVBQUUsTUFBYyxFQUFFLFFBQWdCO1FBQ2xFLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUM7WUFDM0IsU0FBUyxFQUFFLFNBQVM7WUFDcEIsVUFBVSxFQUFFLFFBQVE7WUFDcEIsYUFBYSxFQUFFLFFBQVE7WUFDdkIsMEJBQTBCLEVBQUUsQ0FBQztvQkFDNUIsWUFBWSxFQUFFLE1BQU07b0JBQ3BCLHdCQUF3QixFQUFFLElBQUk7b0JBQzlCLGdCQUFnQixFQUFFLFFBQVE7b0JBQzFCLE1BQU0sRUFBRSxNQUFNO29CQUNkLFdBQVcsRUFBRSxDQUFDLEtBQUssQ0FBQztpQkFDcEIsQ0FBQztTQUNGLENBQUMsQ0FBQztRQUVILE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLFFBQVEsZ0JBQWdCLFNBQVMsYUFBYSxNQUFNLE1BQU0sQ0FBQyxDQUFDO1FBQ3hGLE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBaUMsTUFBTSxFQUFFLGlEQUFpRCxFQUFFLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUVwSSxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3BCLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQ2hDLE1BQU0sSUFBSSxLQUFLLENBQUMs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