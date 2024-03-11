/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IMdParser } from '../../markdownEngine';
import { ITextDocument } from '../../types/textDocument';
import { Mime } from '../../util/mimes';
import { Schemes } from '../../util/schemes';
import { createInsertUriListEdit } from './shared';

export enum PasteUrlAsMarkdownLink {
	Always = 'always',
	SmartWithSelection = 'smartWithSelection',
	Smart = 'smart',
	Never = 'never'
}

function getPasteUrlAsFormattedLinkSetting(document: vscode.TextDocument): PasteUrlAsMarkdownLink {
	return vscode.workspace.getConfiguration('markdown', document)
		.get<PasteUrlAsMarkdownLink>('editor.pasteUrlAsFormattedLink.enabled', PasteUrlAsMarkdownLink.SmartWithSelection);
}

/**
 * Adds support for pasting text uris to create markdown links.
 *
 * This only applies to `text/plain`. Other mimes like `text/uri-list` are handled by ResourcePasteOrDropProvider.
 */
class PasteUrlEditProvider implements vscode.DocumentPasteEditProvider {

	public static readonly kind = vscode.DocumentPasteEditKind.Empty.append('markdown', 'link');

	public static readonly pasteMimeTypes = [Mime.textPlain];

	constructor(
		private readonly _parser: IMdParser,
	) { }

