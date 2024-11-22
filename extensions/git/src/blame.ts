/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DecorationOptions, l10n, Position, Range, TextEditor, TextEditorChange, TextEditorDecorationType, TextEditorChangeKind, ThemeColor, Uri, window, workspace, EventEmitter, ConfigurationChangeEvent, StatusBarItem, StatusBarAlignment, Command, MarkdownString, commands } from 'vscode';
import { Model } from './model';
import { dispose, fromNow, IDisposable, pathEquals } from './util';
import { Repository } from './repository';
import { throttle } from './decorators';
import { BlameInformation } from './git';

function lineRangesContainLine(changes: readonly TextEditorChange[], lineNumber: number): boolean {
	return changes.some(c => c.modified.startLineNumber <= lineNumber && lineNumber < c.modified.endLineNumberExclusive);
}

function lineRangeLength(startLineNumber: number, endLineNumberExclusive: number): number {
	return endLineNumberExclusive - startLineNumber;
}

function toTextEditorChange(originalStartLineNumber: number, originalEndLineNumberExclusive: number, modifiedStartLineNumber: number, modifiedEndLineNumberExclusive: number): TextEditorChange {
	let kind: TextEditorChangeKind;
	if (originalStartLineNumber === originalEndLineNumberExclusive) {
		kind = TextEditorChangeKind.Addition;
	} else if (modifiedStartLineNumber === modifiedEndLineNumberExclusive) {
		kind = TextEditorChangeKind.Deletion;
	} else {
		kind = TextEditorChangeKind.Modification;
	}

	return {
		original: { startLineNumber: originalStartLineNumber, endLineNumberExclusive: originalEndLineNumberExclusive },
		modified: { startLineNumber: modifiedStartLineNumber, endLineNumberExclusive: modifiedEndLineNumberExclusive },
		kind
	};
}

function mapModifiedLineNumberToOriginalLineNumber(lineNumber: number, changes: readonly TextEditorChange[]): number {
	if (changes.length === 0) {
		return lineNumber;
	}

	for (const change of changes) {
		// Do not process changes after the line number
		if (lineNumber < change.modified.startLineNumber) {
			break;
		}

		// Map line number to the original line number
		if (change.kind === TextEditorChangeKind.Addition) {
			// Addition
			lineNumber = lineNumber - lineRangeLength(change.modified.startLineNumber, change.modified.endLineNumberExclusive);
		} else if (change.kind === TextEditorChangeKind.Deletion) {
			// Deletion
			lineNumber = lineNumber + lineRangeLength(change.original.startLineNumber, change.original.endLineNumberExclusive);
		} else if (change.kind === TextEditorChangeKind.Modification) {
			// Modification
			const originalRangeLength = lineRangeLength(change.original.startLineNumber, change.original.endLineNumberExclusive);
			const modifiedRangeLength = lineRangeLength(change.modified.startLineNumber, change.modified.endLineNumberExclusive);

			if (originalRangeLength !== modifiedRangeLength) {
				lineNumber = lineNumber - (modifiedRangeLength - originalRangeLength);
			}
		} else {
			throw new Error('Unexpected change kind');
		}
	}

	return lineNumber;
}

interface RepositoryBlameInformation {
	readonly commit: string; /* commit used for blame information */
	readonly blameInformation: Map<Uri, BlameInformation[]>;
}

interface LineBlameInformation {
	readonly lineNumber: number;
	readonly blameInformation: BlameInformation | string;
}

export class GitBlameController {
	private readonly _onDidChangeBlameInformation = new EventEmitter<TextEditor>();
	public readonly onDidChangeBlameInformation = this._onDidChangeBlameInformation.event;

	readonly textEditorBlameInformation = new Map<TextEditor, readonly LineBlameInformation[]>();

	private readonly _repositoryBlameInformation = new Map<Repository, RepositoryBlameInformation>();
	private readonly _stagedResourceDiffInformation = new Map<Repository, Map<Uri, TextEditorChange[]>>();

	private _repositoryDisposables = new Map<Repository, IDisposable[]>();
	private _disposables: IDisposable[] = [];

	constructor(private readonly _model: Model) {
		this._disposables.push(new GitBlameEditorDecoration(this));
		this._disposables.push(new GitBlameStatusBarItem(this));

		this._model.onDidOpenRepository(this._onDidOpenRepository, this, this._disposables);
		this._model.onDidCloseRepository(this._onDidCloseRepository, this, this._disposables);

		window.onDidChangeTextEditorSelection(e => this._updateTextEditorBlameInformation(e.textEditor), this, this._disposables);
		window.onDidChangeTextEditorDiffInformation(e => this._updateTextEditorBlameInformation(e.textEditor), this, this._disposables);

		this._updateTextEditorBlameInformation(window.activeTextEditor);
	}

