/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dirname, resolve } from 'path';
import * as vscode from 'vscode';
import { IMdParser } from '../markdownEngine';
import { TableOfContents } from '../tableOfContents';
import { ITextDocument } from '../types/textDocument';
import { resolveUriToMarkdownFile } from '../util/openDocumentLink';
import { Schemes } from '../util/schemes';
import { IMdWorkspace } from '../workspace';
import { MdLinkProvider } from './documentLinks';

enum CompletionContextKind {
	/** `[...](|)` */
	Link,

	/** `[...][|]` */
	ReferenceLink,

	/** `[]: |` */
	LinkDefinition,
}

interface AnchorContext {
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
	readonly anchorInfo?: AnchorContext;

	/**
	 * Indicates that the completion does not require encoding.
	 */
	readonly skipEncoding?: boolean;
}

function tryDecodeUriComponent(str: string): string {
	try {
		return decodeURIComponent(str);
	} catch {
		return str;
	}
}

/**
 * Adds path completions in markdown files by implementing {@link vscode.CompletionItemProvider}.
 */
export class MdVsCodePathCompletionProvider implements vscode.CompletionItemProvider {

	constructor(
		private readonly workspace: IMdWorkspace,
		private readonly parser: IMdParser,
		private readonly linkProvider: MdLinkProvider,
	) { }

	public async provideCompletionItems(document: ITextDocument, position: vscode.Position, _token: vscode.CancellationToken, _context: vscode.CompletionContext): Promise<vscode.CompletionItem[]> {
		if (!this.arePathSuggestionEnabled(document)) {
			return [];
		}

		const context = this.getPathCompletionContext(document, position);
		if (!context) {
			return [];
		}

		switch (context.kind) {
			case CompletionContextKind.ReferenceLink: {
				const items: vscode.CompletionItem[] = [];
				for await (const item of this.provideReferenceSuggestions(document, position, context)) {
					items.push(item);
				}
				return items;
			}

			case CompletionContextKind.LinkDefinition:
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
							const otherDoc = await resolveUriToMarkdownFile(this.workspace, rawUri);
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

	private arePathSuggestionEnabled(document: ITextDocument): boolean {
		const config = vscode.workspace.getConfiguration('markdown', document.uri);
		return config.get('suggest.paths.enabled', true);
	}

	/// [...](...|
	private readonly linkStartPattern = /\[([^\]]*?)\]\(\s*(<[^\>\)]*|[^\s\(\)]*)$/;

	/// [...][...|
	private readonly referenceLinkStartPattern = /\[([^\]]*?)\]\[\s*([^\s\(\)]*)$/;

	/// [id]: |
	private readonly definitionPattern = /^\s*\[[\w\-]+\]:\s*([^\s]*)$/m;

	private getPathCompletionContext(document: ITextDocument, position: vscode.Position): CompletionContext | undefined {
		const line = document.lineAt(position.line).text;

		const linePrefixText = line.slice(0, position.character);
		const lineSuffixText = line.slice(position.character);

		const linkPrefixMatch = linePrefixText.match(this.linkStartPattern);
		if (linkPrefixMatch) {
			const isAngleBracketLink = linkPrefixMatch[2].startsWith('<');
			const prefix = linkPrefixMatch[2].slice(isAngleBracketLink ? 1 : 0);
			if (this.refLooksLikeUrl(prefix)) {
				return undefined;
			}

			const suffix = lineSuffixText.match(/^[^\)\s][^\)\s\>]*/);
			return {
				kind: CompletionContextKind.Link,
				linkPrefix: tryDecodeUriComponent(prefix),
				linkTextStartPosition: position.translate({ characterDelta: -prefix.length }),
				linkSuffix: suffix ? suffix[0] : '',
				anchorInfo: this.getAnchorContext(prefix),
				skipEncoding: isAngleBracketLink,
			};
		}

