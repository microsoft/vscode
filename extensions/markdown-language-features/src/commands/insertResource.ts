/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';
import { Command } from '../commandManager';
import { createUriListSnippet, mediaFileExtensions } from '../languageFeatures/copyFiles/shared';
import { coalesce } from '../util/arrays';
import { getParentDocumentUri } from '../util/document';
import { Schemes } from '../util/schemes';


export class InsertLinkFromWorkspace implements Command {
	public readonly id = 'markdown.editor.insertLinkFromWorkspace';

	public async execute(resources?: vscode.Uri[]) {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) {
			return;
		}

		resources ??= await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: true,
			openLabel: vscode.l10n.t("Insert link"),
			title: vscode.l10n.t("Insert link"),
			defaultUri: getDefaultUri(activeEditor.document),
		});

		return insertLink(activeEditor, resources ?? [], false);
	}
}

export class InsertImageFromWorkspace implements Command {
	public readonly id = 'markdown.editor.insertImageFromWorkspace';

	public async execute(resources?: vscode.Uri[]) {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) {
			return;
		}

		resources ??= await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: true,
			filters: {
				[vscode.l10n.t("Media")]: Array.from(mediaFileExtensions.keys())
			},
			openLabel: vscode.l10n.t("Insert image"),
			title: vscode.l10n.t("Insert image"),
			defaultUri: getDefaultUri(activeEditor.document),
		});

		return insertLink(activeEditor, resources ?? [], true);
	}
}

function getDefaultUri(document: vscode.TextDocument) {
	const docUri = getParentDocumentUri(document);
	if (docUri.scheme === Schemes.untitled) {
		return vscode.workspace.workspaceFolders?.[0]?.uri;
	}
	return Utils.dirname(docUri);
}

async function insertLink(activeEditor: vscode.TextEditor, selectedFiles: vscode.Uri[], insertAsImage: boolean): Promise<void> {
	if (!selectedFiles.length) {
		return;
	}

	const edit = createInsertLinkEdit(activeEditor, selectedFiles, insertAsImage);
	await vscode.workspace.applyEdit(edit);
}

function createInsertLinkEdit(activeEditor: vscode.TextEditor, selectedFiles: vscode.Uri[], insertAsMedia: boolean) {
	const snippetEdits = coalesce(activeEditor.selections.map((selection, i): vscode.SnippetTextEdit | undefined => {
		const selectionText = activeEditor.document.getText(selection);
		const snippet = createUriListSnippet(activeEditor.document, selectedFiles, {
			insertAsMedia,
			placeholderText: selectionText,
			placeholderStartIndex: (i + 1) * selectedFiles.length,
			separator: insertAsMedia ? '\n' : ' ',
		});

		return snippet ? new vscode.SnippetTextEdit(selection, snippet.snippet) : undefined;
	}));

	const edit = new vscode.WorkspaceEdit();
	edit.set(activeEditor.document.uri, snippetEdits);
	return edit;
}
