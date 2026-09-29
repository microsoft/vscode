/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TextEncoder } from 'util';
import type * as vscode from 'vscode';
import { ChatResponseStreamImpl } from '../../src/extension/conversation/node/chatResponseStreamImpl';
import { CopilotInteractiveEditorSession, CopilotInteractiveEditorSessionProvider, InteractiveEditorRequest } from '../../src/extension/inlineChat/node/inlineChat';
import { InlineChatConstants } from '../../src/extension/inlineChat/node/inlineChatConstants';
import { ITestDepsResolver, TestDepsResolver } from '../../src/extension/intents/node/testIntent/testDepsResolver';
import { detectIndentationStyle } from '../../src/extension/prompt/node/editGeneration';
import { WorkingCopyOriginalDocument } from '../../src/extension/prompts/node/inline/workingCopies';
import { editorAgentName } from '../../src/platform/chat/common/chatAgents';
import { IChatMLFetcher } from '../../src/platform/chat/common/chatMLFetcher';
import { IConversationOptions } from '../../src/platform/chat/common/conversationOptions';
import { ConfigKey } from '../../src/platform/configuration/common/configurationService';
import { IFileSystemService } from '../../src/platform/filesystem/common/fileSystemService';
import { FileType } from '../../src/platform/filesystem/common/fileTypes';
import { IIgnoreService } from '../../src/platform/ignore/common/ignoreService';
import { AbstractLanguageDiagnosticsService, ILanguageDiagnosticsService } from '../../src/platform/languages/common/languageDiagnosticsService';
import { ILanguageFeaturesService } from '../../src/platform/languages/common/languageFeaturesService';
import { INotebookService, PipPackage, VariablesResult } from '../../src/platform/notebook/common/notebookService';
import { IReviewService, ReviewComment, ReviewDiagnosticCollection } from '../../src/platform/review/common/reviewService';
import { ISearchService } from '../../src/platform/search/common/searchService';
import { ITabsAndEditorsService } from '../../src/platform/tabs/common/tabsAndEditorsService';
import { SnapshotSearchService, TestingTabsAndEditorsService } from '../../src/platform/test/node/promptContextModel';
import { AbstractWorkspaceService, IWorkspaceService } from '../../src/platform/workspace/common/workspaceService';
import { getLanguage, getLanguageForResource } from '../../src/util/common/languages';
import { IServicesAccessor } from '../../src/util/common/services';
import { ExtHostNotebookRange } from '../../src/util/common/test/shims/notebookDocument';
import { ExtHostDocumentData } from '../../src/util/common/test/shims/textDocument';
import { CancellationToken } from '../../src/util/vs/common/cancellation';
import { Event } from '../../src/util/vs/common/event';
import { ResourceMap } from '../../src/util/vs/common/map';
import { commonPrefixLength, commonSuffixLength } from '../../src/util/vs/common/strings';
import { URI } from '../../src/util/vs/common/uri';
import { SyncDescriptor } from '../../src/util/vs/platform/common/descriptors';
import { IInstantiationService } from '../../src/util/vs/platform/common/instantiation';
import { ChatLocation, ChatResponseMarkdownPart, ChatResponseTextEditPart, Diagnostic, DiagnosticRelatedInformation, Location, Range, Selection, TextEdit, Uri, WorkspaceEdit } from '../../src/vscodeTypes';
import { SpyingChatMLFetcher } from '../base/spyingChatMLFetcher';
import { ISimulationTestRuntime } from '../base/stest';
import { getDiagnostics } from './diagnosticProviders';
import { convertTestToVSCodeDiagnostics } from './diagnosticProviders/utils';
import { SimulationLanguageFeaturesService } from './language/simulationLanguageFeatureService';
import { IDiagnostic, IDiagnosticComparison, INLINE_CHANGED_DOC_TAG, INLINE_INITIAL_DOC_TAG, INLINE_STATE_TAG, IRange, IWorkspaceState, IWorkspaceStateFile } from './shared/sharedTypes';
import { SimulationWorkspace, WORKSPACE_PATH, isNotebook } from './simulationWorkspace';
import { DiagnosticProviderId, IFile, IInlineEdit, IOutcome, IScenario, IScenarioDiagnostic } from './types';

