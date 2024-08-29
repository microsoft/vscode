/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import { CancellationToken, DocumentLink, DocumentLinkProvider, languages, ProviderResult, Range, TabInputText, TextDocument, Uri, window, workspace } from 'vscode';
import { IIPCHandler, IIPCServer } from './ipc/ipcServer';
import { ITerminalEnvironmentProvider } from './terminal';
import { EmptyDisposable, IDisposable } from './util';

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

	async handle({ commitMessagePath }: GitEditorRequest): Promise<any> {
		if (commitMessagePath) {
			const uri = Uri.file(commitMessagePath);
			const doc = await workspace.openTextDocument(uri);
			const docLinkProvider = languages.registerDocumentLinkProvider('git-commit', new GitEditorDocumentLinkProvider(commitMessagePath));
			await window.showTextDocument(doc, { preview: false });

			return new Promise((c) => {
				const onDidClose = window.tabGroups.onDidChangeTabs(async (tabs) => {
					if (tabs.closed.some(t => t.input instanceof TabInputText && t.input.uri.toString() === uri.toString())) {
						onDidClose.dispose();
						docLinkProvider.dispose();
						return c(true);
					}
				});
			});
		}
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

class GitEditorDocumentLinkProvider implements DocumentLinkProvider {
	constructor(private readonly commitMessagePath: string) { }

	provideDocumentLinks(document: TextDocument, token: CancellationToken): ProviderResult<DocumentLink[]> {
		const text = document.getText();
		const links: DocumentLink[] = [];
		const lines = text.split('\n');
		let isMatchMode = false;

		for (let i = 0; i < lines.length; i++) {
			if (token.isCancellationRequested) {
				return [];
			}
			const line = lines[i].trim();

			if (line === '#') {
				isMatchMode = false;
				continue;
			}

			if (line.startsWith('#') && line.endsWith(':')) {
				isMatchMode = true;
				continue;
			}

			if (isMatchMode) {
				let filePath: string;
				const colonIndex = line.indexOf(':');
				if (colonIndex !== -1) {
					filePath = line.substring(colonIndex + 1).trim();
				} else {
					filePath = line.substring(1).trim();
				}

				if (filePath) {
					const startIndex = text.indexOf(filePath, document.offsetAt(document.lineAt(i).range.start));
					const start = document.positionAt(startIndex);
					const end = document.positionAt(startIndex + filePath.length);
					const rootDir = path.dirname(path.dirname(this.commitMessagePath));
					const resource = Uri.file(path.join(rootDir, filePath));
					const documentLink = new DocumentLink(new Range(start, end), resource);
					documentLink.tooltip = 'Open in editor';
					links.push(documentLink);
				}
			}
		}

		return links;
	}
}
