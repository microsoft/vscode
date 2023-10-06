"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const cp = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXNycC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImVzcnAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsb0NBQW9DO0FBQ3BDLHlCQUF5QjtBQUN6Qiw2QkFBNkI7QUFDN0IseUJBQXlCO0FBQ3pCLGlDQUFpQztBQUVqQyxNQUFNLElBQUk7SUFDRCxNQUFNLEdBQWEsRUFBRSxDQUFDO0lBRTlCLFdBQVc7UUFDVixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQzVFLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZCLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVELE9BQU87UUFDTixLQUFLLE1BQU0sSUFBSSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNoQyxJQUFJLENBQUM7Z0JBQ0osRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyQixDQUFDO1lBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztnQkFDZCxPQUFPO1lBQ1IsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0NBQ0Q7QUFhRCxTQUFTLFNBQVMsQ0FBQyxJQUFZO0lBQzlCLFFBQVEsSUFBSSxFQUFFLENBQUM7UUFDZCxLQUFLLGNBQWM7WUFDbEIsT0FBTztnQkFDTjtvQkFDQyxPQUFPLEVBQUUsV0FBVztvQkFDcEIsZ0JBQWdCLEVBQUUsY0FBYztvQkFDaEMsVUFBVSxFQUFFO3dCQUNYLEVBQUUsYUFBYSxFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUUsU0FBUyxFQUFFO3dCQUN4RCxFQUFFLGFBQWEsRUFBRSxVQUFVLEVBQUUsY0FBYyxFQUFFLGdDQUFnQyxFQUFFO3dCQUMvRSxFQUFFLGFB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QyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0lBRXhDLE1BQU0sV0FBVyxHQUFHLEdBQUcsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUN0QyxFQUFFLENBQUMsYUFBYSxDQUFDLFdBQVcsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUV2QyxNQUFNLFVBQVUsR0FBRyxHQUFHLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDckMsRUFBRSxDQUFDLGFBQWEsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRTlELE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUNsQyxNQUFNLEdBQUcsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ25DLE1BQU0sRUFBRSxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDbEMsRUFBRSxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBRWhHLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUN4QyxNQUFNLGVBQWUsR0FBRyxNQUFNLENBQUMsY0FBYyxDQUFDLGFBQWEsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDdEUsSUFBSSxTQUFTLEdBQUcsZUFBZSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ2hFLFNBQVMsSUFBSSxlQUFlLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzFDLEVBQUUsQ0FBQyxhQUFhLENBQUMsYUFBYSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBRTNDLE1BQU0sY0FBYyxHQUFHLEdBQUcsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUN6QyxNQUFNLGdCQUFnQixHQUFHLE1BQU0sQ0FBQyxjQUFjLENBQUMsYUFBYSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUN2RSxJQUFJLFVBQVUsR0FBRyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztJQUM5RCxVQUFVLElBQUksZ0JBQWdCLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzVDLEVBQUUsQ0FBQyxhQUFhLENBQUMsY0FBYyxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBRTdDLE1BQU0sSUFBSSxHQUFHO1FBQ1osV0FBVztRQUNYLFdBQVc7UUFDWCxJQUFJLEVBQUUsUUFBUTtRQUNkLElBQUksRUFBRSxhQUFhO1FBQ25CLElBQUksRUFBRSxjQUFjO1FBQ3BCLElBQUksRUFBRSxVQUFVO1FBQ2hCLElBQUksRUFBRSxXQUFXO1FBQ2pCLElBQUksRUFBRSxPQUFPO1FBQ2IsSUFBSSxFQUFFLGdCQUFnQjtRQUN0QixJQUFJLEVBQUUsWUFBWTtRQUNsQixJQUFJLEVBQUUsbUNBQW1DO1FBQ3pDLElBQUksRUFBRSxrQkFBa0I7UUFDeEIsSUFBSSxFQUFFLFVBQVU7UUFDaEIsSUFBSSxFQUFFLE1BQU07UUFDWixJQUFJLEVBQUUsS0FBSztRQUNYLElBQUksRUFBRSxJQUFJO1FBQ1YsSUFBSSxFQUFFLE9BQU87UUFDYixJQUFJLEVBQUUsdUNBQXVDO1FBQzdDLElBQUksRUFBRSxHQUFHO1FBQ1QsSUFBSSxFQUFFLFdBQVc7UUFDakIsSUFBSSxFQUFFLDJCQUEyQjtRQUNqQyxJQUFJLEVBQUUsR0FBRztRQUNULElBQUksRUFBRSxNQUFNO1FBQ1osSUFBSSxFQUFFLE9BQU87S0FDYixDQUFDO0lBRUYsSUFBSSxDQUFDO1FBQ0osRUFBRSxDQUFDLFlBQVksQ0FBQyxRQUFRLEVBQUUsSUFBSSxFQUFFLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7SUFDdkQsQ0FBQztJQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDZCxPQUFPLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQzdCLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbkIsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNqQixDQUFDO0FBQ0YsQ0FBQztBQTdERCxvQkE2REM7QUFFRCxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssTUFBTSxFQUFFLENBQUM7SUFDN0IsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDNUIsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNqQixDQUFDIn0=