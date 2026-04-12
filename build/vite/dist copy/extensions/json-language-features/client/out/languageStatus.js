"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLanguageStatusItem = createLanguageStatusItem;
exports.createLimitStatusItem = createLimitStatusItem;
exports.createDocumentSymbolsLimitItem = createDocumentSymbolsLimitItem;
exports.createSchemaLoadStatusItem = createSchemaLoadStatusItem;
exports.createSchemaLoadIssueItem = createSchemaLoadIssueItem;
const vscode_1 = require("vscode");
const jsonClient_1 = require("./jsonClient");
function getExtensionSchemaAssociations() {
    const associations = [];
    for (const extension of vscode_1.extensions.all) {
        const jsonValidations = extension.packageJSON?.contributes?.jsonValidation;
        if (Array.isArray(jsonValidations)) {
            for (const jsonValidation of jsonValidations) {
                let uri = jsonValidation.url;
                if (typeof uri === 'string') {
                    if (uri[0] === '.' && uri[1] === '/') {
                        uri = vscode_1.Uri.joinPath(extension.extensionUri, uri).toString(false);
                    }
                    associations.push({ fullUri: uri, extension, label: jsonValidation.url });
                }
            }
        }
    }
    return {
        findExtension(uri) {
            for (const association of associations) {
                if (association.fullUri === uri) {
                    return {
                        label: association.label,
                        detail: vscode_1.l10n.t('Configured by extension: {0}', association.extension.id),
                        uri: vscode_1.Uri.parse(association.fullUri),
                        buttons: [{ iconPath: new vscode_1.ThemeIcon('extensions'), tooltip: vscode_1.l10n.t('Open Extension') }],
                        buttonCommands: [() => vscode_1.commands.executeCommand('workbench.extensions.action.showExtensionsWithIds', [[association.extension.id]])]
                    };
                }
            }
            return undefined;
        }
    };
}
//
function getSettingsSchemaAssociations(uri) {
    const resourceUri = vscode_1.Uri.parse(uri);
    const workspaceFolder = vscode_1.workspace.getWorkspaceFolder(resourceUri);
    const settings = vscode_1.workspace.getConfiguration('json', resourceUri).inspect('schemas');
    const associations = [];
    const folderSettingSchemas = settings?.workspaceFolderValue;
    if (workspaceFolder && Array.isArray(folderSettingSchemas)) {
        for (const setting of folderSettingSchemas) {
            const uri = setting.url;
            if (typeof uri === 'string') {
                let fullUri = uri;
                if (uri[0] === '.' && uri[1] === '/') {
                    fullUri = vscode_1.Uri.joinPath(workspaceFolder.uri, uri).toString(false);
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
                    fullUri = vscode_1.Uri.joinPath(workspaceFolder.uri, uri).toString(false);
                }
                associations.push({ fullUri, workspaceFolder: undefined, label: uri });
            }
        }
    }
    return {
        findSetting(uri) {
            for (const association of associations) {
                if (association.fullUri === uri) {
                    return {
                        label: association.label,
                        detail: association.workspaceFolder ? vscode_1.l10n.t('Configured in workspace settings') : vscode_1.l10n.t('Configured in user settings'),
                        uri: vscode_1.Uri.parse(association.fullUri),
                        buttons: [{ iconPath: new vscode_1.ThemeIcon('gear'), tooltip: vscode_1.l10n.t('Open Settings') }],
                        buttonCommands: [() => vscode_1.commands.executeCommand(association.workspaceFolder ? 'workbench.action.openWorkspaceSettingsFile' : 'workbench.action.openSettingsJson', ['json.schemas'])]
                    };
                }
            }
            return undefined;
        }
    };
}
function showSchemaList(input) {
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
        otherEntries.push({ label: schemaUri, uri: vscode_1.Uri.parse(schemaUri) });
    }
    const items = [...extensionEntries, ...settingsEntries, ...otherEntries];
    if (items.length === 0) {
        items.push({
            label: vscode_1.l10n.t('No schema configured for this file'),
            buttons: [{ iconPath: new vscode_1.ThemeIcon('gear'), tooltip: vscode_1.l10n.t('Open Settings') }],
            buttonCommands: [() => vscode_1.commands.executeCommand('workbench.action.openSettingsJson', ['json.schemas'])]
        });
    }
    items.push({ label: '', kind: vscode_1.QuickPickItemKind.Separator });
    items.push({ label: vscode_1.l10n.t('Learn more about JSON schema configuration...'), uri: vscode_1.Uri.parse('https://code.visualstudio.com/docs/languages/json#_json-schemas-and-settings') });
    const quickPick = vscode_1.window.createQuickPick();
    quickPick.placeholder = items.length ? vscode_1.l10n.t('Select the schema to use for {0}', input.uri) : undefined;
    quickPick.items = items;
    quickPick.show();
    quickPick.onDidAccept(() => {
        const uri = quickPick.selectedItems[0].uri;
        if (uri) {
            vscode_1.commands.executeCommand('vscode.open', uri);
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
function createLanguageStatusItem(documentSelector, statusRequest) {
    const statusItem = vscode_1.languages.createLanguageStatusItem('json.projectStatus', documentSelector);
    statusItem.name = vscode_1.l10n.t('JSON Validation Status');
    statusItem.severity = vscode_1.LanguageStatusSeverity.Information;
    const showSchemasCommand = vscode_1.commands.registerCommand(jsonClient_1.CommandIds.showAssociatedSchemaList, showSchemaList);
    const activeEditorListener = vscode_1.window.onDidChangeActiveTextEditor(() => {
        updateLanguageStatus();
    });
    async function updateLanguageStatus() {
        const document = vscode_1.window.activeTextEditor?.document;
        if (document) {
            try {
                statusItem.text = '$(loading~spin)';
                statusItem.detail = vscode_1.l10n.t('Loading JSON info');
                statusItem.command = undefined;
                const schemas = (await statusRequest(document.uri.toString())).schemas;
                statusItem.detail = undefined;
                if (schemas.length === 0) {
                    statusItem.text = vscode_1.l10n.t('No schema validation');
                    statusItem.detail = vscode_1.l10n.t('no JSON schema configured');
                }
                else if (schemas.length === 1) {
                    statusItem.text = vscode_1.l10n.t('Schema validated');
                    statusItem.detail = vscode_1.l10n.t('JSON schema configured');
                }
                else {
                    statusItem.text = vscode_1.l10n.t('Schema validated');
                    statusItem.detail = vscode_1.l10n.t('multiple JSON schemas configured');
                }
                statusItem.command = {
                    command: jsonClient_1.CommandIds.showAssociatedSchemaList,
                    title: vscode_1.l10n.t('Show Schemas'),
                    arguments: [{ schemas, uri: document.uri.toString() }]
                };
            }
            catch (e) {
                statusItem.text = vscode_1.l10n.t('Unable to compute used schemas: {0}', e.message);
                statusItem.detail = undefined;
                statusItem.command = undefined;
            }
        }
        else {
            statusItem.text = vscode_1.l10n.t('Unable to compute used schemas: No document');
            statusItem.detail = undefined;
            statusItem.command = undefined;
        }
    }
    updateLanguageStatus();
    return vscode_1.Disposable.from(statusItem, activeEditorListener, showSchemasCommand);
}
function createLimitStatusItem(newItem) {
    let statusItem;
    const activeLimits = new Map();
    const toDispose = [];
    toDispose.push(vscode_1.window.onDidChangeActiveTextEditor(textEditor => {
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
    toDispose.push(vscode_1.workspace.onDidCloseTextDocument(document => {
        activeLimits.delete(document);
    }));
    function update(document, limitApplied) {
        if (limitApplied === false) {
            activeLimits.delete(document);
            if (statusItem && document === vscode_1.window.activeTextEditor?.document) {
                statusItem.dispose();
                statusItem = undefined;
            }
        }
        else {
            activeLimits.set(document, limitApplied);
            if (document === vscode_1.window.activeTextEditor?.document) {
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
const configureSettingsLabel = vscode_1.l10n.t('Configure');
function createDocumentSymbolsLimitItem(documentSelector, settingId, limit) {
    const statusItem = vscode_1.languages.createLanguageStatusItem('json.documentSymbolsStatus', documentSelector);
    statusItem.name = vscode_1.l10n.t('JSON Outline Status');
    statusItem.severity = vscode_1.LanguageStatusSeverity.Warning;
    statusItem.text = vscode_1.l10n.t('Outline');
    statusItem.detail = vscode_1.l10n.t('only {0} document symbols shown for performance reasons', limit);
    statusItem.command = { command: openSettingsCommand, arguments: [settingId], title: configureSettingsLabel };
    return vscode_1.Disposable.from(statusItem);
}
function createSchemaLoadStatusItem(newItem) {
    let statusItem;
    const fileSchemaErrors = new Map();
    const toDispose = [];
    toDispose.push(vscode_1.window.onDidChangeActiveTextEditor(textEditor => {
        statusItem?.dispose();
        statusItem = undefined;
        const doc = textEditor?.document;
        if (doc) {
            const fileSchemaError = fileSchemaErrors.get(doc.uri.toString());
            if (fileSchemaError !== undefined) {
                statusItem = newItem(fileSchemaError);
            }
        }
    }));
    toDispose.push(vscode_1.workspace.onDidCloseTextDocument(document => {
        fileSchemaErrors.delete(document.uri.toString());
    }));
    function update(uri, diagnostics) {
        const fileSchemaError = diagnostics.find(jsonClient_1.isSchemaResolveError);
        const uriString = uri.toString();
        if (fileSchemaError === undefined) {
            fileSchemaErrors.delete(uriString);
            if (statusItem && uriString === vscode_1.window.activeTextEditor?.document.uri.toString()) {
                statusItem.dispose();
                statusItem = undefined;
            }
        }
        else {
            const current = fileSchemaErrors.get(uriString);
            if (current?.message === fileSchemaError.message) {
                return;
            }
            fileSchemaErrors.set(uriString, fileSchemaError);
            if (uriString === vscode_1.window.activeTextEditor?.document.uri.toString()) {
                statusItem?.dispose();
                statusItem = newItem(fileSchemaError);
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
            fileSchemaErrors.clear();
        }
    };
}
function createSchemaLoadIssueItem(documentSelector, schemaDownloadEnabled, diagnostic) {
    const statusItem = vscode_1.languages.createLanguageStatusItem('json.documentSymbolsStatus', documentSelector);
    statusItem.name = vscode_1.l10n.t('JSON Outline Status');
    statusItem.severity = vscode_1.LanguageStatusSeverity.Error;
    statusItem.text = 'Schema download issue';
    if (!vscode_1.workspace.isTrusted) {
        statusItem.detail = vscode_1.l10n.t('Workspace untrusted');
        statusItem.command = { command: jsonClient_1.CommandIds.workbenchTrustManage, title: 'Configure Trust' };
    }
    else if (!schemaDownloadEnabled) {
        statusItem.detail = vscode_1.l10n.t('Download disabled');
        statusItem.command = { command: jsonClient_1.CommandIds.workbenchActionOpenSettings, arguments: [jsonClient_1.SettingIds.enableSchemaDownload], title: 'Configure' };
    }
    else if (typeof diagnostic.code === 'number' && diagnostic.code === jsonClient_1.ErrorCodes.UntrustedSchemaError) {
        statusItem.detail = vscode_1.l10n.t('Location untrusted');
        const schemaUri = diagnostic.relatedInformation?.[0]?.location.uri;
        if (schemaUri) {
            statusItem.command = { command: jsonClient_1.CommandIds.configureTrustedDomainsCommandId, arguments: [schemaUri.toString()], title: 'Configure Trusted Domains' };
        }
        else {
            statusItem.command = { command: jsonClient_1.CommandIds.workbenchActionOpenSettings, arguments: [jsonClient_1.SettingIds.trustedDomains], title: 'Configure Trusted Domains' };
        }
    }
    else {
        statusItem.detail = vscode_1.l10n.t('Unable to resolve schema');
        statusItem.command = { command: jsonClient_1.CommandIds.retryResolveSchemaCommandId, title: 'Retry' };
    }
    return vscode_1.Disposable.from(statusItem);
}
//# sourceMappingURL=languageStatus.js.map