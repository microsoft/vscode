"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFlows = getFlows;
exports.isSocialSignInProvider = isSocialSignInProvider;
const path = __importStar(require("path"));
const vscode_1 = require("vscode");
const config_1 = require("./config");
const fetch_1 = require("./node/fetch");
const crypto_1 = require("./node/crypto");
const authServer_1 = require("./node/authServer");
const utils_1 = require("./common/utils");
const env_1 = require("./common/env");
const errors_1 = require("./common/errors");
/**
 * Generates a cryptographically secure random string for PKCE code verifier.
 * @param length The length of the string to generate
 * @returns A random hex string
 */
function generateRandomString(length) {
    const array = new Uint8Array(length);
    crypto_1.crypto.getRandomValues(array);
    return Array.from(array)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .substring(0, length);
}
/**
 * Generates a PKCE code challenge from a code verifier using SHA-256.
 * @param codeVerifier The code verifier string
 * @returns A base64url-encoded SHA-256 hash of the code verifier
 */
async function generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto_1.crypto.subtle.digest('SHA-256', data);
    // Base64url encode the digest
    const base64String = btoa(String.fromCharCode(...new Uint8Array(digest)));
    return base64String
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}
async function exchangeCodeForToken(logger, endpointUri, redirectUri, code, codeVerifier, enterpriseUri) {
    logger.info('Exchanging code for token...');
    const clientSecret = config_1.Config.gitHubClientSecret;
    if (!clientSecret) {
        throw new Error('No client secret configured for GitHub authentication.');
    }
    const body = new URLSearchParams([
        ['code', code],
        ['client_id', config_1.Config.gitHubClientId],
        ['redirect_uri', redirectUri.toString(true)],
        ['client_secret', clientSecret],
        ['code_verifier', codeVerifier]
    ]);
    if (enterpriseUri) {
        body.append('github_enterprise', enterpriseUri.toString(true));
    }
    const result = await (0, fetch_1.fetching)(endpointUri.toString(true), {
        logger,
        retryFallbacks: true,
        expectJSON: true,
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString()
    });
    if (result.ok) {
        const json = await result.json();
        logger.info('Token exchange success!');
        return json.access_token;
    }
    else {
        const text = await result.text();
        const error = new Error(text);
        error.name = 'GitHubTokenExchangeError';
        throw error;
    }
}
class UrlHandlerFlow {
    label = vscode_1.l10n.t('url handler');
    options = {
        supportsGitHubDotCom: true,
        // Supporting GHES would be challenging because different versions
        // used a different client ID. We could try to detect the version
        // and use the right one, but that's a lot of work when we have
        // other flows that work well.
        supportsGitHubEnterpriseServer: false,
        supportsHostedGitHubEnterprise: true,
        supportsRemoteExtensionHost: true,
        supportsWebWorkerExtensionHost: true,
        // exchanging a code for a token requires a client secret
        supportsNoClientSecret: false,
        supportsSupportedClients: true,
        supportsUnsupportedClients: false
    };
    async trigger({ scopes, baseUri, redirectUri, callbackUri, enterpriseUri, nonce, signInProvider, extraAuthorizeParameters, uriHandler, existingLogin, logger, }) {
        logger.info(`Trying without local server... (${scopes})`);
        return await vscode_1.window.withProgress({
            location: vscode_1.ProgressLocation.Notification,
            title: vscode_1.l10n.t({
                message: 'Signing in to {0}...',
                args: [baseUri.authority],
                comment: ['The {0} will be a url, e.g. github.com']
            }),
            cancellable: true
        }, async (_, token) => {
            // Generate PKCE parameters
            const codeVerifier = generateRandomString(64);
            const codeChallenge = await generateCodeChallenge(codeVerifier);
            const promise = uriHandler.waitForCode(logger, scopes, nonce, token);
            const searchParams = new URLSearchParams([
                ['client_id', config_1.Config.gitHubClientId],
                ['redirect_uri', redirectUri.toString(true)],
                ['scope', scopes],
                ['state', encodeURIComponent(callbackUri.toString(true))],
                ['code_challenge', codeChallenge],
                ['code_challenge_method', 'S256']
            ]);
            if (existingLogin) {
                searchParams.append('login', existingLogin);
            }
            else {
                searchParams.append('prompt', 'select_account');
            }
            if (signInProvider) {
                searchParams.append('provider', signInProvider);
            }
            if (extraAuthorizeParameters) {
                for (const [key, value] of Object.entries(extraAuthorizeParameters)) {
                    searchParams.append(key, value);
                }
            }
            // The extra toString, parse is apparently needed for env.openExternal
            // to open the correct URL.
            const uri = vscode_1.Uri.parse(baseUri.with({
                path: '/login/oauth/authorize',
                query: searchParams.toString()
            }).toString(true));
            await vscode_1.env.openExternal(uri);
            const code = await promise;
            const proxyEndpoints = await vscode_1.commands.executeCommand('workbench.getCodeExchangeProxyEndpoints');
            const endpointUrl = proxyEndpoints?.github
                ? vscode_1.Uri.parse(`${proxyEndpoints.github}login/oauth/access_token`)
                : baseUri.with({ path: '/login/oauth/access_token' });
            const accessToken = await exchangeCodeForToken(logger, endpointUrl, redirectUri, code, codeVerifier, enterpriseUri);
            return accessToken;
        });
    }
}
class LocalServerFlow {
    label = vscode_1.l10n.t('local server');
    options = {
        supportsGitHubDotCom: true,
        // Supporting GHES would be challenging because different versions
        // used a different client ID. We could try to detect the version
        // and use the right one, but that's a lot of work when we have
        // other flows that work well.
        supportsGitHubEnterpriseServer: false,
        supportsHostedGitHubEnterprise: true,
        // Opening a port on the remote side can't be open in the browser on
        // the client side so this flow won't work in remote extension hosts
        supportsRemoteExtensionHost: false,
        // Web worker can't open a port to listen for the redirect
        supportsWebWorkerExtensionHost: false,
        // exchanging a code for a token requires a client secret
        supportsNoClientSecret: false,
        supportsSupportedClients: true,
        supportsUnsupportedClients: true
    };
    async trigger({ scopes, baseUri, redirectUri, callbackUri, enterpriseUri, signInProvider, extraAuthorizeParameters, existingLogin, logger }) {
        logger.info(`Trying with local server... (${scopes})`);
        return await vscode_1.window.withProgress({
            location: vscode_1.ProgressLocation.Notification,
            title: vscode_1.l10n.t({
                message: 'Signing in to {0}...',
                args: [baseUri.authority],
                comment: ['The {0} will be a url, e.g. github.com']
            }),
            cancellable: true
        }, async (_, token) => {
            // Generate PKCE parameters
            const codeVerifier = generateRandomString(64);
            const codeChallenge = await generateCodeChallenge(codeVerifier);
            const searchParams = new URLSearchParams([
                ['client_id', config_1.Config.gitHubClientId],
                ['redirect_uri', redirectUri.toString(true)],
                ['scope', scopes],
                ['code_challenge', codeChallenge],
                ['code_challenge_method', 'S256']
            ]);
            if (existingLogin) {
                searchParams.append('login', existingLogin);
            }
            else {
                searchParams.append('prompt', 'select_account');
            }
            if (signInProvider) {
                searchParams.append('provider', signInProvider);
            }
            if (extraAuthorizeParameters) {
                for (const [key, value] of Object.entries(extraAuthorizeParameters)) {
                    searchParams.append(key, value);
                }
            }
            const loginUrl = baseUri.with({
                path: '/login/oauth/authorize',
                query: searchParams.toString()
            });
            const server = new authServer_1.LoopbackAuthServer(path.join(__dirname, '../media'), loginUrl.toString(true), callbackUri.toString(true), vscode_1.env.isAppPortable);
            const port = await server.start();
            let codeToExchange;
            try {
                vscode_1.env.openExternal(vscode_1.Uri.parse(`http://127.0.0.1:${port}/signin?nonce=${encodeURIComponent(server.nonce)}`));
                const { code } = await Promise.race([
                    server.waitForOAuthResponse(),
                    new Promise((_, reject) => setTimeout(() => reject(errors_1.TIMED_OUT_ERROR), 300_000)), // 5min timeout
                    (0, utils_1.promiseFromEvent)(token.onCancellationRequested, (_, __, reject) => { reject(errors_1.USER_CANCELLATION_ERROR); }).promise
                ]);
                codeToExchange = code;
            }
            finally {
                setTimeout(() => {
                    void server.stop();
                }, 5000);
            }
            const accessToken = await exchangeCodeForToken(logger, baseUri.with({ path: '/login/oauth/access_token' }), redirectUri, codeToExchange, codeVerifier, enterpriseUri);
            return accessToken;
        });
    }
}
class DeviceCodeFlow {
    label = vscode_1.l10n.t('device code');
    options = {
        supportsGitHubDotCom: true,
        supportsGitHubEnterpriseServer: true,
        supportsHostedGitHubEnterprise: true,
        supportsRemoteExtensionHost: true,
        // CORS prevents this from working in web workers
        supportsWebWorkerExtensionHost: false,
        supportsNoClientSecret: true,
        supportsSupportedClients: true,
        supportsUnsupportedClients: true
    };
    async trigger({ scopes, baseUri, signInProvider, extraAuthorizeParameters, logger }) {
        logger.info(`Trying device code flow... (${scopes})`);
        // Get initial device code
        const uri = baseUri.with({
            path: '/login/device/code',
            query: `client_id=${config_1.Config.gitHubClientId}&scope=${scopes}`
        });
        const result = await (0, fetch_1.fetching)(uri.toString(true), {
            logger,
            retryFallbacks: true,
            expectJSON: true,
            method: 'POST',
            headers: {
                Accept: 'application/json'
            }
        });
        if (!result.ok) {
            throw new Error(`Failed to get one-time code: ${await result.text()}`);
        }
        const json = await result.json();
        const button = vscode_1.l10n.t('Copy & Continue to Browser');
        const modalResult = await vscode_1.window.showInformationMessage(vscode_1.l10n.t({ message: 'Your Code: {0}', args: [json.user_code], comment: ['The {0} will be a code, e.g. 123-456'] }), {
            modal: true,
            detail: vscode_1.l10n.t('To finish authenticating, navigate to GitHub and paste in the above one-time code.')
        }, button);
        if (modalResult !== button) {
            throw new Error(errors_1.USER_CANCELLATION_ERROR);
        }
        await vscode_1.env.clipboard.writeText(json.user_code);
        let open = vscode_1.Uri.parse(json.verification_uri);
        const query = new URLSearchParams(open.query);
        if (signInProvider) {
            query.set('provider', signInProvider);
        }
        if (extraAuthorizeParameters) {
            for (const [key, value] of Object.entries(extraAuthorizeParameters)) {
                query.set(key, value);
            }
        }
        if (signInProvider || extraAuthorizeParameters) {
            open = open.with({ query: query.toString() });
        }
        const uriToOpen = await vscode_1.env.asExternalUri(open);
        await vscode_1.env.openExternal(uriToOpen);
        return await this.waitForDeviceCodeAccessToken(logger, baseUri, json);
    }
    async waitForDeviceCodeAccessToken(logger, baseUri, json) {
        return await vscode_1.window.withProgress({
            location: vscode_1.ProgressLocation.Notification,
            cancellable: true,
            title: vscode_1.l10n.t({
                message: 'Open [{0}]({0}) in a new tab and paste your one-time code: {1}',
                args: [json.verification_uri, json.user_code],
                comment: [
                    'The [{0}]({0}) will be a url and the {1} will be a code, e.g. 123-456',
                    '{Locked="[{0}]({0})"}'
                ]
            })
        }, async (_, token) => {
            const refreshTokenUri = baseUri.with({
                path: '/login/oauth/access_token',
                query: `client_id=${config_1.Config.gitHubClientId}&device_code=${json.device_code}&grant_type=urn:ietf:params:oauth:grant-type:device_code`
            });
            // Try for 2 minutes
            const attempts = 120 / json.interval;
            for (let i = 0; i < attempts; i++) {
                await new Promise(resolve => setTimeout(resolve, json.interval * 1000));
                if (token.isCancellationRequested) {
                    throw new Error(errors_1.USER_CANCELLATION_ERROR);
                }
                let accessTokenResult;
                try {
                    accessTokenResult = await (0, fetch_1.fetching)(refreshTokenUri.toString(true), {
                        logger,
                        retryFallbacks: true,
                        expectJSON: true,
                        method: 'POST',
                        headers: {
                            Accept: 'application/json'
                        }
                    });
                }
                catch {
                    continue;
                }
                if (!accessTokenResult.ok) {
                    continue;
                }
                const accessTokenJson = await accessTokenResult.json();
                if (accessTokenJson.error === 'authorization_pending') {
                    continue;
                }
                if (accessTokenJson.error) {
                    throw new Error(accessTokenJson.error_description);
                }
                return accessTokenJson.access_token;
            }
            throw new Error(errors_1.TIMED_OUT_ERROR);
        });
    }
}
class PatFlow {
    label = vscode_1.l10n.t('personal access token');
    options = {
        supportsGitHubDotCom: true,
        supportsGitHubEnterpriseServer: true,
        supportsHostedGitHubEnterprise: true,
        supportsRemoteExtensionHost: true,
        supportsWebWorkerExtensionHost: true,
        supportsNoClientSecret: true,
        // PATs can't be used with Settings Sync so we don't enable this flow
        // for supported clients
        supportsSupportedClients: false,
        supportsUnsupportedClients: true
    };
    async trigger({ scopes, baseUri, logger, enterpriseUri }) {
        logger.info(`Trying to retrieve PAT... (${scopes})`);
        const button = vscode_1.l10n.t('Continue to GitHub');
        const modalResult = await vscode_1.window.showInformationMessage(vscode_1.l10n.t('Continue to GitHub to create a Personal Access Token (PAT)'), {
            modal: true,
            detail: vscode_1.l10n.t('To finish authenticating, navigate to GitHub to create a PAT then paste the PAT into the input box.')
        }, button);
        if (modalResult !== button) {
            throw new Error(errors_1.USER_CANCELLATION_ERROR);
        }
        const description = `${vscode_1.env.appName} (${scopes})`;
        const uriToOpen = await vscode_1.env.asExternalUri(baseUri.with({ path: '/settings/tokens/new', query: `description=${description}&scopes=${scopes.split(' ').join(',')}` }));
        await vscode_1.env.openExternal(uriToOpen);
        const token = await vscode_1.window.showInputBox({ placeHolder: `ghp_1a2b3c4...`, prompt: `GitHub Personal Access Token - ${scopes}`, ignoreFocusOut: true });
        if (!token) {
            throw new Error(errors_1.USER_CANCELLATION_ERROR);
        }
        const appUri = !enterpriseUri || (0, env_1.isHostedGitHubEnterprise)(enterpriseUri)
            ? vscode_1.Uri.parse(`${baseUri.scheme}://api.${baseUri.authority}`)
            : vscode_1.Uri.parse(`${baseUri.scheme}://${baseUri.authority}/api/v3`);
        const tokenScopes = await this.getScopes(token, appUri, logger); // Example: ['repo', 'user']
        const scopesList = scopes.split(' '); // Example: 'read:user repo user:email'
        if (!scopesList.every(scope => {
            const included = tokenScopes.includes(scope);
            if (included || !scope.includes(':')) {
                return included;
            }
            return scope.split(':').some(splitScopes => {
                return tokenScopes.includes(splitScopes);
            });
        })) {
            throw new Error(`The provided token does not match the requested scopes: ${scopes}`);
        }
        return token;
    }
    async getScopes(token, serverUri, logger) {
        try {
            logger.info('Getting token scopes...');
            const result = await (0, fetch_1.fetching)(serverUri.toString(), {
                logger,
                retryFallbacks: true,
                expectJSON: false,
                headers: {
                    Authorization: `token ${token}`,
                    'User-Agent': `${vscode_1.env.appName} (${vscode_1.env.appHost})`
                }
            });
            if (result.ok) {
                const scopes = result.headers.get('X-OAuth-Scopes');
                return scopes ? scopes.split(',').map(scope => scope.trim()) : [];
            }
            else {
                logger.error(`Getting scopes failed: ${result.statusText}`);
                throw new Error(result.statusText);
            }
        }
        catch (ex) {
            logger.error(ex.message);
            throw new Error(errors_1.NETWORK_ERROR);
        }
    }
}
const allFlows = [
    new LocalServerFlow(),
    new UrlHandlerFlow(),
    new DeviceCodeFlow(),
    new PatFlow()
];
function getFlows(query) {
    const validFlows = allFlows.filter(flow => {
        let useFlow = true;
        switch (query.target) {
            case 0 /* GitHubTarget.DotCom */:
                useFlow &&= flow.options.supportsGitHubDotCom;
                break;
            case 1 /* GitHubTarget.Enterprise */:
                useFlow &&= flow.options.supportsGitHubEnterpriseServer;
                break;
            case 2 /* GitHubTarget.HostedEnterprise */:
                useFlow &&= flow.options.supportsHostedGitHubEnterprise;
                break;
        }
        switch (query.extensionHost) {
            case 1 /* ExtensionHost.Remote */:
                useFlow &&= flow.options.supportsRemoteExtensionHost;
                break;
            case 0 /* ExtensionHost.WebWorker */:
                useFlow &&= flow.options.supportsWebWorkerExtensionHost;
                break;
        }
        if (!config_1.Config.gitHubClientSecret) {
            useFlow &&= flow.options.supportsNoClientSecret;
        }
        if (query.isSupportedClient) {
            // TODO: revisit how we support PAT in GHES but not DotCom... but this works for now since
            // there isn't another flow that has supportsSupportedClients = false
            useFlow &&= (flow.options.supportsSupportedClients || query.target !== 0 /* GitHubTarget.DotCom */);
        }
        else {
            useFlow &&= flow.options.supportsUnsupportedClients;
        }
        return useFlow;
    });
    const preferDeviceCodeFlow = vscode_1.workspace.getConfiguration('github-authentication').get('preferDeviceCodeFlow', false);
    if (preferDeviceCodeFlow) {
        return [
            ...validFlows.filter(flow => flow instanceof DeviceCodeFlow),
            ...validFlows.filter(flow => !(flow instanceof DeviceCodeFlow))
        ];
    }
    return validFlows;
}
function isSocialSignInProvider(provider) {
    return provider === "google" /* GitHubSocialSignInProvider.Google */ || provider === "apple" /* GitHubSocialSignInProvider.Apple */;
}
//# sourceMappingURL=flows.js.map