/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ClientSecretCredential } from '@azure/identity';
import * as https from 'https';

export async function main([username, password]: string[]) {
	console.log('running...');

	const credential = new ClientSecretCredential('72f988bf-86f1-41af-91ab-2d7cd011db47', username, password);
	const accessToken = await credential.getToken('https://microsoft.onmicrosoft.com/DS.ProvisioningUAT.WebApi/.default');

	console.log('got access token');

	const body = JSON.stringify({
		ReleaseId: '36df8da5-4670-4b9f-acd3-c53de62ea93d',
		PortalName: 'VSCode',
		PublisherCode: 'VSCode',
		ProvisionedFilesCollection: [{
			PublisherKey: '2fa7b08c-d022-4165-846f-6f5bfaab4479',
			IsStaticFriendlyFileName: true,
			FriendlyFileName: '/_test/stable/e7e037083ff4455cf320e344325dacb480062c3c/vscode_cli_linux_x64_cli.tar.gz',
			MaxTTL: '31536000',
			CdnMappings: ['ECN']
		}]
	});

	console.log('body', body);

	await new Promise<void>((c, e) => {
		const req = https.request(`https://dsprovisionapi.microsoft.com/api/v2/ProvisionedFiles/CreateProvisionedFiles`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${accessToken.token}`,
				'Content-Type': 'application/json',
				'Content-Length': body.length
			}
		}, res => {
			console.log('STATUS', res.statusCode);

			if (res.statusCode !== 200) {
				return e(new Error(`Unexpected status code: ${res.statusCode}`));
			}

			const chunks: Buffer[] = [];
			res.on('data', chunk => {
				console.log('data', chunk);
				chunks.push(chunk);
			});
			res.on('end', () => {
				console.log('end', chunks);
				const body = Buffer.concat(chunks).toString();

				try {
					const json = JSON.parse(body);
					console.log(json);
					c();
				} catch (err) {
					e(err);
				}
			});
		});

		req.on('error', e);
		req.write(body);
		req.end();
	});
}

if (require.main === module) {
	main(process.argv.slice(2));
	process.exit(0);
}
