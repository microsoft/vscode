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
import * as vscode from 'vscode';
import { Straightforward, Middleware, RequestContext, ConnectContext, isRequest, isConnect } from 'straightforward';
import assert from 'assert';

declare module 'https' {
	interface Agent {
		testCertificates?: string[];
	}
}

(vscode.env.uiKind === vscode.UIKind.Web ? suite.skip : suite)('vscode API - network proxy support', () => {

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
		https.globalAgent.testCertificates = [certPEM];
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
			delete https.globalAgent.testCertificates;
			resetCaches();
			server.close();
		}
	});

	test('basic auth', async () => {
		const url = 'https://example.com'; // Need to use non-local URL because local URLs are excepted from proxying.
		const user = 'testuser';
		const pass = 'testpassword';

		const sf = new Straightforward();
		let authEnabled = false;
		const authOpts: AuthOpts = { user, pass };
		const auth = middlewareAuth(authOpts);
		sf.onConnect.use(async (context, next) => {
			if (authEnabled) {
				return auth(context, next);
			}
			next();
		});
		sf.onConnect.use(({ clientSocket }) => {
			// Shortcircuit the request.
			if (authEnabled) {
				clientSocket.end('HTTP/1.1 204\r\n\r\n');
			} else {
				clientSocket.end('HTTP/1.1 418\r\n\r\n');
			}
		});
		const proxyListen = sf.listen(0);

		try {
			await proxyListen;
			const proxyPort = (sf.server.address() as AddressInfo).port;

			const change = waitForConfigChange('http.proxy');
			await vscode.workspace.getConfiguration().update('http.proxy', `http://127.0.0.1:${proxyPort}`, vscode.ConfigurationTarget.Global);
			await change;
			await new Promise<void>((resolve, reject) => {
				https.get(url, res => {
					if (res.statusCode === 418) {
						resolve();
					} else {
						reject(new Error(`Unexpected status code (expected 418): ${res.statusCode}`));
					}
				})
					.on('error', reject);
			});

			authEnabled = true;
			await new Promise<void>((resolve, reject) => {
				https.get(url, res => {
					if (res.statusCode === 407) {
						resolve();
					} else {
						reject(new Error(`Unexpected status code (expected 407): ${res.statusCode}`));
					}
				})
					.on('error', reject);
			});

			authOpts.realm = Buffer.from(JSON.stringify({ username: user, password: pass })).toString('base64');
			await new Promise<void>((resolve, reject) => {
				https.get(url, res => {
					if (res.statusCode === 204) {
						resolve();
					} else {
						reject(new Error(`Unexpected status code (expected 204): ${res.statusCode}`));
					}
				})
					.on('error', reject);
			});
		} finally {
			sf.close();
			const change = waitForConfigChange('http.proxy');
			await vscode.workspace.getConfiguration().update('http.proxy', undefined, vscode.ConfigurationTarget.Global);
			await change;
			await vscode.workspace.getConfiguration().update('integration-test.http.proxyAuth', undefined, vscode.ConfigurationTarget.Global);
		}
	});

	(vscode.env.remoteName ? test : test.skip)('separate local / remote proxy settings', async () => {
		// Assumes test resolver runs with `--use-host-proxy`.
		const localProxy = 'http://localhost:1234';
		const remoteProxy = 'http://localhost:4321';

		const actualLocalProxy1 = vscode.workspace.getConfiguration().get('http.proxy');

		const p1 = waitForConfigChange('http.proxy');
		await vscode.workspace.getConfiguration().update('http.proxy', localProxy, vscode.ConfigurationTarget.Global);
		await p1;
		const actualLocalProxy2 = vscode.workspace.getConfiguration().get('http.proxy');

		const p2 = waitForConfigChange('http.useLocalProxyConfiguration');
		await vscode.workspace.getConfiguration().update('http.useLocalProxyConfiguration', false, vscode.ConfigurationTarget.Global);
		await p2;
		const actualRemoteProxy1 = vscode.workspace.getConfiguration().get('http.proxy');

		const p3 = waitForConfigChange('http.proxy');
		await vscode.workspace.getConfiguration().update('http.proxy', remoteProxy, vscode.ConfigurationTarget.Global);
		await p3;
		const actualRemoteProxy2 = vscode.workspace.getConfiguration().get('http.proxy');

		const p4 = waitForConfigChange('http.proxy');
		await vscode.workspace.getConfiguration().update('http.proxy', undefined, vscode.ConfigurationTarget.Global);
		await p4;
		const actualRemoteProxy3 = vscode.workspace.getConfiguration().get('http.proxy');

		const p5 = waitForConfigChange('http.proxy');
		await vscode.workspace.getConfiguration().update('http.useLocalProxyConfiguration', true, vscode.ConfigurationTarget.Global);
		await p5;
		const actualLocalProxy3 = vscode.workspace.getConfiguration().get('http.proxy');

		const p6 = waitForConfigChange('http.proxy');
		await vscode.workspace.getConfiguration().update('http.proxy', undefined, vscode.ConfigurationTarget.Global);
		await p6;
		const actualLocalProxy4 = vscode.workspace.getConfiguration().get('http.proxy');

		assert.strictEqual(actualLocalProxy1, '');
		assert.strictEqual(actualLocalProxy2, localProxy);
		assert.strictEqual(actualRemoteProxy1, '');
		assert.strictEqual(actualRemoteProxy2, remoteProxy);
		assert.strictEqual(actualRemoteProxy3, '');
		assert.strictEqual(actualLocalProxy3, localProxy);
		assert.strictEqual(actualLocalProxy4, '');
	});

	function waitForConfigChange(key: string) {
		return new Promise<void>(resolve => {
			const s = vscode.workspace.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(key)) {
					s.dispose();
					resolve();
				}
			});
		});
	}
});

