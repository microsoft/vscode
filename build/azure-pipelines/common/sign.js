"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = exports.Temp = void 0;
const cp = require("child_process");
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
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
        default:
            throw new Error(`Sign type ${type} not found`);
    }
}
function main([esrpCliPath, type, cert, username, password, folderPath, pattern]) {
    const tmp = new Temp();
    process.on('exit', () => tmp.dispose());
    const patternPath = tmp.tmpNameSync();
    fs.writeFileSync(patternPath, pattern);
    const paramsPath = tmp.tmpNameSync();
    fs.writeFileSync(paramsPath, JSON.stringify(getParams(type)));
    const keyFile = tmp.tmpNameSync();
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    fs.writeFileSync(keyFile, JSON.stringify({ key: key.toString('hex'), iv: iv.toString('hex') }));
    const clientkeyPath = tmp.tmpNameSync();
    const clientkeyCypher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let clientkey = clientkeyCypher.update(password, 'utf8', 'hex');
    clientkey += clientkeyCypher.final('hex');
    fs.writeFileSync(clientkeyPath, clientkey);
    const clientcertPath = tmp.tmpNameSync();
    const clientcertCypher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let clientcert = clientcertCypher.update(cert, 'utf8', 'hex');
    clientcert += clientcertCypher.final('hex');
    fs.writeFileSync(clientcertPath, clientcert);
    const args = [
        esrpCliPath,
        'vsts.sign',
        '-a', username,
        '-k', clientkeyPath,
        '-z', clientcertPath,
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
        '-e', keyFile,
    ];
    try {
        cp.execFileSync('dotnet', args, { stdio: 'inherit' });
    }
    catch (err) {
        console.error('ESRP failed');
        console.error(err);
        process.exit(1);
    }
}
exports.main = main;
if (require.main === module) {
    main(process.argv.slice(2));
    process.exit(0);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2lnbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNpZ24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsb0NBQW9DO0FBQ3BDLHlCQUF5QjtBQUN6QixpQ0FBaUM7QUFDakMsNkJBQTZCO0FBQzdCLHlCQUF5QjtBQUV6QixNQUFhLElBQUk7SUFDUixNQUFNLEdBQWEsRUFBRSxDQUFDO0lBRTlCLFdBQVc7UUFDVixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQzVFLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZCLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVELE9BQU87UUFDTixLQUFLLE1BQU0sSUFBSSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNoQyxJQUFJLENBQUM7Z0JBQ0osRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyQixDQUFDO1lBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztnQkFDZCxPQUFPO1lBQ1IsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0NBQ0Q7QUFsQkQsb0JBa0JDO0FBYUQsU0FBUyxTQUFTLENBQUMsSUFBWTtJQUM5QixRQUFRLElBQUksRUFBRSxDQUFDO1FBQ2QsS0FBSyxjQUFjO1lBQ2xCLE9BQU87Z0JBQ047b0JBQ0MsT0FBTyxFQUFFLFdBQVc7b0JBQ3BCLGdCQUFnQixFQUFFLGNBQWM7b0JBQ2hDLFVBQVUsRUFBRTt3QkFDWCxFQUFFLGFBQWEsRUFBRSxVQUFVLEVBQUUsY0FBYyxFQUFFLFNBQVMsRUFBRTt3QkFDeEQsRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxnQ0FBZ0MsRUFBRTt3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