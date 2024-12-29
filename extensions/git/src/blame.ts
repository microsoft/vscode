/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DecorationOptions, l10n, Position, Range, TextEditor, TextEditorChange, TextEditorDecorationType, TextEditorChangeKind, ThemeColor, Uri, window, workspace, EventEmitter, ConfigurationChangeEvent, StatusBarItem, StatusBarAlignment, Command, MarkdownString, languages, HoverProvider, CancellationToken, Hover, TextDocument } from 'vscode';
import { Model } from './model';
import { dispose, fromNow, IDisposable } from './util';
import { Repository } from './repository';
import { throttle } from './decorators';
import { BlameInformation, Commit } from './git';
import { fromGitUri, isGitUri } from './uri';
import { emojify, ensureEmojis } from './emoji';
import { getWorkingTreeAndIndexDiffInformation, getWorkingTreeDiffInformation } from './staging';

function lineRangesContainLine(changes: readonly TextEditorChange[], lineNumber: number): boolean {
	return changes.some(c => c.modified.startLineNumber <= lineNumber && lineNumber < c.modified.endLineNumberExclusive);
}

function lineRangeLength(startLineNumber: number, endLineNumberExclusive: number): number {
	return endLineNumberExclusive - startLineNumber;
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

function getEditorDecorationRange(lineNumber: number): Range {
	const position = new Position(lineNumber, Number.MAX_SAFE_INTEGER);
	return new Range(position, position);
}

function isBlameInformation(object: any): object is BlameInformation {
	return Array.isArray((object as BlameInformation).ranges);
}

type BlameInformationTemplateTokens = {
	readonly hash: string;
	readonly hashShort: string;
	readonly subject: string;
	readonly authorName: string;
	readonly authorEmail: string;
	readonly authorDate: string;
	readonly authorDateAgo: string;
};

interface RepositoryBlameInformation {
	/**
	 * Track the current HEAD of the repository so that we can clear cache entries
	 */
	HEAD: string;

	/**
	 * Outer map - maps resource scheme to resource blame information. Using the uri
	 * scheme as the key so that we can easily delete the cache entries for the "file"
	 * scheme as those entries are outdated when the HEAD of the repository changes.
	 *
	 * Inner map - maps commit + resource to blame information.
	 */
	readonly blameInformation: Map<string, Map<string, BlameInformation[]>>;
}

interface LineBlameInformation {
	readonly lineNumber: number;
	readonly blameInformation: BlameInformation | string;
}

class GitBlameInformationCache {
	private readonly _cache = new Map<Repository, RepositoryBlameInformation>();

	getRepositoryHEAD(repository: Repository): string | undefined {
		return this._cache.get(repository)?.HEAD;
	}

	setRepositoryHEAD(repository: Repository, commit: string): void {
		const repositoryBlameInformation = this._cache.get(repository) ?? {
			HEAD: commit,
			blameInformation: new Map<string, Map<string, BlameInformation[]>>()
		} satisfies RepositoryBlameInformation;

		this._cache.set(repository, {
			...repositoryBlameInformation,
			HEAD: commit
		} satisfies RepositoryBlameInformation);
	}

	deleteBlameInformation(repository: Repository, scheme?: string): boolean {
		if (scheme === undefined) {
			return this._cache.delete(repository);
		}

		return this._cache.get(repository)?.blameInformation.delete(scheme) === true;
	}

	getBlameInformation(repository: Repository, resource: Uri, commit: string): BlameInformation[] | undefined {
		const blameInformationKey = this._getBlameInformationKey(resource, commit);
		return this._cache.get(repository)?.blameInformation.get(resource.scheme)?.get(blameInformationKey);
	}

	setBlameInformation(repository: Repository, resource: Uri, commit: string, blameInformation: BlameInformation[]): void {
		if (!repository.HEAD?.commit) {
			return;
		}

		if (!this._cache.has(repository)) {
			this._cache.set(repository, {
				HEAD: repository.HEAD.commit,
				blameInformation: new Map<string, Map<string, BlameInformation[]>>()
			} satisfies RepositoryBlameInformation);
		}

		const repositoryBlameInformation = this._cache.get(repository)!;
		if (!repositoryBlameInformation.blameInformation.has(resource.scheme)) {
			repositoryBlameInformation.blameInformation.set(resource.scheme, new Map<string, BlameInformation[]>());
		}

		const resourceSchemeBlameInformation = repositoryBlameInformation.blameInformation.get(resource.scheme)!;
		resourceSchemeBlameInformation.set(this._getBlameInformationKey(resource, commit), blameInformation);
	}

	private _getBlameInformationKey(resource: Uri, commit: string): string {
		return `${commit}:${resource.toString()}`;
	}
}

export class GitBlameController {
	private readonly _subjectMaxLength = 50;

	private readonly _onDidChangeBlameInformation = new EventEmitter<TextEditor>();
	public readonly onDidChangeBlameInformation = this._onDidChangeBlameInformation.event;

	readonly textEditorBlameInformation = new Map<TextEditor, readonly LineBlameInformation[]>();

	private readonly _repositoryBlameCache = new GitBlameInformationCache();

	private _repositoryDisposables = new Map<Repository, IDisposable[]>();
	private _disposables: IDisposable[] = [];

	constructor(private readonly _model: Model) {
		this._disposables.push(new GitBlameEditorDecoration(this));
		this._disposables.push(new GitBlameStatusBarItem(this));

		this._model.onDidOpenRepository(this._onDidOpenRepository, this, this._disposables);
		this._model.onDidCloseRepository(this._onDidCloseRepository, this, this._disposables);

		window.onDidChangeActiveTextEditor(e => this._updateTextEditorBlameInformation(e), this, this._disposables);
		window.onDidChangeTextEditorSelection(e => this._updateTextEditorBlameInformation(e.textEditor, true), this, this._disposables);
		window.onDidChangeTextEditorDiffInformation(e => this._updateTextEditorBlameInformation(e.textEditor), this, this._disposables);

		this._updateTextEditorBlameInformation(window.activeTextEditor);
	}

	formatBlameInformationMessage(template: string, blameInformation: BlameInformation): string {
		const subject = blameInformation.subject && blameInformation.subject.length > this._subjectMaxLength
			? `${blameInformation.subject.substring(0, this._subjectMaxLength)}\u2026`
			: blameInformation.subject;

		const templateTokens = {
			hash: blameInformation.hash,
			hashShort: blameInformation.hash.substring(0, 8),
			subject: emojify(subject ?? ''),
			authorName: blameInformation.authorName ?? '',
			authorEmail: blameInformation.authorEmail ?? '',
			authorDate: new Date(blameInformation.authorDate ?? new Date()).toLocaleString(),
			authorDateAgo: fromNow(blameInformation.authorDate ?? new Date(), true, true)
		} satisfies BlameInformationTemplateTokens;

		return template.replace(/\$\{(.+?)\}/g, (_, token) => {
			return token in templateTokens ? templateTokens[token as keyof BlameInformationTemplateTokens] : `\${${token}}`;
		});
	}

	async getBlameInformationDetailedHover(documentUri: Uri, blameInformation: BlameInformation): Promise<MarkdownString | undefined> {
		const repository = this._model.getRepository(documentUri);
		if (!repository) {
			return this.getBlameInformationHover(documentUri, blameInformation);
		}

		try {
			const commit = await repository.getCommit(blameInformation.hash);
			return this.getBlameInformationHover(documentUri, commit);
		} catch {
			return this.getBlameInformationHover(documentUri, blameInformation);
		}
	}

	getBlameInformationHover(documentUri: Uri, blameInformationOrCommit: BlameInformation | Commit): MarkdownString {
		const markdownString = new MarkdownString();
		markdownString.isTrusted = true;
		markdownString.supportHtml = true;
		markdownString.supportThemeIcons = true;

		if (blameInformationOrCommit.authorName) {
			markdownString.appendMarkdown(`$(account) **${blameInformationOrCommit.authorName}**`);

			if (blameInformationOrCommit.authorDate) {
				const dateString = new Date(blameInformationOrCommit.authorDate).toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' });
				markdownString.appendMarkdown(`, $(history) ${fromNow(blameInformationOrCommit.authorDate, true, true)} (${dateString})`);
			}

			markdownString.appendMarkdown('\n\n');
		}

		markdownString.appendMarkdown(`${emojify(isBlameInformation(blameInformationOrCommit) ? blameInformationOrCommit.subject ?? '' : blameInformationOrCommit.message)}\n\n`);
		markdownString.appendMarkdown(`---\n\n`);

		if (!isBlameInformation(blameInformationOrCommit) && blameInformationOrCommit.shortStat) {
			markdownString.appendMarkdown(`<span>${blameInformationOrCommit.shortStat.files === 1 ?
				l10n.t('{0} file changed', blameInformationOrCommit.shortStat.files) :
				l10n.t('{0} files changed', blameInformationOrCommit.shortStat.files)}</span>`);

			if (blameInformationOrCommit.shortStat.insertions) {
				markdownString.appendMarkdown(`,&nbsp;<span style="color:var(--vscode-scmGraph-historyItemHoverAdditionsForeground);">${blameInformationOrCommit.shortStat.insertions === 1 ?
					l10n.t('{0} insertion{1}', blameInformationOrCommit.shortStat.insertions, '(+)') :
					l10n.t('{0} insertions{1}', blameInformationOrCommit.shortStat.insertions, '(+)')}</span>`);
			}

			if (blameInformationOrCommit.shortStat.deletions) {
				markdownString.appendMarkdown(`,&nbsp;<span style="color:var(--vscode-scmGraph-historyItemHoverDeletionsForeground);">${blameInformationOrCommit.shortStat.deletions === 1 ?
					l10n.t('{0} deletion{1}', blameInformationOrCommit.shortStat.deletions, '(-)') :
					l10n.t('{0} deletions{1}', blameInformationOrCommit.shortStat.deletions, '(-)')}</span>`);
			}

			markdownString.appendMarkdown(`\n\n---\n\n`);
		}

		markdownString.appendMarkdown(`[$(eye) View Commit](command:git.blameStatusBarItem.viewCommit?${encodeURIComponent(JSON.stringify([documentUri, blameInformationOrCommit.hash]))} "${l10n.t('View Commit')}")`);
		markdownString.appendMarkdown('&nbsp;&nbsp;&nbsp;&nbsp;');
		markdownString.appendMarkdown(`[$(copy) ${blameInformationOrCommit.hash.substring(0, 8)}](command:git.blameStatusBarItem.copyContent?${encodeURIComponent(JSON.stringify(blameInformationOrCommit.hash))} "${l10n.t('Copy Commit Hash')}")`);

		return markdownString;
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
		this._repositoryBlameCache.deleteBlameInformation(repository);
	}

	private _onDidRunGitStatus(repository: Repository): void {
		const repositoryHEAD = this._repositoryBlameCache.getRepositoryHEAD(repository);
		if (!repositoryHEAD || !repository.HEAD?.commit) {
			return;
		}

		// If the HEAD of the repository changed we can remove the cache
		// entries for the "file" scheme as those entries are outdated.
		if (repositoryHEAD !== repository.HEAD.commit) {
			this._repositoryBlameCache.deleteBlameInformation(repository, 'file');
			this._repositoryBlameCache.setRepositoryHEAD(repository, repository.HEAD.commit);

			for (const textEditor of window.visibleTextEditors) {
				this._updateTextEditorBlameInformation(textEditor);
			}
		}
	}

	private async _getBlameInformation(resource: Uri, commit: string): Promise<BlameInformation[] | undefined> {
		const repository = this._model.getRepository(resource);
		if (!repository) {
			return undefined;
		}

		const resourceBlameInformation = this._repositoryBlameCache.getBlameInformation(repository, resource, commit);
		if (resourceBlameInformation) {
			return resourceBlameInformation;
		}

		// Ensure that the emojis are loaded. We will
		// use them when formatting the blame information.
		await ensureEmojis();

		// Get blame information for the resource and cache it
		const blameInformation = await repository.blame2(resource.fsPath, commit) ?? [];
		this._repositoryBlameCache.setBlameInformation(repository, resource, commit, blameInformation);

		return blameInformation;
	}

	@throttle
	private async _updateTextEditorBlameInformation(textEditor: TextEditor | undefined, showBlameInformationForPositionZero = false): Promise<void> {
		if (!textEditor?.diffInformation || textEditor !== window.activeTextEditor) {
			return;
		}

		const repository = this._model.getRepository(textEditor.document.uri);
		if (!repository || !repository.HEAD?.commit) {
			return;
		}

		// Do not show blame information when there is a single selection and it is at the beginning
		// of the file [0, 0, 0, 0] unless the user explicitly navigates the cursor there. We do this
		// to avoid showing blame information when the editor is not focused.
		if (!showBlameInformationForPositionZero && textEditor.selections.length === 1 &&
			textEditor.selections[0].start.line === 0 && textEditor.selections[0].start.character === 0 &&
			textEditor.selections[0].end.line === 0 && textEditor.selections[0].end.character === 0) {
			this.textEditorBlameInformation.set(textEditor, []);
			this._onDidChangeBlameInformation.fire(textEditor);
			return;
		}

		let allChanges: readonly TextEditorChange[];
		let workingTreeChanges: readonly TextEditorChange[];
		let workingTreeAndIndexChanges: readonly TextEditorChange[] | undefined;

		if (isGitUri(textEditor.document.uri)) {
			const { ref } = fromGitUri(textEditor.document.uri);

			// For the following scenarios we can discard the diff information
			// 1) Commit - Resource in the multi-file diff editor when viewing the details of a commit.
			// 2) HEAD   - Resource on the left-hand side of the diff editor when viewing a resource from the index.
			// 3) ~      - Resource on the left-hand side of the diff editor when viewing a resource from the working tree.
			if (/^[0-9a-f]{40}$/i.test(ref) || ref === 'HEAD' || ref === '~') {
				workingTreeChanges = allChanges = [];
				workingTreeAndIndexChanges = undefined;
			} else if (ref === '') {
				// Resource on the right-hand side of the diff editor when viewing a resource from the index.
				const diffInformationWorkingTreeAndIndex = getWorkingTreeAndIndexDiffInformation(textEditor);

				// Working tree + index diff information is present and it is stale
				if (diffInformationWorkingTreeAndIndex && diffInformationWorkingTreeAndIndex.isStale) {
					return;
				}

				workingTreeChanges = [];
				workingTreeAndIndexChanges = allChanges = diffInformationWorkingTreeAndIndex?.changes ?? [];
			} else {
				throw new Error(`Unexpected ref: ${ref}`);
			}
		} else {
			// Working tree diff information. Diff Editor (Working Tree) -> Text Editor
			const diffInformationWorkingTree = getWorkingTreeDiffInformation(textEditor);

			// Working tree diff information is not present or it is stale
			if (!diffInformationWorkingTree || diffInformationWorkingTree.isStale) {
				return;
			}

			// Working tree + index diff information
			const diffInformationWorkingTreeAndIndex = getWorkingTreeAndIndexDiffInformation(textEditor);

			// Working tree + index diff information is present and it is stale
			if (diffInformationWorkingTreeAndIndex && diffInformationWorkingTreeAndIndex.isStale) {
				return;
			}

			workingTreeChanges = diffInformationWorkingTree.changes;
			workingTreeAndIndexChanges = diffInformationWorkingTreeAndIndex?.changes;

			// For staged resources, we provide an additional "original resource" so that the editor
			// diff information contains both the changes that are in the working tree and the changes
			// that are in the working tree + index.
			allChanges = workingTreeAndIndexChanges ?? workingTreeChanges;
		}

		let commit: string;
		if (!isGitUri(textEditor.document.uri)) {
			// Resource with the `file` scheme
			commit = repository.HEAD.commit;
		} else {
			// Resource with the `git` scheme
			const { ref } = fromGitUri(textEditor.document.uri);
			commit = /^[0-9a-f]{40}$/i.test(ref) ? ref : repository.HEAD.commit;
		}

		// Git blame information
		const resourceBlameInformation = await this._getBlameInformation(textEditor.document.uri, commit);
		if (!resourceBlameInformation) {
			return;
		}

		const lineBlameInformation: LineBlameInformation[] = [];
		for (const lineNumber of new Set(textEditor.selections.map(s => s.active.line))) {
			// Check if the line is contained in the working tree diff information
			if (lineRangesContainLine(workingTreeChanges, lineNumber + 1)) {
				lineBlameInformation.push({ lineNumber, blameInformation: l10n.t('Not Committed Yet') });
				continue;
			}

			// Check if the line is contained in the working tree + index diff information
			if (lineRangesContainLine(workingTreeAndIndexChanges ?? [], lineNumber + 1)) {
				lineBlameInformation.push({ lineNumber, blameInformation: l10n.t('Not Committed Yet (Staged)') });
				continue;
			}

			// Map the line number to the git blame ranges using the diff information
			const lineNumberWithDiff = mapModifiedLineNumberToOriginalLineNumber(lineNumber + 1, allChanges);
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

class GitBlameEditorDecoration implements HoverProvider {
	private _decoration: TextEditorDecorationType | undefined;
	private get decoration(): TextEditorDecorationType {
		if (!this._decoration) {
			this._decoration = window.createTextEditorDecorationType({
				after: {
					color: new ThemeColor('git.blame.editorDecorationForeground')
				}
			});
		}

		return this._decoration;
	}

	private _hoverDisposable: IDisposable | undefined;
	private _disposables: IDisposable[] = [];

	constructor(private readonly _controller: GitBlameController) {
		workspace.onDidChangeConfiguration(this._onDidChangeConfiguration, this, this._disposables);
		window.onDidChangeActiveTextEditor(this._onDidChangeActiveTextEditor, this, this._disposables);
		this._controller.onDidChangeBlameInformation(e => this._updateDecorations(e), this, this._disposables);

		this._onDidChangeConfiguration();
	}

	async provideHover(document: TextDocument, position: Position, token: CancellationToken): Promise<Hover | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}

		const textEditor = window.activeTextEditor;
		if (!textEditor) {
			return undefined;
		}

		// Position must be at the end of the line
		if (position.character !== document.lineAt(position.line).range.end.character) {
			return undefined;
		}

		// Get blame information
		const blameInformation = this._controller.textEditorBlameInformation
			.get(textEditor)?.find(blame => blame.lineNumber === position.line);

		if (!blameInformation || typeof blameInformation.blameInformation === 'string') {
			return undefined;
		}

		const contents = await this._controller.getBlameInformationDetailedHover(textEditor.document.uri, blameInformation.blameInformation);

		if (!contents || token.isCancellationRequested) {
			return undefined;
		}

		return { range: getEditorDecorationRange(position.line), contents: [contents] };
	}

	private _onDidChangeConfiguration(e?: ConfigurationChangeEvent): void {
		if (e &&
			!e.affectsConfiguration('git.blame.editorDecoration.enabled') &&
			!e.affectsConfiguration('git.blame.editorDecoration.template')) {
			return;
		}

		if (this._getConfiguration().enabled) {
			if (window.activeTextEditor) {
				this._registerHoverProvider();
				this._updateDecorations(window.activeTextEditor);
			}
		} else {
			this._decoration?.dispose();
			this._decoration = undefined;

			this._hoverDisposable?.dispose();
			this._hoverDisposable = undefined;
		}
	}

	private _onDidChangeActiveTextEditor(): void {
		if (!this._getConfiguration().enabled) {
			return;
		}

		// Clear decorations
		for (const editor of window.visibleTextEditors) {
			if (editor !== window.activeTextEditor) {
				editor.setDecorations(this.decoration, []);
			}
		}

		// Register hover provider
		this._registerHoverProvider();
	}

	private _getConfiguration(): { enabled: boolean; template: string } {
		const config = workspace.getConfiguration('git');
		const enabled = config.get<boolean>('blame.editorDecoration.enabled', false);
		const template = config.get<string>('blame.editorDecoration.template', '${subject}, ${authorName} (${authorDateAgo})');

		return { enabled, template };
	}

	private _updateDecorations(textEditor: TextEditor): void {
		const { enabled, template } = this._getConfiguration();
		if (!enabled) {
			return;
		}

		// Only support resources with `file` and `git` schemes
		if (textEditor.document.uri.scheme !== 'file' && !isGitUri(textEditor.document.uri)) {
			textEditor.setDecorations(this.decoration, []);
			return;
		}

		// Get blame information
		const blameInformation = this._controller.textEditorBlameInformation.get(textEditor);
		if (!blameInformation) {
			textEditor.setDecorations(this.decoration, []);
			return;
		}

		// Set decorations for the editor
		const decorations = blameInformation.map(blame => {
			const contentText = typeof blame.blameInformation !== 'string'
				? this._controller.formatBlameInformationMessage(template, blame.blameInformation)
				: blame.blameInformation;

			return this._createDecoration(blame.lineNumber, contentText);
		});

		textEditor.setDecorations(this.decoration, decorations);
	}

	private _createDecoration(lineNumber: number, contentText: string): DecorationOptions {
		return {
			range: getEditorDecorationRange(lineNumber),
			renderOptions: {
				after: {
					contentText,
					margin: '0 0 0 50px'
				}
			},
		};
	}

	private _registerHoverProvider(): void {
		this._hoverDisposable?.dispose();

		if (window.activeTextEditor?.document.uri.scheme === 'file' ||
			window.activeTextEditor?.document.uri.scheme === 'git') {
			this._hoverDisposable = languages.registerHoverProvider({
				pattern: window.activeTextEditor.document.uri.fsPath
			}, this);
		}
	}

	dispose() {
		this._decoration?.dispose();
		this._decoration = undefined;

		this._hoverDisposable?.dispose();
		this._hoverDisposable = undefined;

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
		if (!e.affectsConfiguration('git.blame.statusBarItem.enabled') &&
			!e.affectsConfiguration('git.blame.statusBarItem.template')) {
			return;
		}

		if (this._getConfiguration().enabled) {
			if (window.activeTextEditor) {
				this._updateStatusBarItem(window.activeTextEditor);
			}
		} else {
			this._statusBarItem?.dispose();
			this._statusBarItem = undefined;
		}
	}

	private _onDidChangeActiveTextEditor(): void {
		if (!this._getConfiguration().enabled) {
			return;
		}

		if (!window.activeTextEditor) {
			this._statusBarItem?.hide();
		}
	}

	private _getConfiguration(): { enabled: boolean; template: string } {
		const config = workspace.getConfiguration('git');
		const enabled = config.get<boolean>('blame.statusBarItem.enabled', false);
		const template = config.get<string>('blame.statusBarItem.template', '${authorName} (${authorDateAgo})');

		return { enabled, template };
	}

	private _updateStatusBarItem(textEditor: TextEditor): void {
		const { enabled, template } = this._getConfiguration();
		if (!enabled || textEditor !== window.activeTextEditor) {
			return;
		}

		if (!this._statusBarItem) {
			this._statusBarItem = window.createStatusBarItem('git.blame', StatusBarAlignment.Right, 200);
			this._statusBarItem.name = l10n.t('Git Blame Information');
			this._disposables.push(this._statusBarItem);
		}

		// Only support resources with `file` and `git` schemes
		if (textEditor.document.uri.scheme !== 'file' && !isGitUri(textEditor.document.uri)) {
			this._statusBarItem.hide();
			return;
		}

		const blameInformation = this._controller.textEditorBlameInformation.get(textEditor);
		if (!blameInformation || blameInformation.length === 0) {
			this._statusBarItem.hide();
			return;
		}

		if (typeof blameInformation[0].blameInformation === 'string') {
			this._statusBarItem.text = `$(git-commit) ${blameInformation[0].blameInformation}`;
			this._statusBarItem.tooltip = l10n.t('Git Blame Information');
			this._statusBarItem.command = undefined;
		} else {
			this._statusBarItem.text = `$(git-commit) ${this._controller.formatBlameInformationMessage(template, blameInformation[0].blameInformation)}`;
			this._statusBarItem.tooltip = this._controller.getBlameInformationHover(textEditor.document.uri, blameInformation[0].blameInformation);
			this._statusBarItem.command = {
				title: l10n.t('View Commit'),
				command: 'git.blameStatusBarItem.viewCommit',
				arguments: [textEditor.document.uri, blameInformation[0].blameInformation.hash]
			} satisfies Command;
		}

		this._statusBarItem.show();
	}

	dispose() {
		this._disposables = dispose(this._disposables);
	}
}
