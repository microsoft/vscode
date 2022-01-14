/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dirname, resolve } from 'path';
import * as vscode from 'vscode';
import { MarkdownEngine } from '../markdownEngine';
import { TableOfContentsProvider } from '../tableOfContentsProvider';
import { resolveUriToMarkdownFile } from '../util/openDocumentLink';
import LinkProvider from './documentLinkProvider';

enum CompletionContextKind {
	Link, // [...](|)

	ReferenceLink, // [...][|]

	LinkDefinition, // []: | // TODO: not implemented
}

interface CompletionContext {
	readonly kind: CompletionContextKind;

	/**
	 * Text of the link before the current position
	 *
	 * For `[text](xy#z|abc)` this is `xy#z`.
	 */
	readonly linkPrefix: string;

	/**
	 * Position of the start of the link.
	 *
	 * For `[text](xy#z|abc)` this is the position before `xy`.
	 */
	readonly linkTextStartPosition: vscode.Position;

	/**
	 * Text of the link after the current position.
	 *
	 * For `[text](xy#z|abc)` this is `abc`.
	 */
	readonly linkSuffix: string;

	/**
	 * Info if the link looks like it is for an anchor: `[](#header)`
	 */
	readonly anchorInfo?: {
		/**
		 * Link text before the `#`.
		 *
		 * For `[text](xy#z|abc)` this is `xy`.
		 */
		readonly beforeAnchor: string;

		/**
		 * Text of the anchor before the current position.
		 *
		 * For `[text](xy#z|abc)` this is `z`.
		 */
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

		switch (context.kind) {
			case CompletionContextKind.ReferenceLink: {
				return Array.from(this.provideReferenceSuggestions(document, position, context));
			}

			case CompletionContextKind.LinkDefinition: {
				return [];
			}

			case CompletionContextKind.Link: {
				const items: vscode.CompletionItem[] = [];

				const isAnchorInCurrentDoc = context.anchorInfo && context.anchorInfo.beforeAnchor.length === 0;

				// Add anchor #links in current doc
				if (context.linkPrefix.length === 0 || isAnchorInCurrentDoc) {
					const insertRange = new vscode.Range(context.linkTextStartPosition, position);
					for await (const item of this.provideHeaderSuggestions(document, position, context, insertRange)) {
						items.push(item);
					}
				}

				if (!isAnchorInCurrentDoc) {
					if (context.anchorInfo) { // Anchor to a different document
						const rawUri = this.resolveReference(document, context.anchorInfo.beforeAnchor);
						if (rawUri) {
							const otherDoc = await resolveUriToMarkdownFile(rawUri);
							if (otherDoc) {
								const anchorStartPosition = position.translate({ characterDelta: -(context.anchorInfo.anchorPrefix.length + 1) });
								const range = new vscode.Range(anchorStartPosition, position);
								for await (const item of this.provideHeaderSuggestions(otherDoc, position, context, range)) {
									items.push(item);
								}
							}
						}
					} else { // Normal path suggestions
						for await (const item of this.providePathSuggestions(document, position, context)) {
							items.push(item);
						}
					}
				}

				return items;
			}
		}
	}

	private arePathSuggestionEnabled(document: vscode.TextDocument): boolean {
		const config = vscode.workspace.getConfiguration('markdown', document.uri);
		return config.get('suggest.paths.enabled', true);
	}

