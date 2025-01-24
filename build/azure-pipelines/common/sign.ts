/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import cp from 'child_process';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import os from 'os';

export class Temp {
	private _files: string[] = [];

	tmpNameSync(): string {
		const file = path.join(os.tmpdir(), crypto.randomBytes(20).toString('hex'));
		this._files.push(file);
		return file;
	}

	dispose(): void {
		for (const file of this._files) {
			try {
				fs.unlinkSync(file);
			} catch (err) {
				// noop
			}
		}
	}
}

interface Params {
	readonly keyCode: string;
	readonly operationSetCode: string;
	readonly parameters: {
		readonly parameterName: string;
		readonly parameterValue: string;
	}[];
	readonly toolName: string;
	readonly toolVersion: string;
}

function getParams(type: string): Params[] {
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

export function main([esrpCliPath, type, folderPath, pattern]: string[]) {
	const tmp = new Temp();
	process.on('exit', () => tmp.dispose());

	const key = crypto.randomBytes(32);
	const iv = crypto.randomBytes(16);
	const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
	const encryptedToken = cipher.update(process.env['SYSTEM_ACCESSTOKEN']!.trim(), 'utf8', 'hex') + cipher.final('hex');

	const encryptionDetailsPath = tmp.tmpNameSync();
	fs.writeFileSync(encryptionDetailsPath, JSON.stringify({ key: key.toString('hex'), iv: iv.toString('hex') }));

	const encryptedTokenPath = tmp.tmpNameSync();
	fs.writeFileSync(encryptedTokenPath, encryptedToken);

	const patternPath = tmp.tmpNameSync();
	fs.writeFileSync(patternPath, pattern);

	const paramsPath = tmp.tmpNameSync();
	fs.writeFileSync(paramsPath, JSON.stringify(getParams(type)));

	const dotnetVersion = cp.execSync('dotnet --version', { encoding: 'utf8' }).trim();
	const adoTaskVersion = path.basename(path.dirname(path.dirname(esrpCliPath)));

	const federatedTokenData = {
		jobId: process.env['SYSTEM_JOBID'],
		planId: process.env['SYSTEM_PLANID'],
		projectId: process.env['SYSTEM_TEAMPROJECTID'],
		hub: process.env['SYSTEM_HOSTTYPE'],
		uri: process.env['SYSTEM_COLLECTIONURI'],
		managedIdentityId: process.env['VSCODE_ESRP_CLIENT_ID'],
		managedIdentityTenantId: process.env['VSCODE_ESRP_TENANT_ID'],
		serviceConnectionId: process.env['VSCODE_ESRP_SERVICE_CONNECTION_ID'],
		tempDirectory: os.tmpdir(),
		systemAccessToken: encryptedTokenPath,
		encryptionKey: encryptionDetailsPath
	};

	const args = [
		esrpCliPath,
		'vsts.sign',
		'-a', process.env['ESRP_CLIENT_ID']!,
		'-d', process.env['ESRP_TENANT_ID']!,
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
		'-esrpClientId', process.env['ESRP_CLIENT_ID']!,
		'-useMSIAuthentication', 'true',
		'-federatedTokenData', JSON.stringify(federatedTokenData)
	];

	try {
		cp.execFileSync('dotnet', args, { stdio: 'inherit' });
	} catch (err) {
		console.error('ESRP failed');
		console.error(err);
		process.exit(1);
	}
}

if (require.main === module) {
	main(process.argv.slice(2));
	process.exit(0);
}