export function setUpSimulationWorkspace(accessor: IServicesAccessor, files: IFile[], workspaceFolders?: Uri[]): SimulationWorkspace {
	const workspace = new SimulationWorkspace(files, workspaceFolders);
	const workspaceService = new SimulationWorkspaceService(workspace);
	accessor.define(IWorkspaceService, workspaceService);
	const fs = new SimulationFileSystemAdaptor(workspaceService, accessor.get(IFileSystemService));
	accessor.define(IFileSystemService, fs);
	accessor.define(ISearchService, new SnapshotSearchService(fs, workspaceService));
	accessor.define(ITabsAndEditorsService, new TestingTabsAndEditorsService(() => workspace.activeTextEditor, () => workspace.activeNotebookEditor));
	accessor.define(ITestDepsResolver, new SyncDescriptor(TestDepsResolver));
	accessor.define(ILanguageDiagnosticsService, new SimulationLanguageDiagnosticsService(workspace, accessor.get(IIgnoreService)));
	accessor.define(ILanguageFeaturesService, new SimulationLanguageFeaturesService(accessor, workspace));
	accessor.define(IReviewService, new SimulationReviewService());
	accessor.define(INotebookService, new SimulationNotebookService(workspace));
	return workspace;
}

export async function teardownSimulationWorkspace(accessor: IServicesAccessor, _workbench: SimulationWorkspace): Promise<void> {
	const ls = accessor.get(ILanguageFeaturesService);
	if (ls instanceof SimulationLanguageFeaturesService) {
		await ls.teardown();
	}
}

