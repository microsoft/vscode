/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AzureActiveDirectoryService } from './AADHelper';
import { UriEventHandler } from './UriEventHandler';
import TelemetryReporter from '@vscode/extension-telemetry';

export async function activate(context: vscode.ExtensionContext) {
	const { name, version, aiKey } = context.extension.packageJSON as { name: string; version: string; aiKey: string };
	const telemetryReporter = new TelemetryReporter(aiKey);

	const uriHandler = new UriEventHandler();
	context.subscriptions.push(uriHandler);
	context.subscriptions.push(vscode.window.registerUriHandler(uriHandler));

	const loginService = new AzureActiveDirectoryService(context, uriHandler);
	await loginService.initialize();

	context.subscriptions.push(vscode.authentication.registerAuthenticationProvider('microsoft', 'Microsoft', {
		onDidChangeSessions: loginService.onDidChangeSessions,
		getSessions: (scopes: string[]) => loginService.getSessions(scopes),
		createSession: async (scopes: string[]) => {
			try {
				/* __GDPR__
					"login" : {
						"owner": "TylerLeonhardt",
						"comment": "Used to determine the usage of the Microsoft Auth Provider.",
						"scopes": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight", "comment": "Used to determine what scope combinations are being requested." }
					}
				*/
				telemetryReporter.sendTelemetryEvent('login', {
					// Get rid of guids from telemetry.
					scopes: JSON.stringify(scopes.map(s => s.replace(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i, '{guid}'))),
				});

				return await loginService.createSession(scopes.sort());
			} catch (e) {
				/* __GDPR__
					"loginFailed" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users run into issues with the login flow." }
				*/
				telemetryReporter.sendTelemetryEvent('loginFailed');

				throw e;
			}
		},
		removeSession: async (id: string) => {
			try {
				/* __GDPR__
					"logout" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users log out." }
				*/
				telemetryReporter.sendTelemetryEvent('logout');

				await loginService.removeSessionById(id);
			} catch (e) {
				/* __GDPR__
					"logoutFailed" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often fail to log out." }
				*/
				telemetryReporter.sendTelemetryEvent('logoutFailed');
			}
		}
	}, { supportsMultipleAccounts: true }));

	return;
}

// this method is called when your extension is deactivated
export function deactivate() { }
