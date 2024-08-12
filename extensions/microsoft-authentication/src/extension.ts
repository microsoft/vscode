/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, ExtensionContext, l10n, window, workspace } from 'vscode';
import * as extensionV1 from './extensionV1';
import * as extensionV2 from './extensionV2';

const config = workspace.getConfiguration('microsoft');
const useMsal = config.get<boolean>('useMsal', false);

export async function activate(context: ExtensionContext) {
	context.subscriptions.push(workspace.onDidChangeConfiguration(async e => {
		if (!e.affectsConfiguration('microsoft.useMsal') && useMsal === config.get<boolean>('useMsal', false)) {
			return;
		}

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
	// Only activate the new extension if we are not running in a browser environment
	if (useMsal && typeof navigator === 'undefined') {
		await extensionV2.activate(context);
	} else {
		await extensionV1.activate(context);
	}
}

export function deactivate() {
	if (useMsal) {
		extensionV2.deactivate();
	} else {
		extensionV1.deactivate();
	}
}
