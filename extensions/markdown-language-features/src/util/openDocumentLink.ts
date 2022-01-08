/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { MarkdownEngine } from '../markdownEngine';
import { TableOfContentsProvider } from '../tableOfContentsProvider';
import { isMarkdownFile } from './file';
import { extname } from './path';

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
	let [hrefPath, fragment] = href.split('#').map(c => decodeURIComponent(c));

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

export async function openDocumentLink(engine: MarkdownEngine, targetResource: vscode.Uri, fromResource: vscode.Uri): Promise<void> {
	const column = getViewColumn(fromResource);

	if (await tryNavigateToFragmentInActiveEditor(engine, targetResource)) {
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
		if (extname(targetResource.path) === '') {
			const dotMdResource = targetResource.with({ path: targetResource.path + '.md' });
			try {
				const stat = await vscode.workspace.fs.stat(dotMdResource);
				if (stat.type === vscode.FileType.File) {
					await tryOpenMdFile(engine, dotMdResource, column);
					return;
				}
			} catch {
				// noop
			}
		}
	} else if (targetResourceStat.type === vscode.FileType.Directory) {
		return vscode.commands.executeCommand('revealInExplorer', targetResource);
	}

	await tryOpenMdFile(engine, targetResource, column);
}

async function tryOpenMdFile(engine: MarkdownEngine, resource: vscode.Uri, column: vscode.ViewColumn): Promise<boolean> {
	await vscode.commands.executeCommand('vscode.open', resource.with({ fragment: '' }), column);
	return tryNavigateToFragmentInActiveEditor(engine, resource);
}

async function tryNavigateToFragmentInActiveEditor(engine: MarkdownEngine, resource: vscode.Uri): Promise<boolean> {
	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor?.document.uri.fsPath === resource.fsPath) {
		if (isMarkdownFile(activeEditor.document)) {
			if (await tryRevealLineUsingTocFragment(engine, activeEditor, resource.fragment)) {
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

async function tryRevealLineUsingTocFragment(engine: MarkdownEngine, editor: vscode.TextEditor, fragment: string): Promise<boolean> {
	const toc = new TableOfContentsProvider(engine, editor.document);
	const entry = await toc.lookup(fragment);
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

export async function resolveLinkToMarkdownFile(resource: vscode.Uri): Promise<vscode.Uri | undefined> {
	try {
		const standardLink = await tryResolveLinkToMarkdownFile(resource);
		if (standardLink) {
			return standardLink;
		}
	} catch {
		// Noop
	}

	// If no extension, try with `.md` extension
	if (extname(resource.path) === '') {
		return tryResolveLinkToMarkdownFile(resource.with({ path: resource.path + '.md' }));
	}

	return undefined;
}

async function tryResolveLinkToMarkdownFile(resource: vscode.Uri): Promise<vscode.Uri | undefined> {
	let document: vscode.TextDocument;
	try {
		document = await vscode.workspace.openTextDocument(resource);
	} catch {
		return undefined;
	}
	if (isMarkdownFile(document)) {
		return document.uri;
	}
	return undefined;
}