export async function simulateInlineChat(
	accessor: IServicesAccessor,
	scenario: IScenario
): Promise<void> {
	assert(scenario.queries.length > 0, `Cannot simulate scenario with no queries`);
	assert(scenario.files.length > 0, `Cannot simulate scenario with no files`);

	const workspace = setUpSimulationWorkspace(accessor, scenario.files, scenario.workspaceFolders);
	scenario.extraWorkspaceSetup?.(workspace);

	const instaService = accessor.get(IInstantiationService);
	const testRuntime = accessor.get(ISimulationTestRuntime);
	const options: IConversationOptions = {
		_serviceBrand: undefined,
		additionalPromptContext: 'firstTurn',
		temperature: InlineChatConstants.temperature,
		topP: InlineChatConstants.top_p,
		maxResponseTokens: undefined,
		rejectionMessage: ''
	};

	const provider = instaService.createInstance(CopilotInteractiveEditorSessionProvider, editorAgentName, options.rejectionMessage);
	let session: CopilotInteractiveEditorSession | undefined;

	const states: IWorkspaceState[] = [];
	let range: Range | undefined;
	let isFirst = true;

	// run each query for the scenario
	try {
		for (const query of scenario.queries) {

			if (query.file) {
				if (isNotebook(query.file)) {
					const notebook = workspace.getNotebook(query.file);
					if (!notebook) {
						throw new Error(`Missing notebook file ${query.file}`);
					}

					const cell = notebook.cellAt(query.activeCell ?? 0);
					if (!cell) {
						throw new Error(`Missing cell ${query.activeCell} in notebook file ${query.file}`);
					}

					workspace.addNotebookDocument(notebook);
					workspace.setCurrentNotebookDocument(notebook);
					workspace.setCurrentDocument(cell.document.uri);
				} else if (typeof query.file !== 'string') {
					workspace.setCurrentDocument(query.file);
				} else {
					workspace.setCurrentDocument(
						workspace.getDocument(query.file).document.uri);
				}
			}

			if (query.selection) {
				const selection = toSelection(query.selection);
				workspace.setCurrentSelection(selection);
			}

			if (query.activeCell) {
				const cellSelection = new ExtHostNotebookRange(query.activeCell, query.activeCell + 1);
				workspace.setCurrentNotebookSelection(cellSelection);
			}

			const queryWholeRange = query.wholeRange ? toSelection(query.wholeRange) : undefined;

			const editor = accessor.get(ITabsAndEditorsService).activeTextEditor;
			const document = editor?.document;
			if (!editor || !document) {
				throw new Error(`No file specified for query ${query.query}`);
			}

			const language = getLanguage(document.languageId);
			let initialDiagnostics: ResourceMap<vscode.Diagnostic[]> | undefined;

			if (typeof query.diagnostics === 'string') {
				// diagnostics are computed
				try {
					initialDiagnostics = await fetchDiagnostics(accessor, workspace, query.diagnostics);
					workspace.setDiagnostics(initialDiagnostics);
				} catch (error) {
					throw new Error(`Error obtained while fetching the diagnostics: ${error}`);
				}
			} else {
				// diagnostics are set explicitly
				const diagnostics = new ResourceMap<vscode.Diagnostic[]>();
				diagnostics.set(document.uri, convertToDiagnostics(workspace, query.diagnostics));
				workspace.setDiagnostics(diagnostics);
			}

			const fileIndentInfo = query.fileIndentInfo ?? { ...detectIndentationStyle(document.getText().split('\n')) };
			workspace.setCurrentDocumentIndentInfo(fileIndentInfo);

			if (isFirst) {
				isFirst = false;
				session = await provider.prepareInteractiveEditorSession({ document, selection: editor.selection });

				range = session.wholeRange ?? queryWholeRange ?? editor.selection;
				const workspacePath = workspace.getFilePath(document.uri);
				let relativeDiskPath: string | undefined;
				if (isNotebook(document.uri)) {
					const notebookDocument = workspace.getNotebook(document.uri);
					if (!notebookDocument) {
						throw new Error(`Missing notebook document ${document.uri}`);
					}

					relativeDiskPath = await testRuntime.writeFile(workspacePath + '.txt', notebookDocument.getText(), INLINE_INITIAL_DOC_TAG); // TODO@aml: using .txt instead of real file extension to avoid breaking AML scripts
				} else {
					relativeDiskPath = await testRuntime.writeFile(workspacePath + '.txt', document.getText(), INLINE_INITIAL_DOC_TAG); // TODO@aml: using .txt instead of real file extension to avoid breaking AML scripts
				}

				if (!relativeDiskPath) {
					throw new Error(`Failed to write initial document to disk`);
				}

				states.push({
					kind: 'initial',
					file: {
						workspacePath,
						relativeDiskPath
					},
					languageId: language.languageId,
					selection: toIRange(editor.selection),
					range: toIRange(range),
					diagnostics: workspace.activeFileDiagnostics.map(toIDiagnostic),
				});
			} else {
				range = queryWholeRange ?? range;
			}

			if (!range) {
				assert(false, `Range should have been set by now`);
			}

			let command: string | undefined;
			let prompt = query.query;
			if (prompt.startsWith('/')) {
				const groups = /\/(?<intentId>\w+)(?<restOfQuery>\s.*)?/s.exec(query.query)?.groups;
				command = groups?.intentId ?? undefined;
				prompt = groups?.restOfQuery?.trim() ?? '';
			}

			const changedDocs: vscode.TextDocument[] = [];
			const request: InteractiveEditorRequest = {
				location: ChatLocation.Editor,
				command,
				prompt,
				selection: editor.selection,
				wholeRange: range,
				references: [],
				attempt: 0,
				enableCommandDetection: true, // TODO@ulugbekna: add support for disabling intent detection?
			};
			const markdownChunks: string[] = [];
			let receivedStreamingEdits = false;
			const changedDocuments = new ResourceMap<WorkingCopyOriginalDocument>();
			const stream = new ChatResponseStreamImpl((value) => {
				if (value instanceof ChatResponseTextEditPart && value.edits.length > 0) {
					const { uri, edits } = value;
					receivedStreamingEdits = true;

					let doc: ExtHostDocumentData;
					if (!workspace.hasDocument(uri)) {
						// this is a new file
						const language = getLanguageForResource(uri);
						doc = ExtHostDocumentData.create(uri, '', language.languageId);
						workspace.addDocument(doc);
					} else {
						doc = workspace.getDocument(uri);
					}

					let workingCopyDocument = changedDocuments.get(uri);
					if (!workingCopyDocument) {
						workingCopyDocument = new WorkingCopyOriginalDocument(doc.document.getText());
						changedDocuments.set(uri, workingCopyDocument);
					}

					workingCopyDocument.applyOffsetEdits(workingCopyDocument.transformer.toOffsetEdit(edits));
					changedDocs.push(doc.document);
					if (doc.document.uri.toString() === document.uri.toString()) {
						// edit in the same document, adjust the range
						range = applyEditsAndExpandRange(workspace, document, edits, range);
					} else {
						workspace.applyEdits(doc.document.uri, edits);
					}

				} else if (value instanceof ChatResponseMarkdownPart) {
					markdownChunks.push(value.value.value);
				}
			});

			const documentStateBeforeInvocation = document.getText();

			const response = await provider.provideInteractiveEditorResponse(session!, request, stream, CancellationToken.None);

			const intent = response?.promptQuery.intent;

			let goToChat = false;
			let outcome: IOutcome;
			if (!response) {
				outcome = { type: 'none' };
			} else if (receivedStreamingEdits || 'edits' in response) { // TODO@ulugbekna: we should be able to use `instanceof` when the proposed API adopts classes instead of interfaces
				const outcomeFiles: IFile[] = [];
				const workspaceEdit = new WorkspaceEdit();
				const outcomeEdits: IInlineEdit[] = [];
				for (const [uri, workingCopyDoc] of changedDocuments.entries()) {
					if (uri.scheme === 'file') {
						outcomeFiles.push({
							kind: 'relativeFile',
							fileName: path.basename(uri.fsPath),
							fileContents: workspace.getDocument(uri).getText()
						});
					} else {
						outcomeFiles.push({
							kind: 'qualifiedFile',
							uri: uri,
							fileContents: workspace.getDocument(uri).getText()
						});
					}
					const offsetEdits = workingCopyDoc.appliedEdits;
					const textEdits = workingCopyDoc.transformer.toTextEdits(offsetEdits);
					if (uri.toString() === document.uri.toString()) {
						// edit in the same document
						for (let i = 0; i < offsetEdits.edits.length; i++) {
							const offsetEdit = offsetEdits.edits[i];
							const textEdit = textEdits[i];
							outcomeEdits.push({
								offset: startOffset,
								length: endOffset - startOffset,
								range: textEdit.range,
								newText: textEdit.newText,
							});
						}
					}
					workspaceEdit.set(uri, textEdits);
				}

				if (response.reply.type === 'inlineEdit') {
					outcome = {
						type: 'inlineEdit',
						initialDiagnostics,
						appliedEdits: outcomeEdits,
						originalFileContents: documentStateBeforeInvocation,
						fileContents: document.getText(),
						markdownMessage: markdownChunks.join(''),
						annotations: response.reply.annotations
					};
				}
				const edits = response.edits;
				if (Array.isArray(edits)) {
					const outcomeEdits: IInlineEdit[] = edits.map(edit => {
						const startOffset = document.offsetAt(edit.range.start);
						const endOffset = document.offsetAt(edit.range.end);
						return {
							offset: startOffset,
							length: endOffset - startOffset,
							range: edit.range,
							newText: edit.newText,
						};
					});

				} else {

					outcome = { type: 'workspaceEdit', files: outcomeFiles, annotations: response.reply.annotations, edits: workspaceEdit, content: markdownChunks.join('') };
				}
			} else {
				goToChat = true;
				outcome = { type: 'conversational', content: markdownChunks.join(''), annotations: response.reply.annotations };
			}

			const changedFilePaths: IWorkspaceStateFile[] = [];
			if (changedDocs.length > 0) {
				const seenDoc = new Set<string>();
				for (const changedDoc of changedDocs) {
					const workspacePath = workspace.getFilePath(changedDoc.uri);
					if (seenDoc.has(workspacePath)) {
						continue;
					}
					seenDoc.add(workspacePath);

					if (isNotebook(changedDoc.uri)) {
						const notebook = workspace.getNotebook(changedDoc.uri);
						changedFilePaths.push({
							workspacePath,
							relativeDiskPath: await testRuntime.writeFile(workspacePath, notebook.getText(), INLINE_CHANGED_DOC_TAG)
						});
					} else {
						changedFilePaths.push({
							workspacePath,
							relativeDiskPath: await testRuntime.writeFile(workspacePath, changedDoc.getText(), INLINE_CHANGED_DOC_TAG)
						});
					}
				}

				// We managed to edit some files!
				testRuntime.setOutcome({
					kind: 'edit',
					files: changedFilePaths.map(f => f.relativeDiskPath),
					annotations: outcome.annotations
				});
			} else {
				const workspacePath = workspace.getFilePath(editor.document.uri);
				changedFilePaths.push({
					workspacePath,
					relativeDiskPath: await testRuntime.writeFile(workspacePath, editor.document.getText(), INLINE_CHANGED_DOC_TAG)
				});

				if (response && 'contents' in response) {
					testRuntime.setOutcome({
						kind: 'answer',
						content: markdownChunks.join(''),
						annotations: outcome.annotations
					});
				} else {
					const chatMLFetcher = accessor.get(IChatMLFetcher);
					let contentFilterCount = 0;
					if (chatMLFetcher instanceof SpyingChatMLFetcher) {
						contentFilterCount = chatMLFetcher.contentFilterCount;
					}
					testRuntime.setOutcome({
						kind: 'failed',
						hitContentFilter: contentFilterCount > 0,
						error: 'No contents.',
						annotations: outcome.annotations
					});
				}
			}

			let requestCount = 0;
			const fetcher = accessor.get(IChatMLFetcher);
			if (fetcher instanceof SpyingChatMLFetcher) {
				requestCount = fetcher.interceptedRequests.length;
			}

			let diagnostics: { [workspacePath: string]: IDiagnosticComparison } | undefined = undefined;
			if (typeof query.diagnostics === 'string') {
				const diagnosticsAfter = await fetchDiagnostics(accessor, workspace, query.diagnostics);
				diagnostics = {};
				for (const changedFilePath of changedFilePaths) {
					const uri = workspace.getUriFromFilePath(changedFilePath.workspacePath);
					const before = (initialDiagnostics?.get(uri) ?? []).map(toIDiagnostic);
					const after = (diagnosticsAfter.get(uri) ?? []).map(toIDiagnostic);
					diagnostics[changedFilePath.workspacePath] = { before, after };
				}
			}

			states.push({
				kind: 'interaction',
				changedFiles: changedFilePaths,
				annotations: outcome.annotations,
				fileName: workspace.getFilePath(editor.document.uri),
				languageId: language.languageId,
				diagnostics,
				selection: toIRange(editor.selection),
				range: toIRange(range),
				interaction: {
					query: query.query,
					actualIntent: query.expectedIntent,
					detectedIntent: intent?.id,
					goToChat,
				},
				requestCount,
			});

			await Promise.resolve(query.validate(outcome, workspace));
		}
	} finally {
		await teardownSimulationWorkspace(accessor, workspace);
		await testRuntime.writeFile('inline-simulator.txt', JSON.stringify(states, undefined, 2), INLINE_STATE_TAG); // TODO@aml: using .txt instead of .json to avoid breaking AML scripts
	}
}

