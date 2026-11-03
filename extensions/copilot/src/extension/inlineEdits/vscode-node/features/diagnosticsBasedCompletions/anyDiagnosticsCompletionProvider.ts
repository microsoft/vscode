/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CodeActionData } from '../../../../../platform/inlineEdits/common/dataTypes/codeActionData';
import { LanguageId } from '../../../../../platform/inlineEdits/common/dataTypes/languageId';
import { ILogger } from '../../../../../platform/log/common/logService';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { TextReplacement } from '../../../../../util/vs/editor/common/core/edits/textEdit';
import { Position } from '../../../../../util/vs/editor/common/core/position';
import { INextEditDisplayLocation } from '../../../node/nextEditResult';
import { IVSCodeObservableDocument } from '../../parts/vscodeWorkspace';
import { Diagnostic, DiagnosticCompletionItem, DiagnosticInlineEditRequestLogContext, IDiagnosticCodeAction, IDiagnosticCompletionProvider, isDiagnosticWithinDistance, log, logList } from './diagnosticsCompletions';

interface IAnyCodeAction extends IDiagnosticCodeAction {
	type: string;
}

export class AnyDiagnosticCompletionItem extends DiagnosticCompletionItem {

	public readonly providerName = 'any';

	constructor(
		codeAction: IAnyCodeAction,
		diagnostic: Diagnostic,
		private readonly _nextEditDisplayLabel: string | undefined,
		workspaceDocument: IVSCodeObservableDocument,
	) {
		super(codeAction.type, diagnostic, codeAction.edit, workspaceDocument);
	}

	protected override _getDisplayLocation(): INextEditDisplayLocation | undefined {
		if (!this._nextEditDisplayLabel) {
			return undefined;
		}

		const transformer = this._workspaceDocument.value.get().getTransformer();
		return { range: transformer.getRange(this.diagnostic.range), label: this._nextEditDisplayLabel };
	}
}

export class AnyDiagnosticCompletionProvider implements IDiagnosticCompletionProvider<AnyDiagnosticCompletionItem> {

	public static SupportedLanguages = new Set<string>(['*']);

	public readonly providerName = 'any';

	constructor(private readonly _logger: ILogger) { }

	public providesCompletionsForDiagnostic(workspaceDocument: IVSCodeObservableDocument, diagnostic: Diagnostic, language: LanguageId, pos: Position): boolean {
		return isDiagnosticWithinDistance(workspaceDocument, diagnostic, pos, 5);
	}

	async provideDiagnosticCompletionItem(workspaceDocument: IVSCodeObservableDocument, sortedDiagnostics: Diagnostic[], pos: Position, logContext: DiagnosticInlineEditRequestLogContext, token: CancellationToken): Promise<AnyDiagnosticCompletionItem | null> {

		for (const diagnostic of sortedDiagnostics) {
			const availableCodeActions = await workspaceDocument.getCodeActions(diagnostic.range, 3, token);
			if (availableCodeActions === undefined) {
				log(`Fetching code actions likely timed out for \`${diagnostic.message}\``, logContext, this._logger);
				continue;
			}

			const codeActionsFixingCodeAction = availableCodeActions.filter(action => doesCodeActionFixDiagnostics(action, diagnostic));
			if (codeActionsFixingCodeAction.length === 0) {
				continue;
			}

			logList(`Found the following code action which fix \`${diagnostic.message}\``, codeActionsFixingCodeAction, logContext, this._logger);

			const filteredCodeActionsWithEdit = filterCodeActions(codeActionsFixingCodeAction);

			if (filteredCodeActionsWithEdit.length === 0) {
				continue;
			}

			const codeAction = filteredCodeActionsWithEdit[0];
			if (!codeAction.edits) { continue; }

			const joinedEdit = TextReplacement.joinReplacements(codeAction.edits, workspaceDocument.value.get());
			const anyCodeAction: IAnyCodeAction = {
				edit: joinedEdit,
				type: getSanitizedCodeActionTitle(codeAction)
			};

			let displayLocationLabel: string | undefined;
			const editDistance = Math.abs(joinedEdit.range.startLineNumber - pos.lineNumber);
			if (editDistance > 12) {
				displayLocationLabel = codeAction.title;
			}

			const item = new AnyDiagnosticCompletionItem(anyCodeAction, diagnostic, displayLocationLabel, workspaceDocument);
			log(`Created Completion Item for diagnostic: ${diagnostic.message}: ${item.toLineEdit().toString()}`);
			return item;
		}

		return null;
	}

	completionItemRejected(item: AnyDiagnosticCompletionItem): void { }
}

function doesCodeActionFixDiagnostics(action: CodeActionData, diagnostic: Diagnostic): boolean {
	return action.diagnostics.some(d => diagnostic.data.message === d.message && diagnostic.data.range.equals(d.range));
}

function getSanitizedCodeActionTitle(action: CodeActionData): string {
	return action.title.replace(/(["'])(.*?)\1/g, '$1...$1');
}

function filterCodeActions(codeActionsWithEdit: CodeActionData[]): CodeActionData[] {
	return codeActionsWithEdit.filter(action => {
		const edit = action.edits;
		if (!edit) { return false; }

		if (action.title === 'Infer parameter types from usage') {
			if (edit.length === 0) { return false; }
			if (edit.length === 1 && ['any', 'unknown', 'undefined'].some(e => edit[0].text.includes(e))) { return false; }
		}

		return true;
	});
}
