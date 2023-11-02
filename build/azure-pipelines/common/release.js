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
const os = require("os");
const path = require("path");
const crypto = require("crypto");
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
        const res = await this.request('POST', '/api/v2/ProvisionedFiles/CreateProvisionedFiles', { body });
        if (!res.IsSuccess) {
            console.error(res.ErrorDetails);
            throw new Error(res.ErrorDetails.Message);
        }
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
        const submitReleaseResult = await this.SubmitRelease(version, filePath);
        if (submitReleaseResult.submissionResponse.statusCode !== 'pass') {
            throw new Error(`Unexpected status code: ${submitReleaseResult.submissionResponse.statusCode}`);
        }
        const releaseId = submitReleaseResult.submissionResponse.operationId;
        for (let i = 0; i < 10; i++) {
            const details = await this.ReleaseDetails(releaseId);
            console.log(JSON.stringify(details, undefined, 2));
            await new Promise(c => setTimeout(c, 5000));
        }
        return { releaseId, fileId: 'xxx' };
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
    const tmp = new Temp();
    process.on('exit', () => tmp.dispose());
    console.log('Creating release...');
    const esrpclient = new ESRPClient(tmp, releaseTenantId, releaseClientId, releaseAuthCertSubjectName, releaseRequestSigningCertSubjectName);
    const release = await esrpclient.release(version, filePath);
    console.log('Provisioning file...');
    const credential = new identity_1.ClientSecretCredential(provisionTenantId, provisionAADUsername, provisionAADPassword);
    const accessToken = await credential.getToken(['https://microsoft.onmicrosoft.com/DS.Provisioning.WebApi/.default']);
    const service = new ProvisionService(accessToken.token);
    await service.provision(release.releaseId, release.fileId, `_${quality}/${version}/${path.basename(filePath)}`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVsZWFzZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInJlbGVhc2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsOENBQXlEO0FBQ3pELCtCQUErQjtBQUMvQixvQ0FBb0M7QUFDcEMseUJBQXlCO0FBQ3pCLHlCQUF5QjtBQUN6Qiw2QkFBNkI7QUFDN0IsaUNBQWlDO0FBR2pDLE1BQU0sSUFBSTtJQUNELE1BQU0sR0FBYSxFQUFFLENBQUM7SUFFOUIsV0FBVztRQUNWLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxFQUFFLE1BQU0sQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDNUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdkIsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsT0FBTztRQUNOLEtBQUssTUFBTSxJQUFJLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2hDLElBQUksQ0FBQztnQkFDSixFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JCLENBQUM7WUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO2dCQUNkLE9BQU87WUFDUixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7Q0FDRDtBQXdCRCxNQUFNLGdCQUFnQjtJQUVRO0lBQTdCLFlBQTZCLFdBQW1CO1FBQW5CLGdCQUFXLEdBQVgsV0FBVyxDQUFRO0lBQUksQ0FBQztJQUVyRCxLQUFLLENBQUMsU0FBUyxDQUFDLFNBQWlCLEVBQUUsTUFBYyxFQUFFLFFBQWdCO1FBQ2xFLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUM7WUFDM0IsU0FBUyxFQUFFLFNBQVM7WUFDcEIsVUFBVSxFQUFFLFFBQVE7WUFDcEIsYUFBYSxFQUFFLFFB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