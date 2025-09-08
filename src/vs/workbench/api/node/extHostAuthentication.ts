/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import type * as vscode from 'vscode';
import { URL } from 'url';
import { ExtHostAuthentication, DynamicAuthProvider, IExtHostAuthentication } from '../common/extHostAuthentication.js';
import { IExtHostRpcService } from '../common/extHostRpcService.js';
import { IExtHostInitDataService } from '../common/extHostInitDataService.js';
import { IExtHostWindow } from '../common/extHostWindow.js';
import { IExtHostUrlsService } from '../common/extHostUrls.js';
import { ILoggerService, ILogService } from '../../../platform/log/common/log.js';
import { MainThreadAuthenticationShape } from '../common/extHost.protocol.js';
import { IAuthorizationServerMetadata, IAuthorizationProtectedResourceMetadata, IAuthorizationTokenResponse, IAuthorizationDeviceResponse, isAuthorizationDeviceResponse, isAuthorizationTokenResponse, IAuthorizationDeviceTokenErrorResponse, AuthorizationErrorType, AuthorizationDeviceCodeErrorType } from '../../../base/common/oauth.js';
import { Emitter } from '../../../base/common/event.js';
import { raceCancellationError } from '../../../base/common/async.js';
import { IExtHostProgress } from '../common/extHostProgress.js';
import { IProgressStep } from '../../../platform/progress/common/progress.js';
import { CancellationError, isCancellationError } from '../../../base/common/errors.js';
import { URI } from '../../../base/common/uri.js';
import { LoopbackAuthServer } from './loopbackServer.js';

export class NodeDynamicAuthProvider extends DynamicAuthProvider {

	constructor(
		extHostWindow: IExtHostWindow,
		extHostUrls: IExtHostUrlsService,
		initData: IExtHostInitDataService,
		extHostProgress: IExtHostProgress,
		loggerService: ILoggerService,
		proxy: MainThreadAuthenticationShape,
		authorizationServer: URI,
		serverMetadata: IAuthorizationServerMetadata,
		resourceMetadata: IAuthorizationProtectedResourceMetadata | undefined,
		clientId: string,
		clientSecret: string | undefined,
		onDidDynamicAuthProviderTokensChange: Emitter<{ authProviderId: string; clientId: string; tokens: any[] }>,
		initialTokens: any[]
	) {
		super(
			extHostWindow,
			extHostUrls,
			initData,
			extHostProgress,
			loggerService,
			proxy,
			authorizationServer,
			serverMetadata,
			resourceMetadata,
			clientId,
			clientSecret,
			onDidDynamicAuthProviderTokensChange,
			initialTokens
		);

		// Prepend Node-specific flows to the existing flows
		if (!initData.remote.isRemote && serverMetadata.authorization_endpoint) {
			// If we are not in a remote environment, we can use the loopback server for authentication
			this._createFlows.unshift({
				label: nls.localize('loopback', "Loopback Server"),
				handler: (scopes, progress, token) => this._createWithLoopbackServer(scopes, progress, token)
			});
		}

		// Add device code flow to the end since it's not as streamlined
		if (serverMetadata.device_authorization_endpoint) {
			this._createFlows.push({
				label: nls.localize('device code', "Device Code"),
				handler: (scopes, progress, token) => this._createWithDeviceCode(scopes, progress, token)
			});
		}
	}

