/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../commandManager';
import { MarkdownEngine } from '../markdownEngine';
import { TableOfContentsProvider } from '../tableOfContentsProvider';
import { isMarkdownFile } from '../util/file';
import { extname } from '../util/path';


type UriComponents = {
	readonly scheme?: string;
	readonly path: string;
	readonly fragment?: string;
	readonly authority?: string;
	readonly query?: string;
};

export interface OpenDocumentLinkArgs {
	readonly parts: UriComponents;
	readonly fragment: string;
	readonly fromResource: UriComponents;
}

enum OpenMarkdownLinks {
	beside = 'beside',
	currentGroup = 'currentGroup',
}

export class OpenDocumentLinkCommand implements Command {
	private static readonly id = '_markdown.openDocumentLink';
	public readonly id = OpenDocumentLinkCommand.id;

	public static createCommandUri(
		fromResource: vscode.Uri,
		path: vscode.Uri,
		fragment: string,
	): vscode.Uri {
		const toJson = (uri: vscode.Uri): UriComponents => {
			return {
				scheme: uri.scheme,
				authority: uri.authority,
				path: uri.path,
				fragment: uri.fragment,
				query: uri.query,
			};
		};
		return vscode.Uri.parse(`command:${OpenDocumentLinkCommand.id}?${encodeURIComponent(JSON.stringify(<OpenDocumentLinkArgs>{
			parts: toJson(path),
			fragment,
			fromResource: toJson(fromResource),
		}))}`);
	}

	public constructor(
		private readonly engine: MarkdownEngine
	) { }

	public async execute(args: OpenDocumentLinkArgs) {
		return OpenDocumentLinkCommand.execute(this.engine, args);
	}

	public static async execute(engine: MarkdownEngine, args: OpenDocumentLinkArgs): Promise<void> {
		const fromResource = vscode.Uri.parse('').with(args.fromResource);
		const targetResource = reviveUri(args.parts);
		const column = this.getViewColumn(fromResource);

		if (await OpenDocumentLinkCommand.tryNavigateToFragmentInActiveEditor(engine, targetResource, args)) {
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
						await OpenDocumentLinkCommand.tryOpenMdFile(engine, dotMdResource, column, args);
						return;
					}
				} catch {
					// noop
				}
			}
		} else if (targetResourceStat.type === vscode.FileType.Directory) {
			return vscode.commands.executeCommand('revealInExplorer', targetResource);
		}

		await OpenDocumentLinkCommand.tryOpenMdFile(engine, targetResource, column, args);
	}

	private static async tryOpenMdFile(engine: MarkdownEngine, resource: vscode.Uri, column: vscode.ViewColumn, args: OpenDocumentLinkArgs): Promise<boolean> {
		await vscode.commands.executeCommand('vscode.open', resource, column);
		return OpenDocumentLinkCommand.tryNavigateToFragmentInActiveEditor(engine, resource, args);
	}

	private static async tryNavigateToFragmentInActiveEditor(engine: MarkdownEngine, resource: vscode.Uri, args: OpenDocumentLinkArgs): Promise<boolean> {
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor?.document.uri.fsPath === resource.fsPath) {
			if (isMarkdownFile(activeEditor.document)) {
				if (await this.tryRevealLineUsingTocFragment(engine, activeEditor, args.fragment)) {
					return true;
				}
			}
			this.tryRevealLineUsingLineFragment(activeEditor, args.fragment);
			return true;
		}
		return false;
	}

	private static getViewColumn(resource: vscode.Uri): vscode.ViewColumn {
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

	private static async tryRevealLineUsingTocFragment(engine: MarkdownEngine, editor: vscode.TextEditor, fragment: string): Promise<boolean> {
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

	private static tryRevealLineUsingLineFragment(editor: vscode.TextEditor, fragment: string): boolean {
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
}

function reviveUri(parts: any) {
	if (parts.scheme === 'file') {
		return vscode.Uri.file(parts.path);
	}
	return vscode.Uri.parse('').with(parts);
}

export async function resolveLinkToMarkdownFile(path: string): Promise<vscode.Uri | undefined> {
	try {
		const standardLink = await tryResolveLinkToMarkdownFile(path);
		if (standardLink) {
			return standardLink;
		}
	} catch {
		// Noop
	}

	// If no extension, try with `.md` extension
	if (extname(path) === '') {
		return tryResolveLinkToMarkdownFile(path + '.md');
	}

	return undefined;
}

async function tryResolveLinkToMarkdownFile(path: string): Promise<vscode.Uri | undefined> {
	const resource = vscode.Uri.file(path);

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
