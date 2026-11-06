/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdir, readFile } from 'fs/promises';
import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IGitExtensionService } from '../../../platform/git/common/gitExtensionService';
import * as gitExt from '../../../platform/git/vscode/git';
import { SerializedDocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { BatchedProcessor } from '../../../util/common/async';
import { findNotebook, serializeNotebookDocument } from '../../../util/common/notebooks';
import { JSONFile } from '../../../util/node/jsonFile';
import { CachedFunction } from '../../../util/vs/base/common/cache';
import { cancelOnDispose } from '../../../util/vs/base/common/cancellation';
import { Disposable, DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { Schemas } from '../../../util/vs/base/common/network';
import { autorun, autorunWithStore, derived, observableFromEvent, observableSignal, waitForState } from '../../../util/vs/base/common/observable';
import { basename, join } from '../../../util/vs/base/common/path';
import { startsWithIgnoreCase } from '../../../util/vs/base/common/strings';
import { editFromTextDocumentContentChangeEvents } from '../../inlineEdits/vscode-node/parts/common';
import { VirtualTextDocumentProvider } from '../../inlineEdits/vscode-node/utils/virtualTextDocumentProvider';
import { JSONL } from '../common/jsonlUtil';
import { IRecordableEditorLogEntry, IRecordableLogEntry, IWorkspaceListenerService } from '../common/workspaceListenerService';
import { ObservableVsCode, rangeToOffsetRange } from './utilsObservable';
import { WorkspaceRecorder } from './workspaceRecorder';


export class WorkspaceRecorderFeature extends Disposable {
	private readonly _gitApi = observableFromEvent(this, (listener) => this._gitExtensionService.onDidChange(listener), () => this._gitExtensionService.getExtensionApi());
	private readonly _workspaceRecordingEnabled = this._configurationService.getConfigObservable(ConfigKey.Advanced.WorkspaceRecordingEnabled);

	constructor(
		@IVSCodeExtensionContext private readonly _vscodeExtensionContext: IVSCodeExtensionContext,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IGitExtensionService private readonly _gitExtensionService: IGitExtensionService,
		@IWorkspaceListenerService private readonly _workspaceListenerService: IWorkspaceListenerService,
	) {
		super();

		this._register(autorunWithStore((reader, store) => {
			if (!this._workspaceRecordingEnabled.read(reader)) { return; }

			this.init(store);
		}));
	}

	async init(store: DisposableStore) {
		const gitApi = await waitForState(this._gitApi);

		const repos = observableFromEvent(this, (e) => gitApi.onDidOpenRepository(e), () => gitApi.repositories);
		await waitForState(repos, (repos) => repos.length > 0, undefined, cancelOnDispose(store));

		const recordingDirPath = join(this._vscodeExtensionContext.globalStorageUri.fsPath, 'workspaceRecordings');
		await mkdir(recordingDirPath, { recursive: true });

		const workspacesIndexFile = await JSONFile.readOrCreate<WorkspacesIndex>(join(recordingDirPath, 'workspaces.json'), { workspaceIdxByRoot: {} });

		if (store.isDisposed) { return; }
		const w = new InitializedWorkspaceRecorderFeature(gitApi, recordingDirPath, workspacesIndexFile, this._workspaceListenerService);
		store.add(w);
	}
}

interface WorkspacesIndex {
	readonly workspaceIdxByRoot: Readonly<Record<string, number>>;
}

class InitializedWorkspaceRecorderFeature extends Disposable {
	private readonly _logProvider = new VirtualTextDocumentProvider('copilotLogProvider');

	constructor(
		private readonly gitApi: gitExt.API,
		private readonly recordingDirPath: string,
		private readonly workspacesIndexFile: JSONFile<WorkspacesIndex>,
		private readonly workspaceListenerService: IWorkspaceListenerService,
	) {
		super();

		const commandIdOpenRecordingFolder = 'vscodeCopilot.openRecordingFolder';
		this._register(vscode.commands.registerCommand(commandIdOpenRecordingFolder, () => {
			vscode.env.openExternal(vscode.Uri.file(recordingDirPath));
		}));

		const commandIdAddBookmark = 'vscodeCopilot.addRecordingBookmark';
		this._register(vscode.commands.registerCommand(commandIdAddBookmark, () => {
			for (const r of this.recorders.values()) {
				r.addBookmark();
			}
			vscode.window.showInformationMessage('Bookmark added to recording.');
		}));

		const doc = this._logProvider.createDocument('', 'current.recording.w.json');

		const commandIdViewRecording = 'vscodeCopilot.viewRecording';
		this._register(vscode.commands.registerCommand(commandIdViewRecording, async () => {
			const first = this.recorders.values().next().value;
			if (!first) {
				vscode.window.showInformationMessage('No recording found.');
				return;
			}

			const data = await readFile(first.logFilePath, 'utf8');
			const entries = JSONL.parse(data);
			const recordingData = {
				log: entries
			};
			doc.setContent(JSON.stringify(recordingData));

			await vscode.commands.executeCommand('vscode.open', doc.uri);
		}));

		this._register(autorunWithStore((reader, store) => {
			if (!this.hasWorkspace.read(reader)) { return; }

			const item = store.add(vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10000));
			item.text = '$(record) Rec';

			const lines: string[] = [];
			lines.push('## $(record) Recording Workspace Changes');
			lines.push('All recordings are stored locally and not uploaded.');
			lines.push('$(chevron-right) Click status bar entry to add a bookmark');
			lines.push(`[$(chevron-right) Open local recording folder](command:${commandIdOpenRecordingFolder})`);
			lines.push(`[$(chevron-right) View recording](command:${commandIdViewRecording})`);

			const md = new vscode.MarkdownString(lines.join('\n\n'));
			md.isTrusted = true;
			md.supportThemeIcons = true;
			item.tooltip = md;

			item.color = 'yellow';
			item.show();


			item.command = { command: commandIdAddBookmark, title: 'Add bookmark' };
		}));

		this._register(vscode.workspace.onDidOpenTextDocument(e => {
			const docUri = documentUriFromTextDocument(e);
			const workspaceRecorder = this.getWorkspaceRecorder(docUri);
			if (workspaceRecorder) {
				workspaceRecorder.handleOnDidOpenTextDocument(docUri, e.getText(), e.version);
			}
		}));

		this._register(vscode.workspace.onDidOpenNotebookDocument(async e => {
			const docUri = e.uri.toString();
			const workspaceRecorder = this.getWorkspaceRecorder(docUri);
			if (workspaceRecorder) {
				workspaceRecorder.handleOnDidOpenTextDocument(docUri, serializeNotebookDocument(e, { cell_uri_fragment: true }), e.version);
				workspaceRecorder.handleDocumentEvent(docUri, Date.now(), e.version);
			}
		}));

		this._register(this.workspaceListenerService.onStructuredData((item: IRecordableLogEntry | IRecordableEditorLogEntry) => {
			if ('modelUri' in item) {
				const docUri = item.modelUri.toString();
				const workspaceRecorder = this.getWorkspaceRecorder(docUri);
				if (workspaceRecorder) {
					workspaceRecorder.handleDocumentEvent(docUri, item.time, { ...item, time: undefined, modelUri: undefined, modelVersion: undefined, v: item.modelVersion });
				}
			} else {
				// send to first recorder
				const recorder = this.recorders.values().next().value;
				if (recorder) {
					recorder.handleEvent(item.time, { ...item, time: undefined });
				}
			}
		}));

		this._register(vscode.workspace.onDidChangeTextDocument(e => {
			const docUri = documentUriFromTextDocument(e.document);
			const workspaceRecorder = this.getWorkspaceRecorder(docUri);
			if (workspaceRecorder) {
				const edit = editFromTextDocumentContentChangeEvents(e.contentChanges);
				workspaceRecorder.handleOnDidChangeTextDocument(docUri, edit, e.document.version, e.detailedReason?.metadata);
			}
		}));

		this._register(vscode.workspace.onDidCloseTextDocument(e => {
			const docUri = documentUriFromTextDocument(e);
			this.getWorkspaceRecorder(docUri)?.handleOnDidCloseTextDocument(docUri);
		}));

		for (const doc of vscode.workspace.textDocuments) {
			const docUri = documentUriFromTextDocument(doc);
			const workspaceRecorder = this.getWorkspaceRecorder(docUri);
			if (workspaceRecorder) {
				workspaceRecorder.handleOnDidOpenTextDocument(docUri, doc.getText(), doc.version);
			}
		}

		const observableVscodeApi = new ObservableVsCode();

		this._register(autorunWithStore((reader, store) => {
			const activeEditor = observableVscodeApi.activeTextEditor.read(reader);
			if (!activeEditor) { return; }
			const docUri = documentUriFromTextDocument(activeEditor.editor.document);
			const workspaceRecorder = this.getWorkspaceRecorder(docUri);
			if (!workspaceRecorder) { return; }

			workspaceRecorder.handleOnDidFocusedDocumentChange(docUri);

			store.add(autorun(reader => {
				const selections = activeEditor.selection.read(reader);
				const offsetRanges = selections.map(s => rangeToOffsetRange(s, activeEditor.editor.document));
				workspaceRecorder.handleOnDidSelectionChange(docUri, offsetRanges);
			}));
		}));
	}

	private readonly recorders = new Map<string, WorkspaceRecorder>();
	private readonly recordersChangedSignal = observableSignal(this);

	private readonly hasWorkspace = derived(this, reader => {
		this.recordersChangedSignal.read(reader);
		return [...this.recorders].length > 0;
	});

	private getWorkspaceRepository(docUri: string): gitExt.Repository | undefined {
		if (process.platform === 'win32') {
			// Use case insensitive
			return this.gitApi.repositories.find(r => startsWithIgnoreCase(docUri, r.rootUri.toString()));
		}
		return this.gitApi.repositories.find(r => docUri.startsWith(r.rootUri.toString()));
	}

	private getWorkspaceRecorder(docUri: string): WorkspaceRecorder | undefined {
		const workspaceRepo = this.getWorkspaceRepository(docUri);
		const workspaceRoot = workspaceRepo?.rootUri.toString();
		if (!workspaceRoot) {
			return undefined;
		}
		const workspaceRootKey = workspaceRoot.toLowerCase();

		let recorder = this.recorders.get(workspaceRootKey);
		if (!recorder) {
			let workspaceIdxByRoot = this.workspacesIndexFile.value.workspaceIdxByRoot;
			let workspaceIdx = workspaceIdxByRoot[workspaceRootKey];
			if (workspaceIdx === undefined) {
				workspaceIdx = Object.entries(workspaceIdxByRoot).length;
				workspaceIdxByRoot = { ...workspaceIdxByRoot, [workspaceRootKey]: workspaceIdx };
				this.workspacesIndexFile.setValue({ workspaceIdxByRoot: workspaceIdxByRoot });
			}

			const checkIsIgnored = new BatchedProcessor<string, boolean>(async (paths) => {
				const result = await workspaceRepo!.checkIgnore(paths);
				return paths.map(p => result.has(p));
			}, 1000);
			const isIgnored = new CachedFunction(async (documentUri: string) => {
				const path = Uri.parse(documentUri).fsPath;
				return await checkIsIgnored.request(path);
			});

			const folderName = sanitizeFolderName(basename(workspaceRootKey)) + '-' + workspaceIdx;
			recorder = new WorkspaceRecorder(workspaceRoot, join(this.recordingDirPath, folderName), {
				isIgnoredDocument: documentUri => isIgnored.get(documentUri),
			});
			this._register(recorder);

			this.recorders.set(workspaceRootKey, recorder);
			this.recordersChangedSignal.trigger(undefined);
		}

		return recorder;
	}
}

function sanitizeFolderName(str: string): string {
	return str.replaceAll(/[^a-zA-Z0-9_.-]/g, '');
}

function documentUriFromTextDocument(textDocument: vscode.TextDocument): SerializedDocumentId {
	if (textDocument.uri.scheme === Schemas.vscodeNotebookCell) {
		const notebookDocument = findNotebook(textDocument.uri, vscode.workspace.notebookDocuments);
		if (!notebookDocument) {
			throw new Error('No notebook document found for cell');
		}

		return notebookDocument.uri.with({ fragment: textDocument.uri.fragment }).toString();
	}

	return textDocument.uri.toString();
}
