/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DocumentSelector } from '../configuration/documentSelector';
import * as typeConverters from '../typeConverters';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import { conditionalRegistration, requireSomeCapability } from './util/dependentRegistration';

class CopyMetadata {
	constructor(
		readonly resource: vscode.Uri,
		readonly ranges: readonly vscode.Range[],
	) { }

	toJSON() {
		return JSON.stringify({
			resource: this.resource.toJSON(),
			ranges: this.ranges,
		});
	}

	static fromJSON(str: string): CopyMetadata | undefined {
		try {
			const parsed = JSON.parse(str);
			return new CopyMetadata(
				vscode.Uri.from(parsed.resource),
				parsed.ranges.map((r: any) => new vscode.Range(r[0].line, r[0].character, r[1].line, r[1].character)));
		} catch {
			// ignore
		}
		return undefined;
	}
}

class DocumentPasteProvider implements vscode.DocumentPasteEditProvider {

	static readonly metadataMimeType = 'application/vnd.code.jsts.metadata';

	constructor(
		private readonly _client: ITypeScriptServiceClient,
	) { }

	prepareDocumentPaste(document: vscode.TextDocument, ranges: readonly vscode.Range[], dataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken) {
		dataTransfer.set(DocumentPasteProvider.metadataMimeType,
			new vscode.DataTransferItem(new CopyMetadata(document.uri, ranges).toJSON()));
	}

	async provideDocumentPasteEdits(document: vscode.TextDocument, ranges: readonly vscode.Range[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<vscode.DocumentPasteEdit | undefined> {
		const file = this._client.toOpenTsFilePath(document);
		if (!file) {
			return;
		}

		const text = await dataTransfer.get('text/plain')?.asString();
		if (!text || token.isCancellationRequested) {
			return;
		}

		// Get optional metadata
		const metadata = await this.extractMetadata(dataTransfer, token);
		if (token.isCancellationRequested) {
			return;
		}

		const copyRange = metadata?.ranges.at(0);
		const copyFile = metadata ? this._client.toTsFilePath(metadata.resource) : undefined;

		const response = await this._client.execute('GetPasteEdits', {
			file,
			pastes: ranges.map(typeConverters.Range.toTextSpan),
			copies: [{
				text,
				range: metadata && copyFile && copyRange ? { file: copyFile, ...typeConverters.Range.toTextSpan(copyRange) } : undefined,
			}]
		}, token);
		if (response.type !== 'response' || !response.body || token.isCancellationRequested) {
			return;
		}

		const edit = new vscode.DocumentPasteEdit('', vscode.l10n.t("Paste with imports"));
		const additionalEdit = new vscode.WorkspaceEdit();
		for (const edit of response.body.edits) {
			additionalEdit.set(this._client.toResource(edit.fileName), edit.textChanges.map(typeConverters.TextEdit.fromCodeEdit));
		}
		edit.additionalEdit = additionalEdit;
		return edit;
	}

	private async extractMetadata(dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<CopyMetadata | undefined> {
		const metadata = await dataTransfer.get(DocumentPasteProvider.metadataMimeType)?.asString();
		if (token.isCancellationRequested) {
			return undefined;
		}

		return metadata ? CopyMetadata.fromJSON(metadata) : undefined;
	}
}

export function register(selector: DocumentSelector, client: ITypeScriptServiceClient) {
	return conditionalRegistration([
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		return vscode.languages.registerDocumentPasteEditProvider(selector.semantic, new DocumentPasteProvider(client), {
			id: 'jsts.pasteWithImports',
			copyMimeTypes: [DocumentPasteProvider.metadataMimeType],
			pasteMimeTypes: ['text/plain'],
		});
	});
}