// Added 'realm'. From MIT licensed https://github.com/berstend/straightforward/blob/84a4cb88024cffce37a05870da7d9d0aba7dcca8/src/middleware/auth.ts

export interface AuthOpts {
	realm?: string;
	user?: string;
	pass?: string;
	dynamic?: boolean;
}

export interface RequestAdditionsAuth {
	locals: { proxyUser: string; proxyPass: string };
}

/**
 * Authenticate an incoming proxy request
 * Supports static `user` and `pass` or `dynamic`,
 * in which case `ctx.req.locals` will be populated with `proxyUser` and `proxyPass`
 * This middleware supports both onRequest and onConnect
 */
export const middlewareAuth =
	(opts: AuthOpts): Middleware<
		RequestContext<RequestAdditionsAuth> | ConnectContext<RequestAdditionsAuth>
	> =>
		async (ctx, next) => {
			const { realm, user, pass, dynamic } = opts;
			const sendAuthRequired = () => {
				const realmStr = realm ? ` realm="${realm}"` : '';
				if (isRequest(ctx)) {
					ctx.res.writeHead(407, { 'Proxy-Authenticate': `Basic${realmStr}` });
					ctx.res.end();
				} else if (isConnect(ctx)) {
					ctx.clientSocket.end(
						'HTTP/1.1 407\r\n' + `Proxy-Authenticate: basic${realmStr}\r\n` + '\r\n'
					);
				}
			};
			const proxyAuth = ctx.req.headers['proxy-authorization'];
			if (!proxyAuth) {
				return sendAuthRequired();
			}
			const [proxyUser, proxyPass] = Buffer.from(
				proxyAuth.replace('Basic ', ''),
				'base64'
			)
				.toString()
				.split(':');

			if (!dynamic && !!(!!user && !!pass)) {
				if (user !== proxyUser || pass !== proxyPass) {
					return sendAuthRequired();
				}
			}
			ctx.req.locals.proxyUser = proxyUser;
			ctx.req.locals.proxyPass = proxyPass;

			return next();
		};