	/// [...](...|
	private readonly linkStartPattern = /\[([^\]]*?)\]\(\s*([^\s\(\)]*)$/;

	/// [...][...|
	private readonly referenceLinkStartPattern = /\[([^\]]*?)\]\[\s*([^\s\(\)]*)$/;

	private getPathCompletionContext(document: vscode.TextDocument, position: vscode.Position): CompletionContext | undefined {
		const line = document.lineAt(position.line).text;

		const linePrefixText = line.slice(0, position.character);
		const lineSuffixText = line.slice(position.character);

		const linkPrefixMatch = linePrefixText.match(this.linkStartPattern);
		if (linkPrefixMatch) {
			const prefix = linkPrefixMatch[2];
			if (/^\s*[\w\d\-]+:/.test(prefix)) { // Check if this looks like a 'http:' style uri
				return undefined;
			}

			const anchorMatch = prefix.match(/^(.*)#([\w\d\-]*)$/);

			const suffix = lineSuffixText.match(/^[^\)\s]*/);

			return {
				kind: CompletionContextKind.Link,
				linkPrefix: prefix,
				linkTextStartPosition: position.translate({ characterDelta: -prefix.length }),

				linkSuffix: suffix ? suffix[0] : '',

				anchorInfo: anchorMatch ? {
					beforeAnchor: anchorMatch[1],
					anchorPrefix: anchorMatch[2],
				} : undefined,
			};
		}

		const referenceLinkPrefixMatch = linePrefixText.match(this.referenceLinkStartPattern);
		if (referenceLinkPrefixMatch) {
			const prefix = referenceLinkPrefixMatch[2];
			const suffix = lineSuffixText.match(/^[^\]\s]*/);
			return {
				kind: CompletionContextKind.ReferenceLink,
				linkPrefix: prefix,
				linkTextStartPosition: position.translate({ characterDelta: -prefix.length }),

				linkSuffix: suffix ? suffix[0] : '',
			};
		}

		return undefined;
	}

	private *provideReferenceSuggestions(document: vscode.TextDocument, position: vscode.Position, context: CompletionContext): Iterable<vscode.CompletionItem> {
		const insertionRange = new vscode.Range(context.linkTextStartPosition, position);
		const replacementRange = new vscode.Range(insertionRange.start, position.translate({ characterDelta: context.linkSuffix.length }));

		const definitions = LinkProvider.getDefinitions(document.getText(), document);
		for (const def of definitions) {
			yield {
				kind: vscode.CompletionItemKind.Reference,
				label: def[0],
				range: {
					inserting: insertionRange,
					replacing: replacementRange,
				},
			};
		}
	}

	private async *provideHeaderSuggestions(document: vscode.TextDocument, position: vscode.Position, context: CompletionContext, insertionRange: vscode.Range): AsyncIterable<vscode.CompletionItem> {
		const tocProvider = new TableOfContentsProvider(this.engine, document);
		const toc = await tocProvider.getToc();
		for (const entry of toc) {
			const replacementRange = new vscode.Range(insertionRange.start, position.translate({ characterDelta: context.linkSuffix.length }));
			yield {
				kind: vscode.CompletionItemKind.Reference,
				label: '#' + entry.slug.value,
				range: {
					inserting: insertionRange,
					replacing: replacementRange,
				},
			};
		}
	}

	private async *providePathSuggestions(document: vscode.TextDocument, position: vscode.Position, context: CompletionContext): AsyncIterable<vscode.CompletionItem> {
		const valueBeforeLastSlash = context.linkPrefix.substring(0, context.linkPrefix.lastIndexOf('/') + 1); // keep the last slash

		const parentDir = this.resolveReference(document, valueBeforeLastSlash || '.');
		if (!parentDir) {
			return;
		}

		const pathSegmentStart = position.translate({ characterDelta: valueBeforeLastSlash.length - context.linkPrefix.length });
		const insertRange = new vscode.Range(pathSegmentStart, position);

		const pathSegmentEnd = position.translate({ characterDelta: context.linkSuffix.length });
		const replacementRange = new vscode.Range(pathSegmentStart, pathSegmentEnd);

		let dirInfo: Array<[string, vscode.FileType]>;
		try {
			dirInfo = await vscode.workspace.fs.readDirectory(parentDir);
		} catch {
			return;
		}

		for (const [name, type] of dirInfo) {
			// Exclude paths that start with `.`
			if (name.startsWith('.')) {
				continue;
			}

			const isDir = type === vscode.FileType.Directory;
			yield {
				label: isDir ? name + '/' : name,
				kind: isDir ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File,
				range: {
					inserting: insertRange,
					replacing: replacementRange,
				},
				command: isDir ? { command: 'editor.action.triggerSuggest', title: '' } : undefined,
			};
		}
	}

	private resolveReference(document: vscode.TextDocument, ref: string): vscode.Uri | undefined {
		if (ref.startsWith('/')) {
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
			if (workspaceFolder) {
				return vscode.Uri.joinPath(workspaceFolder.uri, ref);
			}
		}

		try {
			if (document.uri.scheme === 'file') {
				return vscode.Uri.file(resolve(dirname(document.uri.fsPath), ref));
			} else {
				return document.uri.with({
					path: resolve(dirname(document.uri.path), ref),
				});
			}
		} catch (e) {
			return undefined;
		}
	}
}