function computeMoreMinimalEdit(document: vscode.TextDocument, edit: vscode.TextEdit): vscode.TextEdit {
	edit = reduceCommonPrefix(document, edit);
	edit = reduceCommonSuffix(document, edit);
	return edit;

	function reduceCommonPrefix(document: vscode.TextDocument, edit: vscode.TextEdit): vscode.TextEdit {
		const start = document.offsetAt(edit.range.start);
		const end = document.offsetAt(edit.range.end);
		const oldText = document.getText().substring(start, end);
		const newText = edit.newText;
		const commonPrefixLen = commonPrefixLength(oldText, newText);

		return new TextEdit(
			new Range(
				document.positionAt(start + commonPrefixLen),
				edit.range.end
			),
			edit.newText.substring(commonPrefixLen)
		);
	}

	function reduceCommonSuffix(document: vscode.TextDocument, edit: vscode.TextEdit): vscode.TextEdit {
		const start = document.offsetAt(edit.range.start);
		const end = document.offsetAt(edit.range.end);
		const oldText = document.getText().substring(start, end);
		const newText = edit.newText;
		const commonSuffixLen = commonSuffixLength(oldText, newText);

		return new TextEdit(
			new Range(
				edit.range.start,
				document.positionAt(end - commonSuffixLen)
			),
			edit.newText.substring(0, newText.length - commonSuffixLen)
		);
	}
}

