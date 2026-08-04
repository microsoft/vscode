/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EndOfLine, TextDocument, TextDocumentChangeEvent, workspace } from 'vscode';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import { editFromTextDocumentContentChangeEvents } from './common';

/**
 * Verifies that VS Code content change API reports consistent document edits.
 * Tracks document states and verifies that applying reported edits to the previous state
 * produces the new document state. Reports mismatches via telemetry.
 */
export class VerifyTextDocumentChanges extends Disposable {
	private readonly _documentStates = new Map<string, { text: string; linefeed: EndOfLine }>();

	constructor(
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) {
		super();

		// This comes from telemetry
		const allowedSchemes = new Set([
			'file',
			'vscode-notebook-cell',
			'untitled',
			// "vscode-local",
			// "vscode-chat-code-block",
			// "chat-editing-text-model",
			// "embedded-html",
			// "vscode-userdata",
			// "vscode-remote",
			// "git",
		]);
		function shouldVerifyDoc(doc: TextDocument): boolean {
			return allowedSchemes.has(doc.uri.scheme);
		}

		this._register(workspace.onDidOpenTextDocument(doc => {
			if (!shouldVerifyDoc(doc)) {
				return;
			}
			const docUri = doc.uri.toString();
			this._documentStates.set(docUri, { text: doc.getText(), linefeed: doc.eol });
		}));

		this._register(workspace.onDidCloseTextDocument(doc => {
			if (!shouldVerifyDoc(doc)) {
				return;
			}
			const docUri = doc.uri.toString();
			this._documentStates.delete(docUri);
		}));

		workspace.textDocuments.forEach(doc => {
			if (!shouldVerifyDoc(doc)) {
				return;
			}
			const docUri = doc.uri.toString();
			this._documentStates.set(docUri, { text: doc.getText(), linefeed: doc.eol });
		});

		this._register(workspace.onDidChangeTextDocument(e => {
			if (!shouldVerifyDoc(e.document)) {
				return;
			}
			this._verifyDocumentStateConsistency(e);
		}));
	}

	private _verifyDocumentStateConsistency(e: TextDocumentChangeEvent): void {
		const docUri = e.document.uri.toString();
		const currentText = e.document.getText();
		const previousValue = this._documentStates.get(docUri);

		if (previousValue === undefined) {
			/* __GDPR__
				"vscode.contentChangeForUnknownDocument" : {
					"owner": "hediet",
					"comment": "Telemetry for verifying VSCode content change API consistency"
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('vscode.contentChangeForUnknownDocument', {}, {});
			return;
		}

		this._documentStates.set(docUri, { text: currentText, linefeed: e.document.eol });

		const edit = editFromTextDocumentContentChangeEvents(e.contentChanges);
		const expectedText = edit.apply(previousValue.text);

		if (expectedText !== currentText) {
			/* __GDPR__
				"vscode.contentChangeInconsistencyDetected" : {
					"owner": "hediet",
					"comment": "Telemetry for verifying VSCode content change API consistency",
					"languageId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Language of the currently open document." },
					"sourceOfChange": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Source of the change." },
					"reason": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Reason for change (1 = undo, 2 = redo).", "isMeasurement": true },
					"previousLineFeed": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Line feed of the previously open document.", "isMeasurement": true },
					"currentLineFeed": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Line feed of the currently open document.", "isMeasurement": true },
					"scheme": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Scheme of the currently open document." }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('vscode.contentChangeInconsistencyDetected', {
				languageId: e.document.languageId,
				scheme: e.document.uri.scheme,
				sourceOfChange: e.detailedReason?.source || '',
			}, {
				reason: e.reason,
				previousLineFeed: previousValue.linefeed,
				currentLineFeed: e.document.eol,
			});
		}
	}
}
