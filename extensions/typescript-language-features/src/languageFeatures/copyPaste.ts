/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DocumentSelector } from '../configuration/documentSelector';
import { LanguageDescription } from '../configuration/languageDescription';
import { API } from '../tsServer/api';
import protocol from '../tsServer/protocol/protocol';
import * as typeConverters from '../typeConverters';
import { ClientCapability, ITypeScriptServiceClient, ServerResponse } from '../typescriptService';
import { raceTimeout } from '../utils/async';
import FileConfigurationManager from './fileConfigurationManager';
import { conditionalRegistration, requireGlobalConfiguration, requireMinVersion, requireSomeCapability } from './util/dependentRegistration';

class CopyMetadata {

	static parse(data: string): CopyMetadata | undefined {
		try {

			const parsedData = JSON.parse(data);
			const resource = vscode.Uri.parse(parsedData.resource);
			const ranges = parsedData.ranges.map((range: any) => new vscode.Range(range.start, range.end));
			const copyOperation = parsedData.copyOperation ? Promise.resolve(parsedData.copyOperation) : undefined;
			return new CopyMetadata(resource, ranges, copyOperation);
		} catch (error) {
			return undefined;
		}
	}

	constructor(
		public readonly resource: vscode.Uri,
		public readonly ranges: readonly vscode.Range[],
		public readonly copyOperation: Promise<ServerResponse.Response<protocol.PreparePasteEditsResponse>> | undefined
	) { }
}

class TsPasteEdit extends vscode.DocumentPasteEdit {

	static tryCreateFromResponse(
		client: ITypeScriptServiceClient,
		response: ServerResponse.Response<protocol.GetPasteEditsResponse>
	): TsPasteEdit | undefined {
		if (response.type !== 'response' || !response.body?.edits.length) {
			return undefined;
		}

		const pasteEdit = new TsPasteEdit();

		const additionalEdit = new vscode.WorkspaceEdit();
		for (const edit of response.body.edits) {
			additionalEdit.set(client.toResource(edit.fileName), edit.textChanges.map(typeConverters.TextEdit.fromCodeEdit));
		}
		pasteEdit.additionalEdit = additionalEdit;

		return pasteEdit;
	}

	constructor() {
		super('', vscode.l10n.t("Paste with imports"), DocumentPasteProvider.kind);
		this.yieldTo = [
			vscode.DocumentDropOrPasteEditKind.Text.append('plain')
		];
	}
}

class TsPendingPasteEdit extends TsPasteEdit {
	constructor(
		text: string,
		public readonly operation: Promise<ServerResponse.Response<protocol.GetPasteEditsResponse>>
	) {
		super();
		this.insertText = text;
	}
}

const enabledSettingId = 'updateImportsOnPaste.enabled';

class DocumentPasteProvider implements vscode.DocumentPasteEditProvider<TsPasteEdit> {

	static readonly kind = vscode.DocumentDropOrPasteEditKind.TextUpdateImports.append('jsts');
	static readonly metadataMimeType = 'application/vnd.code.jsts.metadata';

	constructor(
		private readonly _modeId: string,
		private readonly _client: ITypeScriptServiceClient,
		private readonly fileConfigurationManager: FileConfigurationManager,
	) { }

