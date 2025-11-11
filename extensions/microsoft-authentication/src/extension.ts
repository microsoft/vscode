/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, ExtensionContext, l10n, window, workspace } from 'vscode';
import * as extensionV2 from './extensionV2';
import { MicrosoftAuthenticationTelemetryReporter } from './common/telemetryReporter';

let implementation: 'msal' | 'msal-no-broker' = 'msal';
const getImplementation = () => workspace.getConfiguration('microsoft-authentication').get<'msal' | 'msal-no-broker'>('implementation') ?? 'msal';

export async function activate(context: ExtensionContext) {
	const mainTelemetryReporter = new MicrosoftAuthenticationTelemetryReporter(context.extension.packageJSON.aiKey);
	implementation = getImplementation();
	context.subscriptions.push(workspace.onDidChangeConfiguration(async e => {
		if (!e.affectsConfiguration('microsoft-authentication')) {
			return;
		}
		if (implementation === getImplementation()) {
			return;
		}

		// Allow for the migration to be re-attempted if the user switches back to the MSAL implementation
		context.globalState.update('msalMigration', undefined);

		const reload = l10n.t('Reload');
		const result = await window.showInformationMessage(
			'Reload required',
			{
				modal: true,
				detail: l10n.t('Microsoft Account configuration has been changed.'),
			},
			reload
		);

		if (result === reload) {
			commands.executeCommand('workbench.action.reloadWindow');
		}
	}));

	switch (implementation) {
		case 'msal-no-broker':
			mainTelemetryReporter.sendActivatedWithMsalNoBrokerEvent();
			await extensionV2.activate(context, mainTelemetryReporter);
			break;
		case 'msal':
		default:
			await extensionV2.activate(context, mainTelemetryReporter);
			break;
	}
}

export function deactivate() {
	extensionV2.deactivate();
}