		const definitionLinkPrefixMatch = linePrefixText.match(this.definitionPattern);
		if (definitionLinkPrefixMatch) {
			const prefix = definitionLinkPrefixMatch[1];
			if (this.refLooksLikeUrl(prefix)) {
				return undefined;
			}

			const suffix = lineSuffixText.match(/^[^\s]*/);
			return {
				kind: CompletionContextKind.LinkDefinition,
				linkPrefix: tryDecodeUriComponent(prefix),
				linkTextStartPosition: position.translate({ characterDelta: -prefix.length }),
				linkSuffix: suffix ? suffix[0] : '',
				anchorInfo: this.getAnchorContext(prefix),
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

	/**
	 * Check if {@param ref} looks like a 'http:' style url.
	 */
	private refLooksLikeUrl(prefix: string): boolean {
		return /^\s*[\w\d\-]+:/.test(prefix);
	}

	private getAnchorContext(prefix: string): AnchorContext | undefined {
		const anchorMatch = prefix.match(/^(.*)#([\w\d\-]*)$/);
		if (!anchorMatch) {
			return undefined;
		}
		return {
			beforeAnchor: anchorMatch[1],
			anchorPrefix: anchorMatch[2],
		};
	}

	private async *provideReferenceSuggestions(document: ITextDocument, position: vscode.Position, context: CompletionContext): AsyncIterable<vscode.CompletionItem> {
		const insertionRange = new vscode.Range(context.linkTextStartPosition, position);
		const replacementRange = new vscode.Range(insertionRange.start, position.translate({ characterDelta: context.linkSuffix.length }));

		const { definitions } = await this.linkProvider.getLinks(document);
		for (const [_, def] of definitions) {
			yield {
				kind: vscode.CompletionItemKind.Reference,
				label: def.ref.text,
				range: {
					inserting: insertionRange,
					replacing: replacementRange,
				},
			};
		}
	}

	private async *provideHeaderSuggestions(document: ITextDocument, position: vscode.Position, context: CompletionContext, insertionRange: vscode.Range): AsyncIterable<vscode.CompletionItem> {
		const toc = await TableOfContents.createForDocumentOrNotebook(this.parser, document);
		for (const entry of toc.entries) {
			const replacementRange = new vscode.Range(insertionRange.start, position.translate({ characterDelta: context.linkSuffix.length }));
			yield {
				kind: vscode.CompletionItemKind.Reference,
				label: '#' + decodeURIComponent(entry.slug.value),
				range: {
					inserting: insertionRange,
					replacing: replacementRange,
				},
			};
		}
	}

	private async *providePathSuggestions(document: ITextDocument, position: vscode.Position, context: CompletionContext): AsyncIterable<vscode.CompletionItem> {
		const valueBeforeLastSlash = context.linkPrefix.substring(0, context.linkPrefix.lastIndexOf('/') + 1); // keep the last slash

		const parentDir = this.resolveReference(document, valueBeforeLastSlash || '.');
		if (!parentDir) {
			return;
		}

		const pathSegmentStart = position.translate({ characterDelta: valueBeforeLastSlash.length - context.linkPrefix.length });
		const insertRange = new vscode.Range(pathSegmentStart, position);

		const pathSegmentEnd = position.translate({ characterDelta: context.linkSuffix.length });
		const replacementRange = new vscode.Range(pathSegmentStart, pathSegmentEnd);

		const dirInfo = await this.workspace.readDirectory(parentDir);
		for (const [name, type] of dirInfo) {
			// Exclude paths that start with `.`
			if (name.startsWith('.')) {
				continue;
			}

			const isDir = type === vscode.FileType.Directory;
			yield {
				label: isDir ? name + '/' : name,
				insertText: (context.skipEncoding ? name : encodeURIComponent(name)) + (isDir ? '/' : ''),
				kind: isDir ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File,
				range: {
					inserting: insertRange,
					replacing: replacementRange,
				},
				command: isDir ? { command: 'editor.action.triggerSuggest', title: '' } : undefined,
			};
		}
	}

	private resolveReference(document: ITextDocument, ref: string): vscode.Uri | undefined {
		const docUri = this.getFileUriOfTextDocument(document);

		if (ref.startsWith('/')) {
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(docUri);
			if (workspaceFolder) {
				return vscode.Uri.joinPath(workspaceFolder.uri, ref);
			} else {
				return this.resolvePath(docUri, ref.slice(1));
			}
		}

		return this.resolvePath(docUri, ref);
	}

	private resolvePath(root: vscode.Uri, ref: string): vscode.Uri | undefined {
		try {
			if (root.scheme === Schemes.file) {
				return vscode.Uri.file(resolve(dirname(root.fsPath), ref));
			} else {
				return root.with({
					path: resolve(dirname(root.path), ref),
				});
			}
		} catch {
			return undefined;
		}
	}

	private getFileUriOfTextDocument(document: ITextDocument) {
		if (document.uri.scheme === 'vscode-notebook-cell') {
			const notebook = vscode.workspace.notebookDocuments
				.find(notebook => notebook.getCells().some(cell => cell.document === document));

			if (notebook) {
				return notebook.uri;
			}
		}

		return document.uri;
	}
}

export function registerPathCompletionSupport(
	selector: vscode.DocumentSelector,
	workspace: IMdWorkspace,
	parser: IMdParser,
	linkProvider: MdLinkProvider,
): vscode.Disposable {
	return vscode.languages.registerCompletionItemProvider(selector, new MdVsCodePathCompletionProvider(workspace, parser, linkProvider), '.', '/', '#');
}