	async prepareDocumentPaste(document: vscode.TextDocument, ranges: readonly vscode.Range[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken) {
		if (!this.isEnabled(document)) {
			return;
		}

		const file = this._client.toOpenTsFilePath(document);
		if (!file) {
			return;
		}

		const copyRequest = this._client.interruptGetErr(() => this._client.execute('preparePasteEdits', {
			file,
			copiedTextSpan: ranges.map(typeConverters.Range.toTextSpan),
		}, token));

		const copyTimeout = 200;
		const response = await raceTimeout(copyRequest, copyTimeout);
		if (token.isCancellationRequested) {
			return;
		}

		if (response) {
			if (response.type !== 'response' || !response.body) {
				// We got a response which told us no to bother with the paste
				// Don't store anything so that we don't trigger on paste
				return;
			}

			dataTransfer.set(DocumentPasteProvider.metadataMimeType,
				new vscode.DataTransferItem(new CopyMetadata(document.uri, ranges, undefined)));
		} else {
			// We are still waiting on the response. Store the pending request so that we can try checking it on paste
			// when it has hopefully resolved
			dataTransfer.set(DocumentPasteProvider.metadataMimeType,
				new vscode.DataTransferItem(new CopyMetadata(document.uri, ranges, copyRequest)));
		}
	}

	async provideDocumentPasteEdits(
		document: vscode.TextDocument,
		ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		_context: vscode.DocumentPasteEditContext,
		token: vscode.CancellationToken,
	): Promise<TsPasteEdit[] | undefined> {
		if (!this.isEnabled(document)) {
			return;
		}

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

		let copiedFrom: {
			file: string;
			spans: protocol.TextSpan[];
		} | undefined;
		if (metadata) {
			const spans = metadata.ranges.map(typeConverters.Range.toTextSpan);
			const copyFile = this._client.toTsFilePath(metadata.resource);
			if (copyFile) {
				copiedFrom = { file: copyFile, spans };
			}
		}

		if (copiedFrom?.file === file) {
			// We are pasting in the same file we copied from. No need to do anything
			return;
		}

		const pasteCts = new vscode.CancellationTokenSource();
		token.onCancellationRequested(() => pasteCts.cancel());

		// If we have a copy operation, use that to potentially eagerly cancel the paste if it resolves to false
		metadata?.copyOperation?.then(copyResponse => {
			if (copyResponse.type !== 'response' || !copyResponse.body) {
				pasteCts.cancel();
			}
		}, (_err) => {
			// Expected. May have been cancelled.
		});

		try {
			const pasteOperation = this._client.interruptGetErr(() => {
				this.fileConfigurationManager.ensureConfigurationForDocument(document, token);

				return this._client.execute('getPasteEdits', {
					file,
					// TODO: only supports a single paste for now
					pastedText: [text],
					pasteLocations: ranges.map(typeConverters.Range.toTextSpan),
					copiedFrom
				}, pasteCts.token);
			});

			const pasteTimeout = 200;
			const response = await raceTimeout(pasteOperation, pasteTimeout);
			if (response) {
				// Success, can return real paste edit.
				const edit = TsPasteEdit.tryCreateFromResponse(this._client, response);
				return edit ? [edit] : undefined;
			} else {
				// Still waiting on the response. Eagerly return a paste edit that we will resolve when we
				// really need to apply it
				return [new TsPendingPasteEdit(text, pasteOperation)];
			}
		} finally {
			pasteCts.dispose();
		}
	}

	async resolveDocumentPasteEdit(inEdit: TsPasteEdit, _token: vscode.CancellationToken): Promise<TsPasteEdit | undefined> {
		if (!(inEdit instanceof TsPendingPasteEdit)) {
			return;
		}

		const response = await inEdit.operation;
		const pasteEdit = TsPendingPasteEdit.tryCreateFromResponse(this._client, response);
		return pasteEdit ?? inEdit;
	}

	private async extractMetadata(dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<CopyMetadata | undefined> {
		const metadata = await dataTransfer.get(DocumentPasteProvider.metadataMimeType)?.value;
		if (token.isCancellationRequested) {
			return undefined;
		}

		if (metadata instanceof CopyMetadata) {
			return metadata;
		}

		if (typeof metadata === 'string') {
			return CopyMetadata.parse(metadata);
		}

		return undefined;
	}

	private isEnabled(document: vscode.TextDocument) {
		const config = vscode.workspace.getConfiguration(this._modeId, document.uri);
		return config.get(enabledSettingId, true);
	}
}

export function register(selector: DocumentSelector, language: LanguageDescription, client: ITypeScriptServiceClient, fileConfigurationManager: FileConfigurationManager) {
	return conditionalRegistration([
		requireSomeCapability(client, ClientCapability.Semantic),
		requireMinVersion(client, API.v570),
		requireGlobalConfiguration(language.id, enabledSettingId),
	], () => {
		return vscode.languages.registerDocumentPasteEditProvider(selector.semantic, new DocumentPasteProvider(language.id, client, fileConfigurationManager), {
			providedPasteEditKinds: [DocumentPasteProvider.kind],
			copyMimeTypes: [DocumentPasteProvider.metadataMimeType],
			pasteMimeTypes: [DocumentPasteProvider.metadataMimeType],
		});
	});
}
