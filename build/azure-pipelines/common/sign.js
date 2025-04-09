"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Temp = void 0;
exports.main = main;
const child_process_1 = __importDefault(require("child_process"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
class Temp {
    _files = [];
    tmpNameSync() {
        const file = path_1.default.join(os_1.default.tmpdir(), crypto_1.default.randomBytes(20).toString('hex'));
        this._files.push(file);
        return file;
    }
    dispose() {
        for (const file of this._files) {
            try {
                fs_1.default.unlinkSync(file);
            }
            catch (err) {
                // noop
            }
        }
    }
}
exports.Temp = Temp;
function getParams(type) {
    switch (type) {
        case 'sign-windows':
            return [
                {
                    keyCode: 'CP-230012',
                    operationSetCode: 'SigntoolSign',
                    parameters: [
                        { parameterName: 'OpusName', parameterValue: 'VS Code' },
                        { parameterName: 'OpusInfo', parameterValue: 'https://code.visualstudio.com/' },
                        { parameterName: 'Append', parameterValue: '/as' },
                        { parameterName: 'FileDigest', parameterValue: '/fd "SHA256"' },
                        { parameterName: 'PageHash', parameterValue: '/NPH' },
                        { parameterName: 'TimeStamp', parameterValue: '/tr "http://rfc3161.gtm.corp.microsoft.com/TSS/HttpTspServer" /td sha256' }
                    ],
                    toolName: 'sign',
                    toolVersion: '1.0'
                },
                {
                    keyCode: 'CP-230012',
                    operationSetCode: 'SigntoolVerify',
                    parameters: [
                        { parameterName: 'VerifyAll', parameterValue: '/all' }
                    ],
                    toolName: 'sign',
                    toolVersion: '1.0'
                }
            ];
        case 'sign-windows-appx':
            return [
                {
                    keyCode: 'CP-229979',
                    operationSetCode: 'SigntoolSign',
                    parameters: [
                        { parameterName: 'OpusName', parameterValue: 'VS Code' },
                        { parameterName: 'OpusInfo', parameterValue: 'https://code.visualstudio.com/' },
                        { parameterName: 'FileDigest', parameterValue: '/fd "SHA256"' },
                        { parameterName: 'PageHash', parameterValue: '/NPH' },
                        { parameterName: 'TimeStamp', parameterValue: '/tr "http://rfc3161.gtm.corp.microsoft.com/TSS/HttpTspServer" /td sha256' }
                    ],
                    toolName: 'sign',
                    toolVersion: '1.0'
                },
                {
                    keyCode: 'CP-229979',
                    operationSetCode: 'SigntoolVerify',
                    parameters: [],
                    toolName: 'sign',
                    toolVersion: '1.0'
                }
            ];
        case 'sign-pgp':
            return [{
                    keyCode: 'CP-450779-Pgp',
                    operationSetCode: 'LinuxSign',
                    parameters: [],
                    toolName: 'sign',
                    toolVersion: '1.0'
                }];
        case 'sign-darwin':
            return [{
                    keyCode: 'CP-401337-Apple',
                    operationSetCode: 'MacAppDeveloperSign',
                    parameters: [{ parameterName: 'Hardening', parameterValue: '--options=runtime' }],
                    toolName: 'sign',
                    toolVersion: '1.0'
                }];
        case 'notarize-darwin':
            return [{
                    keyCode: 'CP-401337-Apple',
                    operationSetCode: 'MacAppNotarize',
                    parameters: [],
                    toolName: 'sign',
                    toolVersion: '1.0'
                }];
        case 'nuget':
            return [{
                    keyCode: 'CP-401405',
                    operationSetCode: 'NuGetSign',
                    parameters: [],
                    toolName: 'sign',
                    toolVersion: '1.0'
                }, {
                    keyCode: 'CP-401405',
                    operationSetCode: 'NuGetVerify',
                    parameters: [],
                    toolName: 'sign',
                    toolVersion: '1.0'
                }];
        default:
            throw new Error(`Sign type ${type} not found`);
    }
}
function main([esrpCliPath, type, folderPath, pattern]) {
    const tmp = new Temp();
    process.on('exit', () => tmp.dispose());
    const key = crypto_1.default.randomBytes(32);
    const iv = crypto_1.default.randomBytes(16);
    const cipher = crypto_1.default.createCipheriv('aes-256-cbc', key, iv);
    const encryptedToken = cipher.update(process.env['SYSTEM_ACCESSTOKEN'].trim(), 'utf8', 'hex') + cipher.final('hex');
    const encryptionDetailsPath = tmp.tmpNameSync();
    fs_1.default.writeFileSync(encryptionDetailsPath, JSON.stringify({ key: key.toString('hex'), iv: iv.toString('hex') }));
    const encryptedTokenPath = tmp.tmpNameSync();
    fs_1.default.writeFileSync(encryptedTokenPath, encryptedToken);
    const patternPath = tmp.tmpNameSync();
    fs_1.default.writeFileSync(patternPath, pattern);
    const paramsPath = tmp.tmpNameSync();
    fs_1.default.writeFileSync(paramsPath, JSON.stringify(getParams(type)));
    const dotnetVersion = child_process_1.default.execSync('dotnet --version', { encoding: 'utf8' }).trim();
    const adoTaskVersion = path_1.default.basename(path_1.default.dirname(path_1.default.dirname(esrpCliPath)));
    const federatedTokenData = {
        jobId: process.env['SYSTEM_JOBID'],
        planId: process.env['SYSTEM_PLANID'],
        projectId: process.env['SYSTEM_TEAMPROJECTID'],
        hub: process.env['SYSTEM_HOSTTYPE'],
        uri: process.env['SYSTEM_COLLECTIONURI'],
        managedIdentityId: process.env['VSCODE_ESRP_CLIENT_ID'],
        managedIdentityTenantId: process.env['VSCODE_ESRP_TENANT_ID'],
        serviceConnectionId: process.env['VSCODE_ESRP_SERVICE_CONNECTION_ID'],
        tempDirectory: os_1.default.tmpdir(),
        systemAccessToken: encryptedTokenPath,
        encryptionKey: encryptionDetailsPath
    };
    const args = [
        esrpCliPath,
        'vsts.sign',
        '-a', process.env['ESRP_CLIENT_ID'],
        '-d', process.env['ESRP_TENANT_ID'],
        '-k', JSON.stringify({ akv: 'vscode-esrp' }),
        '-z', JSON.stringify({ akv: 'vscode-esrp', cert: 'esrp-sign' }),
        '-f', folderPath,
        '-p', patternPath,
        '-u', 'false',
        '-x', 'regularSigning',
        '-b', 'input.json',
        '-l', 'AzSecPack_PublisherPolicyProd.xml',
        '-y', 'inlineSignParams',
        '-j', paramsPath,
        '-c', '9997',
        '-t', '120',
        '-g', '10',
        '-v', 'Tls12',
        '-s', 'https://api.esrp.microsoft.com/api/v1',
        '-m', '0',
        '-o', 'Microsoft',
        '-i', 'https://www.microsoft.com',
        '-n', '5',
        '-r', 'true',
        '-w', dotnetVersion,
        '-skipAdoReportAttachment', 'false',
        '-pendingAnalysisWaitTimeoutMinutes', '5',
        '-adoTaskVersion', adoTaskVersion,
        '-resourceUri', 'https://msazurecloud.onmicrosoft.com/api.esrp.microsoft.com',
        '-esrpClientId', process.env['ESRP_CLIENT_ID'],
        '-useMSIAuthentication', 'true',
        '-federatedTokenData', JSON.stringify(federatedTokenData)
    ];
    try {
        child_process_1.default.execFileSync('dotnet', args, { stdio: 'inherit' });
    }
    catch (err) {
        console.error('ESRP failed');
        console.error(err);
        process.exit(1);
    }
}
if (require.main === module) {
    main(process.argv.slice(2));
    process.exit(0);
}
//# sourceMappingURL=sign.js.map