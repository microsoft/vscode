/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	window, languages, Uri, Disposable, commands, QuickPickItem,
	extensions, workspace, Extension, WorkspaceFolder, QuickPickItemKind,
	ThemeIcon, TextDocument, LanguageStatusSeverity, l10n, DocumentSelector
} from 'vscode';
import { JSONLanguageStatus, JSONSchemaSettings } from './jsonClient';

type ShowSchemasInput = {
	schemas: string[];
	uri: string;
};

interface ShowSchemasItem extends QuickPickItem {
	uri?: Uri;
	buttonCommands?: (() => void)[];
}

function getExtensionSchemaAssociations() {
	const associations: { fullUri: string; extension: Extension<any>; label: string }[] = [];

	for (const extension of extensions.all) {
		const jsonValidations = extension.packageJSON?.contributes?.jsonValidation;
		if (Array.isArray(jsonValidations)) {
			for (const jsonValidation of jsonValidations) {
				let uri = jsonValidation.url;
				if (typeof uri === 'string') {
					if (uri[0] === '.' && uri[1] === '/') {
						uri = Uri.joinPath(extension.extensionUri, uri).toString(false);
					}
					associations.push({ fullUri: uri, extension, label: jsonValidation.url });
				}
			}
		}
	}
	return {
		findExtension(uri: string): ShowSchemasItem | undefined {
			for (const association of associations) {
				if (association.fullUri === uri) {
					return {
						label: association.label,
						detail: l10n.t('Configured by extension: {0}', association.extension.id),
						uri: Uri.parse(association.fullUri),
						buttons: [{ iconPath: new ThemeIcon('extensions'), tooltip: l10n.t('Open Extension') }],
						buttonCommands: [() => commands.executeCommand('workbench.extensions.action.showExtensionsWithIds', [[association.extension.id]])]
					};
				}
			}
			return undefined;
		}
	};
}

//

function getSettingsSchemaAssociations(uri: string) {
	const resourceUri = Uri.parse(uri);
	const workspaceFolder = workspace.getWorkspaceFolder(resourceUri);

	const settings = workspace.getConfiguration('json', resourceUri).inspect<JSONSchemaSettings[]>('schemas');

	const associations: { fullUri: string; workspaceFolder: WorkspaceFolder | undefined; label: string }[] = [];

	const folderSettingSchemas = settings?.workspaceFolderValue;
	if (workspaceFolder && Array.isArray(folderSettingSchemas)) {
		for (const setting of folderSettingSchemas) {
			const uri = setting.url;
			if (typeof uri === 'string') {
				let fullUri = uri;
				if (uri[0] === '.' && uri[1] === '/') {
					fullUri = Uri.joinPath(workspaceFolder.uri, uri).toString(false);
				}
				associations.push({ fullUri, workspaceFolder, label: uri });
			}
		}
	}
	const userSettingSchemas = settings?.globalValue;
	if (Array.isArray(userSettingSchemas)) {
		for (const setting of userSettingSchemas) {
			const uri = setting.url;
			if (typeof uri === 'string') {
				let fullUri = uri;
				if (workspaceFolder && uri[0] === '.' && uri[1] === '/') {
					fullUri = Uri.joinPath(workspaceFolder.uri, uri).toString(false);
				}
				associations.push({ fullUri, workspaceFolder: undefined, label: uri });
			}
		}
	}
	return {
		findSetting(uri: string): ShowSchemasItem | undefined {
			for (const association of associations) {
				if (association.fullUri === uri) {
					return {
						label: association.label,
						detail: association.workspaceFolder ? l10n.t('Configured in workspace settings') : l10n.t('Configured in user settings'),
						uri: Uri.parse(association.fullUri),
						buttons: [{ iconPath: new ThemeIcon('gear'), tooltip: l10n.t('Open Settings') }],
						buttonCommands: [() => commands.executeCommand(association.workspaceFolder ? 'workbench.action.openWorkspaceSettingsFile' : 'workbench.action.openSettingsJson', ['json.schemas'])]
					};
				}
			}
			return undefined;
		}
	};
}

function showSchemaList(input: ShowSchemasInput) {

	const extensionSchemaAssocations = getExtensionSchemaAssociations();
	const settingsSchemaAssocations = getSettingsSchemaAssociations(input.uri);

	const extensionEntries = [];
	const settingsEntries = [];
	const otherEntries = [];

	for (const schemaUri of input.schemas) {
		const extensionEntry = extensionSchemaAssocations.findExtension(schemaUri);
		if (extensionEntry) {
			extensionEntries.push(extensionEntry);
			continue;
		}
		const settingsEntry = settingsSchemaAssocations.findSetting(schemaUri);
		if (settingsEntry) {
			settingsEntries.push(settingsEntry);
			continue;
		}
		otherEntries.push({ label: schemaUri, uri: Uri.parse(schemaUri) });
	}

	const items: ShowSchemasItem[] = [...extensionEntries, ...settingsEntries, ...otherEntries];
	if (items.length === 0) {
		items.push({
			label: l10n.t('No schema configured for this file'),
			buttons: [{ iconPath: new ThemeIcon('gear'), tooltip: l10n.t('Open Settings') }],
			buttonCommands: [() => commands.executeCommand('workbench.action.openSettingsJson', ['json.schemas'])]
		});
	}

	items.push({ label: '', kind: QuickPickItemKind.Separator });
	items.push({ label: l10n.t('Learn more about JSON schema configuration...'), uri: Uri.parse('https://code.visualstudio.com/docs/languages/json#_json-schemas-and-settings') });

	const quickPick = window.createQuickPick<ShowSchemasItem>();
	quickPick.placeholder = items.length ? l10n.t('Select the schema to use for {0}', input.uri) : undefined;
	quickPick.items = items;
	quickPick.show();
	quickPick.onDidAccept(() => {
		const uri = quickPick.selectedItems[0].uri;
		if (uri) {
			commands.executeCommand('vscode.open', uri);
			quickPick.dispose();
		}
	});
	quickPick.onDidTriggerItemButton(b => {
		const index = b.item.buttons?.indexOf(b.button);
		if (index !== undefined && index >= 0 && b.item.buttonCommands && b.item.buttonCommands[index]) {
			b.item.buttonCommands[index]();
		}
	});
}

