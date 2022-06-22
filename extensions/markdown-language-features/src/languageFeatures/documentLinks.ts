/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import * as uri from 'vscode-uri';
import * as Parser from 'web-tree-sitter';
import { OpenDocumentLinkCommand } from '../commands/openDocumentLink';
import { ILogger } from '../logging';
import { coalesce } from '../util/arrays';
import { noopToken } from '../util/cancellation';
import { Disposable } from '../util/dispose';
import { getUriForLinkWithKnownExternalScheme, isOfScheme, Schemes } from '../util/schemes';
import { MdDocumentInfoCache } from '../util/workspaceCache';
import { MdWorkspaceContents, SkinnyTextDocument } from '../workspaceContents';

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
	const externalSchemeUri = getUriForLinkWithKnownExternalScheme(link);
	if (externalSchemeUri) {
		// Normalize VS Code links to target currently running version
		if (isOfScheme(Schemes.vscode, link) || isOfScheme(Schemes['vscode-insiders'], link)) {
			return { kind: 'external', uri: vscode.Uri.parse(link).with({ scheme: vscode.env.uriScheme }) };
		}
		return { kind: 'external', uri: externalSchemeUri };
	}

	if (/^[a-z\-][a-z\-]+:/i.test(link)) {
		// Looks like a uri
		return { kind: 'external', uri: vscode.Uri.parse(link) };
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

function getFragmentRange(text: string, linkRange: vscode.Range): vscode.Range | undefined {
	const index = text.indexOf('#');
	if (index < 0) {
		return undefined;
	}
	return new vscode.Range(linkRange.start.translate({ characterDelta: index + 1 }), linkRange.end);
}

function getLinkSourceFragmentInfo(document: SkinnyTextDocument, link: string, linkRange: vscode.Range): { fragmentRange: vscode.Range | undefined; pathText: string } {
	const fragmentRange = getFragmentRange(link, linkRange);
	return {
		pathText: document.getText(new vscode.Range(linkRange.start, fragmentRange ? fragmentRange.start.translate(0, -1) : linkRange.end)),
		fragmentRange,
	};
}

type TreeSitterLoader = () => Promise<Parser.Language>;

interface TreeSitterState {
	readonly language: Parser.Language;
	readonly linkQuery: Parser.Query;
}

/**
 * Stateless object that extracts link information from markdown files.
 */
export class MdLinkComputer {

	private readonly _treeSitter: Promise<TreeSitterState>;

	constructor(
		loadTreeSitter: TreeSitterLoader,
		private readonly logger: ILogger,
	) {
		this._treeSitter = loadTreeSitter().then((lang): TreeSitterState => {
			const linkQuery = lang.query(`([
				(link (link_destination (text) @link_destination))
				(image (link_destination (text) @link_destination))

				(link (link_label (text) @reference_link))
				(image (link_label (text) @reference_link))
				(link . (link_text (text) @reference_link) .)

				(uri_autolink (text) @uri_autolink)

				(link_reference_definition) @link_definition
			])`);
			return { language: lang, linkQuery };
		});
	}

	public async getAllLinks(document: SkinnyTextDocument, token: vscode.CancellationToken): Promise<MdLink[]> {
		this.logger.verbose('MdLinkComputer', `getAllLinks.start - ${document.uri}}`);
		const treeSitter = await this._treeSitter;
		if (token.isCancellationRequested) {
			return [];
		}
		const result = Array.from(this.getInlineLinks(document, treeSitter));
		this.logger.verbose('MdLinkComputer', `getAllLinks.end - ${document.uri}}`);
		return result;
	}

	private *getInlineLinks(document: SkinnyTextDocument, ts: TreeSitterState): Iterable<MdLink> {
		const parser = new Parser();
		parser.setLanguage(ts.language);
		const tree = parser.parse(document.getText() + '\n'); // Add new line to work around https://github.com/ikatyang/tree-sitter-markdown/issues
		parser.delete();

		const captures = ts.linkQuery.captures(tree.rootNode);
		for (const capture of captures) {
			switch (capture.name) {
				case 'link_destination': {
					const link = this.extractLinkDestination(document, capture.node);
					if (link) {
						yield link;
					}
					break;
				}
				case 'reference_link': {
					const link = this.extractReferenceLink(document, capture.node);
					if (link) {
						yield link;
					}
					break;
				}
				case 'uri_autolink': {
					const link = this.extractAutoLink(document, capture.node);
					if (link) {
						yield link;
					}
					break;
				}
				case 'link_definition': {
					const link = this.extractLinkDefinition(document, capture.node);
					if (link) {
						yield link;
					}
					break;
				}
			}
		}
	}

	private extractLinkDestination(document: SkinnyTextDocument, node: Parser.SyntaxNode): MdLink | undefined {
		const href = parseLink(document, node.text);
		if (!href) {
			return;
		}

		const range = getNodeRange(node);
		return {
			kind: 'link',
			href,
			source: {
				text: node.text,
				resource: document.uri,
				hrefRange: range,
				...getLinkSourceFragmentInfo(document, node.text, range),
			}
		};
	}

	private extractReferenceLink(document: SkinnyTextDocument, node: Parser.SyntaxNode): MdLink | undefined {
		const reference = node.text;
		const hrefRange = getNodeRange(node);

		const line = document.lineAt(hrefRange.start.line);
		// See if link looks like a checkbox
		const checkboxMatch = line.text.match(/^\s*[\-\*]\s*\[x\]/i);
		if (checkboxMatch && hrefRange.start.character <= checkboxMatch[0].length) {
			return;
		}

		return {
			kind: 'link',
			source: {
				text: reference,
				pathText: reference,
				resource: document.uri,
				hrefRange: hrefRange,
				fragmentRange: undefined,
			},
			href: {
				kind: 'reference',
				ref: reference,
			}
		};
	}

	private extractAutoLink(document: SkinnyTextDocument, node: Parser.SyntaxNode): MdLink | undefined {
		const linkTarget = parseLink(document, node.text);
		if (!linkTarget) {
			return undefined;
		}

		const hrefRange = getNodeRange(node);
		return {
			kind: 'link',
			href: linkTarget,
			source: {
				text: node.text,
				resource: document.uri,
				hrefRange: hrefRange,
				...getLinkSourceFragmentInfo(document, node.text, hrefRange),
			}
		};
	}

	private extractLinkDefinition(document: SkinnyTextDocument, node: Parser.SyntaxNode): MdLink | undefined {
		const labelNode = node.child(0)?.child(0);
		if (!labelNode || labelNode.text.startsWith('^')) {
			return;
		}

		const destinationNode = node.child(1)?.child(0);
		if (!destinationNode) {
			return;
		}

		const target = parseLink(document, destinationNode.text);
		if (!target) {
			return;
		}
		const hrefRange = getNodeRange(destinationNode);
		return {
			kind: 'definition',
			source: {
				text: destinationNode.text,
				resource: document.uri,
				hrefRange,
				...getLinkSourceFragmentInfo(document, destinationNode.text, hrefRange),
			},
			ref: { text: labelNode.text, range: getNodeRange(labelNode) },
			href: target,
		};
	}
}

interface MdDocumentLinks {
	readonly links: readonly MdLink[];
	readonly definitions: LinkDefinitionSet;
}

/**
 * Stateful object which provides links for markdown files the workspace.
 */
export class MdLinkProvider extends Disposable {

	private readonly _linkCache: MdDocumentInfoCache<MdDocumentLinks>;

	constructor(
		workspaceContents: MdWorkspaceContents,
		linkComputer: MdLinkComputer,
		logger: ILogger,
	) {
		super();
		this._linkCache = this._register(new MdDocumentInfoCache(workspaceContents, async doc => {
			logger.verbose('LinkProvider', `compute - ${doc.uri}`);

			const links = await linkComputer.getAllLinks(doc, noopToken);
			return {
				links,
				definitions: new LinkDefinitionSet(links),
			};
		}));
	}

	public async getLinks(document: SkinnyTextDocument): Promise<MdDocumentLinks> {
		return this._linkCache.getForDocument(document);
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

function getNodeRange(node: Parser.SyntaxNode): vscode.Range {
	const linkStart = new vscode.Position(node.startPosition.row, node.startPosition.column);
	const linkEnd = new vscode.Position(node.endPosition.row, node.endPosition.column);
	return new vscode.Range(linkStart, linkEnd);
}

export function registerDocumentLinkSupport(
	selector: vscode.DocumentSelector,
	linkProvider: MdLinkProvider,
): vscode.Disposable {
	return vscode.languages.registerDocumentLinkProvider(selector, new MdVsCodeLinkProvider(linkProvider));
}