	getBlameInformationHover(documentUri: Uri, blameInformation: BlameInformation | string): MarkdownString {
		if (typeof blameInformation === 'string') {
			return new MarkdownString(blameInformation, true);
		}

		const markdownString = new MarkdownString();
		markdownString.supportThemeIcons = true;
		markdownString.isTrusted = true;

		if (blameInformation.authorName) {
			markdownString.appendMarkdown(`$(account) **${blameInformation.authorName}**`);

			if (blameInformation.date) {
				const dateString = new Date(blameInformation.date).toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' });
				markdownString.appendMarkdown(`, $(history) ${fromNow(blameInformation.date, true, true)} (${dateString})`);
			}

			markdownString.appendMarkdown('\n\n');
		}

		markdownString.appendMarkdown(`${blameInformation.message}\n\n`);
		markdownString.appendMarkdown(`---\n\n`);

		markdownString.appendMarkdown(`[$(eye) View Commit](command:git.blameStatusBarItem.viewCommit?${encodeURIComponent(JSON.stringify([documentUri, blameInformation.id]))})`);
		markdownString.appendMarkdown('&nbsp;&nbsp;|&nbsp;&nbsp;');
		markdownString.appendMarkdown(`[$(copy) ${blameInformation.id.substring(0, 8)}](command:git.blameStatusBarItem.copyContent?${encodeURIComponent(JSON.stringify(blameInformation.id))})`);

		if (blameInformation.message) {
			markdownString.appendMarkdown('&nbsp;&nbsp;');
			markdownString.appendMarkdown(`[$(copy) Message](command:git.blameStatusBarItem.copyContent?${encodeURIComponent(JSON.stringify(blameInformation.message))})`);
		}

		return markdownString;
	}

	private _onDidOpenRepository(repository: Repository): void {
		const repositoryDisposables: IDisposable[] = [];

		repository.onDidRunGitStatus(() => this._onDidRunGitStatus(repository), this, repositoryDisposables);
		repository.onDidChangeRepository(e => this._onDidChangeRepository(repository, e), this, this._disposables);

		this._repositoryDisposables.set(repository, repositoryDisposables);
	}

	private _onDidCloseRepository(repository: Repository): void {
		const disposables = this._repositoryDisposables.get(repository);
		if (disposables) {
			dispose(disposables);
		}

		this._repositoryDisposables.delete(repository);
		this._repositoryBlameInformation.delete(repository);
	}

	private _onDidRunGitStatus(repository: Repository): void {
		const repositoryBlameInformation = this._repositoryBlameInformation.get(repository);
		if (!repositoryBlameInformation) {
			return;
		}

		// HEAD commit changed (remove blame information for the repository)
		if (repositoryBlameInformation.commit !== repository.HEAD?.commit) {
			this._repositoryBlameInformation.delete(repository);

			for (const textEditor of window.visibleTextEditors) {
				this._updateTextEditorBlameInformation(textEditor);
			}
		}
	}

	private _onDidChangeRepository(repository: Repository, uri: Uri): void {
		if (!/\.git\/index$/.test(uri.fsPath)) {
			return;
		}

		this._stagedResourceDiffInformation.delete(repository);
	}

	private async _getBlameInformation(resource: Uri): Promise<BlameInformation[] | undefined> {
		const repository = this._model.getRepository(resource);
		if (!repository || !repository.HEAD?.commit) {
			return undefined;
		}

		const repositoryBlameInformation = this._repositoryBlameInformation.get(repository) ?? {
			commit: repository.HEAD.commit,
			blameInformation: new Map<Uri, BlameInformation[]>()
		} satisfies RepositoryBlameInformation;

		let resourceBlameInformation = repositoryBlameInformation.blameInformation.get(resource);
		if (repositoryBlameInformation.commit === repository.HEAD.commit && resourceBlameInformation) {
			return resourceBlameInformation;
		}

		// Get blame information for the resource
		resourceBlameInformation = await repository.blame2(resource.fsPath, repository.HEAD.commit) ?? [];

		this._repositoryBlameInformation.set(repository, {
			...repositoryBlameInformation,
			blameInformation: repositoryBlameInformation.blameInformation.set(resource, resourceBlameInformation)
		});

		return resourceBlameInformation;
	}

