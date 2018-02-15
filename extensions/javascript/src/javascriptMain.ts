/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { addJSONProviders } from './features/jsonContributions';
import * as httpRequest from 'request-light';

import { ExtensionContext, workspace } from 'vscode';

export function activate(context: ExtensionContext): any {
	configureHttpRequest();
	workspace.onDidChangeConfiguration(() => configureHttpRequest());

	context.subscriptions.push(addJSONProviders(httpRequest.xhr));
}

function configureHttpRequest() {
	const httpSettings = workspace.getConfiguration('http');
	httpRequest.configure(httpSettings.get<string>('proxy', ''), httpSettings.get<boolean>('proxyStrictSSL', true));
}
