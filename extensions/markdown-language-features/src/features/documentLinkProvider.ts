/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { OpenDocumentLinkCommand } from '../commands/openDocumentLink';
import { getUriForLinkWithKnownExternalScheme } from '../util/links';

const localize = nls.loadMessageBundle();

function parseLink(
	document: vscode.TextDocument,
	link: string,
	base: string
): { uri: vscode.Uri, tooltip?: string } {
	const externalSchemeUri = getUriForLinkWithKnownExternalScheme(link);
	if (externalSchemeUri) {
		return { uri: externalSchemeUri };
	}

	// Assume it must be an relative or absolute file path
	// Use a fake scheme to avoid parse warnings
	const tempUri = vscode.Uri.parse(`vscode-resource:${link}`);

	let resourcePath = tempUri.path;
	if (!tempUri.path && document.uri.scheme === 'file') {
		resourcePath = document.uri.path;
	} else if (tempUri.path[0] === '/') {
		const root = vscode.workspace.getWorkspaceFolder(document.uri);
		if (root) {
			resourcePath = path.join(root.uri.fsPath, tempUri.path);
		}
	} else {
		resourcePath = base ? path.join(base, tempUri.path) : tempUri.path;
	}

	return {
		uri: OpenDocumentLinkCommand.createCommandUri(resourcePath, tempUri.fragment),
		tooltip: localize('documentLink.tooltip', 'Follow link')
	};
}

function matchAll(
	pattern: RegExp,
	text: string
): Array<RegExpMatchArray> {
	const out: RegExpMatchArray[] = [];
	pattern.lastIndex = 0;
	let match: RegExpMatchArray | null;
	while ((match = pattern.exec(text))) {
		out.push(match);
	}
	return out;
}

function extractDocumentLink(
	document: vscode.TextDocument,
	base: string,
	pre: number,
	link: string,
	matchIndex: number | undefined
): vscode.DocumentLink | undefined {
	const offset = (matchIndex || 0) + pre;
	const linkStart = document.positionAt(offset);
	const linkEnd = document.positionAt(offset + link.length);
	try {
		const { uri, tooltip } = parseLink(document, link, base);
		const documentLink = new vscode.DocumentLink(
			new vscode.Range(linkStart, linkEnd),
			uri);
		documentLink.tooltip = tooltip;
		return documentLink;
	} catch (e) {
		return undefined;
	}
}

export default class LinkProvider implements vscode.DocumentLinkProvider {
	private readonly linkPattern = /(\[((!\[[^\]]*?\]\(\s*)([^\s\(\)]+?)\s*\)\]|(?:\\\]|[^\]])*\])\(\s*)(([^\s\(\)]|\(\S*?\))+)\s*(".*?")?\)/g;
	private readonly referenceLinkPattern = /(\[((?:\\\]|[^\]])+)\]\[\s*?)([^\s\]]*?)\]/g;
	private readonly definitionPattern = /^([\t ]*\[((?:\\\]|[^\]])+)\]:\s*)(\S+)/gm;

	public provideDocumentLinks(
		document: vscode.TextDocument,
		_token: vscode.CancellationToken
	): vscode.DocumentLink[] {
		const base = document.uri.scheme === 'file' ? path.dirname(document.uri.fsPath) : '';
		const text = document.getText();

		return [
			...this.providerInlineLinks(text, document, base),
			...this.provideReferenceLinks(text, document, base)
		];
	}

	private providerInlineLinks(
		text: string,
		document: vscode.TextDocument,
		base: string
	): vscode.DocumentLink[] {
		const results: vscode.DocumentLink[] = [];
		for (const match of matchAll(this.linkPattern, text)) {
			const matchImage = match[4] && extractDocumentLink(document, base, match[3].length + 1, match[4], match.index);
			if (matchImage) {
				results.push(matchImage);
			}
			const matchLink = extractDocumentLink(document, base, match[1].length, match[5], match.index);
			if (matchLink) {
				results.push(matchLink);
			}
		}
		return results;
	}

	private provideReferenceLinks(
		text: string,
		document: vscode.TextDocument,
		base: string
	): vscode.DocumentLink[] {
		const results: vscode.DocumentLink[] = [];

		const definitions = this.getDefinitions(text, document);
		for (const match of matchAll(this.referenceLinkPattern, text)) {
			let linkStart: vscode.Position;
			let linkEnd: vscode.Position;
			let reference = match[3];
			if (reference) { // [text][ref]
				const pre = match[1];
				const offset = (match.index || 0) + pre.length;
				linkStart = document.positionAt(offset);
				linkEnd = document.positionAt(offset + reference.length);
			} else if (match[2]) { // [ref][]
				reference = match[2];
				const offset = (match.index || 0) + 1;
				linkStart = document.positionAt(offset);
				linkEnd = document.positionAt(offset + match[2].length);
			} else {
				continue;
			}

			try {
				const link = definitions.get(reference);
				if (link) {
					results.push(new vscode.DocumentLink(
						new vscode.Range(linkStart, linkEnd),
						vscode.Uri.parse(`command:_markdown.moveCursorToPosition?${encodeURIComponent(JSON.stringify([link.linkRange.start.line, link.linkRange.start.character]))}`)));
				}
			} catch (e) {
				// noop
			}
		}

		for (const definition of definitions.values()) {
			try {
				const { uri } = parseLink(document, definition.link, base);
				results.push(new vscode.DocumentLink(definition.linkRange, uri));
			} catch (e) {
				// noop
			}
		}

		return results;
	}

	private getDefinitions(text: string, document: vscode.TextDocument) {
		const out = new Map<string, { link: string, linkRange: vscode.Range }>();
		for (const match of matchAll(this.definitionPattern, text)) {
			const pre = match[1];
			const reference = match[2];
			const link = match[3].trim();

			const offset = (match.index || 0) + pre.length;
			const linkStart = document.positionAt(offset);
			const linkEnd = document.positionAt(offset + link.length);

			out.set(reference, {
				link: link,
				linkRange: new vscode.Range(linkStart, linkEnd)
			});
		}
		return out;
	}
}