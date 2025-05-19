/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as http from 'http';
import { URL } from 'url';
import { randomBytes } from 'crypto';
import { doDynamicRegistration, DynamicAuthProvider, ExtHostAuthentication } from '../common/extHostAuthentication.js';
import { IAuthorizationServerMetadata } from '../../../base/common/oauth.js';
import { URI } from '../../../base/common/uri.js';
import { MainThreadAuthenticationShape } from '../common/extHost.protocol.js';
import { IExtHostWindow } from '../common/extHostWindow.js';
import type { AuthenticationSession } from 'vscode';
import { IExtHostInitDataService } from '../common/extHostInitDataService.js';

export class NodeExtHostAuthentication extends ExtHostAuthentication {
	override async $registerDynamicAuthProvider(serverMetadata: IAuthorizationServerMetadata): Promise<void> {
		const provider = await NodeDynamicAuthProvider.create(
			this._proxy,
			serverMetadata,
			this._initData,
			this._extHostWindow
		);
		// leaked disposables
		this._authenticationProviders.set(serverMetadata.issuer, { label: serverMetadata.issuer, provider, options: { supportsMultipleAccounts: false } });
		provider.onDidChangeSessions(e => this._proxy.$sendDidChangeSessions(serverMetadata.issuer, e));
		await this._proxy.$registerAuthenticationProvider(serverMetadata.issuer, serverMetadata.issuer, false, [URI.parse(serverMetadata.issuer)]);
	}
}

class NodeDynamicAuthProvider extends DynamicAuthProvider {
	constructor(
		proxy: MainThreadAuthenticationShape,
		serverMetadata: IAuthorizationServerMetadata,
		clientId: string,
		appUriScheme: string,
		extHostWindow: IExtHostWindow,
		private readonly loopbackServer: LoopbackAuthServer
	) {
		super(
			proxy,
			serverMetadata,
			clientId,
			appUriScheme,
			extHostWindow,
			[]
			// [scopes => this._createWithLoopbackServer(scopes)]
		);
	}

	static override async create(
		proxy: MainThreadAuthenticationShape,
		serverMetadata: IAuthorizationServerMetadata,
		initData: IExtHostInitDataService,
		extHostWindow: IExtHostWindow,
	): Promise<DynamicAuthProvider> {
		if (!serverMetadata.registration_endpoint) {
			throw new Error('Server does not support dynamic registration');
		}
		try {
			const loopbackServer = new LoopbackAuthServer();
			await loopbackServer.start();

			const registration = await doDynamicRegistration(serverMetadata.registration_endpoint, initData, loopbackServer.port!);
			const provider = new this(
				proxy,
				serverMetadata,
				registration.client_id,
				initData.environment.appUriScheme,
				extHostWindow,
				loopbackServer
			);

			await provider.initializeSessions();
			return provider;
		} catch (err) {
			throw new Error(`Dynamic registration failed: ${err.message}`);
		}
	}

	private async _createWithLoopbackServer(scopes: string[]): Promise<AuthenticationSession> {
		// Generate PKCE code verifier (random string) and code challenge (SHA-256 hash of verifier)
		const codeVerifier = this.generateRandomString(64);
		const codeChallenge = await this.generateCodeChallenge(codeVerifier);

		// Generate a random state value to prevent CSRF
		// const nonce = this.generateRandomString(32);
		// const issuer = URI.parse(this._serverMetadata.issuer);
		// TODO fix

		// const loopbackServer = new LoopbackAuthServer();

		// const state = URI.parse(`${this._appUriScheme}://mcp/${issuer.authority}/authorize?nonce=${nonce}`);
		// const state = await this._extHostWindow.asExternalUri(callbackUri, {});

		// await loopbackServer.start();
		// Prepare the authorization request URL
		const authorizationUrl = new URL(this._serverMetadata.authorization_endpoint!);
		authorizationUrl.searchParams.append('client_id', this._clientId);
		authorizationUrl.searchParams.append('response_type', 'code');
		authorizationUrl.searchParams.append('scope', scopes.join(' '));
		authorizationUrl.searchParams.append('state', this.loopbackServer.nonce);
		authorizationUrl.searchParams.append('code_challenge', codeChallenge);
		authorizationUrl.searchParams.append('code_challenge_method', 'S256');

		// Use a redirect URI that matches what was registered during dynamic registration
		const redirectUri = this.loopbackServer.state!;
		authorizationUrl.searchParams.append('redirect_uri', redirectUri);
		const promise = this.loopbackServer.waitForOAuthResponse();

		// Open the browser for user authorization
		await this._extHostWindow.openUri(authorizationUrl.toString(), {});

		// Wait for the authorization code via a redirect
		const { code } = await promise;

		if (!code) {
			throw new Error('Authentication failed: No authorization code received');
		}

		// Exchange the authorization code for tokens
		const tokenResponse = await this.exchangeCodeForToken(code, codeVerifier, redirectUri);

		// Create a session from the token response
		const session: AuthenticationSession = {
			id: this.generateRandomString(32), // Generate a unique session ID
			accessToken: tokenResponse.access_token,
			account: {
				id: 'unknown',
				label: 'User Account' // Better label could be fetched from userinfo endpoint if available
			},
			scopes: scopes,
		};
		return session;
	}
}

