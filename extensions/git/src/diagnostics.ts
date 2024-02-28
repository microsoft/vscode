/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CodeAction, CodeActionKind, CodeActionProvider, Diagnostic, DiagnosticCollection, DiagnosticSeverity, Disposable, Range, Selection, TextDocument, Uri, WorkspaceEdit, l10n, languages, workspace } from 'vscode';
import { mapEvent, filterEvent, dispose } from './util';
import { Model } from './model';

export enum DiagnosticCodes {
	empty_message = 'empty_message',
	line_length = 'line_length'
}

export class GitCommitInputBoxDiagnosticsManager {

	private readonly diagnostics: DiagnosticCollection;
	private readonly severity = DiagnosticSeverity.Warning;
	private readonly disposables: Disposable[] = [];

	constructor(private readonly model: Model) {
		this.diagnostics = languages.createDiagnosticCollection();

		this.migrateInputValidationSettings()
			.then(() => {
				mapEvent(filterEvent(workspace.onDidChangeTextDocument, e => e.document.uri.scheme === 'vscode-scm'), e => e.document)(this.onDidChangeTextDocument, this, this.disposables);
				filterEvent(workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git.inputValidation') || e.affectsConfiguration('git.inputValidationLength') || e.affectsConfiguration('git.inputValidationSubjectLength'))(this.onDidChangeConfiguration, this, this.disposables);
			});
	}

	public getDiagnostics(uri: Uri): ReadonlyArray<Diagnostic> {
		return this.diagnostics.get(uri) ?? [];
	}

	private async migrateInputValidationSettings(): Promise<void> {
		try {
			const config = workspace.getConfiguration('git');
			const inputValidation = config.inspect<'always' | 'warn' | 'off' | boolean>('inputValidation');

			if (inputValidation === undefined) {
				return;
			}

			// Workspace setting
			if (typeof inputValidation.workspaceValue === 'string') {
				await config.update('inputValidation', inputValidation.workspaceValue !== 'off', false);
			}

			// User setting
			if (typeof inputValidation.globalValue === 'string') {
				await config.update('inputValidation', inputValidation.workspaceValue !== 'off', true);
			}
		} catch { }
	}

	private onDidChangeConfiguration(): void {
		for (const repository of this.model.repositories) {
			this.onDidChangeTextDocument(repository.inputBox.document);
		}
	}

	private onDidChangeTextDocument(document: TextDocument): void {
		const config = workspace.getConfiguration('git');
		const inputValidation = config.get<boolean>('inputValidation', false);
		if (!inputValidation) {
			this.diagnostics.set(document.uri, undefined);
			return;
		}

		if (/^\s+$/.test(document.getText())) {
			const documentRange = new Range(document.lineAt(0).range.start, document.lineAt(document.lineCount - 1).range.end);
			const diagnostic = new Diagnostic(documentRange, l10n.t('Current commit message only contains whitespace characters'), this.severity);
			diagnostic.code = DiagnosticCodes.empty_message;

			this.diagnostics.set(document.uri, [diagnostic]);
			return;
		}

		const diagnostics: Diagnostic[] = [];
		const inputValidationLength = config.get<number>('inputValidationLength', 50);
		const inputValidationSubjectLength = config.get<number | undefined>('inputValidationSubjectLength', undefined);

		for (let index = 0; index < document.lineCount; index++) {
			const line = document.lineAt(index);
			const threshold = index === 0 ? inputValidationSubjectLength ?? inputValidationLength : inputValidationLength;

			if (line.text.length > threshold) {
				const diagnostic = new Diagnostic(line.range, l10n.t('{0} characters over {1} in current line', line.text.length - threshold, threshold), this.severity);
				diagnostic.code = DiagnosticCodes.line_length;

				diagnostics.push(diagnostic);
			}
		}

		this.diagnostics.set(document.uri, diagnostics);
	}

	dispose() {
		dispose(this.disposables);
	}
}

export class GitCommitInputBoxCodeActionsProvider implements CodeActionProvider {

	private readonly disposables: Disposable[] = [];

	constructor(private readonly diagnosticsManager: GitCommitInputBoxDiagnosticsManager) {
		this.disposables.push(languages.registerCodeActionsProvider({ scheme: 'vscode-scm' }, this));
	}

