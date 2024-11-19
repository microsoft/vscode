/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigurationChangeEvent, DecorationOptions, l10n, Position, Range, TextDocument, TextEditor, TextEditorDecorationType, TextEditorDiff, TextEditorDiffKind, ThemeColor, Uri, window, workspace } from 'vscode';
import { Model } from './model';
import { dispose, filterEvent, fromNow, IDisposable } from './util';
import { Repository } from './repository';
import { throttle } from './decorators';
import { BlameInformation } from './git';

function isLineChanged(lineNumber: number, changes: readonly TextEditorDiff[]): boolean {
	for (const change of changes) {
		// If the change is a delete, skip it
		if (change.kind === TextEditorDiffKind.Deletion) {
			continue;
		}

		const startLineNumber = change.modifiedStartLineNumber;
		const endLineNumber = change.modifiedEndLineNumber || startLineNumber;
		if (lineNumber >= startLineNumber && lineNumber <= endLineNumber) {
			return true;
		}
	}

	return false;
}

function lineNumberTransform(lineNumber: number, changes: readonly TextEditorDiff[]): number {
	if (changes.length === 0) {
		return lineNumber;
	}

	for (const change of changes) {
		// Line number is before the change
		if ((change.kind === TextEditorDiffKind.Addition && lineNumber < change.modifiedStartLineNumber) ||
			(change.kind === TextEditorDiffKind.Modification && lineNumber < change.modifiedStartLineNumber) ||
			(change.kind === TextEditorDiffKind.Deletion && lineNumber < change.originalStartLineNumber)) {
			break;
		}

		// Update line number
		switch (change.kind) {
			case TextEditorDiffKind.Addition:
				lineNumber = lineNumber - (change.modifiedEndLineNumber - change.originalStartLineNumber);
				break;
			case TextEditorDiffKind.Modification:
				if (change.originalStartLineNumber !== change.modifiedStartLineNumber || change.originalEndLineNumber !== change.modifiedEndLineNumber) {
					lineNumber = lineNumber - (change.modifiedEndLineNumber - change.originalEndLineNumber);
				}
				break;
			case TextEditorDiffKind.Deletion:
				lineNumber = lineNumber + (change.originalEndLineNumber - change.originalStartLineNumber) + 1;
				break;
		}
	}

	return lineNumber;
}

export class GitBlameController {
	private readonly _decorationType: TextEditorDecorationType;

	/* Repository -> Uri -> BlameInformation[] */
	/* TODO @lszomoru - consider storing repository HEAD */
	private readonly _blameInformation = new Map<Repository, Map<Uri, BlameInformation[]>>();

	private _repositoryDisposables = new Map<Repository, IDisposable[]>();
	private _disposables: IDisposable[] = [];

	constructor(private readonly _model: Model) {
		this._decorationType = window.createTextEditorDecorationType({
			isWholeLine: true,
			after: {
				color: new ThemeColor('gitDecoration.blameEditorDecorationForeground')
			}
		});
		this._disposables.push(this._decorationType);

		this._model.onDidOpenRepository(this._onDidOpenRepository, this, this._disposables);
		this._model.onDidCloseRepository(this._onDidCloseRepository, this, this._disposables);

		workspace.onDidChangeConfiguration(this._onDidChangeConfiguration, this, this._disposables);

		window.onDidChangeTextEditorSelection(e => this._updateDecorations(e.textEditor), this, this._disposables);
		window.onDidChangeTextEditorDiffInformation(e => this._updateDecorations(e.textEditor), this, this._disposables);

		this._updateDecorations(window.activeTextEditor);
	}

	private _onDidChangeConfiguration(e: ConfigurationChangeEvent): void {
		if (!e.affectsConfiguration('git.blame.enabled')) {
			return;
		}

		for (const textEditor of window.visibleTextEditors) {
			this._updateDecorations(textEditor);
		}
	}

	private _onDidOpenRepository(repository: Repository): void {
		const disposables: IDisposable[] = [];

		const onDidRunWriteOperation = filterEvent(repository.onDidRunOperation, e => !e.operation.readOnly);
		onDidRunWriteOperation(() => this._blameInformation.delete(repository), this, disposables);

		this._repositoryDisposables.set(repository, disposables);
	}

	private _onDidCloseRepository(repository: Repository): void {
		const disposables = this._repositoryDisposables.get(repository);
		if (disposables) {
			dispose(disposables);
		}

		this._repositoryDisposables.delete(repository);
		this._blameInformation.delete(repository);
	}

	@throttle
	private async _updateDecorations(textEditor: TextEditor | undefined): Promise<void> {
		if (!textEditor) {
			return;
		}

		const enabled = workspace.getConfiguration('git').get<boolean>('blame.enabled', false);
		if (!enabled) {
			textEditor.setDecorations(this._decorationType, []);
			return;
		}

		const diffInformation = textEditor.diffInformation;
		if (!diffInformation || diffInformation.isStale) {
			textEditor.setDecorations(this._decorationType, []);
			return;
		}

		const blameInformationCollection = await this._getBlameInformation(textEditor.document);
		if (!blameInformationCollection) {
			textEditor.setDecorations(this._decorationType, []);
			return;
		}

		const decorations: DecorationOptions[] = [];
		for (const lineNumber of textEditor.selections.map(s => s.active.line)) {
			// Check if the line is in an add/edit change
			if (isLineChanged(lineNumber + 1, diffInformation.diff)) {
				decorations.push(this._createDecoration(lineNumber, l10n.t('Uncommitted change')));
				continue;
			}

			// Recalculate the line number factoring in the diff information
			const lineNumberWithDiff = lineNumberTransform(lineNumber + 1, diffInformation.diff);
			const blameInformation = blameInformationCollection.find(blameInformation => {
				return blameInformation.ranges.find(range => {
					return lineNumberWithDiff >= range.startLineNumber && lineNumberWithDiff <= range.endLineNumber;
				});
			});

			if (blameInformation) {
				const ago = fromNow(blameInformation.date ?? Date.now(), true, true);
				decorations.push(this._createDecoration(lineNumber, `${blameInformation.message ?? ''}, ${blameInformation.authorName ?? ''} (${ago})`));
			}
		}

		textEditor.setDecorations(this._decorationType, decorations);
	}

	private _createDecoration(lineNumber: number, contentText: string): DecorationOptions {
		const position = new Position(lineNumber, Number.MAX_SAFE_INTEGER);

		return {
			range: new Range(position, position),
			renderOptions: {
				after: {
					contentText: `\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0${contentText}`
				}
			},
		};
	}

	private async _getBlameInformation(document: TextDocument): Promise<BlameInformation[] | undefined> {
		const repository = this._model.getRepository(document.uri);
		if (!repository) {
			return undefined;
		}

		let repositoryBlameInformation = this._blameInformation.get(repository);
		if (!repositoryBlameInformation) {
			repositoryBlameInformation = new Map();
			this._blameInformation.set(repository, repositoryBlameInformation);
		}

		if (!this._blameInformation.has(repository)) {
			this._blameInformation.set(repository, new Map());
		}

		let fileBlameInformation = repositoryBlameInformation.get(document.uri);
		if (!fileBlameInformation) {
			fileBlameInformation = await repository.blame2(document.uri.fsPath) ?? [];

			repositoryBlameInformation.set(document.uri, fileBlameInformation);
			this._blameInformation.set(repository, repositoryBlameInformation);
		}

		return fileBlameInformation;
	}

	dispose() {
		for (const disposables of this._repositoryDisposables.values()) {
			dispose(disposables);
		}
		this._repositoryDisposables.clear();

		this._disposables = dispose(this._disposables);
	}
}