	private async _getStagedResourceDiffInformation(uri: Uri): Promise<TextEditorChange[] | undefined> {
		const repository = this._model.getRepository(uri);
		if (!repository) {
			return undefined;
		}

		const [resource] = repository.indexGroup
			.resourceStates.filter(r => pathEquals(uri.fsPath, r.resourceUri.fsPath));

		if (!resource || !resource.leftUri || !resource.rightUri) {
			return undefined;
		}

		const diffInformationMap = this._stagedResourceDiffInformation.get(repository) ?? new Map<Uri, TextEditorChange[]>();
		let changes = diffInformationMap.get(resource.resourceUri);
		if (changes) {
			return changes;
		}

		// Get the diff information for the staged resource
		const diffInformation: [number, number, number, number][] = await commands.executeCommand('_workbench.internal.computeDiff', resource.leftUri, resource.rightUri);
		if (!diffInformation) {
			return undefined;
		}

		changes = diffInformation.map(change => toTextEditorChange(change[0], change[1], change[2], change[3]));
		this._stagedResourceDiffInformation.set(repository, diffInformationMap.set(resource.resourceUri, changes));

		return changes;
	}

	@throttle
	private async _updateTextEditorBlameInformation(textEditor: TextEditor | undefined): Promise<void> {
		const diffInformation = textEditor?.diffInformation;
		if (!diffInformation || diffInformation.isStale) {
			return;
		}

		const resourceBlameInformation = await this._getBlameInformation(textEditor.document.uri);
		if (!resourceBlameInformation) {
			return;
		}

		// The diff information does not contain changes that have been staged. We need
		// to get the staged changes and if present, merge them with the diff information.
		const diffInformationStagedResources: TextEditorChange[] = await this._getStagedResourceDiffInformation(textEditor.document.uri) ?? [];

		console.log('diffInformation', diffInformation.changes);
		console.log('diffInformationStagedResources', diffInformationStagedResources);

		console.log('resourceBlameInformation', resourceBlameInformation);

		const lineBlameInformation: LineBlameInformation[] = [];
		for (const lineNumber of textEditor.selections.map(s => s.active.line)) {
			// Check if the line is contained in the diff information
			if (lineRangesContainLine(diffInformation.changes, lineNumber + 1)) {
				lineBlameInformation.push({ lineNumber, blameInformation: l10n.t('Not Committed Yet') });
				continue;
			}

			// Check if the line is contained in the staged resources diff information
			if (lineRangesContainLine(diffInformationStagedResources, lineNumber + 1)) {
				lineBlameInformation.push({ lineNumber, blameInformation: l10n.t('Not Committed Yet (Staged)') });
				continue;
			}

			const diffInformationAll = [...diffInformation.changes, ...diffInformationStagedResources];

			// Map the line number to the git blame ranges using the diff information
			const lineNumberWithDiff = mapModifiedLineNumberToOriginalLineNumber(lineNumber + 1, diffInformationAll);
			const blameInformation = resourceBlameInformation.find(blameInformation => {
				return blameInformation.ranges.find(range => {
					return lineNumberWithDiff >= range.startLineNumber && lineNumberWithDiff <= range.endLineNumber;
				});
			});

			if (blameInformation) {
				lineBlameInformation.push({ lineNumber, blameInformation });
			}
		}

		this.textEditorBlameInformation.set(textEditor, lineBlameInformation);
		this._onDidChangeBlameInformation.fire(textEditor);
	}

	dispose() {
		for (const disposables of this._repositoryDisposables.values()) {
			dispose(disposables);
		}
		this._repositoryDisposables.clear();

		this._disposables = dispose(this._disposables);
	}
}

class GitBlameEditorDecoration {
	private readonly _decorationType: TextEditorDecorationType;
	private _disposables: IDisposable[] = [];

	constructor(private readonly _controller: GitBlameController) {
		this._decorationType = window.createTextEditorDecorationType({
			isWholeLine: true,
			after: {
				color: new ThemeColor('git.blame.editorDecorationForeground')
			}
		});
		this._disposables.push(this._decorationType);

		workspace.onDidChangeConfiguration(this._onDidChangeConfiguration, this, this._disposables);
		this._controller.onDidChangeBlameInformation(e => this._updateDecorations(e), this, this._disposables);
	}

	private _onDidChangeConfiguration(e: ConfigurationChangeEvent): void {
		if (!e.affectsConfiguration('git.blame.editorDecoration.enabled')) {
			return;
		}

		const enabled = this._isEnabled();
		for (const textEditor of window.visibleTextEditors) {
			if (enabled) {
				this._updateDecorations(textEditor);
			} else {
				textEditor.setDecorations(this._decorationType, []);
			}
		}
	}