	provideCodeActions(document: TextDocument, range: Range | Selection): CodeAction[] {
		const codeActions: CodeAction[] = [];
		const diagnostics = this.diagnosticsManager.getDiagnostics(document.uri);
		const wrapAllLinesCodeAction = this.getWrapAllLinesCodeAction(document, diagnostics);

		for (const diagnostic of diagnostics) {
			if (!diagnostic.range.contains(range)) {
				continue;
			}

			switch (diagnostic.code) {
				case DiagnosticCodes.empty_message: {
					const workspaceEdit = new WorkspaceEdit();
					workspaceEdit.delete(document.uri, diagnostic.range);

					const codeAction = new CodeAction(l10n.t('Clear whitespace characters'), CodeActionKind.QuickFix);
					codeAction.diagnostics = [diagnostic];
					codeAction.edit = workspaceEdit;
					codeActions.push(codeAction);

					break;
				}
				case DiagnosticCodes.line_length: {
					const workspaceEdit = this.getWrapLineWorkspaceEdit(document, diagnostic.range);

					const codeAction = new CodeAction(l10n.t('Hard wrap line'), CodeActionKind.QuickFix);
					codeAction.diagnostics = [diagnostic];
					codeAction.edit = workspaceEdit;
					codeActions.push(codeAction);

					if (wrapAllLinesCodeAction) {
						wrapAllLinesCodeAction.diagnostics = [diagnostic];
						codeActions.push(wrapAllLinesCodeAction);
					}

					break;
				}
			}
		}

		return codeActions;
	}

	private getWrapLineWorkspaceEdit(document: TextDocument, range: Range): WorkspaceEdit {
		const lineSegments = this.wrapTextDocumentLine(document, range.start.line);

		const workspaceEdit = new WorkspaceEdit();
		workspaceEdit.replace(document.uri, range, lineSegments.join('\n'));

		return workspaceEdit;
	}

	private getWrapAllLinesCodeAction(document: TextDocument, diagnostics: readonly Diagnostic[]): CodeAction | undefined {
		const lineLengthDiagnostics = diagnostics.filter(d => d.code === DiagnosticCodes.line_length);
		if (lineLengthDiagnostics.length < 2) {
			return undefined;
		}

		const wrapAllLinesCodeAction = new CodeAction(l10n.t('Hard wrap all lines'), CodeActionKind.QuickFix);
		wrapAllLinesCodeAction.edit = this.getWrapAllLinesWorkspaceEdit(document, lineLengthDiagnostics);

		return wrapAllLinesCodeAction;
	}

	private getWrapAllLinesWorkspaceEdit(document: TextDocument, diagnostics: Diagnostic[]): WorkspaceEdit {
		const workspaceEdit = new WorkspaceEdit();

		for (const diagnostic of diagnostics) {
			const lineSegments = this.wrapTextDocumentLine(document, diagnostic.range.start.line);
			workspaceEdit.replace(document.uri, diagnostic.range, lineSegments.join('\n'));
		}

		return workspaceEdit;
	}

	private wrapTextDocumentLine(document: TextDocument, line: number): string[] {
		const config = workspace.getConfiguration('git');
		const inputValidationLength = config.get<number>('inputValidationLength', 50);
		const inputValidationSubjectLength = config.get<number | undefined>('inputValidationSubjectLength', undefined);
		const lineLengthThreshold = line === 0 ? inputValidationSubjectLength ?? inputValidationLength : inputValidationLength;

		const lineSegments: string[] = [];
		const lineText = document.lineAt(line).text.trim();

		let position = 0;
		while (lineText.length - position > lineLengthThreshold) {
			const lastSpaceBeforeThreshold = lineText.lastIndexOf(' ', position + lineLengthThreshold);

			if (lastSpaceBeforeThreshold !== -1 && lastSpaceBeforeThreshold > position) {
				lineSegments.push(lineText.substring(position, lastSpaceBeforeThreshold));
				position = lastSpaceBeforeThreshold + 1;
			} else {
				// Find first space after threshold
				const firstSpaceAfterThreshold = lineText.indexOf(' ', position + lineLengthThreshold);
				if (firstSpaceAfterThreshold !== -1) {
					lineSegments.push(lineText.substring(position, firstSpaceAfterThreshold));
					position = firstSpaceAfterThreshold + 1;
				} else {
					lineSegments.push(lineText.substring(position));
					position = lineText.length;
				}
			}
		}
		if (position < lineText.length) {
			lineSegments.push(lineText.substring(position));
		}

		return lineSegments;
	}

	dispose() {
		dispose(this.disposables);
	}
}
