/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { addJSONProviders } from './features/jsonContributions';
import * as httpRequest from 'request-light';

import { ExtensionContext, env, workspace } from 'vscode';

import * as nls from 'vscode-nls';

export function activate(context: ExtensionContext): any {
	nls.config({ locale: env.language });

	configureHttpRequest();
	workspace.onDidChangeConfiguration(e => configureHttpRequest());

	context.subscriptions.push(addJSONProviders(httpRequest.xhr));
}

function configureHttpRequest() {
	let httpSettings = workspace.getConfiguration('http');
	httpRequest.configure(httpSettings.get<string>('proxy'), httpSettings.get<boolean>('proxyStrictSSL'));
}
