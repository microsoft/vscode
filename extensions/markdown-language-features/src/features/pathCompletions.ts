/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dirname, resolve } from 'path';
import * as vscode from 'vscode';
import { MarkdownEngine } from '../markdownEngine';
import { TableOfContentsProvider } from '../tableOfContentsProvider';
import { resolveUriToMarkdownFile } from '../util/openDocumentLink';

enum LinkKind {
	Link, // [...](...)
	ReferenceLink, // [...][...]
}

interface CompletionContext {
	readonly linkKind: LinkKind;

	/**
	 * Text of the link before the current position
	 *
	 * For `[abc](xy|z)` this would be `xy`
	 */
	readonly linkPrefix: string;

	/** Text of the link before the current position */
	readonly linkTextStartPosition: vscode.Position;

	/**
	 * Info if the link looks like its for an anchor: `[](#header)`
	 */
	readonly anchorInfo?: {
		/** Text before the `#` */
		readonly beforeAnchor: string;

		/** Text of the anchor before the current position. */
		readonly anchorPrefix: string;
	}
}

export class PathCompletionProvider implements vscode.CompletionItemProvider {

	public static register(selector: vscode.DocumentSelector, engine: MarkdownEngine): vscode.Disposable {
		return vscode.languages.registerCompletionItemProvider(selector, new PathCompletionProvider(engine), '.', '/', '#');
	}

	constructor(
		private readonly engine: MarkdownEngine,
	) { }

	public async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken, _context: vscode.CompletionContext): Promise<vscode.CompletionItem[]> {
		if (!this.arePathSuggestionEnabled(document)) {
			return [];
		}

		const context = this.getPathCompletionContext(document, position);
		if (!context) {
			return [];
		}

		const items: vscode.CompletionItem[] = [];

		const isAnchorInCurrentDoc = context.anchorInfo && context.anchorInfo.beforeAnchor.length === 0;

		// Add anchor #links in current doc
		if (context.linkPrefix.length === 0 || isAnchorInCurrentDoc) {
			const range = new vscode.Range(context.linkTextStartPosition, position);
			items.push(...(await this.provideHeaderSuggestions(document, range)));
		}

		if (!isAnchorInCurrentDoc) {
			if (context.anchorInfo) { // Anchor to a different document
				const rawUri = this.resolveReference(document, context.anchorInfo.beforeAnchor);
				if (rawUri) {
					const otherDoc = await resolveUriToMarkdownFile(rawUri);
					if (otherDoc) {
						const anchorStartPosition = position.translate({ characterDelta: -(context.anchorInfo.anchorPrefix.length + 1) });
						const range = new vscode.Range(anchorStartPosition, position);

						items.push(...(await this.provideHeaderSuggestions(otherDoc, range)));
					}
				}
			} else { // Normal path suggestions
				const pathSuggestions = await this.providePathSuggestions(document, position, context);
				items.push(...pathSuggestions);
			}
		}

		return items;
	}

	private arePathSuggestionEnabled(document: vscode.TextDocument): boolean {
		const config = vscode.workspace.getConfiguration('markdown', document.uri);
		return config.get('suggest.paths.enabled', true);
	}

	/// [...](...|
	private readonly linkStartPattern = /\[([^\]]*?)\]\(\s*([^\s\(\)]*)$/;

	private getPathCompletionContext(document: vscode.TextDocument, position: vscode.Position): CompletionContext | undefined {
		const prefixRange = new vscode.Range(position.with({ character: 0 }), position);
		const linePrefix = document.getText(prefixRange);

		const linkPrefixMatch = linePrefix.match(this.linkStartPattern);
		if (linkPrefixMatch) {
			const prefix = linkPrefixMatch[2];
			if (/^\s*[\w\d\-]+:/.test(prefix)) { // Check if this looks like a 'http:' style uri
				return undefined;
			}

			const anchorMatch = prefix.match(/^(.*)#([\w\d\-]*)$/);

			return {
				linkKind: LinkKind.Link,
				linkPrefix: prefix,
				linkTextStartPosition: position.translate({ characterDelta: -prefix.length }),
				anchorInfo: anchorMatch ? {
					beforeAnchor: anchorMatch[1],
					anchorPrefix: anchorMatch[2],
				} : undefined,
			};
		}

		return undefined;
	}

	private async provideHeaderSuggestions(document: vscode.TextDocument, range: vscode.Range,): Promise<vscode.CompletionItem[]> {
		const items: vscode.CompletionItem[] = [];

		const tocProvider = new TableOfContentsProvider(this.engine, document);
		const toc = await tocProvider.getToc();
		for (const entry of toc) {
			items.push({
				kind: vscode.CompletionItemKind.Reference,
				label: '#' + entry.slug.value,
				range: range,
			});
		}

		return items;
	}

	private async providePathSuggestions(document: vscode.TextDocument, position: vscode.Position, context: CompletionContext): Promise<vscode.CompletionItem[]> {
		const valueBeforeLastSlash = context.linkPrefix.substring(0, context.linkPrefix.lastIndexOf('/') + 1); // keep the last slash

		const pathSegmentStart = position.translate({ characterDelta: valueBeforeLastSlash.length - context.linkPrefix.length });

		const parentDir = this.resolveReference(document, valueBeforeLastSlash || '.');
		if (!parentDir) {
			return [];
		}

		try {
			const result: vscode.CompletionItem[] = [];
			const infos = await vscode.workspace.fs.readDirectory(parentDir);
			for (const [name, type] of infos) {
				// Exclude paths that start with `.`
				if (name.startsWith('.')) {
					continue;
				}

				const isDir = type === vscode.FileType.Directory;
				result.push({
					label: isDir ? name + '/' : name,
					kind: isDir ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File,
					range: new vscode.Range(pathSegmentStart, position),
					command: isDir ? { command: 'editor.action.triggerSuggest', title: '' } : undefined,
				});
			}

			return result;
		} catch (e) {
			// ignore
		}

		return [];
	}

	private resolveReference(document: vscode.TextDocument, ref: string): vscode.Uri | undefined {
		if (ref.startsWith('/')) {
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
			if (workspaceFolder) {
				return vscode.Uri.joinPath(workspaceFolder.uri, ref);
			}
		}

		try {
			return document.uri.with({
				path: resolve(dirname(document.uri.path), ref),
			});
		} catch (e) {
			return undefined;
		}
	}
}
