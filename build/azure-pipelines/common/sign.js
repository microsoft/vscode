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
        case 'windows':
            return '[{"keyCode":"CP-230012","operationSetCode":"SigntoolSign","parameters":[{"parameterName":"OpusName","parameterValue":"VS Code"},{"parameterName":"OpusInfo","parameterValue":"https://code.visualstudio.com/"},{"parameterName":"Append","parameterValue":"/as"},{"parameterName":"FileDigest","parameterValue":"/fd \\"SHA256\\""},{"parameterName":"PageHash","parameterValue":"/NPH"},{"parameterName":"TimeStamp","parameterValue":"/tr \\"http://rfc3161.gtm.corp.microsoft.com/TSS/HttpTspServer\\" /td sha256"}],"toolName":"sign","toolVersion":"1.0"},{"keyCode":"CP-230012","operationSetCode":"SigntoolVerify","parameters":[{"parameterName":"VerifyAll","parameterValue":"/all"}],"toolName":"sign","toolVersion":"1.0"}]';
        case 'windows-appx':
            return '[{"keyCode":"CP-229979","operationSetCode":"SigntoolSign","parameters":[{"parameterName":"OpusName","parameterValue":"VS Code"},{"parameterName":"OpusInfo","parameterValue":"https://code.visualstudio.com/"},{"parameterName":"FileDigest","parameterValue":"/fd \\"SHA256\\""},{"parameterName":"PageHash","parameterValue":"/NPH"},{"parameterName":"TimeStamp","parameterValue":"/tr \\"http://rfc3161.gtm.corp.microsoft.com/TSS/HttpTspServer\\" /td sha256"}],"toolName":"sign","toolVersion":"1.0"},{"keyCode":"CP-229979","operationSetCode":"SigntoolVerify","parameters":[],"toolName":"sign","toolVersion":"1.0"}]';
        case 'pgp':
            return '[{ "keyCode": "CP-450779-Pgp", "operationSetCode": "LinuxSign", "parameters": [], "toolName": "sign", "toolVersion": "1.0" }]';
        case 'darwin-sign':
            return '[{"keyCode":"CP-401337-Apple","operationSetCode":"MacAppDeveloperSign","parameters":[{"parameterName":"Hardening","parameterValue":"--options=runtime"}],"toolName":"sign","toolVersion":"1.0"}]';
        case 'darwin-notarize':
            return '[{"keyCode":"CP-401337-Apple","operationSetCode":"MacAppNotarize","parameters":[],"toolName":"sign","toolVersion":"1.0"}]';
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
    fs.writeFileSync(paramsPath, getParams(type));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2lnbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNpZ24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcsb0NBQW9DO0FBQ3BDLHlCQUF5QjtBQUN6Qiw2QkFBNkI7QUFDN0IseUJBQXlCO0FBQ3pCLGlDQUFpQztBQUVqQyxNQUFNLElBQUk7SUFDRCxNQUFNLEdBQWEsRUFBRSxDQUFDO0lBRTlCLFdBQVc7UUFDVixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQzVFLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZCLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVELE9BQU87UUFDTixLQUFLLE1BQU0sSUFBSSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNoQyxJQUFJLENBQUM7Z0JBQ0osRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyQixDQUFDO1lBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztnQkFDZCxPQUFPO1lBQ1IsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0NBQ0Q7QUFFRCxTQUFTLFNBQVMsQ0FBQyxJQUFZO0lBQzlCLFFBQVEsSUFBSSxFQUFFLENBQUM7UUFDZCxLQUFLLFNBQVM7WUFDYixPQUFPLHdzQkFBd3NCLENBQUM7UUFDanRCLEtBQUssY0FBYztZQUNsQixPQUFPLGltQkFBaW1CLENBQUM7UUFDMW1CLEtBQUssS0FBSztZQUNULE9BQU8sK0hBQStILENBQUM7UUFDeEksS0FBSyxhQUFhO1lBQ2pCLE9BQU8sa01BQWtNLENBQUM7UUFDM00sS0FBSyxpQkFBaUI7WUFDckIsT0FBTywySEFBMkgsQ0FBQztRQUNwSTtZQUNDLE1B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