function applyEditsAndExpandRange(workspace: SimulationWorkspace, document: vscode.TextDocument, edits: vscode.TextEdit[], range: vscode.Range): vscode.Range;
function applyEditsAndExpandRange(workspace: SimulationWorkspace, document: vscode.TextDocument, edits: vscode.TextEdit[], range: vscode.Range | undefined): vscode.Range | undefined;
function applyEditsAndExpandRange(workspace: SimulationWorkspace, document: vscode.TextDocument, edits: vscode.TextEdit[], range: vscode.Range | undefined): vscode.Range | undefined {
	if (typeof range === 'undefined') {
		workspace.applyEdits(document.uri, edits, range);
		return undefined;
	}

	edits = edits.map(edit => computeMoreMinimalEdit(document, edit));

	const touchedRanges = new Set<[number, number]>();
	let deltaOffset = 0;
	for (const edit of edits) {
		const startOffset = deltaOffset + document.offsetAt(edit.range.start);
		const endOffset = deltaOffset + document.offsetAt(edit.range.end);
		const textLen = edit.newText.length;

		deltaOffset += textLen - (endOffset - startOffset);

		touchedRanges.add([startOffset, textLen]);
	}

	range = workspace.applyEdits(document.uri, edits, range);
	for (const touchedRange of touchedRanges) {
		const [startOffset, textLen] = touchedRange;
		const start = document.positionAt(startOffset);
		const end = document.positionAt(startOffset + textLen);
		range = range?.union(new Range(start, end));
	}
	return range;
}

