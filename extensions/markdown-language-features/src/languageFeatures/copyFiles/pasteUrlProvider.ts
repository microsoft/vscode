/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ITextDocument } from '../../types/textDocument';
import { Mime } from '../../util/mimes';
import { createInsertUriListEdit, externalUriSchemes } from './shared';

enum PasteUrlAsFormattedLink {
	Always = 'always',
	Smart = 'smart',
	Never = 'never'
}

function getPasteUrlAsFormattedLinkSetting(document: vscode.TextDocument): PasteUrlAsFormattedLink {
	return vscode.workspace.getConfiguration('markdown', document)
		.get<PasteUrlAsFormattedLink>('editor.pasteUrlAsFormattedLink.enabled', PasteUrlAsFormattedLink.Smart);
}

/**
 * Adds support for pasting text uris to create markdown links.
 *
 * This only applies to `text/plain`. Other mimes like `text/uri-list` are handled by ResourcePasteOrDropProvider.
 */
class PasteUrlEditProvider implements vscode.DocumentPasteEditProvider {

	public static readonly id = 'insertMarkdownLink';

	public static readonly pasteMimeTypes = [Mime.textPlain];

	async provideDocumentPasteEdits(
		document: vscode.TextDocument,
		ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentPasteEdit | undefined> {
		const pasteUrlSetting = getPasteUrlAsFormattedLinkSetting(document);
		if (pasteUrlSetting === PasteUrlAsFormattedLink.Never) {
			return;
		}

		const item = dataTransfer.get(Mime.textPlain);
		const urlList = await item?.asString();
		if (token.isCancellationRequested || !urlList) {
			return;
		}

		const uriText = findValidUriInText(urlList);
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

		// If smart pasting is enabled, deprioritize this provider when:
		// - The user has no selection
		// - At least one of the ranges occurs in a context where smart pasting is disabled (such as a fenced code block)
		if (pasteUrlSetting === PasteUrlAsFormattedLink.Smart) {
			if (!ranges.every(range => shouldSmartPaste(document, range))) {
				pasteEdit.yieldTo = [{ mimeType: Mime.textPlain }];
			}
		}
		return pasteEdit;
	}
}

export function registerLinkPasteSupport(selector: vscode.DocumentSelector,) {
	return vscode.languages.registerDocumentPasteEditProvider(selector, new PasteUrlEditProvider(), {
		id: PasteUrlEditProvider.id,
		pasteMimeTypes: PasteUrlEditProvider.pasteMimeTypes,
	});
}

const smartPasteRegexes = [
	{ regex: /(\[[^\[\]]*](?:\([^\(\)]*\)|\[[^\[\]]*]))/g }, // In a Markdown link
	{ regex: /^```[\s\S]*?```$/gm }, // In a backtick fenced code block
	{ regex: /^~~~[\s\S]*?~~~$/gm }, // In a tildefenced code block
	{ regex: /^\$\$[\s\S]*?\$\$$/gm }, // In a fenced math block
	{ regex: /`[^`]*`/g }, // In inline code
	{ regex: /\$[^$]*\$/g }, // In inline math
];

export function shouldSmartPaste(document: ITextDocument, selectedRange: vscode.Range): boolean {
	// Disable for empty selections and multi-line selections
	if (selectedRange.isEmpty || selectedRange.start.line !== selectedRange.end.line) {
		return false;
	}

	const rangeText = document.getText(selectedRange);
	// Disable for whitespace only selections
	if (rangeText.trim().length === 0) {
		return false;
	}

	// Disable when the selection is already a link
	if (findValidUriInText(rangeText)) {
		return false;
	}

	if (/\[.*\]\(.*\)/.test(rangeText) || /!\[.*\]\(.*\)/.test(rangeText)) {
		return false;
	}

	for (const regex of smartPasteRegexes) {
		const matches = [...document.getText().matchAll(regex.regex)];
		for (const match of matches) {
			if (match.index !== undefined) {
				const useDefaultPaste = selectedRange.start.character > match.index && selectedRange.end.character < match.index + match[0].length;
				if (useDefaultPaste) {
					return false;
				}
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