	async provideDocumentPasteEdits(
		document: vscode.TextDocument,
		ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		_context: vscode.DocumentPasteEditContext,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentPasteEdit[] | undefined> {
		const pasteUrlSetting = getPasteUrlAsFormattedLinkSetting(document);
		if (pasteUrlSetting === PasteUrlAsMarkdownLink.Never) {
			return;
		}

		const item = dataTransfer.get(Mime.textPlain);
		const text = await item?.asString();
		if (token.isCancellationRequested || !text) {
			return;
		}

		const uriText = findValidUriInText(text);
		if (!uriText) {
			return;
		}

		const edit = createInsertUriListEdit(document, ranges, uriText, { preserveAbsoluteUris: true });
		if (!edit) {
			return;
		}

		const pasteEdit = new vscode.DocumentPasteEdit('', edit.label, PasteUrlEditProvider.kind);
		const workspaceEdit = new vscode.WorkspaceEdit();
		workspaceEdit.set(document.uri, edit.edits);
		pasteEdit.additionalEdit = workspaceEdit;

		if (!(await shouldInsertMarkdownLinkByDefault(this._parser, document, pasteUrlSetting, ranges, token))) {
			pasteEdit.yieldTo = [{ mimeType: Mime.textPlain }];
		}

		return [pasteEdit];
	}
}

export function registerPasteUrlSupport(selector: vscode.DocumentSelector, parser: IMdParser) {
	return vscode.languages.registerDocumentPasteEditProvider(selector, new PasteUrlEditProvider(parser), {
		providedPasteEditKinds: [PasteUrlEditProvider.kind],
		pasteMimeTypes: PasteUrlEditProvider.pasteMimeTypes,
	});
}

const smartPasteLineRegexes = [
	{ regex: /(\[[^\[\]]*](?:\([^\(\)]*\)|\[[^\[\]]*]))/g }, // In a Markdown link
	{ regex: /\$\$[\s\S]*?\$\$/gm }, // In a fenced math block
	{ regex: /`[^`]*`/g }, // In inline code
	{ regex: /\$[^$]*\$/g }, // In inline math
	{ regex: /<[^<>\s]*>/g }, // Autolink
	{ regex: /^[ ]{0,3}\[\w+\]:\s.*$/g, isWholeLine: true }, // Block link definition (needed as tokens are not generated for these)
];

export async function shouldInsertMarkdownLinkByDefault(
	parser: IMdParser,
	document: ITextDocument,
	pasteUrlSetting: PasteUrlAsMarkdownLink,
	ranges: readonly vscode.Range[],
	token: vscode.CancellationToken,
): Promise<boolean> {
	switch (pasteUrlSetting) {
		case PasteUrlAsMarkdownLink.Always: {
			return true;
		}
		case PasteUrlAsMarkdownLink.Smart: {
			return checkSmart();
		}
		case PasteUrlAsMarkdownLink.SmartWithSelection: {
			// At least one range must not be empty
			if (!ranges.some(range => document.getText(range).trim().length > 0)) {
				return false;
			}
			// And all ranges must be smart
			return checkSmart();
		}
		default: {
			return false;
		}
	}

	async function checkSmart(): Promise<boolean> {
		return (await Promise.all(ranges.map(range => shouldSmartPasteForSelection(parser, document, range, token)))).every(x => x);
	}
}

const textTokenTypes = new Set(['paragraph_open', 'inline', 'heading_open', 'ordered_list_open', 'bullet_list_open', 'list_item_open', 'blockquote_open']);

async function shouldSmartPasteForSelection(
	parser: IMdParser,
	document: ITextDocument,
	selectedRange: vscode.Range,
	token: vscode.CancellationToken,
): Promise<boolean> {
	// Disable for multi-line selections
	if (selectedRange.start.line !== selectedRange.end.line) {
		return false;
	}

	const rangeText = document.getText(selectedRange);
	// Disable when the selection is already a link
	if (findValidUriInText(rangeText)) {
		return false;
	}

	if (/\[.*\]\(.*\)/.test(rangeText) || /!\[.*\]\(.*\)/.test(rangeText)) {
		return false;
	}

	// Check if selection is inside a special block level element using markdown engine
	const tokens = await parser.tokenize(document);
	if (token.isCancellationRequested) {
		return false;
	}

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (!token.map) {
			continue;
		}
		if (token.map[0] <= selectedRange.start.line && token.map[1] > selectedRange.start.line) {
			if (!textTokenTypes.has(token.type)) {
				return false;
			}
		}

		// Special case for html such as:
		//
		// <b>
		// |
		// </b>
		//
		// In this case pasting will cause the html block to be created even though the cursor is not currently inside a block
		if (token.type === 'html_block' && token.map[1] === selectedRange.start.line) {
			const nextToken = tokens.at(i + 1);
			// The next token does not need to be a html_block, but it must be on the next line
			if (nextToken?.map?.[0] === selectedRange.end.line + 1) {
				return false;
			}
		}
	}

	// Run additional regex checks on the current line to check if we are inside an inline element
	const line = document.getText(new vscode.Range(selectedRange.start.line, 0, selectedRange.start.line, Number.MAX_SAFE_INTEGER));
	for (const regex of smartPasteLineRegexes) {
		for (const match of line.matchAll(regex.regex)) {
			if (match.index === undefined) {
				continue;
			}

			if (regex.isWholeLine) {
				return false;
			}

			if (selectedRange.start.character > match.index && selectedRange.start.character < match.index + match[0].length) {
				return false;
			}
		}
	}

	return true;
}


const externalUriSchemes: ReadonlySet<string> = new Set([
	Schemes.http,
	Schemes.https,
	Schemes.mailto,
	Schemes.file,
]);

export function findValidUriInText(text: string): string | undefined {
	const trimmedUrlList = text.trim();

	if (
		!/^\S+$/.test(trimmedUrlList) // Uri must consist of a single sequence of characters without spaces
		|| !trimmedUrlList.includes(':') // And it must have colon somewhere for the scheme. We will verify the schema again later
	) {
		return;
	}

	let uri: vscode.Uri;
	try {
		uri = vscode.Uri.parse(trimmedUrlList);
	} catch {
		// Could not parse
		return;
	}

	// `Uri.parse` is lenient and will return a `file:` uri even for non-uri text such as `abc`
	// Make sure that the resolved scheme starts the original text
	if (!trimmedUrlList.toLowerCase().startsWith(uri.scheme.toLowerCase() + ':')) {
		return;
	}

	// Only enable for an allow list of schemes. Otherwise this can be accidentally activated for non-uri text
	// such as `c:\abc` or `value:foo`
	if (!externalUriSchemes.has(uri.scheme.toLowerCase())) {
		return;
	}

	// Some part of the uri must not be empty
	// This disables the feature for text such as `http:`
	if (!uri.authority && uri.path.length < 2 && !uri.query && !uri.fragment) {
		return;
	}

	return trimmedUrlList;
}