function convertToDiagnostics(workspace: SimulationWorkspace, diagnostics: IScenarioDiagnostic[] | undefined): vscode.Diagnostic[] {
	return (diagnostics ?? []).map((d) => {
		const diagnostic = new Diagnostic(new Range(d.startLine, d.startCharacter, d.endLine, d.endCharacter), d.message);
		diagnostic.relatedInformation = d.relatedInformation?.map(r => {
			const range = new Range(r.location.startLine, r.location.startCharacter, r.location.endLine, r.location.endCharacter);
			const relatedDocument = workspace.getDocument(r.location.path);
			const relatedLocation = new Location(relatedDocument.document.uri, range);
			return new DiagnosticRelatedInformation(relatedLocation, r.message);
		});
		return diagnostic;
	});
}

async function fetchDiagnostics(accessor: IServicesAccessor, workspace: SimulationWorkspace, providerId: DiagnosticProviderId) {
	const files = workspace.documents.map(doc => ({ fileName: workspace.getFilePath(doc.document.uri), fileContents: doc.document.getText() }));
	const diagnostics = await getDiagnostics(accessor, files, providerId);
	return convertTestToVSCodeDiagnostics(diagnostics, path => workspace.getUriFromFilePath(path));
}

function toIDiagnostic(diagnostic: vscode.Diagnostic): IDiagnostic {
	return { range: toIRange(diagnostic.range), message: diagnostic.message };
}

