/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
//import * as nls from 'vscode-nls';
import * as util from 'util';

const trackers = new Set<string>();

const PATTERN = 'listening on.* (https?://\\S+|[0-9]+)'; // matches "listening on port 3000" or "Now listening on: https://localhost:5001"
const URI_FORMAT = 'http://localhost:%s';
const WEB_ROOT = '${workspaceFolder}';

interface ServerReadyAction {
	pattern: string;
	action?: 'openExternally' | 'debugWithChrome';
	uriFormat?: string;
	webRoot?: string;
}

export function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('*', {
		resolveDebugConfiguration(_folder: vscode.WorkspaceFolder | undefined, debugConfiguration: vscode.DebugConfiguration) {
			const args: ServerReadyAction = debugConfiguration.serverReadyAction;
			if (debugConfiguration.type && args) {
				startTrackerForType(context, debugConfiguration.type);
			}
			return debugConfiguration;
		}
	}));
}

function startTrackerForType(context: vscode.ExtensionContext, type: string) {

	if (!trackers.has(type)) {
		trackers.add(type);

		// scan debug console output for a PORT message
		context.subscriptions.push(vscode.debug.registerDebugAdapterTrackerFactory(type, {
			createDebugAdapterTracker(session: vscode.DebugSession) {
				const args: ServerReadyAction = session.configuration.serverReadyAction;
				if (args) {
					const regexp = new RegExp(args.pattern || PATTERN);
					let hasFired = false;
					return {
						onDidSendMessage: m => {
							if (!hasFired && m.type === 'event' && m.event === 'output' && m.body.output) {
								const result = regexp.exec(m.body.output);
								if (result && result.length === 2) {
									openExternalWithString(session, result[1]);
									hasFired = true;
								}
							}
						}
					};
				}
				return undefined;
			}
		}));
	}
}

function openExternalWithString(session: vscode.DebugSession, portOrUriString: string) {

	if (portOrUriString) {
		if (/^[0-9]+$/.test(portOrUriString)) {
			const args: ServerReadyAction = session.configuration.serverReadyAction;
			portOrUriString = util.format(args.uriFormat || URI_FORMAT, portOrUriString);
		}
		openExternalWithUri(session, portOrUriString);
	}
}

function openExternalWithUri(session: vscode.DebugSession, uri: string) {

	const args: ServerReadyAction = session.configuration.serverReadyAction;
	switch (args.action || 'openExternally') {
		case 'openExternally':
			vscode.env.openExternal(vscode.Uri.parse(uri));
			break;
		case 'debugWithChrome':
			vscode.debug.startDebugging(session.workspaceFolder, {
				type: 'chrome',
				name: 'Chrome Debug',
				request: 'launch',
				url: uri,
				webRoot: args.webRoot || WEB_ROOT
			});
			break;
		default:
			// not supported
			break;
	}
}
