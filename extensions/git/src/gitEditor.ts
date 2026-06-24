/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import { CancellationToken, DocumentLink, DocumentLinkProvider, l10n, Range, TabInputText, TextDocument, Uri, window, workspace } from 'vscode';
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

	constructor(ipc?: IIPCServer) {
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

			return new Promise((c) => {
				const onDidClose = window.tabGroups.onDidChangeTabs(async (tabs) => {
					if (tabs.closed.some(t => t.input instanceof TabInputText && t.input.uri.toString() === uri.toString())) {
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
