/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import * as uri from 'vscode-uri';
import { MdTableOfContentsProvider } from '../tableOfContents';
import { ITextDocument } from '../types/textDocument';
import { IMdWorkspace } from '../workspace';
import { isMarkdownFile } from './file';

export interface OpenDocumentLinkArgs {
	readonly parts: vscode.Uri;
	readonly fragment: string;
	readonly fromResource: vscode.Uri;
}

enum OpenMarkdownLinks {
	beside = 'beside',
	currentGroup = 'currentGroup',
}

export function resolveDocumentLink(href: string, markdownFile: vscode.Uri): vscode.Uri {
	const [hrefPath, fragment] = href.split('#').map(c => decodeURIComponent(c));

	if (hrefPath[0] === '/') {
		// Absolute path. Try to resolve relative to the workspace
		const workspace = vscode.workspace.getWorkspaceFolder(markdownFile);
		if (workspace) {
			return vscode.Uri.joinPath(workspace.uri, hrefPath.slice(1)).with({ fragment });
		}
	}

	// Relative path. Resolve relative to the md file
	const dirnameUri = markdownFile.with({ path: path.dirname(markdownFile.path) });
	return vscode.Uri.joinPath(dirnameUri, hrefPath).with({ fragment });
}

export async function openDocumentLink(tocProvider: MdTableOfContentsProvider, targetResource: vscode.Uri, fromResource: vscode.Uri): Promise<void> {
	const column = getViewColumn(fromResource);

	if (await tryNavigateToFragmentInActiveEditor(tocProvider, targetResource)) {
		return;
	}

	let targetResourceStat: vscode.FileStat | undefined;
	try {
		targetResourceStat = await vscode.workspace.fs.stat(targetResource);
	} catch {
		// noop
	}

	if (typeof targetResourceStat === 'undefined') {
		// We don't think the file exists. If it doesn't already have an extension, try tacking on a `.md` and using that instead
		if (uri.Utils.extname(targetResource) === '') {
			const dotMdResource = targetResource.with({ path: targetResource.path + '.md' });
			try {
				const stat = await vscode.workspace.fs.stat(dotMdResource);
				if (stat.type === vscode.FileType.File) {
					await tryOpenMdFile(tocProvider, dotMdResource, column);
					return;
				}
			} catch {
				// noop
			}
		}
	} else if (targetResourceStat.type === vscode.FileType.Directory) {
		return vscode.commands.executeCommand('revealInExplorer', targetResource);
	}

	await tryOpenMdFile(tocProvider, targetResource, column);
}

async function tryOpenMdFile(tocProvider: MdTableOfContentsProvider, resource: vscode.Uri, column: vscode.ViewColumn): Promise<boolean> {
	await vscode.commands.executeCommand('vscode.open', resource.with({ fragment: '' }), column);
	return tryNavigateToFragmentInActiveEditor(tocProvider, resource);
}

async function tryNavigateToFragmentInActiveEditor(tocProvider: MdTableOfContentsProvider, resource: vscode.Uri): Promise<boolean> {
	const notebookEditor = vscode.window.activeNotebookEditor;
	if (notebookEditor?.notebook.uri.fsPath === resource.fsPath) {
		if (await tryRevealLineInNotebook(tocProvider, notebookEditor, resource.fragment)) {
			return true;
		}
	}

	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor?.document.uri.fsPath === resource.fsPath) {
		if (isMarkdownFile(activeEditor.document)) {
			if (await tryRevealLineUsingTocFragment(tocProvider, activeEditor, resource.fragment)) {
				return true;
			}
		}
		tryRevealLineUsingLineFragment(activeEditor, resource.fragment);
		return true;
	}

	return false;
}

function getViewColumn(resource: vscode.Uri): vscode.ViewColumn {
	const config = vscode.workspace.getConfiguration('markdown', resource);
	const openLinks = config.get<OpenMarkdownLinks>('links.openLocation', OpenMarkdownLinks.currentGroup);
	switch (openLinks) {
		case OpenMarkdownLinks.beside:
			return vscode.ViewColumn.Beside;
		case OpenMarkdownLinks.currentGroup:
		default:
			return vscode.ViewColumn.Active;
	}
}

async function tryRevealLineInNotebook(tocProvider: MdTableOfContentsProvider, editor: vscode.NotebookEditor, fragment: string): Promise<boolean> {
	const toc = await tocProvider.createForNotebook(editor.notebook);
	const entry = toc.lookup(fragment);
	if (!entry) {
		return false;
	}

	const cell = editor.notebook.getCells().find(cell => cell.document.uri.toString() === entry.sectionLocation.uri.toString());
	if (!cell) {
		return false;
	}

	const range = new vscode.NotebookRange(cell.index, cell.index);
	editor.selection = range;
	editor.revealRange(range);
	return true;
}

async function tryRevealLineUsingTocFragment(tocProvider: MdTableOfContentsProvider, editor: vscode.TextEditor, fragment: string): Promise<boolean> {
	const toc = await tocProvider.getForDocument(editor.document);
	const entry = toc.lookup(fragment);
	if (entry) {
		const lineStart = new vscode.Range(entry.line, 0, entry.line, 0);
		editor.selection = new vscode.Selection(lineStart.start, lineStart.end);
		editor.revealRange(lineStart, vscode.TextEditorRevealType.AtTop);
		return true;
	}
	return false;
}

function tryRevealLineUsingLineFragment(editor: vscode.TextEditor, fragment: string): boolean {
	const lineNumberFragment = fragment.match(/^L(\d+)$/i);
	if (lineNumberFragment) {
		const line = +lineNumberFragment[1] - 1;
		if (!isNaN(line)) {
			const lineStart = new vscode.Range(line, 0, line, 0);
			editor.selection = new vscode.Selection(lineStart.start, lineStart.end);
			editor.revealRange(lineStart, vscode.TextEditorRevealType.AtTop);
			return true;
		}
	}
	return false;
}

export async function resolveUriToMarkdownFile(workspace: IMdWorkspace, resource: vscode.Uri): Promise<ITextDocument | undefined> {
	try {
		const doc = await workspace.getOrLoadMarkdownDocument(resource);
		if (doc) {
			return doc;
		}
	} catch {
		// Noop
	}

	// If no extension, try with `.md` extension
	if (uri.Utils.extname(resource) === '') {
		return workspace.getOrLoadMarkdownDocument(resource.with({ path: resource.path + '.md' }));
	}

	return undefined;
}
