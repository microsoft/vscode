/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as https from 'https';
import 'mocha';
import { assertNoRpc } from '../utils';
import { pki } from 'node-forge';
import { AddressInfo } from 'net';
import { resetCaches } from '@vscode/proxy-agent';

suite('vscode API - network proxy support', () => {

	teardown(async function () {
		assertNoRpc();
	});

	test('custom root certificate', async () => {
		const keys = pki.rsa.generateKeyPair(2048);
		const cert = pki.createCertificate();
		cert.publicKey = keys.publicKey;
		cert.serialNumber = '01';
		cert.validity.notBefore = new Date();
		cert.validity.notAfter = new Date();
		cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
		const attrs = [{
			name: 'commonName',
			value: 'localhost-proxy-test'
		}];
		cert.setSubject(attrs);
		cert.setIssuer(attrs);
		cert.sign(keys.privateKey);
		const certPEM = pki.certificateToPem(cert);
		const privateKeyPEM = pki.privateKeyToPem(keys.privateKey);

		let resolvePort: (port: number) => void;
		let rejectPort: (err: any) => void;
		const port = new Promise<number>((resolve, reject) => {
			resolvePort = resolve;
			rejectPort = reject;
		});
		const server = https.createServer({
			key: privateKeyPEM,
			cert: certPEM,
		}, (_req, res) => {
			res.end();
		}).listen(0, '127.0.0.1', () => {
			const address = server.address();
			resolvePort((address as AddressInfo).port);
		}).on('error', err => {
			rejectPort(err);
		});

		// Using https.globalAgent because it is shared with proxyResolver.ts and mutable.
		(https.globalAgent as any).testCertificates = [certPEM];
		resetCaches();

		try {
			const portNumber = await port;
			await new Promise<void>((resolve, reject) => {
				https.get(`https://127.0.0.1:${portNumber}`, { servername: 'localhost-proxy-test' }, res => {
					if (res.statusCode === 200) {
						resolve();
					} else {
						reject(new Error(`Unexpected status code: ${res.statusCode}`));
					}
				})
					.on('error', reject);
			});
		} finally {
			delete (https.globalAgent as any).testCertificates;
			resetCaches();
			server.close();
		}
	});
});
