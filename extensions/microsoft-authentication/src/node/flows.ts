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

const redirectUri = 'https://vscode.dev/redirect';

export const enum ExtensionHost {
	WebWorker,
	Remote,
	Local
}

interface IMsalFlowOptions {
	supportsRemoteExtensionHost: boolean;
	supportsWebWorkerExtensionHost: boolean;
}

interface IMsalFlowTriggerOptions {
	cachedPca: ICachedPublicClientApplication;
	authority: string;
	scopes: string[];
	loginHint?: string;
	windowHandle?: Buffer;
	logger: LogOutputChannel;
	uriHandler: UriEventHandler;
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
		supportsWebWorkerExtensionHost: false
	};

	async trigger({ cachedPca, authority, scopes, loginHint, windowHandle, logger }: IMsalFlowTriggerOptions): Promise<AuthenticationResult> {
		logger.info('Trying default msal flow...');
		return await cachedPca.acquireTokenInteractive({
			openBrowser: async (url: string) => { await env.openExternal(Uri.parse(url)); },
			scopes,
			authority,
			successTemplate: loopbackTemplate,
			errorTemplate: loopbackTemplate,
			loginHint,
			prompt: loginHint ? undefined : 'select_account',
			windowHandle
		});
	}
}

class UrlHandlerFlow implements IMsalFlow {
	label = 'protocol handler';
	options: IMsalFlowOptions = {
		supportsRemoteExtensionHost: true,
		supportsWebWorkerExtensionHost: false
	};

	async trigger({ cachedPca, authority, scopes, loginHint, windowHandle, logger, uriHandler }: IMsalFlowTriggerOptions): Promise<AuthenticationResult> {
		logger.info('Trying protocol handler flow...');
		const loopbackClient = new UriHandlerLoopbackClient(uriHandler, redirectUri, logger);
		return await cachedPca.acquireTokenInteractive({
			openBrowser: (url: string) => loopbackClient.openBrowser(url),
			scopes,
			authority,
			loopbackClient,
			loginHint,
			prompt: loginHint ? undefined : 'select_account',
			windowHandle
		});
	}
}

const allFlows: IMsalFlow[] = [
	new DefaultLoopbackFlow(),
	new UrlHandlerFlow()
];

export interface IMsalFlowQuery {
	extensionHost: ExtensionHost;
}

export function getMsalFlows(query: IMsalFlowQuery): IMsalFlow[] {
	return allFlows.filter(flow => {
		let useFlow: boolean = true;
		switch (query.extensionHost) {
			case ExtensionHost.Remote:
				useFlow &&= flow.options.supportsRemoteExtensionHost;
				break;
			case ExtensionHost.WebWorker:
				useFlow &&= flow.options.supportsWebWorkerExtensionHost;
				break;
		}
		return useFlow;
	});
}
