/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../nls.js';
import { URL } from 'url';
import { ExtHostAuthentication, DynamicAuthProvider } from '../common/extHostAuthentication.js';
import { isAuthorizationDeviceResponse, isAuthorizationTokenResponse } from '../../../base/common/oauth.js';
import { raceCancellationError } from '../../../base/common/async.js';
import { CancellationError, isCancellationError } from '../../../base/common/errors.js';
import { URI } from '../../../base/common/uri.js';
import { LoopbackAuthServer } from './loopbackServer.js';
export class NodeDynamicAuthProvider extends DynamicAuthProvider {
    constructor(extHostWindow, extHostUrls, initData, extHostProgress, loggerService, proxy, authorizationServer, serverMetadata, resourceMetadata, clientId, clientSecret, onDidDynamicAuthProviderTokensChange, initialTokens) {
        super(extHostWindow, extHostUrls, initData, extHostProgress, loggerService, proxy, authorizationServer, serverMetadata, resourceMetadata, clientId, clientSecret, onDidDynamicAuthProviderTokensChange, initialTokens);
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
    async _createWithLoopbackServer(scopes, progress, token) {
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
        let appUri;
        try {
            appUri = await this._extHostUrls.createAppUri(callbackUri);
        }
        catch (error) {
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
        const server = new LoopbackAuthServer(this._logger, appUri, this._initData.environment.appName);
        try {
            await server.start();
        }
        catch (err) {
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
            let code;
            try {
                const response = await raceCancellationError(promise, token);
                code = response.code;
            }
            catch (err) {
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
        }
        finally {
            // Clean up the server
            setTimeout(() => {
                void server.stop();
            }, 5000);
        }
    }
    async _createWithDeviceCode(scopes, progress, token) {
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
        let deviceCodeResponse;
        try {
            deviceCodeResponse = await fetch(deviceAuthUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                body: deviceCodeRequest.toString()
            });
        }
        catch (error) {
            this._logger.error(`Failed to request device code: ${error}`);
            throw new Error(`Failed to request device code: ${error}`);
        }
        if (!deviceCodeResponse.ok) {
            const text = await deviceCodeResponse.text();
            throw new Error(`Device code request failed: ${deviceCodeResponse.status} ${deviceCodeResponse.statusText} - ${text}`);
        }
        const deviceCodeData = await deviceCodeResponse.json();
        if (!isAuthorizationDeviceResponse(deviceCodeData)) {
            this._logger.error('Invalid device code response received from server');
            throw new Error('Invalid device code response received from server');
        }
        this._logger.info(`Device code received: ${deviceCodeData.user_code}`);
        // Step 2: Show the device code modal
        const userConfirmed = await this._proxy.$showDeviceCodeModal(deviceCodeData.user_code, deviceCodeData.verification_uri);
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
                    const tokenData = await tokenResponse.json();
                    if (!isAuthorizationTokenResponse(tokenData)) {
                        this._logger.error('Invalid token response received from server');
                        throw new Error('Invalid token response received from server');
                    }
                    this._logger.info(`Device code flow completed successfully for scopes: ${scopeString}`);
                    return tokenData;
                }
                else {
                    let errorData;
                    try {
                        errorData = await tokenResponse.json();
                    }
                    catch (e) {
                        this._logger.error(`Failed to parse error response: ${e}`);
                        throw new Error(`Token request failed with status ${tokenResponse.status}: ${tokenResponse.statusText}`);
                    }
                    // Handle known error cases
                    if (errorData.error === "authorization_pending" /* AuthorizationDeviceCodeErrorType.AuthorizationPending */) {
                        // User hasn't completed authorization yet, continue polling
                        continue;
                    }
                    else if (errorData.error === "slow_down" /* AuthorizationDeviceCodeErrorType.SlowDown */) {
                        // Server is asking us to slow down
                        await new Promise(resolve => setTimeout(resolve, pollInterval));
                        continue;
                    }
                    else if (errorData.error === "expired_token" /* AuthorizationDeviceCodeErrorType.ExpiredToken */) {
                        throw new Error('Device code expired. Please try again.');
                    }
                    else if (errorData.error === "access_denied" /* AuthorizationDeviceCodeErrorType.AccessDenied */) {
                        throw new CancellationError();
                    }
                    else if (errorData.error === "invalid_client" /* AuthorizationErrorType.InvalidClient */) {
                        this._logger.warn(`Client ID (${this._clientId}) was invalid, generated a new one.`);
                        await this._generateNewClientId();
                        throw new Error(`Client ID was invalid, generated a new one. Please try again.`);
                    }
                    else {
                        throw new Error(`Token request failed: ${errorData.error_description || errorData.error || 'Unknown error'}`);
                    }
                }
            }
            catch (error) {
                if (isCancellationError(error)) {
                    throw error;
                }
                throw new Error(`Error polling for token: ${error}`);
            }
        }
        throw new Error('Device code flow timed out. Please try again.');
    }
}
export class NodeExtHostAuthentication extends ExtHostAuthentication {
    constructor(extHostRpc, initData, extHostWindow, extHostUrls, extHostProgress, extHostLoggerService, extHostLogService) {
        super(extHostRpc, initData, extHostWindow, extHostUrls, extHostProgress, extHostLoggerService, extHostLogService);
        this._dynamicAuthProviderCtor = NodeDynamicAuthProvider;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9ub2RlL2V4dEhvc3RBdXRoZW50aWNhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGlCQUFpQixDQUFDO0FBRXZDLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxLQUFLLENBQUM7QUFDMUIsT0FBTyxFQUFFLHFCQUFxQixFQUFFLG1CQUFtQixFQUEwQixNQUFNLG9DQUFvQyxDQUFDO0FBT3hILE9BQU8sRUFBb0ksNkJBQTZCLEVBQUUsNEJBQTRCLEVBQW9HLE1BQU0sK0JBQStCLENBQUM7QUFFaFYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFHdEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLG1CQUFtQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDeEYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRXpELE1BQU0sT0FBTyx1QkFBd0IsU0FBUSxtQkFBbUI7SUFFL0QsWUFDQyxhQUE2QixFQUM3QixXQUFnQyxFQUNoQyxRQUFpQyxFQUNqQyxlQUFpQyxFQUNqQyxhQUE2QixFQUM3QixLQUFvQyxFQUNwQyxtQkFBd0IsRUFDeEIsY0FBNEMsRUFDNUMsZ0JBQXFFLEVBQ3JFLFFBQWdCLEVBQ2hCLFlBQWdDLEVBQ2hDLG9DQUEwRyxFQUMxRyxhQUFvQjtRQUVwQixLQUFLLENBQ0osYUFBYSxFQUNiLFdBQVcsRUFDWCxRQUFRLEVBQ1IsZUFBZSxFQUNmLGFBQWEsRUFDYixLQUFLLEVBQ0wsbUJBQW1CLEVBQ25CLGNBQWMsRUFDZCxnQkFBZ0IsRUFDaEIsUUFB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