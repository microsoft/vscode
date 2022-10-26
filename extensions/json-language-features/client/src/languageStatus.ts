/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	window, languages, Uri, Disposable, commands, QuickPickItem,
	extensions, workspace, Extension, WorkspaceFolder, QuickPickItemKind,
	ThemeIcon, TextDocument, LanguageStatusSeverity
} from 'vscode';
import { JSONLanguageStatus, JSONSchemaSettings } from './jsonClient';

import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

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
						detail: localize('schemaFromextension', 'Configured by extension: {0}', association.extension.id),
						uri: Uri.parse(association.fullUri),
						buttons: [{ iconPath: new ThemeIcon('extensions'), tooltip: localize('openExtension', 'Open Extension') }],
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
						detail: association.workspaceFolder ? localize('schemaFromFolderSettings', 'Configured in workspace settings') : localize('schemaFromUserSettings', 'Configured in user settings'),
						uri: Uri.parse(association.fullUri),
						buttons: [{ iconPath: new ThemeIcon('gear'), tooltip: localize('openSettings', 'Open Settings') }],
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
			label: localize('schema.noSchema', 'No schema configured for this file'),
			buttons: [{ iconPath: new ThemeIcon('gear'), tooltip: localize('openSettings', 'Open Settings') }],
			buttonCommands: [() => commands.executeCommand('workbench.action.openSettingsJson', ['json.schemas'])]
		});
	}

	items.push({ label: '', kind: QuickPickItemKind.Separator });
	items.push({ label: localize('schema.showdocs', 'Learn more about JSON schema configuration...'), uri: Uri.parse('https://code.visualstudio.com/docs/languages/json#_json-schemas-and-settings') });

	const quickPick = window.createQuickPick<ShowSchemasItem>();
	quickPick.title = localize('schemaPicker.title', 'JSON Schemas used for {0}', input.uri);
	//	quickPick.placeholder = items.length ? localize('schemaPicker.placeholder', 'Select the schema to open') : undefined;
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

export function createLanguageStatusItem(documentSelector: string[], statusRequest: (uri: string) => Promise<JSONLanguageStatus>): Disposable {
	const statusItem = languages.createLanguageStatusItem('json.projectStatus', documentSelector);
	statusItem.name = localize('statusItem.name', "JSON Validation Status");
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
				statusItem.detail = localize('pending.detail', 'Loading JSON info');
				statusItem.command = undefined;

				const schemas = (await statusRequest(document.uri.toString())).schemas;
				statusItem.detail = undefined;
				if (schemas.length === 0) {
					statusItem.text = localize('status.noSchema.short', "No Schema Validation");
					statusItem.detail = localize('status.noSchema', 'no JSON schema configured');
				} else if (schemas.length === 1) {
					statusItem.text = localize('status.withSchema.short', "Schema Validated");
					statusItem.detail = localize('status.singleSchema', 'JSON schema configured');
				} else {
					statusItem.text = localize('status.withSchemas.short', "Schema Validated");
					statusItem.detail = localize('status.multipleSchema', 'multiple JSON schemas configured');
				}
				statusItem.command = {
					command: '_json.showAssociatedSchemaList',
					title: localize('status.openSchemasLink', 'Show Schemas'),
					arguments: [{ schemas, uri: document.uri.toString() } as ShowSchemasInput]
				};
			} catch (e) {
				statusItem.text = localize('status.error1', 'Unable to compute used schemas: {0}', e.message);
				statusItem.detail = undefined;
				statusItem.command = undefined;
			}
		} else {
			statusItem.text = localize('status.error2', 'Unable to compute used schemas: No document');
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
const configureSettingsLabel = localize('status.button.configure', "Configure");

export function createFoldingRangeLimitItem(documentSelector: string[], settingId: string, limit: number): Disposable {
	const statusItem = languages.createLanguageStatusItem('json.foldingRangesStatus', documentSelector);
	statusItem.name = localize('foldingRangesStatusItem.name', "JSON Folding Status");
	statusItem.severity = LanguageStatusSeverity.Warning;
	statusItem.text = localize('status.limitedFoldingRanges.short', "Folding Ranges Limited");
	statusItem.detail = localize('status.limitedFoldingRanges.details', 'only {0} folding ranges shown', limit);
	statusItem.command = { command: openSettingsCommand, arguments: [settingId], title: configureSettingsLabel };
	return Disposable.from(statusItem);
}

export function createDocumentSymbolsLimitItem(documentSelector: string[], settingId: string, limit: number): Disposable {
	const statusItem = languages.createLanguageStatusItem('json.documentSymbolsStatus', documentSelector);
	statusItem.name = localize('documentSymbolsStatusItem.name', "JSON Outline Status");
	statusItem.severity = LanguageStatusSeverity.Warning;
	statusItem.text = localize('status.limitedDocumentSymbols.short', "Outline Limited");
	statusItem.detail = localize('status.limitedDocumentSymbols.details', 'only {0} document symbols shown', limit);
	statusItem.command = { command: openSettingsCommand, arguments: [settingId], title: configureSettingsLabel };
	return Disposable.from(statusItem);
}

export function createDocumentColorsLimitItem(documentSelector: string[], settingId: string, limit: number): Disposable {
	const statusItem = languages.createLanguageStatusItem('json.documentColorsStatus', documentSelector);
	statusItem.name = localize('documentColorsStatusItem.name', "JSON Color Symbol Status");
	statusItem.severity = LanguageStatusSeverity.Warning;
	statusItem.text = localize('status.limitedDocumentColors.short', "Color Symbols Limited");
	statusItem.detail = localize('status.limitedDocumentColors.details', 'only {0} color decorators shown', limit);
	statusItem.command = { command: openSettingsCommand, arguments: [settingId], title: configureSettingsLabel };
	return Disposable.from(statusItem);
}

