/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AzureActiveDirectoryService, onDidChangeSessions } from './AADHelper';
import TelemetryReporter from '@vscode/extension-telemetry';

export async function activate(context: vscode.ExtensionContext) {
	const { name, version, aiKey } = context.extension.packageJSON as { name: string; version: string; aiKey: string };
	const telemetryReporter = new TelemetryReporter(name, version, aiKey);

	const loginService = new AzureActiveDirectoryService(context);
	await loginService.initialize();

	context.subscriptions.push(vscode.authentication.registerAuthenticationProvider('microsoft', 'Microsoft', {
		onDidChangeSessions: onDidChangeSessions.event,
		getSessions: (scopes: string[]) => loginService.getSessions(scopes),
		createSession: async (scopes: string[]) => {
			try {
				/* __GDPR__
					"login" : {
						"scopes": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
					}
				*/
				telemetryReporter.sendTelemetryEvent('login', {
					// Get rid of guids from telemetry.
					scopes: JSON.stringify(scopes.map(s => s.replace(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i, '{guid}'))),
				});

				const session = await loginService.createSession(scopes.sort());
				onDidChangeSessions.fire({ added: [session], removed: [], changed: [] });
				return session;
			} catch (e) {
				/* __GDPR__
					"loginFailed" : { }
				*/
				telemetryReporter.sendTelemetryEvent('loginFailed');

				throw e;
			}
		},
		removeSession: async (id: string) => {
			try {
				/* __GDPR__
					"logout" : { }
				*/
				telemetryReporter.sendTelemetryEvent('logout');

				const session = await loginService.removeSessionById(id);
				if (session) {
					onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
				}
			} catch (e) {
				/* __GDPR__
					"logoutFailed" : { }
				*/
				telemetryReporter.sendTelemetryEvent('logoutFailed');
			}
		}
	}, { supportsMultipleAccounts: true }));

	return;
}

// this method is called when your extension is deactivated
export function deactivate() { }
