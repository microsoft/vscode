"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const cp = require("child_process");
const fs = require("fs");
const crypto = require("crypto");
const util_1 = require("../../lib/util");
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
        case 'sign-darwin-notarize':
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
    const tmp = new util_1.Temp();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2lnbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNpZ24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsb0NBQW9DO0FBQ3BDLHlCQUF5QjtBQUd6QixpQ0FBaUM7QUFDakMseUNBQXNDO0FBYXRDLFNBQVMsU0FBUyxDQUFDLElBQVk7SUFDOUIsUUFBUSxJQUFJLEVBQUUsQ0FBQztRQUNkLEtBQUssY0FBYztZQUNsQixPQUFPO2dCQUNOO29CQUNDLE9BQU8sRUFBRSxXQUFXO29CQUNwQixnQkFBZ0IsRUFBRSxjQUFjO29CQUNoQyxVQUFVLEVBQUU7d0JBQ1gsRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxTQUFTLEVBQUU7d0JBQ3hELEVBQUUsYUFBYSxFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUUsZ0NBQWdDLEVBQUU7d0JBQy9FLEVBQUUsYUFBYSxFQUFFLFFBQVEsRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFFO3dCQUNsRCxFQUFFLGFBQWEsRUFBRSxZQUFZLEVBQUUsY0FBYyxFQUFFLGNBQWMsRUFBRTt3QkFDL0QsRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUU7d0JBQ3JELEVBQUUsYUFBYSxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsMEVBQTBFLEVBQUU7cUJBQzFIO29CQUNELFFBQVEsRUFBRSxNQUFNO29CQUNoQixXQUFXLEVBQUUsS0FBSztpQkFDbEI7Z0JBQ0Q7b0JBQ0MsT0FBTyxFQUFFLFdBQVc7b0JBQ3BCLGdCQUFnQixFQUFFLGdCQUFnQjtvQkFDbEMsVUFBVSxFQUFFO3dCQUNYLEVBQUUsYUFBYSxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsTUFBTSxFQUFFO3FCQUN0RDtvQkFDRCxRQUFRLEVBQUUsTUFBTTtvQkFDaEIsV0FBVyxFQUFFLEtBQUs7aUJBQ2xCO2FBQ0QsQ0FBQztRQUNILEtBQUssbUJBQW1CO1lBQ3ZCLE9BQU87Z0JBQ047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