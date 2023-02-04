/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, Connection, Diagnostic, Disposable, DocumentDiagnosticParams, DocumentDiagnosticReport, DocumentDiagnosticReportKind, TextDocuments } from 'vscode-languageserver';
import { TextDocument } from 'vscode-html-languageservice';
import { formatError, runSafe } from './runner';
import { RuntimeEnvironment } from '../htmlServer';

export type Validator = (textDocument: TextDocument) => Promise<Diagnostic[]>;
export type DiagnosticsSupport = {
	dispose(): void;
	requestRefresh(): void;
};

export function registerDiagnosticsPushSupport(documents: TextDocuments<TextDocument>, connection: Connection, runtime: RuntimeEnvironment, validate: Validator): DiagnosticsSupport {

	const pendingValidationRequests: { [uri: string]: Disposable } = {};
	const validationDelayMs = 500;

	const disposables: Disposable[] = [];

	// The content of a text document has changed. This event is emitted
	// when the text document first opened or when its content has changed.
	documents.onDidChangeContent(change => {
		triggerValidation(change.document);
	}, undefined, disposables);

	// a document has closed: clear all diagnostics
	documents.onDidClose(event => {
		cleanPendingValidation(event.document);
		connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
	}, undefined, disposables);

	function cleanPendingValidation(textDocument: TextDocument): void {
		const request = pendingValidationRequests[textDocument.uri];
		if (request) {
			request.dispose();
			delete pendingValidationRequests[textDocument.uri];
		}
	}

	function triggerValidation(textDocument: TextDocument): void {
		cleanPendingValidation(textDocument);
		const request = pendingValidationRequests[textDocument.uri] = runtime.timer.setTimeout(async () => {
			if (request === pendingValidationRequests[textDocument.uri]) {
				try {
					const diagnostics = await validate(textDocument);
					if (request === pendingValidationRequests[textDocument.uri]) {
						connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
					}
					delete pendingValidationRequests[textDocument.uri];
				} catch (e) {
					connection.console.error(formatError(`Error while validating ${textDocument.uri}`, e));
				}
			}
		}, validationDelayMs);
	}

	return {
		requestRefresh: () => {
			documents.all().forEach(triggerValidation);
		},
		dispose: () => {
			disposables.forEach(d => d.dispose());
			disposables.length = 0;
			const keys = Object.keys(pendingValidationRequests);
			for (const key of keys) {
				pendingValidationRequests[key].dispose();
				delete pendingValidationRequests[key];
			}
		}
	};
}

export function registerDiagnosticsPullSupport(documents: TextDocuments<TextDocument>, connection: Connection, runtime: RuntimeEnvironment, validate: Validator): DiagnosticsSupport {

	function newDocumentDiagnosticReport(diagnostics: Diagnostic[]): DocumentDiagnosticReport {
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: diagnostics
		};
	}

	const registration = connection.languages.diagnostics.on(async (params: DocumentDiagnosticParams, token: CancellationToken) => {
		return runSafe(runtime, async () => {
			const document = documents.get(params.textDocument.uri);
			if (document) {
				return newDocumentDiagnosticReport(await validate(document));
			}
			return newDocumentDiagnosticReport([]);

		}, newDocumentDiagnosticReport([]), `Error while computing diagnostics for ${params.textDocument.uri}`, token);
	});

	function requestRefresh(): void {
		connection.languages.diagnostics.refresh();
	}

	return {
		requestRefresh,
		dispose: () => {
			registration.dispose();
		}
	};

}
