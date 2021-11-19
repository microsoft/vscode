/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { window, languages, Uri, LanguageStatusSeverity, Disposable, commands, QuickPickItem } from 'vscode';
import { JSONLanguageStatus } from './jsonClient';

import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export function createLanguageStatusItem(documentSelector: string[], statusRequest: (uri: string) => Promise<JSONLanguageStatus>): Disposable {
	const statusItem = languages.createLanguageStatusItem('json.projectStatus', documentSelector);
	statusItem.name = localize('statusItem.name', "JSON Validation Status");
	statusItem.severity = LanguageStatusSeverity.Information;

	const showSchemasCommand = commands.registerCommand('_json.showAssociatedSchemaList', arg => {
		const items = arg.schemas.sort().map((a: string) => ({ label: a }));
		const quickPick = window.createQuickPick<QuickPickItem>();
		quickPick.title = localize('schemaPicker.title', 'Associated JSON Schemas');
		quickPick.placeholder = localize('schemaPicker.placeholder', 'Select the schema to open');
		quickPick.items = items;
		quickPick.show();
		quickPick.onDidAccept(() => {
			const selectedSchema = quickPick.selectedItems[0].label;
			commands.executeCommand('vscode.open', Uri.parse(selectedSchema));
			quickPick.dispose();
		});
	});

	const activeEditorListener = window.onDidChangeActiveTextEditor(() => {
		updateLanguageStatus();
	});

	async function updateLanguageStatus() {
		const document = window.activeTextEditor?.document;
		if (document && documentSelector.indexOf(document.languageId) !== -1) {
			try {
				statusItem.text = '$(loading~spin)';
				statusItem.detail = localize('pending.detail', 'Loading JSON info');
				statusItem.command = undefined;

				const schemas = (await statusRequest(document.uri.toString())).schemas;
				statusItem.detail = undefined;
				if (schemas.length === 0) {
					statusItem.text = localize('status.noSchema', 'Validated without JSON schema');
				} else if (schemas.length === 1) {
					statusItem.text = localize('status.singleSchema', 'Validated with JSON schema');
					statusItem.command = {
						command: 'vscode.open',
						title: localize('status.openSchemaLink', 'Open Schema'),
						tooltip: schemas[0],
						arguments: [Uri.parse(schemas[0])]
					};
				} else {
					statusItem.text = localize('status.multipleSchema', 'Validated with multiple JSON schemas');
					statusItem.command = {
						command: '_json.showAssociatedSchemaList',
						title: localize('status.openSchemasLink', 'Show Schemas'),
						arguments: [{ schemas }]
					};
				}
			} catch (e) {
				statusItem.text = localize('status.error', 'Unable to compute used schemas');
				statusItem.detail = undefined;
				statusItem.command = undefined;
				console.log(e);
			}
		} else {
			statusItem.text = localize('status.notJSON', 'Not a JSON editor');
			statusItem.detail = undefined;
			statusItem.command = undefined;
		}
	}

	updateLanguageStatus();

	return Disposable.from(statusItem, activeEditorListener, showSchemasCommand);
}



