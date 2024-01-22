/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IMdParser } from '../../markdownEngine';
import { ITextDocument } from '../../types/textDocument';
import { Mime } from '../../util/mimes';
import { createInsertUriListEdit, externalUriSchemes } from './shared';

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

	public static readonly id = 'insertMarkdownLink';

	public static readonly pasteMimeTypes = [Mime.textPlain];

	constructor(
		private readonly _parser: IMdParser,
	) { }

	async provideDocumentPasteEdits(
		document: vscode.TextDocument,
		ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentPasteEdit | undefined> {
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

		const edit = createInsertUriListEdit(document, ranges, uriText);
		if (!edit) {
			return;
		}

		const pasteEdit = new vscode.DocumentPasteEdit('', edit.label);
		const workspaceEdit = new vscode.WorkspaceEdit();
		workspaceEdit.set(document.uri, edit.edits);
		pasteEdit.additionalEdit = workspaceEdit;

		if (!(await shouldInsertMarkdownLinkByDefault(this._parser, document, pasteUrlSetting, ranges, token))) {
			pasteEdit.yieldTo = [{ mimeType: Mime.textPlain }];
		}

		return pasteEdit;
	}
}

export function registerPasteUrlSupport(selector: vscode.DocumentSelector, parser: IMdParser) {
	return vscode.languages.registerDocumentPasteEditProvider(selector, new PasteUrlEditProvider(parser), {
		id: PasteUrlEditProvider.id,
		pasteMimeTypes: PasteUrlEditProvider.pasteMimeTypes,
	});
}

const smartPasteLineRegexes = [
	{ regex: /(\[[^\[\]]*](?:\([^\(\)]*\)|\[[^\[\]]*]))/g }, // In a Markdown link
	{ regex: /\$\$[\s\S]*?\$\$/gm }, // In a fenced math block
	{ regex: /`[^`]*`/g }, // In inline code
	{ regex: /\$[^$]*\$/g }, // In inline math
	{ regex: /^[ ]{0,3}\[\w+\]:\s.*$/g }, // Block link definition (needed as tokens are not generated for these)
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
	for (const token of tokens) {
		if (token.map && token.map[0] <= selectedRange.start.line && token.map[1] > selectedRange.start.line) {
			if (!['paragraph_open', 'inline', 'heading_open', 'ordered_list_open', 'bullet_list_open', 'list_item_open', 'blockquote_open'].includes(token.type)) {
				return false;
			}
		}
	}

	// Run additional regex checks on the current line to check if we are inside an inline element
	const line = document.getText(new vscode.Range(selectedRange.start.line, 0, selectedRange.start.line, Number.MAX_SAFE_INTEGER));
	for (const regex of smartPasteLineRegexes) {
		for (const match of line.matchAll(regex.regex)) {
			if (match.index !== undefined && selectedRange.start.character >= match.index && selectedRange.start.character <= match.index + match[0].length) {
				return false;
			}
		}
	}

	return true;
}

export function findValidUriInText(text: string): string | undefined {
	const trimmedUrlList = text.trim();

	// Uri must consist of a single sequence of characters without spaces
	if (!/^\S+$/.test(trimmedUrlList)) {
		return;
	}

	let uri: vscode.Uri;
	try {
		uri = vscode.Uri.parse(trimmedUrlList);
	} catch {
		// Could not parse
		return;
	}

	if (!externalUriSchemes.includes(uri.scheme.toLowerCase()) || uri.authority.length <= 1) {
		return;
	}

	return trimmedUrlList;
}
