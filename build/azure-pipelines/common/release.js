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
    tenantId;
    clientId;
    authCertSubjectName;
    requestSigningCertSubjectName;
    constructor(tmp, tenantId, clientId, authCertSubjectName, requestSigningCertSubjectName) {
        this.tmp = tmp;
        this.tenantId = tenantId;
        this.clientId = clientId;
        this.authCertSubjectName = authCertSubjectName;
        this.requestSigningCertSubjectName = requestSigningCertSubjectName;
    }
    async release(version, filePath) {
        const authPath = this.tmp.tmpNameSync();
        fs.writeFileSync(authPath, JSON.stringify({
            Version: '1.0.0',
            AuthenticationType: 'AAD_CERT',
            TenantId: this.tenantId,
            ClientId: this.clientId,
            AuthCert: {
                SubjectName: this.authCertSubjectName,
                StoreLocation: 'LocalMachine',
                StoreName: 'My',
                SendX5c: 'true'
            },
            RequestSigningCert: {
                SubjectName: this.requestSigningCertSubjectName,
                StoreLocation: 'LocalMachine',
                StoreName: 'My'
            }
        }));
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
        cp.execSync(`ESRPClient SubmitRelease -l Verbose -a ${authPath} -p ${policyPath} -i ${inputPath} -o ${outputPath}`, {
            stdio: 'inherit'
        });
        const output = fs.readFileSync(outputPath, 'utf8');
        console.log('*************************');
        console.log(output);
        console.log('*************************');
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