export function toIRange(range: vscode.Range): IRange {
	return {
		start: { line: range.start.line, character: range.start.character },
		end: { line: range.end.line, character: range.end.character },
	};
}

export interface OffsetBasedRange {
	readonly offset: number;
	readonly length: number;
}

export function toSelection(selection: [number, number] | [number, number, number, number]): vscode.Selection {
	if (selection.length === 2) {
		return new Selection(selection[0], selection[1], selection[0], selection[1]);
	} else {
		return new Selection(selection[0], selection[1], selection[2], selection[3]);
	}
}

class SimulationLanguageDiagnosticsService extends AbstractLanguageDiagnosticsService {

	constructor(private workspace: SimulationWorkspace, ignoreService: IIgnoreService) {
		super(ignoreService);
	}

	override onDidChangeDiagnostics: vscode.Event<vscode.DiagnosticChangeEvent> = this.workspace.onDidChangeDiagnostics;
	override getDiagnostics: (resource: vscode.Uri) => vscode.Diagnostic[] = this.workspace.getDiagnostics.bind(this.workspace);
}

class SimulationWorkspaceService extends AbstractWorkspaceService {

	constructor(private readonly workspace: SimulationWorkspace) {
		super();
	}

	override get textDocuments(): readonly vscode.TextDocument[] {
		return this.workspace.documents.map(d => d.document);
	}

	override onDidOpenTextDocument: vscode.Event<vscode.TextDocument> = Event.None;
	override onDidCloseTextDocument: vscode.Event<vscode.TextDocument> = Event.None;
	override onDidChangeTextDocument: vscode.Event<vscode.TextDocumentChangeEvent> = Event.None;

	override async openTextDocument(uri: vscode.Uri): Promise<vscode.TextDocument> {
		if (this.workspace.hasDocument(uri)) {
			return this.workspace.getDocument(uri).document;
		}

		if (uri.scheme === 'file') {
			const filePath = uri.fsPath;
			const fileContents = await fs.readFile(filePath, 'utf8');
			const language = getLanguageForResource(uri);
			return ExtHostDocumentData.create(uri, fileContents, language.languageId).document;
		}

		throw new Error(`File not found ${uri}`);
	}

	override get notebookDocuments(): readonly vscode.NotebookDocument[] {
		return this.workspace.getNotebookDocuments();
	}

	override getWorkspaceFolders(): URI[] {
		return this.workspace.workspaceFolders;
	}

	override ensureWorkspaceIsFullyLoaded(): Promise<void> {
		// We aren't using virtual workspaces here, so we can just return
		return Promise.resolve();
	}
}

class SimulationFileSystemAdaptor implements IFileSystemService {

	declare readonly _serviceBrand: undefined;

	private readonly _time = Date.now();

	constructor(
		@IWorkspaceService private _workspace: IWorkspaceService,
		@IFileSystemService private _delegate: IFileSystemService
	) { }

	async stat(uri: URI): Promise<vscode.FileStat> {
		const doc = await this._workspace.openTextDocument(uri);
		if (doc) {
			return {
				type: FileType.File,
				ctime: this._time,
				mtime: this._time,
				size: new TextEncoder().encode(doc.getText()).byteLength
			};
		}
		return await this._delegate.stat(uri);
	}

	async readFile(uri: URI): Promise<Uint8Array> {
		const doc = await this._workspace.openTextDocument(uri);
		if (doc) {
			return new TextEncoder().encode(doc.getText());
		}
		return await this._delegate.readFile(uri);
	}