	private async _createWithLoopbackServer(scopes: string[], progress: vscode.Progress<IProgressStep>, token: vscode.CancellationToken): Promise<IAuthorizationTokenResponse> {
		if (!this._serverMetadata.authorization_endpoint) {
			throw new Error('Authorization Endpoint required');
		}
		if (!this._serverMetadata.token_endpoint) {
			throw new Error('Token endpoint not available in server metadata');
		}

		// Generate PKCE code verifier (random string) and code challenge (SHA-256 hash of verifier)
		const codeVerifier = this.generateRandomString(64);
		const codeChallenge = await this.generateCodeChallenge(codeVerifier);

		// Generate a random state value to prevent CSRF
		const nonce = this.generateRandomString(32);
		const callbackUri = URI.parse(`${this._initData.environment.appUriScheme}://dynamicauthprovider/${this.authorizationServer.authority}/redirect?nonce=${nonce}`);
		let appUri: URI;
		try {
			appUri = await this._extHostUrls.createAppUri(callbackUri);
		} catch (error) {
			throw new Error(`Failed to create external URI: ${error}`);
		}

		// Prepare the authorization request URL
		const authorizationUrl = new URL(this._serverMetadata.authorization_endpoint);
		authorizationUrl.searchParams.append('client_id', this._clientId);
		authorizationUrl.searchParams.append('response_type', 'code');
		authorizationUrl.searchParams.append('code_challenge', codeChallenge);
		authorizationUrl.searchParams.append('code_challenge_method', 'S256');
		const scopeString = scopes.join(' ');
		if (scopeString) {
			authorizationUrl.searchParams.append('scope', scopeString);
		}
		if (this._resourceMetadata?.resource) {
			// If a resource is specified, include it in the request
			authorizationUrl.searchParams.append('resource', this._resourceMetadata.resource);
		}

		// Create and start the loopback server
		const server = new LoopbackAuthServer(
			this._logger,
			appUri,
			this._initData.environment.appName
		);
		try {
			await server.start();
		} catch (err) {
			throw new Error(`Failed to start loopback server: ${err}`);
		}

		// Update the authorization URL with the actual redirect URI
		authorizationUrl.searchParams.set('redirect_uri', server.redirectUri);
		authorizationUrl.searchParams.set('state', server.state);

		const promise = server.waitForOAuthResponse();
		// Set up a Uri Handler but it's just to redirect not to handle the code
		void this._proxy.$waitForUriHandler(appUri);

		try {
			// Open the browser for user authorization
			this._logger.info(`Opening authorization URL for scopes: ${scopeString}`);
			this._logger.trace(`Authorization URL: ${authorizationUrl.toString()}`);
			const opened = await this._extHostWindow.openUri(authorizationUrl.toString(), {});
			if (!opened) {
				throw new CancellationError();
			}
			progress.report({
				message: nls.localize('completeAuth', "Complete the authentication in the browser window that has opened."),
			});

			// Wait for the authorization code via the loopback server
			let code: string | undefined;
			try {
				const response = await raceCancellationError(promise, token);
				code = response.code;
			} catch (err) {
				if (isCancellationError(err)) {
					this._logger.info('Authorization code request was cancelled by the user.');
					throw err;
				}
				this._logger.error(`Failed to receive authorization code: ${err}`);
				throw new Error(`Failed to receive authorization code: ${err}`);
			}
			this._logger.info(`Authorization code received for scopes: ${scopeString}`);

			// Exchange the authorization code for tokens
			const tokenResponse = await this.exchangeCodeForToken(code, codeVerifier, server.redirectUri);
			return tokenResponse;
		} finally {
			// Clean up the server
			setTimeout(() => {
				void server.stop();
			}, 5000);
		}
	}