	private _isEnabled(): boolean {
		const config = workspace.getConfiguration('git');
		return config.get<boolean>('blame.editorDecoration.enabled', false);
	}

	private _updateDecorations(textEditor: TextEditor): void {
		if (!this._isEnabled()) {
			return;
		}

		const blameInformation = this._controller.textEditorBlameInformation.get(textEditor);
		if (!blameInformation || textEditor.document.uri.scheme !== 'file') {
			textEditor.setDecorations(this._decorationType, []);
			return;
		}

		const decorations = blameInformation.map(blame => {
			const contentText = typeof blame.blameInformation === 'string'
				? blame.blameInformation
				: `${blame.blameInformation.message ?? ''}, ${blame.blameInformation.authorName ?? ''} (${fromNow(blame.blameInformation.date ?? Date.now(), true, true)})`;
			const hoverMessage = this._controller.getBlameInformationHover(textEditor.document.uri, blame.blameInformation);

			return this._createDecoration(blame.lineNumber, contentText, hoverMessage);
		});

		textEditor.setDecorations(this._decorationType, decorations);
	}

	private _createDecoration(lineNumber: number, contentText: string, hoverMessage: MarkdownString): DecorationOptions {
		const position = new Position(lineNumber, Number.MAX_SAFE_INTEGER);

		return {
			hoverMessage,
			range: new Range(position, position),
			renderOptions: {
				after: {
					contentText: `\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0${contentText}`
				}
			},
		};
	}

	dispose() {
		this._disposables = dispose(this._disposables);
	}
}

class GitBlameStatusBarItem {
	private _statusBarItem: StatusBarItem | undefined;

	private _disposables: IDisposable[] = [];

	constructor(private readonly _controller: GitBlameController) {
		workspace.onDidChangeConfiguration(this._onDidChangeConfiguration, this, this._disposables);
		window.onDidChangeActiveTextEditor(this._onDidChangeActiveTextEditor, this, this._disposables);

		this._controller.onDidChangeBlameInformation(e => this._updateStatusBarItem(e), this, this._disposables);
	}

	private _onDidChangeConfiguration(e: ConfigurationChangeEvent): void {
		if (!e.affectsConfiguration('git.blame.statusBarItem.enabled')) {
			return;
		}

		if (this._isEnabled()) {
			if (window.activeTextEditor) {
				this._updateStatusBarItem(window.activeTextEditor);
			}
		} else {
			this._statusBarItem?.dispose();
			this._statusBarItem = undefined;
		}
	}

	private _onDidChangeActiveTextEditor(): void {
		if (!this._isEnabled()) {
			return;
		}

		if (window.activeTextEditor) {
			this._updateStatusBarItem(window.activeTextEditor);
		} else {
			this._statusBarItem?.hide();
		}
	}

	private _isEnabled(): boolean {
		const config = workspace.getConfiguration('git');
		return config.get<boolean>('blame.statusBarItem.enabled', false);
	}

	private _updateStatusBarItem(textEditor: TextEditor): void {
		if (!this._isEnabled() || textEditor !== window.activeTextEditor) {
			return;
		}

		if (!this._statusBarItem) {
			this._statusBarItem = window.createStatusBarItem('git.blame', StatusBarAlignment.Right, 200);
			this._statusBarItem.name = l10n.t('Git Blame Information');
			this._disposables.push(this._statusBarItem);
		}

		const blameInformation = this._controller.textEditorBlameInformation.get(textEditor);
		if (!blameInformation || blameInformation.length === 0 || textEditor.document.uri.scheme !== 'file') {
			this._statusBarItem.hide();
			return;
		}

		if (typeof blameInformation[0].blameInformation === 'string') {
			this._statusBarItem.text = `$(git-commit) ${blameInformation[0].blameInformation}`;
			this._statusBarItem.tooltip = this._controller.getBlameInformationHover(textEditor.document.uri, blameInformation[0].blameInformation);
			this._statusBarItem.command = undefined;
		} else {
			this._statusBarItem.text = `$(git-commit) ${blameInformation[0].blameInformation.authorName ?? ''} (${fromNow(blameInformation[0].blameInformation.date ?? new Date(), true, true)})`;
			this._statusBarItem.tooltip = this._controller.getBlameInformationHover(textEditor.document.uri, blameInformation[0].blameInformation);
			this._statusBarItem.command = {
				title: l10n.t('View Commit'),
				command: 'git.blameStatusBarItem.viewCommit',
				arguments: [textEditor.document.uri, blameInformation[0].blameInformation.id]
			} satisfies Command;
		}

		this._statusBarItem.show();
	}

	dispose() {
		this._disposables = dispose(this._disposables);
	}
}