export function createLanguageStatusItem(documentSelector: DocumentSelector, statusRequest: (uri: string) => Promise<JSONLanguageStatus>): Disposable {
	const statusItem = languages.createLanguageStatusItem('json.projectStatus', documentSelector);
	statusItem.name = l10n.t('JSON Validation Status');
	statusItem.severity = LanguageStatusSeverity.Information;

	const showSchemasCommand = commands.registerCommand('_json.showAssociatedSchemaList', showSchemaList);

	const activeEditorListener = window.onDidChangeActiveTextEditor(() => {
		updateLanguageStatus();
	});

	async function updateLanguageStatus() {
		const document = window.activeTextEditor?.document;
		if (document) {
			try {
				statusItem.text = '$(loading~spin)';
				statusItem.detail = l10n.t('Loading JSON info');
				statusItem.command = undefined;

				const schemas = (await statusRequest(document.uri.toString())).schemas;
				statusItem.detail = undefined;
				if (schemas.length === 0) {
					statusItem.text = l10n.t('No Schema Validation');
					statusItem.detail = l10n.t('no JSON schema configured');
				} else if (schemas.length === 1) {
					statusItem.text = l10n.t('Schema Validated');
					statusItem.detail = l10n.t('JSON schema configured');
				} else {
					statusItem.text = l10n.t('Schema Validated');
					statusItem.detail = l10n.t('multiple JSON schemas configured');
				}
				statusItem.command = {
					command: '_json.showAssociatedSchemaList',
					title: l10n.t('Show Schemas'),
					arguments: [{ schemas, uri: document.uri.toString() } satisfies ShowSchemasInput]
				};
			} catch (e) {
				statusItem.text = l10n.t('Unable to compute used schemas: {0}', e.message);
				statusItem.detail = undefined;
				statusItem.command = undefined;
			}
		} else {
			statusItem.text = l10n.t('Unable to compute used schemas: No document');
			statusItem.detail = undefined;
			statusItem.command = undefined;
		}
	}

	updateLanguageStatus();

	return Disposable.from(statusItem, activeEditorListener, showSchemasCommand);
}

export function createLimitStatusItem(newItem: (limit: number) => Disposable) {
	let statusItem: Disposable | undefined;
	const activeLimits: Map<TextDocument, number> = new Map();

	const toDispose: Disposable[] = [];
	toDispose.push(window.onDidChangeActiveTextEditor(textEditor => {
		statusItem?.dispose();
		statusItem = undefined;
		const doc = textEditor?.document;
		if (doc) {
			const limit = activeLimits.get(doc);
			if (limit !== undefined) {
				statusItem = newItem(limit);
			}
		}
	}));
	toDispose.push(workspace.onDidCloseTextDocument(document => {
		activeLimits.delete(document);
	}));

	function update(document: TextDocument, limitApplied: number | false) {
		if (limitApplied === false) {
			activeLimits.delete(document);
			if (statusItem && document === window.activeTextEditor?.document) {
				statusItem.dispose();
				statusItem = undefined;
			}
		} else {
			activeLimits.set(document, limitApplied);
			if (document === window.activeTextEditor?.document) {
				if (!statusItem || limitApplied !== activeLimits.get(document)) {
					statusItem?.dispose();
					statusItem = newItem(limitApplied);
				}
			}
		}
	}
	return {
		update,
		dispose() {
			statusItem?.dispose();
			toDispose.forEach(d => d.dispose());
			toDispose.length = 0;
			statusItem = undefined;
			activeLimits.clear();
		}
	};
}

const openSettingsCommand = 'workbench.action.openSettings';
const configureSettingsLabel = l10n.t('Configure');

export function createDocumentSymbolsLimitItem(documentSelector: DocumentSelector, settingId: string, limit: number): Disposable {
	const statusItem = languages.createLanguageStatusItem('json.documentSymbolsStatus', documentSelector);
	statusItem.name = l10n.t('JSON Outline Status');
	statusItem.severity = LanguageStatusSeverity.Warning;
	statusItem.text = l10n.t('Outline');
	statusItem.detail = l10n.t('only {0} document symbols shown for performance reasons', limit);
	statusItem.command = { command: openSettingsCommand, arguments: [settingId], title: configureSettingsLabel };
	return Disposable.from(statusItem);
}


