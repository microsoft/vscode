/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import { CancellationToken, CodeLens, CodeLensProvider, DocumentLink, DocumentLinkProvider, Event, EventEmitter, l10n, languages, Range, TabInputText, TextDocument, Uri, window, workspace } from 'vscode';
import { IIPCHandler, IIPCServer } from './ipc/ipcServer';
import { ITerminalEnvironmentProvider } from './terminal';
import { EmptyDisposable, IDisposable } from './util';
import { Model } from './model';
import { Repository } from './repository';

interface GitEditorRequest {
	commitMessagePath?: string;
}

export class GitEditor implements IIPCHandler, ITerminalEnvironmentProvider {

	private env: { [key: string]: string };
	private disposable: IDisposable = EmptyDisposable;

	readonly featureDescription = 'git editor';

	constructor(private readonly _codeLensProvider: GitEditorCodeLensProvider, ipc?: IIPCServer) {
		if (ipc) {
			this.disposable = ipc.registerHandler('git-editor', this);
		}

		this.env = {
			GIT_EDITOR: `"${path.join(__dirname, ipc ? 'git-editor.sh' : 'git-editor-empty.sh')}"`,
			VSCODE_GIT_EDITOR_NODE: process.execPath,
			VSCODE_GIT_EDITOR_EXTRA_ARGS: '',
			VSCODE_GIT_EDITOR_MAIN: path.join(__dirname, 'git-editor-main.js')
		};
	}

	async handle({ commitMessagePath }: GitEditorRequest): Promise<boolean> {
		if (commitMessagePath) {
			const uri = Uri.file(commitMessagePath);
			const doc = await workspace.openTextDocument(uri);
			await window.showTextDocument(doc, { preview: false });

			this._codeLensProvider.addUri(uri);

			return new Promise((c) => {
				const onDidClose = window.tabGroups.onDidChangeTabs(async (tabs) => {
					if (tabs.closed.some(t => t.input instanceof TabInputText && t.input.uri.toString() === uri.toString())) {
						this._codeLensProvider.removeUri(uri);
						onDidClose.dispose();
						return c(true);
					}
				});
			});
		}

		return Promise.resolve(false);
	}

	getEnv(): { [key: string]: string } {
		const config = workspace.getConfiguration('git');
		return config.get<boolean>('useEditorAsCommitInput') ? this.env : {};
	}

	getTerminalEnv(): { [key: string]: string } {
		const config = workspace.getConfiguration('git');
		return config.get<boolean>('useEditorAsCommitInput') && config.get<boolean>('terminalGitEditor') ? this.env : {};
	}

	dispose(): void {
		this.disposable.dispose();
	}
}

export class GitEditorCodeLensProvider implements CodeLensProvider, IDisposable {

	private readonly _activeUris = new Set<string>();
	private readonly _onDidChangeCodeLenses = new EventEmitter<void>();
	private readonly _disposables: IDisposable[] = [];

	readonly onDidChangeCodeLenses: Event<void> = this._onDidChangeCodeLenses.event;

	constructor() {
		this._disposables.push(
			languages.registerCodeLensProvider({ language: 'git-commit' }, this),
			this._onDidChangeCodeLenses
		);
	}

	addUri(uri: Uri): void {
		this._activeUris.add(uri.toString());
		this._onDidChangeCodeLenses.fire();
	}

	removeUri(uri: Uri): void {
		this._activeUris.delete(uri.toString());
		this._onDidChangeCodeLenses.fire();
	}

	provideCodeLenses(document: TextDocument, _token: CancellationToken): CodeLens[] {
		if (!this._activeUris.has(document.uri.toString())) {
			return [];
		}

		const range = new Range(0, 0, 0, 0);

		const commitCommand = {
			command: 'git.commitMessageAccept',
			title: l10n.t('$(check) Commit'),
			arguments: [document.uri]
		};

		const discardCommand = {
			command: 'git.commitMessageDiscard',
			title: l10n.t('$(x) Cancel'),
			arguments: [document.uri]
		};

		return [
			new CodeLens(range, commitCommand),
			new CodeLens(range, discardCommand),
		];
	}

	dispose(): void {
		this._disposables.forEach(d => d.dispose());
	}
}

export class GitEditorDocumentLinkProvider implements DocumentLinkProvider {
	private readonly _regex = /^#\s+(modified|new file|deleted|renamed|copied|type change):\s+(?<file1>.*?)(?:\s+->\s+(?<file2>.*))*$/gm;

	constructor(private readonly _model: Model) { }

	provideDocumentLinks(document: TextDocument, token: CancellationToken): DocumentLink[] {
		if (token.isCancellationRequested) {
			return [];
		}

		const repository = this._model.getRepository(document.uri);
		if (!repository) {
			return [];
		}

		const links: DocumentLink[] = [];
		for (const match of document.getText().matchAll(this._regex)) {
			if (!match.groups) {
				continue;
			}

			const { file1, file2 } = match.groups;

			if (file1) {
				links.push(this._createDocumentLink(repository, document, match, file1));
			}
			if (file2) {
				links.push(this._createDocumentLink(repository, document, match, file2));
			}
		}

		return links;
	}

	private _createDocumentLink(repository: Repository, document: TextDocument, match: RegExpExecArray, file: string): DocumentLink {
		const startIndex = match[0].indexOf(file);
		const startPosition = document.positionAt(match.index + startIndex);
		const endPosition = document.positionAt(match.index + startIndex + file.length);

		const documentLink = new DocumentLink(
			new Range(startPosition, endPosition),
			Uri.file(path.join(repository.root, file)));
		documentLink.tooltip = l10n.t('Open File');

		return documentLink;
	}
}