	async readDirectory(uri: URI): Promise<[string, FileType][]> {
		if (uri.path === WORKSPACE_PATH) {
			return this._workspace.textDocuments.map(doc => {
				const relativePath = path.relative(WORKSPACE_PATH, doc.uri.path);
				return [relativePath, FileType.File];
			});
		}
		return await this._delegate.readDirectory(uri);
	}

	async createDirectory(uri: URI): Promise<void> {
		return await this._delegate.createDirectory(uri);
	}

	async writeFile(uri: URI, content: Uint8Array): Promise<void> {
		return await this._delegate.writeFile(uri, content);
	}

	async delete(uri: URI, options?: { recursive?: boolean | undefined; useTrash?: boolean | undefined } | undefined): Promise<void> {
		return await this._delegate.delete(uri, options);
	}

	async rename(oldURI: URI, newURI: URI, options?: { overwrite?: boolean | undefined } | undefined): Promise<void> {
		return await this._delegate.rename(oldURI, newURI, options);
	}

	async copy(source: URI, destination: URI, options?: { overwrite?: boolean | undefined } | undefined): Promise<void> {
		return await this._delegate.copy(source, destination, options);
	}

	isWritableFileSystem(scheme: string): boolean | undefined {
		return this._delegate.isWritableFileSystem(scheme);
	}

	createFileSystemWatcher(glob: string): vscode.FileSystemWatcher {
		return this._delegate.createFileSystemWatcher(glob);
	}
}

class SimulationReviewService implements IReviewService {
	declare _serviceBrand: undefined;

	private diagnosticCollection = {
		diagnosticCollection: new Map<string, readonly vscode.Diagnostic[]>(),
		get(uri: vscode.Uri) {
			return this.diagnosticCollection.get(uri.toString());
		},
		set(uri: vscode.Uri, diagnostics: readonly vscode.Diagnostic[] | undefined) {
			if (diagnostics?.length) {
				this.diagnosticCollection.set(uri.toString(), diagnostics);
			} else {
				this.diagnosticCollection.delete(uri.toString());
			}
		}
	};

	private _comments: ReviewComment[] = [];

	updateContextValues(): void {
	}

	isIntentEnabled(): boolean {
		return ConfigKey.ReviewIntent.defaultValue;
	}

	getDiagnosticCollection(): ReviewDiagnosticCollection {
		return this.diagnosticCollection;
	}

	getReviewComments(): ReviewComment[] {
		return this._comments.slice();
	}

	addReviewComments(comments: ReviewComment[]) {
		this._comments.push(...comments);
	}

	collapseReviewComment(_comment: ReviewComment): void {
	}

	removeReviewComments(comments: ReviewComment[]) {
		for (const comment of comments) {
			const index = this._comments.indexOf(comment);
			if (index !== -1) {
				this._comments.splice(index, 1);
			}
		}
	}

	findReviewComment(_threadOrComment: vscode.CommentThread | vscode.Comment): ReviewComment | undefined {
		return undefined;
	}

	findCommentThread(comment: ReviewComment): vscode.CommentThread | undefined {
		return undefined;
	}
}

class SimulationNotebookService implements INotebookService {

	declare _serviceBrand: undefined;
	private _variablesMap = new ResourceMap<VariablesResult[]>();

	constructor(private _workspace: SimulationWorkspace) { }

	getCellExecutions(notebook: vscode.Uri): vscode.NotebookCell[] {
		return [];
	}

	async getVariables(notebook: vscode.Uri): Promise<VariablesResult[]> {
		return this._variablesMap.get(notebook) ?? [];
	}

	async getPipPackages(notebook: vscode.Uri): Promise<PipPackage[]> {
		return [];
	}

	setVariables(uri: vscode.Uri, variables: VariablesResult[]) {
		if (!this._workspace.getNotebook(uri)) {
			return;
		}

		this._variablesMap.set(uri, variables);
	}
}