	private async _createWithDeviceCode(scopes: string[], progress: vscode.Progress<IProgressStep>, token: vscode.CancellationToken): Promise<IAuthorizationTokenResponse> {
		if (!this._serverMetadata.token_endpoint) {
			throw new Error('Token endpoint not available in server metadata');
		}
		if (!this._serverMetadata.device_authorization_endpoint) {
			throw new Error('Device authorization endpoint not available in server metadata');
		}

		const deviceAuthUrl = this._serverMetadata.device_authorization_endpoint;
		const scopeString = scopes.join(' ');
		this._logger.info(`Starting device code flow for scopes: ${scopeString}`);

		// Step 1: Request device and user codes
		const deviceCodeRequest = new URLSearchParams();
		deviceCodeRequest.append('client_id', this._clientId);
		if (scopeString) {
			deviceCodeRequest.append('scope', scopeString);
		}
		if (this._resourceMetadata?.resource) {
			// If a resource is specified, include it in the request
			deviceCodeRequest.append('resource', this._resourceMetadata.resource);
		}

		let deviceCodeResponse: Response;
		try {
			deviceCodeResponse = await fetch(deviceAuthUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'Accept': 'application/json'
				},
				body: deviceCodeRequest.toString()
			});
		} catch (error) {
			this._logger.error(`Failed to request device code: ${error}`);
			throw new Error(`Failed to request device code: ${error}`);
		}

		if (!deviceCodeResponse.ok) {
			const text = await deviceCodeResponse.text();
			throw new Error(`Device code request failed: ${deviceCodeResponse.status} ${deviceCodeResponse.statusText} - ${text}`);
		}

		const deviceCodeData: IAuthorizationDeviceResponse = await deviceCodeResponse.json();
		if (!isAuthorizationDeviceResponse(deviceCodeData)) {
			this._logger.error('Invalid device code response received from server');
			throw new Error('Invalid device code response received from server');
		}
		this._logger.info(`Device code received: ${deviceCodeData.user_code}`);

		// Step 2: Show the device code modal
		const userConfirmed = await this._proxy.$showDeviceCodeModal(
			deviceCodeData.user_code,
			deviceCodeData.verification_uri
		);

		if (!userConfirmed) {
			throw new CancellationError();
		}

		// Step 3: Poll for token
		progress.report({
			message: nls.localize('waitingForAuth', "Open [{0}]({0}) in a new tab and paste your one-time code: {1}", deviceCodeData.verification_uri, deviceCodeData.user_code)
		});

		const pollInterval = (deviceCodeData.interval || 5) * 1000; // Convert to milliseconds
		const expiresAt = Date.now() + (deviceCodeData.expires_in * 1000);

		while (Date.now() < expiresAt) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			// Wait for the specified interval
			await new Promise(resolve => setTimeout(resolve, pollInterval));

			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			// Poll the token endpoint
			const tokenRequest = new URLSearchParams();
			tokenRequest.append('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');
			tokenRequest.append('device_code', deviceCodeData.device_code);
			tokenRequest.append('client_id', this._clientId);

			// Add resource indicator if available (RFC 8707)
			if (this._resourceMetadata?.resource) {
				tokenRequest.append('resource', this._resourceMetadata.resource);
			}

			try {
				const tokenResponse = await fetch(this._serverMetadata.token_endpoint, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
						'Accept': 'application/json'
					},
					body: tokenRequest.toString()
				});

				if (tokenResponse.ok) {
					const tokenData: IAuthorizationTokenResponse = await tokenResponse.json();
					if (!isAuthorizationTokenResponse(tokenData)) {
						this._logger.error('Invalid token response received from server');
						throw new Error('Invalid token response received from server');
					}
					this._logger.info(`Device code flow completed successfully for scopes: ${scopeString}`);
					return tokenData;
				} else {
					let errorData: IAuthorizationDeviceTokenErrorResponse;
					try {
						errorData = await tokenResponse.json();
					} catch (e) {
						this._logger.error(`Failed to parse error response: ${e}`);
						throw new Error(`Token request failed with status ${tokenResponse.status}: ${tokenResponse.statusText}`);
					}

					// Handle known error cases
					if (errorData.error === AuthorizationDeviceCodeErrorType.AuthorizationPending) {
						// User hasn't completed authorization yet, continue polling
						continue;
					} else if (errorData.error === AuthorizationDeviceCodeErrorType.SlowDown) {
						// Server is asking us to slow down
						await new Promise(resolve => setTimeout(resolve, pollInterval));
						continue;
					} else if (errorData.error === AuthorizationDeviceCodeErrorType.ExpiredToken) {
						throw new Error('Device code expired. Please try again.');
					} else if (errorData.error === AuthorizationDeviceCodeErrorType.AccessDenied) {
						throw new CancellationError();
					} else if (errorData.error === AuthorizationErrorType.InvalidClient) {
						this._logger.warn(`Client ID (${this._clientId}) was invalid, generated a new one.`);
						await this._generateNewClientId();
						throw new Error(`Client ID was invalid, generated a new one. Please try again.`);
					} else {
						throw new Error(`Token request failed: ${errorData.error_description || errorData.error || 'Unknown error'}`);
					}
				}
			} catch (error) {
				if (isCancellationError(error)) {
					throw error;
				}
				throw new Error(`Error polling for token: ${error}`);
			}
		}

		throw new Error('Device code flow timed out. Please try again.');
	}
}

export class NodeExtHostAuthentication extends ExtHostAuthentication implements IExtHostAuthentication {

	protected override readonly _dynamicAuthProviderCtor = NodeDynamicAuthProvider;

	constructor(
		extHostRpc: IExtHostRpcService,
		initData: IExtHostInitDataService,
		extHostWindow: IExtHostWindow,
		extHostUrls: IExtHostUrlsService,
		extHostProgress: IExtHostProgress,
		extHostLoggerService: ILoggerService,
		extHostLogService: ILogService
	) {
		super(extHostRpc, initData, extHostWindow, extHostUrls, extHostProgress, extHostLoggerService, extHostLogService);
	}
}
