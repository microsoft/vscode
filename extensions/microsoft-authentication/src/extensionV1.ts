/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Environment, EnvironmentParameters } from '@azure/ms-rest-azure-env';
import { AzureActiveDirectoryService, IStoredSession } from './AADHelper';
import { BetterTokenStorage } from './betterSecretStorage';
import { UriEventHandler } from './UriEventHandler';
import TelemetryReporter from '@vscode/extension-telemetry';
import Logger from './logger';

async function initMicrosoftSovereignCloudAuthProvider(context: vscode.ExtensionContext, telemetryReporter: TelemetryReporter, uriHandler: UriEventHandler, tokenStorage: BetterTokenStorage<IStoredSession>): Promise<vscode.Disposable | undefined> {
	const environment = vscode.workspace.getConfiguration('microsoft-sovereign-cloud').get<string | undefined>('environment');
	let authProviderName: string | undefined;
	if (!environment) {
		return undefined;
	}

	if (environment === 'custom') {
		const customEnv = vscode.workspace.getConfiguration('microsoft-sovereign-cloud').get<EnvironmentParameters>('customEnvironment');
		if (!customEnv) {
			const res = await vscode.window.showErrorMessage(vscode.l10n.t('You must also specify a custom environment in order to use the custom environment auth provider.'), vscode.l10n.t('Open settings'));
			if (res) {
				await vscode.commands.executeCommand('workbench.action.openSettingsJson', 'microsoft-sovereign-cloud.customEnvironment');
			}
			return undefined;
		}
		try {
			Environment.add(customEnv);
		} catch (e) {
			const res = await vscode.window.showErrorMessage(vscode.l10n.t('Error validating custom environment setting: {0}', e.message), vscode.l10n.t('Open settings'));
			if (res) {
				await vscode.commands.executeCommand('workbench.action.openSettings', 'microsoft-sovereign-cloud.customEnvironment');
			}
			return undefined;
		}
		authProviderName = customEnv.name;
	} else {
		authProviderName = environment;
	}

	const env = Environment.get(authProviderName);
	if (!env) {
		const res = await vscode.window.showErrorMessage(vscode.l10n.t('The environment `{0}` is not a valid environment.', authProviderName), vscode.l10n.t('Open settings'));
		return undefined;
	}

	const aadService = new AzureActiveDirectoryService(
		vscode.window.createOutputChannel(vscode.l10n.t('Microsoft Sovereign Cloud Authentication'), { log: true }),
		context,
		uriHandler,
		tokenStorage,
		telemetryReporter,
		env);
	await aadService.initialize();

	const disposable = vscode.authentication.registerAuthenticationProvider('microsoft-sovereign-cloud', authProviderName, {
		onDidChangeSessions: aadService.onDidChangeSessions,
		getSessions: (scopes: string[]) => aadService.getSessions(scopes),
		createSession: async (scopes: string[]) => {
			try {
				/* __GDPR__
					"loginMicrosoftSovereignCloud" : {
						"owner": "TylerLeonhardt",
						"comment": "Used to determine the usage of the Microsoft Sovereign Cloud Auth Provider.",
						"scopes": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight", "comment": "Used to determine what scope combinations are being requested." }
					}
				*/
				telemetryReporter.sendTelemetryEvent('loginMicrosoftSovereignCloud', {
					// Get rid of guids from telemetry.
					scopes: JSON.stringify(scopes.map(s => s.replace(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i, '{guid}'))),
				});

				return await aadService.createSession(scopes);
			} catch (e) {
				/* __GDPR__
					"loginMicrosoftSovereignCloudFailed" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users run into issues with the login flow." }
				*/
				telemetryReporter.sendTelemetryEvent('loginMicrosoftSovereignCloudFailed');

				throw e;
			}
		},
		removeSession: async (id: string) => {
			try {
				/* __GDPR__
					"logoutMicrosoftSovereignCloud" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users log out." }
				*/
				telemetryReporter.sendTelemetryEvent('logoutMicrosoftSovereignCloud');

				await aadService.removeSessionById(id);
			} catch (e) {
				/* __GDPR__
					"logoutMicrosoftSovereignCloudFailed" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often fail to log out." }
				*/
				telemetryReporter.sendTelemetryEvent('logoutMicrosoftSovereignCloudFailed');
			}
		}
	}, { supportsMultipleAccounts: true });

	context.subscriptions.push(disposable);
	return disposable;
}

export async function activate(context: vscode.ExtensionContext, telemetryReporter: TelemetryReporter) {
	// If we ever activate the old flow, then mark that we will need to migrate when the user upgrades to v2.
	// TODO: MSAL Migration. Remove this when we remove the old flow.
	context.globalState.update('msalMigration', false);

	const uriHandler = new UriEventHandler();
	context.subscriptions.push(uriHandler);
	const betterSecretStorage = new BetterTokenStorage<IStoredSession>('microsoft.login.keylist', context);

	const loginService = new AzureActiveDirectoryService(
		Logger,
		context,
		uriHandler,
		betterSecretStorage,
		telemetryReporter,
		Environment.AzureCloud);
	await loginService.initialize();

	context.subscriptions.push(vscode.authentication.registerAuthenticationProvider(
		'microsoft',
		'Microsoft',
		{
			onDidChangeSessions: loginService.onDidChangeSessions,
			getSessions: (scopes: string[], options?: vscode.AuthenticationProviderSessionOptions) => loginService.getSessions(scopes, options),
			createSession: async (scopes: string[], options?: vscode.AuthenticationProviderSessionOptions) => {
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

					return await loginService.createSession(scopes, options);
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
		},
		{
			supportsMultipleAccounts: true,
			supportedAuthorizationServers: [
				vscode.Uri.parse('https://login.microsoftonline.com/*'),
				vscode.Uri.parse('https://login.microsoftonline.com/*/v2.0')
			]
		}
	));

	let microsoftSovereignCloudAuthProviderDisposable = await initMicrosoftSovereignCloudAuthProvider(context, telemetryReporter, uriHandler, betterSecretStorage);

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async e => {
		if (e.affectsConfiguration('microsoft-sovereign-cloud')) {
			microsoftSovereignCloudAuthProviderDisposable?.dispose();
			microsoftSovereignCloudAuthProviderDisposable = await initMicrosoftSovereignCloudAuthProvider(context, telemetryReporter, uriHandler, betterSecretStorage);
		}
	}));

	return;
}

// this method is called when your extension is deactivated
export function deactivate() { }
