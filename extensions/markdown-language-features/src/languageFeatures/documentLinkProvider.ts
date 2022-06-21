/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import * as uri from 'vscode-uri';
import { OpenDocumentLinkCommand } from '../commands/openDocumentLink';
import { MarkdownEngine } from '../markdownEngine';
import { coalesce } from '../util/arrays';
import { noopToken } from '../util/cancellation';
import { Disposable } from '../util/dispose';
import { getUriForLinkWithKnownExternalScheme, isOfScheme, Schemes } from '../util/schemes';
import { MdWorkspaceContents, SkinnyTextDocument } from '../workspaceContents';
import { MdDocumentInfoCache } from './workspaceCache';

const localize = nls.loadMessageBundle();

export interface ExternalHref {
	readonly kind: 'external';
	readonly uri: vscode.Uri;
}

export interface InternalHref {
	readonly kind: 'internal';
	readonly path: vscode.Uri;
	readonly fragment: string;
}

export interface ReferenceHref {
	readonly kind: 'reference';
	readonly ref: string;
}

export type LinkHref = ExternalHref | InternalHref | ReferenceHref;


function parseLink(
	document: SkinnyTextDocument,
	link: string,
): ExternalHref | InternalHref | undefined {
	const cleanLink = stripAngleBrackets(link);
	const externalSchemeUri = getUriForLinkWithKnownExternalScheme(cleanLink);
	if (externalSchemeUri) {
		// Normalize VS Code links to target currently running version
		if (isOfScheme(Schemes.vscode, link) || isOfScheme(Schemes['vscode-insiders'], link)) {
			return { kind: 'external', uri: vscode.Uri.parse(link).with({ scheme: vscode.env.uriScheme }) };
		}
		return { kind: 'external', uri: externalSchemeUri };
	}

	if (/^[a-z\-][a-z\-]+:/i.test(cleanLink)) {
		// Looks like a uri
		return { kind: 'external', uri: vscode.Uri.parse(cleanLink) };
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

	return {
		kind: 'internal',
		path: resourceUri.with({ fragment: '' }),
		fragment: tempUri.fragment,
	};
}

function getWorkspaceFolder(document: SkinnyTextDocument) {
	return vscode.workspace.getWorkspaceFolder(document.uri)?.uri
		|| vscode.workspace.workspaceFolders?.[0]?.uri;
}

export interface MdLinkSource {
	/**
	 * The original text of the link destination in code.
	 */
	readonly text: string;

	/**
	 * The original text of just the link's path in code.
	 */
	readonly pathText: string;

	readonly resource: vscode.Uri;
	readonly hrefRange: vscode.Range;
	readonly fragmentRange: vscode.Range | undefined;
}

export interface MdInlineLink {
	readonly kind: 'link';
	readonly source: MdLinkSource;
	readonly href: LinkHref;
}

export interface MdLinkDefinition {
	readonly kind: 'definition';
	readonly source: MdLinkSource;
	readonly ref: {
		readonly range: vscode.Range;
		readonly text: string;
	};
	readonly href: ExternalHref | InternalHref;
}

export type MdLink = MdInlineLink | MdLinkDefinition;

function extractDocumentLink(
	document: SkinnyTextDocument,
	pre: string,
	rawLink: string,
	matchIndex: number | undefined
): MdLink | undefined {
	const isAngleBracketLink = rawLink.startsWith('<');
	const link = stripAngleBrackets(rawLink);

	const offset = (matchIndex || 0) + pre.length + (isAngleBracketLink ? 1 : 0);
	const linkStart = document.positionAt(offset);
	const linkEnd = document.positionAt(offset + link.length);
	try {
		const linkTarget = parseLink(document, link);
		if (!linkTarget) {
			return undefined;
		}
		return {
			kind: 'link',
			href: linkTarget,
			source: {
				text: link,
				resource: document.uri,
				hrefRange: new vscode.Range(linkStart, linkEnd),
				...getLinkSourceFragmentInfo(document, link, linkStart, linkEnd),
			}
		};
	} catch {
		return undefined;
	}
}

function getFragmentRange(text: string, start: vscode.Position, end: vscode.Position): vscode.Range | undefined {
	const index = text.indexOf('#');
	if (index < 0) {
		return undefined;
	}
	return new vscode.Range(start.translate({ characterDelta: index + 1 }), end);
}

function getLinkSourceFragmentInfo(document: SkinnyTextDocument, link: string, linkStart: vscode.Position, linkEnd: vscode.Position): { fragmentRange: vscode.Range | undefined; pathText: string } {
	const fragmentRange = getFragmentRange(link, linkStart, linkEnd);
	return {
		pathText: document.getText(new vscode.Range(linkStart, fragmentRange ? fragmentRange.start.translate(0, -1) : linkEnd)),
		fragmentRange,
	};
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

const r = String.raw;

/**
 * Matches `[text](link)` or `[text](<link>)`
 */
const linkPattern = new RegExp(
	// text
	r`(\[` + // open prefix match -->
	/**/r`(?:` +
	/*****/r`[^\[\]\\]|` + // Non-bracket chars, or...
	/*****/r`\\.|` + // Escaped char, or...
	/*****/r`\[[^\[\]]*\]` + // Matched bracket pair
	/**/r`)*` +
	r`\]` +

	// Destination
	r`\(\s*)` + // <-- close prefix match
	/**/r`(` +
	/*****/r`[^\s\(\)\<](?:[^\s\(\)]|\([^\s\(\)]*?\))*|` + // Link without whitespace, or...
	/*****/r`<[^<>]*>` + // In angle brackets
	/**/r`)` +

	// Title
	/**/r`\s*(?:"[^"]*"|'[^']*'|\([^\(\)]*\))?\s*` +
	r`\)`,
	'g');

/**
* Matches `[text][ref]` or `[shorthand]`
*/
const referenceLinkPattern = /(^|[^\]\\])(?:(?:(\[((?:\\\]|[^\]])+)\]\[\s*?)([^\s\]]*?)\]|\[\s*?([^\s\]]*?)\])(?![\:\(]))/gm;

