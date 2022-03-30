/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import * as uri from 'vscode-uri';
import { OpenDocumentLinkCommand } from '../commands/openDocumentLink';
import { MarkdownEngine } from '../markdownEngine';
import { getUriForLinkWithKnownExternalScheme, isOfScheme, Schemes } from '../util/schemes';
import { SkinnyTextDocument } from '../workspaceContents';

const localize = nls.loadMessageBundle();

export interface ExternalLinkTarget {
	readonly kind: 'external';
	readonly uri: vscode.Uri;
}

export interface InternalLinkTarget {
	readonly kind: 'internal';

	readonly fromResource: vscode.Uri;

	readonly path: vscode.Uri;
	readonly fragment: string;
}

export interface ReferenceLinkTarget {
	readonly kind: 'reference';

	readonly position: vscode.Position;
}

export interface DefinitionLinkTarget {
	readonly kind: 'definition';

	readonly target: ExternalLinkTarget | InternalLinkTarget;
}

export type LinkTarget = ExternalLinkTarget | InternalLinkTarget | ReferenceLinkTarget | DefinitionLinkTarget;


function parseLink(
	document: SkinnyTextDocument,
	link: string,
): ExternalLinkTarget | InternalLinkTarget | undefined {
	const cleanLink = stripAngleBrackets(link);
	const externalSchemeUri = getUriForLinkWithKnownExternalScheme(cleanLink);
	if (externalSchemeUri) {
		// Normalize VS Code links to target currently running version
		if (isOfScheme(Schemes.vscode, link) || isOfScheme(Schemes['vscode-insiders'], link)) {
			return { kind: 'external', uri: vscode.Uri.parse(link).with({ scheme: vscode.env.uriScheme }) };
		}
		return { kind: 'external', uri: externalSchemeUri };
	}

	// Assume it must be an relative or absolute file path
	// Use a fake scheme to avoid parse warnings
	const tempUri = vscode.Uri.parse(`vscode-resource:${link}`);

	let resourceUri: vscode.Uri | undefined;
	if (!tempUri.path) {
		resourceUri = document.uri;
	} else if (tempUri.path[0] === '/') {
		const root = getWorkspaceFolder(document);
		if (root) {
			resourceUri = vscode.Uri.joinPath(root, tempUri.path);
		}
	} else {
		if (document.uri.scheme === Schemes.untitled) {
			const root = getWorkspaceFolder(document);
			if (root) {
				resourceUri = vscode.Uri.joinPath(root, tempUri.path);
			}
		} else {
			const base = uri.Utils.dirname(document.uri);
			resourceUri = vscode.Uri.joinPath(base, tempUri.path);
		}
	}

	if (!resourceUri) {
		return undefined;
	}

	resourceUri = resourceUri.with({ fragment: tempUri.fragment });

	return {
		kind: 'internal',
		fromResource: document.uri,
		path: resourceUri,
		fragment: tempUri.fragment,
	};
}

function getWorkspaceFolder(document: SkinnyTextDocument) {
	return vscode.workspace.getWorkspaceFolder(document.uri)?.uri
		|| vscode.workspace.workspaceFolders?.[0]?.uri;
}

export interface LinkData {
	readonly target: LinkTarget;
	readonly sourceRange: vscode.Range;
}

function extractDocumentLink(
	document: SkinnyTextDocument,
	pre: number,
	link: string,
	matchIndex: number | undefined
): LinkData | undefined {
	const offset = (matchIndex || 0) + pre;
	const linkStart = document.positionAt(offset);
	const linkEnd = document.positionAt(offset + link.length);
	try {
		const linkTarget = parseLink(document, link);
		if (!linkTarget) {
			return undefined;
		}
		return {
			target: linkTarget,
			sourceRange: new vscode.Range(linkStart, linkEnd)
		};
	} catch {
		return undefined;
	}
}

const angleBracketLinkRe = /^<(.*)>$/;

/**
 * Used to strip brackets from the markdown link
 *
 * <http://example.com> will be transformed to http://example.com
*/
function stripAngleBrackets(link: string) {
	return link.replace(angleBracketLinkRe, '$1');
}

/**
 * Matches `[text](link)`
 */
const linkPattern = /(\[((!\[[^\]]*?\]\(\s*)([^\s\(\)]+?)\s*\)\]|(?:\\\]|[^\]])*\])\(\s*)(([^\s\(\)]|\([^\s\(\)]*?\))+)\s*(".*?")?\)/g;

/**
 * Matches `[text][ref]`
 */
const referenceLinkPattern = /(?:(\[((?:\\\]|[^\]])+)\]\[\s*?)([^\s\]]*?)\]|\[\s*?([^\s\]]*?)\])(?!\:)/g;

/**
 * Matches `[text]: link`
 */
const definitionPattern = /^([\t ]*\[(?!\^)((?:\\\]|[^\]])+)\]:\s*)([^<]\S*|<[^>]+>)/gm;

