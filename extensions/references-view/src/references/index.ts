/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SymbolsTree } from '../tree';
import { FileItem, ReferenceItem, ReferencesModel, ReferencesTreeInput } from './model';

export function register(tree: SymbolsTree, context: vscode.ExtensionContext): void {

	function findLocations(title: string, command: string) {
		if (vscode.window.activeTextEditor) {
			const input = new ReferencesTreeInput(title, new vscode.Location(vscode.window.activeTextEditor.document.uri, vscode.window.activeTextEditor.selection.active), command);
			tree.setInput(input);
		}
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('references-view.findReferences', () => findLocations('References', 'vscode.executeReferenceProvider')),
		vscode.commands.registerCommand('references-view.findImplementations', () => findLocations('Implementations', 'vscode.executeImplementationProvider')),
		// --- legacy name
		vscode.commands.registerCommand('references-view.find', (...args: any[]) => vscode.commands.executeCommand('references-view.findReferences', ...args)),
		vscode.commands.registerCommand('references-view.removeReferenceItem', removeReferenceItem),
		vscode.commands.registerCommand('references-view.copy', copyCommand),
		vscode.commands.registerCommand('references-view.copyAll', copyAllCommand),
		vscode.commands.registerCommand('references-view.copyPath', copyPathCommand),
	);


	// --- references.preferredLocation setting

	let showReferencesDisposable: vscode.Disposable | undefined;
	const config = 'references.preferredLocation';
	function updateShowReferences(event?: vscode.ConfigurationChangeEvent) {
		if (event && !event.affectsConfiguration(config)) {
			return;
		}
		const value = vscode.workspace.getConfiguration().get<string>(config);

		showReferencesDisposable?.dispose();
		showReferencesDisposable = undefined;

		if (value === 'view') {
			showReferencesDisposable = vscode.commands.registerCommand('editor.action.showReferences', async (uri: vscode.Uri, position: vscode.Position, locations: vscode.Location[]) => {
				const input = new ReferencesTreeInput(vscode.l10n.t('References'), new vscode.Location(uri, position), 'vscode.executeReferenceProvider', locations);
				tree.setInput(input);
			});
		}
	}
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(updateShowReferences));
	context.subscriptions.push({ dispose: () => showReferencesDisposable?.dispose() });
	updateShowReferences();
}

const copyAllCommand = async (item: ReferenceItem | FileItem | unknown) => {
	if (item instanceof ReferenceItem) {
		copyCommand(item.file.model);
	} else if (item instanceof FileItem) {
		copyCommand(item.model);
	}
};

function removeReferenceItem(item: FileItem | ReferenceItem | unknown) {
	if (item instanceof FileItem) {
		item.remove();
	} else if (item instanceof ReferenceItem) {
		item.remove();
	}
}


async function copyCommand(item: ReferencesModel | ReferenceItem | FileItem | unknown) {
	let val: string | undefined;
	if (item instanceof ReferencesModel) {
		val = await item.asCopyText();
	} else if (item instanceof ReferenceItem) {
		val = await item.asCopyText();
	} else if (item instanceof FileItem) {
		val = await item.asCopyText();
	}
	if (val) {
		await vscode.env.clipboard.writeText(val);
	}
}

async function copyPathCommand(item: FileItem | unknown) {
	if (item instanceof FileItem) {
		if (item.uri.scheme === 'file') {
			vscode.env.clipboard.writeText(item.uri.fsPath);
		} else {
			vscode.env.clipboard.writeText(item.uri.toString(true));
		}
	}
}
