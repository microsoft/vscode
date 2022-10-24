/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { Command } from '../commandManager';
import { createUriListSnippet, getParentDocumentUri, imageFileExtensions } from '../languageFeatures/dropIntoEditor';
import { coalesce } from '../util/arrays';
import { Schemes } from '../util/schemes';

const localize = nls.loadMessageBundle();


export class InsertLinkFromWorkspace implements Command {
	public readonly id = 'markdown.editor.insertLinkFromWorkspace';

	public async execute(resources?: vscode.Uri[]) {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) {
			return;
		}

		resources ??= await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: true,
			canSelectMany: true,
			openLabel: localize('insertLink.openLabel', "Insert link"),
			title: localize('insertLink.title', "Insert link"),
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
				[localize('insertImage.imagesLabel', "Images")]: Array.from(imageFileExtensions)
			},
			openLabel: localize('insertImage.openLabel', "Insert image"),
			title: localize('insertImage.title', "Insert image"),
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
	return docUri;
}

async function insertLink(activeEditor: vscode.TextEditor, selectedFiles: vscode.Uri[], insertAsImage: boolean): Promise<void> {
	if (!selectedFiles.length) {
		return;
	}

	const edit = createInsertLinkEdit(activeEditor, selectedFiles, insertAsImage);
	await vscode.workspace.applyEdit(edit);
}

function createInsertLinkEdit(activeEditor: vscode.TextEditor, selectedFiles: vscode.Uri[], insertAsImage: boolean) {
	const snippetEdits = coalesce(activeEditor.selections.map((selection, i): vscode.SnippetTextEdit | undefined => {
		const selectionText = activeEditor.document.getText(selection);
		const snippet = createUriListSnippet(activeEditor.document, selectedFiles, {
			insertAsImage: insertAsImage,
			placeholderText: selectionText,
			placeholderStartIndex: (i + 1) * selectedFiles.length,
		});

		return snippet ? new vscode.SnippetTextEdit(selection, snippet) : undefined;
	}));

	const edit = new vscode.WorkspaceEdit();
	edit.set(activeEditor.document.uri, snippetEdits);
	return edit;
}