const inlineCodePattern = /(?:^|[^`])(`+)(?:.+?|.*?(?:(?:\r?\n).+?)*?)(?:\r?\n)?\1(?:$|[^`])/gm;

interface CodeInDocument {
	/**
	 * code blocks and fences each represented by [line_start,line_end).
	 */
	readonly multiline: ReadonlyArray<[number, number]>;

	/**
	 * inline code spans each represented by {@link vscode.Range}.
	 */
	readonly inline: readonly vscode.Range[];
}

async function findCode(document: SkinnyTextDocument, engine: MarkdownEngine): Promise<CodeInDocument> {
	const tokens = await engine.parse(document);
	const multiline = tokens.filter(t => (t.type === 'code_block' || t.type === 'fence') && !!t.map).map(t => t.map) as [number, number][];

	const text = document.getText();
	const inline = [...text.matchAll(inlineCodePattern)].map(match => {
		const start = match.index || 0;
		return new vscode.Range(document.positionAt(start), document.positionAt(start + match[0].length));
	});

	return { multiline, inline };
}

function isLinkInsideCode(code: CodeInDocument, link: LinkData) {
	return code.multiline.some(interval => link.sourceRange.start.line >= interval[0] && link.sourceRange.start.line < interval[1]) ||
		code.inline.some(position => position.intersection(link.sourceRange));
}

function createDocumentLink(sourceRange: vscode.Range, target: LinkTarget): vscode.DocumentLink {
	switch (target.kind) {
		case 'external': {
			return new vscode.DocumentLink(sourceRange, target.uri);
		}
		case 'internal': {
			const uri = OpenDocumentLinkCommand.createCommandUri(target.fromResource, target.path, target.fragment);
			const documentLink = new vscode.DocumentLink(sourceRange, uri);
			documentLink.tooltip = localize('documentLink.tooltip', 'Follow link');
			return documentLink;
		}
		case 'reference': {
			return new vscode.DocumentLink(
				sourceRange,
				vscode.Uri.parse(`command:_markdown.moveCursorToPosition?${encodeURIComponent(JSON.stringify([target.position.line, target.position.character]))}`));
		}
		case 'definition':
			return createDocumentLink(sourceRange, target.target);
	}
}

export class MdLinkProvider implements vscode.DocumentLinkProvider {
	constructor(
		private readonly engine: MarkdownEngine
	) { }

	public async provideDocumentLinks(
		document: SkinnyTextDocument,
		_token: vscode.CancellationToken
	): Promise<vscode.DocumentLink[]> {
		return (await this.getAllLinks(document)).map(data => createDocumentLink(data.sourceRange, data.target));
	}

	public async getAllLinks(document: SkinnyTextDocument): Promise<LinkData[]> {
		return Array.from([
			...(await this.getInlineLinks(document)),
			...this.getReferenceLinks(document),
			...this.getDefinitionLinks(document),
		]);
	}

	public async getInlineLinks(document: SkinnyTextDocument): Promise<LinkData[]> {
		const text = document.getText();

		const results: LinkData[] = [];
		const codeInDocument = await findCode(document, this.engine);
		for (const match of text.matchAll(linkPattern)) {
			const matchImageData = match[4] && extractDocumentLink(document, match[3].length + 1, match[4], match.index);
			if (matchImageData && !isLinkInsideCode(codeInDocument, matchImageData)) {
				results.push(matchImageData);
			}
			const matchLinkData = extractDocumentLink(document, match[1].length, match[5], match.index);
			if (matchLinkData && !isLinkInsideCode(codeInDocument, matchLinkData)) {
				results.push(matchLinkData);
			}
		}
		return results;
	}

	public *getReferenceLinks(document: SkinnyTextDocument): Iterable<LinkData> {
		const text = document.getText();
		const definitions = this.getDefinitions(document);
		for (const match of text.matchAll(referenceLinkPattern)) {
			let linkStart: vscode.Position;
			let linkEnd: vscode.Position;
			let reference = match[3];
			if (reference) { // [text][ref]
				const pre = match[1];
				const offset = (match.index || 0) + pre.length;
				linkStart = document.positionAt(offset);
				linkEnd = document.positionAt(offset + reference.length);
			} else if (match[4]) { // [ref][], [ref]
				reference = match[4];
				const offset = (match.index || 0) + 1;
				linkStart = document.positionAt(offset);
				linkEnd = document.positionAt(offset + reference.length);
			} else {
				continue;
			}

			const link = definitions.get(reference);
			if (link) {
				yield {
					sourceRange: new vscode.Range(linkStart, linkEnd),
					target: {
						kind: 'reference',
						position: link.linkRange.start
					}
				};

			}
		}
	}

	public *getDefinitionLinks(document: SkinnyTextDocument): Iterable<LinkData> {
		const definitions = this.getDefinitions(document);
		for (const definition of definitions.values()) {
			try {
				const target = parseLink(document, definition.link);
				if (target) {
					yield {
						sourceRange: definition.linkRange,
						target: {
							kind: 'definition',
							target
						}
					};
				}
			} catch (e) {
				// noop
			}
		}
	}

	public getDefinitions(document: SkinnyTextDocument): Map<string, { readonly link: string; readonly linkRange: vscode.Range }> {
		const text = document.getText();
		const out = new Map<string, { link: string; linkRange: vscode.Range }>();
		for (const match of text.matchAll(definitionPattern)) {
			const pre = match[1];
			const reference = match[2];
			const link = match[3].trim();
			const offset = (match.index || 0) + pre.length;

			if (angleBracketLinkRe.test(link)) {
				const linkStart = document.positionAt(offset + 1);
				const linkEnd = document.positionAt(offset + link.length - 1);
				out.set(reference, {
					link: link.substring(1, link.length - 1),
					linkRange: new vscode.Range(linkStart, linkEnd)
				});
			} else {
				const linkStart = document.positionAt(offset);
				const linkEnd = document.positionAt(offset + link.length);
				out.set(reference, {
					link: link,
					linkRange: new vscode.Range(linkStart, linkEnd)
				});
			}
		}
		return out;
	}
}