//#region Loopback Auth Server

/**
 * Result of OAuth callback
 */
interface IOAuthResult {
	code: string;
	state: string;
}

/**
 * Interface for loopback server
 */
interface ILoopbackServer {
	/**
	 * The port the server is listening on. Undefined if not started.
	 */
	port: number | undefined;

	/**
	 * The nonce used for verification
	 */
	nonce: string;

	/**
	 * The state parameter used in the OAuth flow
	 */
	state: string | undefined;

	/**
	 * Starts the server
	 * @returns Promise that resolves with the port number
	 */
	start(): Promise<number>;

	/**
	 * Stops the server
	 * @returns Promise that resolves when server is stopped
	 */
	stop(): Promise<void>;

	/**
	 * Waits for OAuth response from the callback
	 * @returns Promise that resolves with OAuth result
	 */
	waitForOAuthResponse(): Promise<IOAuthResult>;
}

/**
 * Implementation of a loopback server for OAuth flow
 */
export class LoopbackAuthServer implements ILoopbackServer {
	public port: number | undefined;
	public readonly nonce: string;
	public state: string | undefined;

	private readonly _server: http.Server;
	private _resultPromise: Promise<IOAuthResult>;
	private _resultPromiseResolve!: (result: IOAuthResult) => void;
	private _resultPromiseReject!: (err: Error) => void;

	constructor() {
		this.nonce = randomBytes(16).toString('base64');
		this._resultPromise = new Promise<IOAuthResult>((resolve, reject) => {
			this._resultPromiseResolve = resolve;
			this._resultPromiseReject = reject;
		});

		this._server = http.createServer((req, res) => this._handleRequest(req, res));
	}

	/**
	 * Starts the server
	 * @returns Promise that resolves with the port number
	 */
	public start(): Promise<number> {
		return new Promise<number>((resolve, reject) => {
			const portTimeout = setTimeout(() => {
				reject(new Error('Timeout waiting for port'));
			}, 5000);

			this._server.on('listening', () => {
				const address = this._server.address();
				if (typeof address === 'string') {
					this.port = parseInt(address);
				} else if (address && typeof address === 'object') {
					this.port = address.port;
				} else {
					throw new Error('Unable to determine port');
				}

				clearTimeout(portTimeout);

				// Set state which will be used to redirect back
				this.state = `http://127.0.0.1:${this.port}/callback`;

				resolve(this.port);
			});

			this._server.on('error', err => {
				reject(new Error(`Error listening to server: ${err}`));
			});

			this._server.on('close', () => {
				reject(new Error('Server closed unexpectedly'));
			});

			this._server.listen(0, '127.0.0.1');
		});
	}

	/**
	 * Stops the server
	 * @returns Promise that resolves when server is stopped
	 */
	public stop(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			if (!this._server.listening) {
				throw new Error('Server is not started');
			}

			this._server.close((err) => {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}

	/**
	 * Waits for OAuth response from the callback
	 * @returns Promise that resolves with OAuth result
	 */
	public waitForOAuthResponse(): Promise<IOAuthResult> {
		return this._resultPromise;
	}

	/**
	 * Handles incoming HTTP requests
	 */
	private _handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		if (!req.url) {
			res.writeHead(400);
			res.end();
			return;
		}

		const reqUrl = new URL(req.url, `http://127.0.0.1:${this.port}`);
		const pathname = reqUrl.pathname;

		switch (pathname) {
			case '/callback': {
				// const nonce = reqUrl.searchParams.get('nonce');
				// if (nonce !== this.nonce) {
				// 	res.writeHead(403);
				// 	res.end('Invalid nonce');
				// 	return;
				// }

				const code = reqUrl.searchParams.get('code');
				const state = reqUrl.searchParams.get('state');

				if (!code || !state) {
					const error = reqUrl.searchParams.get('error');
					const errorDescription = reqUrl.searchParams.get('error_description');

					res.writeHead(400);
					res.end(`OAuth callback error: ${error}, ${errorDescription}`);

					this._resultPromiseReject(new Error(`OAuth callback error: ${error}, ${errorDescription}`));
					return;
				}

				// Send success page
				res.writeHead(200, {
					'content-type': 'text/html'
				});
				res.end('<html><body><h1>Authentication successful!</h1><p>You can close this window now.</p></body></html>');

				// Resolve with OAuth result
				this._resultPromiseResolve({ code, state });
				break;
			}
			default: {
				res.writeHead(404);
				res.end();
				break;
			}
		}
	}
}

//#endregion Loopback Auth Server
