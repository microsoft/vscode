/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IMdParser } from '../../markdownEngine';
import { Mime } from '../../util/mimes';
import { UriList } from '../../util/uriList';
import { createInsertUriListEdit, linkEditKind } from './shared';
import { InsertMarkdownLink, findValidUriInText, shouldInsertMarkdownLinkByDefault } from './smartDropOrPaste';

/**
 * Adds support for pasting text uris to create markdown links.
 *
 * This only applies to `text/plain`. Other mimes like `text/uri-list` are handled by ResourcePasteOrDropProvider.
 */
class PasteUrlEditProvider implements vscode.DocumentPasteEditProvider {

	public static readonly kind = linkEditKind;

	public static readonly pasteMimeTypes = [Mime.textPlain];

	constructor(
		private readonly _parser: IMdParser,
	) { }

	async provideDocumentPasteEdits(
		document: vscode.TextDocument,
		ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		context: vscode.DocumentPasteEditContext,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentPasteEdit[] | undefined> {
		const pasteUrlSetting = vscode.workspace.getConfiguration('markdown', document)
			.get<InsertMarkdownLink>('editor.pasteUrlAsFormattedLink.enabled', InsertMarkdownLink.SmartWithSelection);
		if (pasteUrlSetting === InsertMarkdownLink.Never) {
			return;
		}

		const item = dataTransfer.get(Mime.textPlain);
		const text = await item?.asString();
		if (token.isCancellationRequested || !text) {
			return;
		}

		// TODO: If the user has explicitly requested to paste as a markdown link,
		// try to paste even if we don't have a valid uri
		const uriText = findValidUriInText(text);
		if (!uriText) {
			return;
		}

		const edit = createInsertUriListEdit(document, ranges, UriList.from(uriText), {
			linkKindHint: context.only,
			preserveAbsoluteUris: true
		});
		if (!edit) {
			return;
		}

		const pasteEdit = new vscode.DocumentPasteEdit('', edit.label, PasteUrlEditProvider.kind);
		const workspaceEdit = new vscode.WorkspaceEdit();
		workspaceEdit.set(document.uri, edit.edits);
		pasteEdit.additionalEdit = workspaceEdit;

		if (!(await shouldInsertMarkdownLinkByDefault(this._parser, document, pasteUrlSetting, ranges, token))) {
			pasteEdit.yieldTo = [
				vscode.DocumentDropOrPasteEditKind.Text,
				vscode.DocumentDropOrPasteEditKind.Empty.append('uri')
			];
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
