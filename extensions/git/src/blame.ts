/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigurationChangeEvent, DecorationOptions, l10n, Position, Range, TextDocument, TextEditor, TextEditorChange, TextEditorDecorationType, TextEditorChangeKind, ThemeColor, Uri, window, workspace } from 'vscode';
import { Model } from './model';
import { dispose, fromNow, IDisposable, pathEquals } from './util';
import { Repository } from './repository';
import { throttle } from './decorators';
import { BlameInformation } from './git';

const notCommittedYetId = '0000000000000000000000000000000000000000';

function isLineChanged(lineNumber: number, changes: readonly TextEditorChange[]): boolean {
	for (const change of changes) {
		// If the change is a delete, skip it
		if (change.kind === TextEditorChangeKind.Deletion) {
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

function mapLineNumber(lineNumber: number, changes: readonly TextEditorChange[]): number {
	if (changes.length === 0) {
		return lineNumber;
	}

	for (const change of changes) {
		// Line number is before the change so there is not need to process further
		if ((change.kind === TextEditorChangeKind.Addition && lineNumber < change.modifiedStartLineNumber) ||
			(change.kind === TextEditorChangeKind.Modification && lineNumber < change.modifiedStartLineNumber) ||
			(change.kind === TextEditorChangeKind.Deletion && lineNumber < change.originalStartLineNumber)) {
			break;
		}

		// Map line number to the original line number
		if (change.kind === TextEditorChangeKind.Addition) {
			// Addition
			lineNumber = lineNumber - (change.modifiedEndLineNumber - change.originalStartLineNumber);
		} else if (change.kind === TextEditorChangeKind.Deletion) {
			// Deletion
			lineNumber = lineNumber + (change.originalEndLineNumber - change.originalStartLineNumber) + 1;
		} else if (change.kind === TextEditorChangeKind.Modification) {
			// Modification
			const originalLineCount = change.originalEndLineNumber - change.originalStartLineNumber + 1;
			const modifiedLineCount = change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1;
			if (originalLineCount !== modifiedLineCount) {
				lineNumber = lineNumber - (modifiedLineCount - originalLineCount);
			}
		} else {
			throw new Error('Unexpected change kind');
		}
	}

	return lineNumber;
}

function processTextEditorChangesWithBlameInformation(blameInformation: BlameInformation[], changes: readonly TextEditorChange[]): TextEditorChange[] {
	const [notYetCommittedBlameInformation] = blameInformation.filter(b => b.id === notCommittedYetId);
	if (!notYetCommittedBlameInformation) {
		return [...changes];
	}

	const changesWithBlameInformation: TextEditorChange[] = [];
	for (const change of changes) {
		const originalStartLineNumber = mapLineNumber(change.originalStartLineNumber, changes);
		const originalEndLineNumber = mapLineNumber(change.originalEndLineNumber, changes);

		if (notYetCommittedBlameInformation.ranges.some(range =>
			range.startLineNumber === originalStartLineNumber && range.endLineNumber === originalEndLineNumber)) {
			continue;
		}

		changesWithBlameInformation.push(change);
	}

	return changesWithBlameInformation;
}

interface RepositoryBlameInformation {
	readonly commit: string; /* commit used for blame information */
	readonly blameInformation: Map<Uri, ResourceBlameInformation>;
}

interface ResourceBlameInformation {
	readonly staged: boolean; /* whether the file is staged */
	readonly blameInformation: BlameInformation[];
}

export class GitBlameController {
	private readonly _decorationType: TextEditorDecorationType;

	private readonly _blameInformation = new Map<Repository, RepositoryBlameInformation>();

	private _repositoryDisposables = new Map<Repository, IDisposable[]>();
	private _disposables: IDisposable[] = [];

	constructor(private readonly _model: Model) {
		this._decorationType = window.createTextEditorDecorationType({
			isWholeLine: true,
			after: {
				color: new ThemeColor('git.blame.editorDecorationForeground')
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
		if (!e.affectsConfiguration('git.blame.editorDecoration.enabled')) {
			return;
		}

		for (const textEditor of window.visibleTextEditors) {
			this._updateDecorations(textEditor);
		}
	}

	private _onDidOpenRepository(repository: Repository): void {
		const repositoryDisposables: IDisposable[] = [];

		repository.onDidRunGitStatus(() => this._onDidRunGitStatus(repository), this, repositoryDisposables);
		this._repositoryDisposables.set(repository, repositoryDisposables);
	}

	private _onDidCloseRepository(repository: Repository): void {
		const disposables = this._repositoryDisposables.get(repository);
		if (disposables) {
			dispose(disposables);
		}

		this._repositoryDisposables.delete(repository);
		this._blameInformation.delete(repository);
	}

	private _onDidRunGitStatus(repository: Repository): void {
		let repositoryBlameInformation = this._blameInformation.get(repository);
		if (!repositoryBlameInformation) {
			return;
		}

		let updateDecorations = false;

		// 1. HEAD commit changed (remove all blame information for the repository)
		if (repositoryBlameInformation.commit !== repository.HEAD?.commit) {
			this._blameInformation.delete(repository);
			repositoryBlameInformation = undefined;
			updateDecorations = true;
		}

		// 2. Resource has been staged/unstaged (remove blame information for the file)
		for (const [uri, resourceBlameInformation] of repositoryBlameInformation?.blameInformation.entries() ?? []) {
			const isStaged = repository.indexGroup.resourceStates
				.some(r => pathEquals(uri.fsPath, r.resourceUri.fsPath));

			if (resourceBlameInformation.staged !== isStaged) {
				repositoryBlameInformation?.blameInformation.delete(uri);
				updateDecorations = true;
			}
		}

		if (updateDecorations) {
			for (const textEditor of window.visibleTextEditors) {
				this._updateDecorations(textEditor);
			}
		}
	}

	@throttle
	private async _updateDecorations(textEditor: TextEditor | undefined): Promise<void> {
		if (!textEditor) {
			return;
		}

		const enabled = workspace.getConfiguration('git').get<boolean>('blame.editorDecoration.enabled', false);
		if (!enabled) {
			textEditor.setDecorations(this._decorationType, []);
			return;
		}

		const diffInformation = textEditor.diffInformation;
		if (!diffInformation || diffInformation.isStale) {
			textEditor.setDecorations(this._decorationType, []);
			return;
		}

		const resourceBlameInformation = await this._getBlameInformation(textEditor.document);
		if (!resourceBlameInformation) {
			textEditor.setDecorations(this._decorationType, []);
			return;
		}

		// Remove the diff information that is contained in the git blame information.
		// This is done since git blame information is the source of truth and we don't
		// need the diff information for those ranges. The complete diff information is
		// still used to determine whether a line is changed or not.
		const diffInformationWithBlame = processTextEditorChangesWithBlameInformation(
			resourceBlameInformation,
			diffInformation.changes);

		const decorations: DecorationOptions[] = [];
		for (const lineNumber of textEditor.selections.map(s => s.active.line)) {
			// Check if the line is contained in the diff information
			if (isLineChanged(lineNumber + 1, diffInformation.changes)) {
				decorations.push(this._createDecoration(lineNumber, l10n.t('Not Committed Yet')));
				continue;
			}

			// Map the line number to the git blame ranges
			const lineNumberWithDiff = mapLineNumber(lineNumber + 1, diffInformationWithBlame);
			const blameInformation = resourceBlameInformation.find(blameInformation => {
				return blameInformation.ranges.find(range => {
					return lineNumberWithDiff >= range.startLineNumber && lineNumberWithDiff <= range.endLineNumber;
				});
			});

			if (blameInformation) {
				if (blameInformation.id === notCommittedYetId) {
					decorations.push(this._createDecoration(lineNumber, l10n.t('Not Committed Yet (Staged)')));
				} else {
					const ago = fromNow(blameInformation.date ?? Date.now(), true, true);
					decorations.push(this._createDecoration(lineNumber, `${blameInformation.message ?? ''}, ${blameInformation.authorName ?? ''} (${ago})`));
				}
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
		if (!repository || !repository.HEAD?.commit) {
			return undefined;
		}

		const repositoryBlameInformation = this._blameInformation.get(repository) ?? {
			commit: repository.HEAD.commit,
			blameInformation: new Map<Uri, ResourceBlameInformation>()
		} satisfies RepositoryBlameInformation;

		let resourceBlameInformation = repositoryBlameInformation.blameInformation.get(document.uri);
		if (repositoryBlameInformation.commit === repository.HEAD.commit && resourceBlameInformation) {
			return resourceBlameInformation.blameInformation;
		}

		const staged = repository.indexGroup.resourceStates
			.some(r => pathEquals(document.uri.fsPath, r.resourceUri.fsPath));
		const blameInformation = await repository.blame2(document.uri.fsPath) ?? [];
		resourceBlameInformation = { staged, blameInformation } satisfies ResourceBlameInformation;

		this._blameInformation.set(repository, {
			...repositoryBlameInformation,
			blameInformation: repositoryBlameInformation.blameInformation.set(document.uri, resourceBlameInformation)
		});

		return resourceBlameInformation.blameInformation;
	}

	dispose() {
		for (const disposables of this._repositoryDisposables.values()) {
			dispose(disposables);
		}
		this._repositoryDisposables.clear();

		this._disposables = dispose(this._disposables);
	}
}