/**
 * Matches `<http://example.com>`
 */
const autoLinkPattern = /\<(\w+:[^\>\s]+)\>/g;

/**
 * Matches `[text]: link`
 */
const definitionPattern = /^([\t ]*\[(?!\^)((?:\\\]|[^\]])+)\]:\s*)([^<]\S*|<[^>]+>)/gm;

const inlineCodePattern = /(?:^|[^`])(`+)(?:.+?|.*?(?:(?:\r?\n).+?)*?)(?:\r?\n)?\1(?:$|[^`])/gm;

class NoLinkRanges {
	public static async compute(document: SkinnyTextDocument, engine: MarkdownEngine): Promise<NoLinkRanges> {
		const tokens = await engine.parse(document);
		const multiline = tokens.filter(t => (t.type === 'code_block' || t.type === 'fence' || t.type === 'html_block') && !!t.map).map(t => t.map) as [number, number][];

		const text = document.getText();
		const inline = [...text.matchAll(inlineCodePattern)].map(match => {
			const start = match.index || 0;
			return new vscode.Range(document.positionAt(start), document.positionAt(start + match[0].length));
		});

		return new NoLinkRanges(multiline, inline);
	}

	private constructor(
		/**
		 * code blocks and fences each represented by [line_start,line_end).
		 */
		public readonly multiline: ReadonlyArray<[number, number]>,

		/**
		 * Inline code spans where links should not be detected
		 */
		public readonly inline: readonly vscode.Range[]
	) { }

	contains(range: vscode.Range): boolean {
		return this.multiline.some(interval => range.start.line >= interval[0] && range.start.line < interval[1]) ||
			this.inline.some(inlineRange => inlineRange.contains(range.start));
	}
}

/**
 * Stateless object that extracts link information from markdown files.
 */
export class MdLinkComputer {

	constructor(
		private readonly engine: MarkdownEngine
	) { }

	public async getAllLinks(document: SkinnyTextDocument, token: vscode.CancellationToken): Promise<MdLink[]> {
		const noLinkRanges = await NoLinkRanges.compute(document, this.engine);
		if (token.isCancellationRequested) {
			return [];
		}

		return Array.from([
			...this.getInlineLinks(document, noLinkRanges),
			...this.getReferenceLinks(document, noLinkRanges),
			...this.getLinkDefinitions(document, noLinkRanges),
			...this.getAutoLinks(document, noLinkRanges),
		]);
	}

	private *getInlineLinks(document: SkinnyTextDocument, noLinkRanges: NoLinkRanges): Iterable<MdLink> {
		const text = document.getText();
		for (const match of text.matchAll(linkPattern)) {
			const matchLinkData = extractDocumentLink(document, match[1], match[2], match.index);
			if (matchLinkData && !noLinkRanges.contains(matchLinkData.source.hrefRange)) {
				yield matchLinkData;

				// Also check link destination for links
				for (const innerMatch of match[1].matchAll(linkPattern)) {
					const innerData = extractDocumentLink(document, innerMatch[1], innerMatch[2], (match.index ?? 0) + (innerMatch.index ?? 0));
					if (innerData) {
						yield innerData;
					}
				}
			}
		}
	}

	private * getAutoLinks(document: SkinnyTextDocument, noLinkRanges: NoLinkRanges): Iterable<MdLink> {
		const text = document.getText();

		for (const match of text.matchAll(autoLinkPattern)) {
			const link = match[1];
			const linkTarget = parseLink(document, link);
			if (linkTarget) {
				const offset = (match.index ?? 0) + 1;
				const linkStart = document.positionAt(offset);
				const linkEnd = document.positionAt(offset + link.length);
				const hrefRange = new vscode.Range(linkStart, linkEnd);
				if (noLinkRanges.contains(hrefRange)) {
					continue;
				}
				yield {
					kind: 'link',
					href: linkTarget,
					source: {
						text: link,
						resource: document.uri,
						hrefRange: new vscode.Range(linkStart, linkEnd),
						...getLinkSourceFragmentInfo(document, link, linkStart, linkEnd),
					}
				};
			}
		}
	}

	private *getReferenceLinks(document: SkinnyTextDocument, noLinkRanges: NoLinkRanges): Iterable<MdLink> {
		const text = document.getText();
		for (const match of text.matchAll(referenceLinkPattern)) {
			let linkStart: vscode.Position;
			let linkEnd: vscode.Position;
			let reference = match[4];
			if (reference) { // [text][ref]
				const pre = match[2];
				const offset = ((match.index ?? 0) + match[1].length) + pre.length;
				linkStart = document.positionAt(offset);
				linkEnd = document.positionAt(offset + reference.length);
			} else if (match[5]) { // [ref][], [ref]
				reference = match[5];
				const offset = ((match.index ?? 0) + match[1].length) + 1;
				linkStart = document.positionAt(offset);
				const line = document.lineAt(linkStart.line);
				// See if link looks like a checkbox
				const checkboxMatch = line.text.match(/^\s*[\-\*]\s*\[x\]/i);
				if (checkboxMatch && linkStart.character <= checkboxMatch[0].length) {
					continue;
				}
				linkEnd = document.positionAt(offset + reference.length);
			} else {
				continue;
			}

			const hrefRange = new vscode.Range(linkStart, linkEnd);
			if (noLinkRanges.contains(hrefRange)) {
				continue;
			}

			yield {
				kind: 'link',
				source: {
					text: reference,
					pathText: reference,
					resource: document.uri,
					hrefRange,
					fragmentRange: undefined,
				},
				href: {
					kind: 'reference',
					ref: reference,
				}
			};
		}
	}

	private *getLinkDefinitions(document: SkinnyTextDocument, noLinkRanges: NoLinkRanges): Iterable<MdLinkDefinition> {
		const text = document.getText();
		for (const match of text.matchAll(definitionPattern)) {
			const pre = match[1];
			const reference = match[2];
			const link = match[3].trim();
			const offset = (match.index || 0) + pre.length;

			const refStart = document.positionAt((match.index ?? 0) + 1);
			const refRange = new vscode.Range(refStart, refStart.translate({ characterDelta: reference.length }));

			let linkStart: vscode.Position;
			let linkEnd: vscode.Position;
			let text: string;
			if (angleBracketLinkRe.test(link)) {
				linkStart = document.positionAt(offset + 1);
				linkEnd = document.positionAt(offset + link.length - 1);
				text = link.substring(1, link.length - 1);
			} else {
				linkStart = document.positionAt(offset);
				linkEnd = document.positionAt(offset + link.length);
				text = link;
			}
			const hrefRange = new vscode.Range(linkStart, linkEnd);
			if (noLinkRanges.contains(hrefRange)) {
				continue;
			}
			const target = parseLink(document, text);
			if (target) {
				yield {
					kind: 'definition',
					source: {
						text: link,
						resource: document.uri,
						hrefRange,
						...getLinkSourceFragmentInfo(document, link, linkStart, linkEnd),
					},
					ref: { text: reference, range: refRange },
					href: target,
				};
			}
		}
	}
}

/**
 * Stateful object which provides links for markdown files the workspace.
 */
export class MdLinkProvider extends Disposable {

	private readonly _linkCache: MdDocumentInfoCache<readonly MdLink[]>;

	private readonly linkComputer: MdLinkComputer;

	constructor(
		engine: MarkdownEngine,
		workspaceContents: MdWorkspaceContents,
	) {
		super();
		this.linkComputer = new MdLinkComputer(engine);
		this._linkCache = this._register(new MdDocumentInfoCache(workspaceContents, doc => this.linkComputer.getAllLinks(doc, noopToken)));
	}

	public async getLinks(document: SkinnyTextDocument): Promise<{
		readonly links: readonly MdLink[];
		readonly definitions: LinkDefinitionSet;
	}> {
		const links = (await this._linkCache.get(document.uri)) ?? [];
		return {
			links,
			definitions: new LinkDefinitionSet(links),
		};
	}
}

export class LinkDefinitionSet implements Iterable<[string, MdLinkDefinition]> {
	private readonly _map = new Map<string, MdLinkDefinition>();

	constructor(links: Iterable<MdLink>) {
		for (const link of links) {
			if (link.kind === 'definition') {
				this._map.set(link.ref.text, link);
			}
		}
	}

	public [Symbol.iterator](): Iterator<[string, MdLinkDefinition]> {
		return this._map.entries();
	}

	public lookup(ref: string): MdLinkDefinition | undefined {
		return this._map.get(ref);
	}
}

export class MdVsCodeLinkProvider implements vscode.DocumentLinkProvider {

	constructor(
		private readonly _linkProvider: MdLinkProvider,
	) { }

	public async provideDocumentLinks(
		document: SkinnyTextDocument,
		token: vscode.CancellationToken
	): Promise<vscode.DocumentLink[]> {
		const { links, definitions } = await this._linkProvider.getLinks(document);
		if (token.isCancellationRequested) {
			return [];
		}

		return coalesce(links.map(data => this.toValidDocumentLink(data, definitions)));
	}

	private toValidDocumentLink(link: MdLink, definitionSet: LinkDefinitionSet): vscode.DocumentLink | undefined {
		switch (link.href.kind) {
			case 'external': {
				return new vscode.DocumentLink(link.source.hrefRange, link.href.uri);
			}
			case 'internal': {
				const uri = OpenDocumentLinkCommand.createCommandUri(link.source.resource, link.href.path, link.href.fragment);
				const documentLink = new vscode.DocumentLink(link.source.hrefRange, uri);
				documentLink.tooltip = localize('documentLink.tooltip', 'Follow link');
				return documentLink;
			}
			case 'reference': {
				const def = definitionSet.lookup(link.href.ref);
				if (def) {
					const documentLink = new vscode.DocumentLink(
						link.source.hrefRange,
						vscode.Uri.parse(`command:_markdown.moveCursorToPosition?${encodeURIComponent(JSON.stringify([def.source.hrefRange.start.line, def.source.hrefRange.start.character]))}`));
					documentLink.tooltip = localize('documentLink.referenceTooltip', 'Go to link definition');
					return documentLink;
				} else {
					return undefined;
				}
			}
		}
	}
}

export function registerDocumentLinkSupport(
	selector: vscode.DocumentSelector,
	linkProvider: MdLinkProvider,
): vscode.Disposable {
	return vscode.languages.registerDocumentLinkProvider(selector, new MdVsCodeLinkProvider(linkProvider));
}
