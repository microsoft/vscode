/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthenticationResult } from '@azure/msal-node';
import { Uri, LogOutputChannel, env } from 'vscode';
import { ICachedPublicClientApplication } from '../common/publicClientCache';
import { UriHandlerLoopbackClient } from '../common/loopbackClientAndOpener';
import { UriEventHandler } from '../UriEventHandler';
import { loopbackTemplate } from './loopbackTemplate';
import { Config } from '../common/config';

const DEFAULT_REDIRECT_URI = 'https://vscode.dev/redirect';

export const enum ExtensionHost {
	WebWorker,
	Remote,
	Local
}

interface IMsalFlowOptions {
	supportsRemoteExtensionHost: boolean;
	supportsWebWorkerExtensionHost: boolean;
	supportsUnsupportedClient: boolean;
	supportsBroker: boolean;
}

interface IMsalFlowTriggerOptions {
	cachedPca: ICachedPublicClientApplication;
	authority: string;
	scopes: string[];
	callbackUri: Uri;
	loginHint?: string;
	windowHandle?: Buffer;
	logger: LogOutputChannel;
	uriHandler: UriEventHandler;
	claims?: string;
}

interface IMsalFlow {
	readonly label: string;
	readonly options: IMsalFlowOptions;
	trigger(options: IMsalFlowTriggerOptions): Promise<AuthenticationResult>;
}

class DefaultLoopbackFlow implements IMsalFlow {
	label = 'default';
	options: IMsalFlowOptions = {
		supportsRemoteExtensionHost: false,
		supportsWebWorkerExtensionHost: false,
		supportsUnsupportedClient: true,
		supportsBroker: true
	};

	async trigger({ cachedPca, authority, scopes, claims, loginHint, windowHandle, logger }: IMsalFlowTriggerOptions): Promise<AuthenticationResult> {
		logger.info('Trying default msal flow...');
		let redirectUri: string | undefined;
		if (cachedPca.isBrokerAvailable && process.platform === 'darwin') {
			redirectUri = Config.macOSBrokerRedirectUri;
		}
		return await cachedPca.acquireTokenInteractive({
			openBrowser: async (url: string) => { await env.openExternal(Uri.parse(url)); },
			scopes,
			authority,
			successTemplate: loopbackTemplate,
			errorTemplate: loopbackTemplate,
			loginHint,
			prompt: loginHint ? undefined : 'select_account',
			windowHandle,
			claims,
			redirectUri
		});
	}
}

class UrlHandlerFlow implements IMsalFlow {
	label = 'protocol handler';
	options: IMsalFlowOptions = {
		supportsRemoteExtensionHost: true,
		supportsWebWorkerExtensionHost: false,
		supportsUnsupportedClient: false,
		supportsBroker: false
	};

	async trigger({ cachedPca, authority, scopes, claims, loginHint, windowHandle, logger, uriHandler, callbackUri }: IMsalFlowTriggerOptions): Promise<AuthenticationResult> {
		logger.info('Trying protocol handler flow...');
		const loopbackClient = new UriHandlerLoopbackClient(uriHandler, DEFAULT_REDIRECT_URI, callbackUri, logger);
		let redirectUri: string | undefined;
		if (cachedPca.isBrokerAvailable && process.platform === 'darwin') {
			redirectUri = Config.macOSBrokerRedirectUri;
		}
		return await cachedPca.acquireTokenInteractive({
			openBrowser: (url: string) => loopbackClient.openBrowser(url),
			scopes,
			authority,
			loopbackClient,
			loginHint,
			prompt: loginHint ? undefined : 'select_account',
			windowHandle,
			claims,
			redirectUri
		});
	}
}

class DeviceCodeFlow implements IMsalFlow {
	label = 'device code';
	options: IMsalFlowOptions = {
		supportsRemoteExtensionHost: true,
		supportsWebWorkerExtensionHost: false,
		supportsUnsupportedClient: true,
		supportsBroker: false
	};

	async trigger({ cachedPca, authority, scopes, claims, logger }: IMsalFlowTriggerOptions): Promise<AuthenticationResult> {
		logger.info('Trying device code flow...');
		const result = await cachedPca.acquireTokenByDeviceCode({ scopes, authority, claims });
		if (!result) {
			throw new Error('Device code flow did not return a result');
		}
		return result;
	}
}

const allFlows: IMsalFlow[] = [
	new DefaultLoopbackFlow(),
	new UrlHandlerFlow(),
	new DeviceCodeFlow()
];

export interface IMsalFlowQuery {
	extensionHost: ExtensionHost;
	supportedClient: boolean;
	isBrokerSupported: boolean;
}

export function getMsalFlows(query: IMsalFlowQuery): IMsalFlow[] {
	const flows = [];
	for (const flow of allFlows) {
		let useFlow: boolean = true;
		switch (query.extensionHost) {
			case ExtensionHost.Remote:
				useFlow &&= flow.options.supportsRemoteExtensionHost;
				break;
			case ExtensionHost.WebWorker:
				useFlow &&= flow.options.supportsWebWorkerExtensionHost;
				break;
		}
		useFlow &&= flow.options.supportsBroker || !query.isBrokerSupported;
		useFlow &&= flow.options.supportsUnsupportedClient || query.supportedClient;
		if (useFlow) {
			flows.push(flow);
		}
	}
	return flows;
}
