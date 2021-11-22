/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { window, languages, Uri, LanguageStatusSeverity, Disposable, commands, QuickPickItem, extensions, workspace } from 'vscode';
import { JSONLanguageStatus } from './jsonClient';

import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

type ShowSchemasInput = {
	schemas: string[];
	uri: string;
};

interface ShowSchemasItem extends QuickPickItem {
	uri: Uri;
}

function equalsIgnoreCase(a: string, b: string): boolean {
	return a.length === b.length && a.toLowerCase().localeCompare(b.toLowerCase()) === 0;
}

function isEqualAuthority(a1: string | undefined, a2: string | undefined) {
	return a1 === a2 || (a1 !== undefined && a2 !== undefined && equalsIgnoreCase(a1, a2));
}

function findExtension(uri: Uri) {
	for (const ext of extensions.all) {
		const parent = ext.extensionUri;
		if (uri.scheme === parent.scheme && isEqualAuthority(uri.authority, parent.authority) && uri.path.startsWith(parent.path + '/')) {
			return ext;
		}
	}
	return undefined;
}

function findWorkspaceFolder(uri: Uri) {
	if (workspace.workspaceFolders) {
		for (const wf of workspace.workspaceFolders) {
			const parent = wf.uri;
			if (uri.scheme === parent.scheme && isEqualAuthority(uri.authority, parent.authority) && uri.path.startsWith(parent.path + '/')) {
				return wf;
			}
		}
	}
	return undefined;
}

function renderShowSchemasItem(schema: string): ShowSchemasItem {
	const uri = Uri.parse(schema);
	const extension = findExtension(uri);
	if (extension) {
		return { label: extension.id, description: uri.path.substring(extension.extensionUri.path.length + 1), uri };
	}
	const wf = findWorkspaceFolder(uri);
	if (wf) {
		return { label: uri.path.substring(wf.uri.path.length + 1), description: 'Workspace', uri };
	}
	if (uri.scheme === 'file') {
		return { label: uri.fsPath, uri };
	} else if (uri.scheme === 'vscode') {
		return { label: schema, description: 'internally generated', uri };
	}
	return { label: schema, uri };
}


export function createLanguageStatusItem(documentSelector: string[], statusRequest: (uri: string) => Promise<JSONLanguageStatus>): Disposable {
	const statusItem = languages.createLanguageStatusItem('json.projectStatus', documentSelector);
	statusItem.name = localize('statusItem.name', "JSON Validation Status");
	statusItem.severity = LanguageStatusSeverity.Information;

	const showSchemasCommand = commands.registerCommand('_json.showAssociatedSchemaList', (arg: ShowSchemasInput) => {
		const items: ShowSchemasItem[] = arg.schemas.sort().map(renderShowSchemasItem);
		const quickPick = window.createQuickPick<ShowSchemasItem>();
		quickPick.title = localize('schemaPicker.title', 'JSON Schemas used for {0}', arg.uri.toString());
		quickPick.placeholder = localize('schemaPicker.placeholder', 'Select the schema to open');
		quickPick.items = items;
		quickPick.show();
		quickPick.onDidAccept(() => {
			commands.executeCommand('vscode.open', quickPick.selectedItems[0].uri);
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
					const item = renderShowSchemasItem(schemas[0]);
					statusItem.text = localize('status.singleSchema', 'Validated with JSON schema');
					statusItem.command = {
						command: 'vscode.open',
						title: localize('status.openSchemaLink', 'Open Schema'),
						tooltip: item.description ? `${item.label} - ${item.description}` : item.label,
						arguments: [item.uri]
					};
				} else {
					statusItem.text = localize('status.multipleSchema', 'Validated with multiple JSON schemas');
					statusItem.command = {
						command: '_json.showAssociatedSchemaList',
						title: localize('status.openSchemasLink', 'Show Schemas'),
						arguments: [{ schemas, uri: document.uri.toString() } as ShowSchemasInput]
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

