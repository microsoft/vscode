/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as path from 'path';
import type * as vscode from 'vscode';
import { Intent } from '../../src/extension/common/constants';
import { CopilotInteractiveEditorResponse, InteractionOutcome, InteractionOutcomeComputer } from '../../src/extension/inlineChat/node/promptCraftingTypes';
import { ICopilotChatResult } from '../../src/extension/prompt/common/conversation';
import { ChatParticipantRequestHandler, IChatAgentArgs } from '../../src/extension/prompt/node/chatParticipantRequestHandler';
import { guessFileIndentInfo } from '../../src/extension/prompt/node/indentationGuesser';
import { IntentDetector } from '../../src/extension/prompt/node/intentDetector';
import { IIntent } from '../../src/extension/prompt/node/intents';
import { WorkingCopyOriginalDocument } from '../../src/extension/prompts/node/inline/workingCopies';
import { IToolsService } from '../../src/extension/tools/common/toolsService';
import { TestEditFileTool } from '../../src/extension/tools/node/test/testTools';
import { TestToolsService } from '../../src/extension/tools/node/test/testToolsService';
import { editorAgentName, getChatParticipantIdFromName } from '../../src/platform/chat/common/chatAgents';
import { IChatMLFetcher } from '../../src/platform/chat/common/chatMLFetcher';
import { ILanguageDiagnosticsService } from '../../src/platform/languages/common/languageDiagnosticsService';
import { ILanguageFeaturesService } from '../../src/platform/languages/common/languageFeaturesService';
import { ITabsAndEditorsService } from '../../src/platform/tabs/common/tabsAndEditorsService';
import { isInExtensionHost } from '../../src/platform/test/node/isInExtensionHost';
import { IDeserializedWorkspaceState } from '../../src/platform/test/node/promptContextModel';
import { ITestingServicesAccessor, TestingServiceCollection } from '../../src/platform/test/node/services';
import { IFile, isNotebook, SimulationWorkspace } from '../../src/platform/test/node/simulationWorkspace';
import { ChatResponseStreamImpl } from '../../src/util/common/chatResponseStreamImpl';
import { getLanguage, getLanguageForResource } from '../../src/util/common/languages';
import { ChatRequestTurn, ChatResponseTurn } from '../../src/util/common/test/shims/chatTypes';
import { ExtHostNotebookDocumentData } from '../../src/util/common/test/shims/notebookDocument';
import { createTextDocumentData, IExtHostDocumentData } from '../../src/util/common/test/shims/textDocument';
import { CancellationToken } from '../../src/util/vs/base/common/cancellation';
import { ResourceMap } from '../../src/util/vs/base/common/map';
import { isEqual } from '../../src/util/vs/base/common/resources';
import { commonPrefixLength, commonSuffixLength } from '../../src/util/vs/base/common/strings';
import { URI } from '../../src/util/vs/base/common/uri';
import { SyncDescriptor } from '../../src/util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { ChatLocation, ChatReferenceDiagnostic, ChatRequest, ChatRequestEditorData, ChatResponseMarkdownPart, ChatResponseNotebookEditPart, ChatResponseTextEditPart, Diagnostic, DiagnosticRelatedInformation, LanguageModelToolResult, Location, NotebookRange, Range, Selection, TextEdit, Uri, WorkspaceEdit } from '../../src/vscodeTypes';
import { SimulationExtHostToolsService } from '../base/extHostContext/simulationExtHostToolsService';
import { SimulationWorkspaceExtHost } from '../base/extHostContext/simulationWorkspaceExtHost';
import { SpyingChatMLFetcher } from '../base/spyingChatMLFetcher';
import { ISimulationTestRuntime, NonExtensionConfiguration } from '../base/stest';
import { createWorkingSetFileVariable, parseQueryForTest } from '../e2e/testHelper';
import { readBuiltinIntents } from '../intent/intentTest';
import { getDiagnostics } from './diagnosticProviders';
import { convertTestToVSCodeDiagnostics } from './diagnosticProviders/utils';
import { SimulationLanguageFeaturesService } from './language/simulationLanguageFeatureService';
import { IDiagnostic, IDiagnosticComparison, INLINE_CHANGED_DOC_TAG, INLINE_INITIAL_DOC_TAG, INLINE_STATE_TAG, IRange, IWorkspaceState, IWorkspaceStateFile } from './shared/sharedTypes';
import { DiagnosticProviderId, EditTestStrategy, IDeserializedWorkspaceStateBasedScenario, IInlineEdit, IOutcome, IScenario, IScenarioDiagnostic, IScenarioQuery, OutcomeAnnotation } from './types';

export type SimulationWorkspaceInput = { files: IFile[]; workspaceFolders?: Uri[] } | { workspaceState: IDeserializedWorkspaceState };

export function setupSimulationWorkspace(testingServiceCollection: TestingServiceCollection, input: SimulationWorkspaceInput): SimulationWorkspace {
	const workspace = isInExtensionHost ? new SimulationWorkspaceExtHost() : new SimulationWorkspace();
	if ('workspaceState' in input) {
		workspace.resetFromDeserializedWorkspaceState(input.workspaceState);
	} else {
		workspace.resetFromFiles(input.files, input.workspaceFolders);
	}
	workspace.setupServices(testingServiceCollection);
	testingServiceCollection.define(ILanguageFeaturesService, new SyncDescriptor(SimulationLanguageFeaturesService, [workspace]));
	return workspace;
}

export async function teardownSimulationWorkspace(accessor: ITestingServicesAccessor, workbench: SimulationWorkspace): Promise<void> {
	const ls = accessor.get(ILanguageFeaturesService);
	if (ls instanceof SimulationLanguageFeaturesService) {
		await ls.teardown();
	}
	workbench.dispose();
}

function isDeserializedWorkspaceStateBasedScenario(scenario: IScenario): scenario is IDeserializedWorkspaceStateBasedScenario {
	return 'workspaceState' in scenario;
}

export function simulateInlineChatWithStrategy(strategy: EditTestStrategy, testingServiceCollection: TestingServiceCollection, scenario: IScenario) {

	if (strategy === EditTestStrategy.InlineChatIntent) {
		return simulateInlineChatIntent(testingServiceCollection, scenario);
	} else {
		return simulateInlineChat(testingServiceCollection, scenario);
	}
}

export async function simulateInlineChat(
	testingServiceCollection: TestingServiceCollection,
	scenario: IScenario
): Promise<void> {
	const host: EditingSimulationHost = {
		prepareChatRequestLocation: (accessor: ITestingServicesAccessor, wholeRange?: Range) => {
			const editor = accessor.get(ITabsAndEditorsService).activeTextEditor;
			if (!editor) {
				throw new Error(`No active editor`);
			}
			return {
				location: ChatLocation.Editor,
				location2: new ChatRequestEditorData(editor, editor.document, editor.selection, wholeRange ?? editor.selection),
			};
		}
	};
	return simulateEditingScenario(testingServiceCollection, scenario, host);
}

class ChatReferenceDiagnostic2 extends ChatReferenceDiagnostic {
	constructor(uri: Uri, d: Diagnostic) {
		super([[uri, [d]]]);
	}
}

export async function simulateInlineChatIntent(
	testingServiceCollection: TestingServiceCollection,
	scenario: IScenario
): Promise<void> {

	const overrideCommand = `/${Intent.InlineChat}`;

	const ensureSlashEdit = (query: string) => {
		return query.startsWith(overrideCommand) ? query : `${overrideCommand} ${query}`;
	};
	const prependEditToUserQueries = (queries: IScenarioQuery[]) => {
		return queries.map(scenarioQuery => {
			return {
				...scenarioQuery,
				query: ensureSlashEdit(scenarioQuery.query),
			};
		});
	};

	const massagedScenario = { ...scenario, queries: prependEditToUserQueries(scenario.queries) };

	const host: EditingSimulationHost = {
		prepareChatRequestLocation: (accessor: ITestingServicesAccessor, wholeRange?: Range) => {
			const editor = accessor.get(ITabsAndEditorsService).activeTextEditor;
			if (!editor) {
				throw new Error(`No active editor`);
			}
			return {
				location: ChatLocation.Editor,
				location2: new ChatRequestEditorData(editor, editor.document, editor.selection, wholeRange ?? editor.selection),
			};
		},
		contributeAdditionalReferences(accessor, existingReferences) {
			const diagnosticService = accessor.get(ILanguageDiagnosticsService);
			const editor = accessor.get(ITabsAndEditorsService).activeTextEditor;
			if (!editor) {
				return existingReferences.slice();
			}

			const result = existingReferences.slice();

			const diagnostics = diagnosticService.getDiagnostics(editor.document.uri);

			for (const d of diagnostics) {
				if (d.range.intersection(editor.selection)) {
					result.push({
						id: `diagnostic/${editor.document.uri}/${JSON.stringify(d)}`,
						name: d.message,
						value: new ChatReferenceDiagnostic2(editor.document.uri, d)
					});
				}
			}

			return result;
		},
	};
	return simulateEditingScenario(testingServiceCollection, massagedScenario, host);
}

export type EditingSimulationHostResponseProcessor = {
	spyOnStream(stream: vscode.ChatResponseStream): vscode.ChatResponseStream;
	postProcess(accessor: ITestingServicesAccessor, workspace: SimulationWorkspace, stream: vscode.ChatResponseStream, result?: ICopilotChatResult): Promise<OutcomeAnnotation[]>;
};

export interface EditingSimulationHost {
	agentArgs?: IChatAgentArgs;
	prepareChatRequestLocation(accessor: ITestingServicesAccessor, range?: Range): {
		location: vscode.ChatLocation;
		location2: vscode.ChatRequestEditorData | undefined;
	};
	contributeAdditionalReferences?: (accessor: ITestingServicesAccessor, existingReferences: readonly vscode.ChatPromptReference[]) => vscode.ChatPromptReference[];
	provideResponseProcessor?: (query: IScenarioQuery) => EditingSimulationHostResponseProcessor;
}


export async function simulateEditingScenario(
	testingServiceCollection: TestingServiceCollection,
	scenario: IScenario,
	host: EditingSimulationHost
): Promise<void> {
	assert(scenario.queries.length > 0, `Cannot simulate scenario with no queries`);
	assert(isDeserializedWorkspaceStateBasedScenario(scenario) || scenario.files.length > 0, `Cannot simulate scenario with no files`);

	const workspace = setupSimulationWorkspace(testingServiceCollection, scenario);

	await scenario.extraWorkspaceSetup?.(workspace);
	const accessor = testingServiceCollection.createTestingAccessor();
	await scenario.onBeforeStart?.(accessor);

	const instaService = accessor.get(IInstantiationService);
	const testRuntime = accessor.get(ISimulationTestRuntime);

	const states: IWorkspaceState[] = [];
	let range: Range | undefined;
	let isFirst = true;
	const history: (ChatRequestTurn | ChatResponseTurn)[] = [];
	/**
	 * A map from doc to relative path with initial contents which is populated right before modifying a document.
	 */
	const changedDocsInitialStates = new Map<vscode.TextDocument, Promise<IWorkspaceStateFile> | null>();

	// run each query for the scenario
	try {
		const seenFiles: vscode.ChatPromptReference[] = [];

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

			if (query.visibleRanges) {
				workspace.setCurrentVisibleRanges(query.visibleRanges.map((range) => toRange(range)));
			}

			if (query.activeCell) {
				const cellSelection = new NotebookRange(query.activeCell, query.activeCell + 1);
				workspace.setCurrentNotebookSelection([cellSelection]);
			}

			const queryWholeRange = query.wholeRange ? toSelection(query.wholeRange) : undefined;

			const activeEditor = accessor.get(ITabsAndEditorsService).activeTextEditor;
			if (query.file && !activeEditor) {
				throw new Error(`query.file is defined but no editor is active`);
			}

			let initialDiagnostics: ResourceMap<vscode.Diagnostic[]> | undefined;

			if (typeof query.diagnostics === 'string') {
				// diagnostics are computed
				try {
					initialDiagnostics = await fetchDiagnostics(accessor, workspace, query.diagnostics);
					workspace.setDiagnostics(initialDiagnostics);
				} catch (error) {
					throw new Error(`Error obtained while fetching the diagnostics: ${error}`);
				}
			} else if (Array.isArray(query.diagnostics)) {
				if (!activeEditor) {
					throw new Error(`diagnostics can only be an array if there's an active editor (is 'file' specified?)`);
				}
				// diagnostics are set explicitly
				const diagnostics = new ResourceMap<vscode.Diagnostic[]>();
				diagnostics.set(activeEditor.document.uri, convertToDiagnostics(workspace, query.diagnostics));
				workspace.setDiagnostics(diagnostics);
			}

			if (query.fileIndentInfo) {
				workspace.setCurrentDocumentIndentInfo(query.fileIndentInfo);
			} else if (activeEditor) {
				workspace.setCurrentDocumentIndentInfo(guessFileIndentInfo(activeEditor.document));
			}
			if (isFirst && activeEditor) {
				isFirst = false;
				range = activeEditor.selection;
				const documentUri = activeEditor.document.uri;
				const workspacePath = workspace.getFilePath(documentUri);
				let relativeDiskPath: string | undefined;
				if (isNotebook(documentUri)) {
					const notebookDocument = workspace.getNotebook(documentUri);
					if (!notebookDocument) {
						throw new Error(`Missing notebook document ${documentUri}`);
					}

					relativeDiskPath = await testRuntime.writeFile(workspacePath + '.txt', notebookDocument.getText(), INLINE_INITIAL_DOC_TAG); // using .txt instead of real file extension to avoid breaking automation scripts
				} else {
					relativeDiskPath = await testRuntime.writeFile(workspacePath + '.txt', activeEditor.document.getText(), INLINE_INITIAL_DOC_TAG); // using .txt instead of real file extension to avoid breaking automation scripts
				}
				changedDocsInitialStates.set(activeEditor.document, null); // just mark that it doesn't get written twice

				if (!relativeDiskPath) {
					throw new Error(`Failed to write initial document to disk`);
				}

				states.push({
					kind: 'initial',
					file: {
						workspacePath,
						relativeDiskPath,
						languageId: activeEditor.document.languageId
					},
					additionalFiles: [],
					languageId: getLanguage(activeEditor.document).languageId,
					selection: toIRange(activeEditor.selection),
					range: toIRange(range),
					diagnostics: workspace.activeFileDiagnostics.map(toIDiagnostic),
				});
			} else {
				range = queryWholeRange ?? range;
				states.push({
					kind: 'initial',
					additionalFiles: [],
					diagnostics: workspace.activeFileDiagnostics.map(toIDiagnostic),
				});
			}


			let command: string | undefined;
			let prompt = query.query;
			if (prompt.startsWith('/')) {
				const groups = /\/(?<intentId>\w+)(?<restOfQuery>\s.*)?/s.exec(query.query)?.groups;
				command = groups?.intentId ?? undefined;
				prompt = groups?.restOfQuery?.trim() ?? '';
			}

			const changedDocs: vscode.TextDocument[] = [];
			const references: vscode.ChatPromptReference[] = [...seenFiles];
			const toolReferences: vscode.ChatLanguageModelToolReference[] = [];

			try {
				const parsedQuery = parseQueryForTest(accessor, prompt, workspace);

				for (const variable of parsedQuery.variables) {
					if (!URI.isUri(variable.value)) {
						references.push(variable);
						continue;
					}
					const uri = variable.value;
					if (!seenFiles.find(ref => URI.isUri(ref.value) && isEqual(ref.value, uri))) {
						seenFiles.push(variable);
						references.push(variable);
					}
				}

				toolReferences.push(...parsedQuery.toolReferences);
			} catch (error) {
				// No problem!
			}

			references.push(...(host.contributeAdditionalReferences?.(accessor, references) ?? []));

			const { location, location2 } = host.prepareChatRequestLocation(accessor, range);
			let request: vscode.ChatRequest = {
				location,
				location2,
				command,
				prompt,
				references,
				attempt: 0,
				isParticipantDetected: false,
				enableCommandDetection: true, // TODO@ulugbekna: add support for disabling intent detection?
				toolReferences,
				toolInvocationToken: (isInExtensionHost ? undefined : {}) as never,
				model: null!, // https://github.com/microsoft/vscode-copilot/issues/9475
				tools: new Map(),
				id: '1',
				sessionId: '1',
				sessionResource: Uri.parse('chat:/1'),
				hasHooksEnabled: false,
			};

			// Run intent detection
			if (!request.command) {
				const intentDetector = instaService.createInstance(IntentDetector);
				const participants = readBuiltinIntents(location);
				const detectedParticipant = await intentDetector.provideParticipantDetection(request, { history, yieldRequested: false }, { participants, location: ChatLocation.Editor }, CancellationToken.None);
				if (detectedParticipant?.command) {
					request = { ...request, command: detectedParticipant.command };
				}
			}

			const markdownChunks: string[] = [];
			const changedDocuments = new ResourceMap<WorkingCopyOriginalDocument>();
			let hasActualEdits = false;
			let stream: vscode.ChatResponseStream = new ChatResponseStreamImpl((value) => {
				if (value instanceof ChatResponseTextEditPart && value.edits.length > 0) {
					const { uri, edits } = value;

					let doc: IExtHostDocumentData;
					if (!workspace.hasDocument(uri)) {
						// this is a new file
						const language = getLanguageForResource(uri);
						doc = createTextDocumentData(uri, '', language.languageId);
						workspace.addDocument(doc);
					} else {
						doc = workspace.getDocument(uri);
						if (!changedDocsInitialStates.has(doc.document)) {
							const workspacePath = workspace.getFilePath(doc.document.uri);
							const workspaceStateFilePromise = testRuntime.writeFile(workspacePath, doc.document.getText(), INLINE_CHANGED_DOC_TAG).then((relativeDiskPath) => {
								return {
									workspacePath,
									relativeDiskPath,
									languageId: doc.document.languageId
								};
							});
							changedDocsInitialStates.set(doc.document, workspaceStateFilePromise);
						}
					}

					let workingCopyDocument = changedDocuments.get(uri);
					if (!workingCopyDocument) {
						workingCopyDocument = new WorkingCopyOriginalDocument(doc.document.getText());
						changedDocuments.set(uri, workingCopyDocument);
					}

					const offsetEdits = workingCopyDocument.transformer.toOffsetEdit(edits);
					if (!workingCopyDocument.isNoop(offsetEdits)) {
						hasActualEdits = true;
						workingCopyDocument.applyOffsetEdits(offsetEdits);
						changedDocs.push(doc.document);
						if (activeEditor && isEqual(doc.document.uri, activeEditor.document.uri)) {
							// edit in the same document, adjust the range
							range = applyEditsAndExpandRange(workspace, activeEditor.document, edits, range);
						} else {
							workspace.applyEdits(doc.document.uri, edits);
						}
					}

				} else if (value instanceof ChatResponseNotebookEditPart) {
					const { uri, edits } = value;
					const validEdits = edits.filter(edit => typeof edit !== 'boolean');

					let notebookDoc: ExtHostNotebookDocumentData;

					if (!workspace.hasNotebookDocument(uri)) {
						notebookDoc = ExtHostNotebookDocumentData.createJupyterNotebook(uri, `{ "cells": [] }`);
						workspace.addNotebookDocument(notebookDoc);
					} else {
						notebookDoc = workspace.getNotebook(uri);
					}


					let workingCopyDocument = changedDocuments.get(uri);
					if (!workingCopyDocument) {
						workingCopyDocument = new WorkingCopyOriginalDocument(notebookDoc.getText());
						changedDocuments.set(uri, workingCopyDocument);
					}

					if (validEdits.length > 0) {
						hasActualEdits = true;
						workspace.applyNotebookEdits(notebookDoc.uri, validEdits);
						workingCopyDocument = new WorkingCopyOriginalDocument(notebookDoc.getText());
						changedDocuments.set(uri, workingCopyDocument);
					}
				} else if (value instanceof ChatResponseMarkdownPart) {
					markdownChunks.push(value.value.value);
				}
			}, () => { }, undefined, undefined, undefined, () => Promise.resolve(undefined));
			const interactionOutcomeComputer = new InteractionOutcomeComputer(activeEditor?.document.uri);
			stream = interactionOutcomeComputer.spyOnStream(stream);

			const responseProcessor = host.provideResponseProcessor?.(query);
			if (responseProcessor) {
				stream = responseProcessor.spyOnStream(stream);
			}

			const documentStateBeforeInvocation = activeEditor?.document.getText();

			setupTools(stream, request, accessor);

			const agentArgs = host.agentArgs ?? {
				agentId: getChatParticipantIdFromName(editorAgentName),
				agentName: editorAgentName,
				intentId: request.command
			};

			const requestHandler = instaService.createInstance(ChatParticipantRequestHandler, history, request, stream, CancellationToken.None, agentArgs, () => false, undefined);
			const result = await requestHandler.getResult();
			history.push(new ChatRequestTurn(request.prompt, request.command, [...request.references], '', []));
			history.push(new ChatResponseTurn([new ChatResponseMarkdownPart(markdownChunks.join(''))], result, ''));

			let annotations = await responseProcessor?.postProcess(accessor, workspace, stream, result) ?? [];

			let interactionOutcomeKind = interactionOutcomeComputer.interactionOutcome.kind;
			if (interactionOutcomeKind === 'inlineEdit' || interactionOutcomeKind === 'workspaceEdit') {
				// sometimes we push noop edits which can trick the outcome computer
				if (!hasActualEdits) {
					interactionOutcomeKind = 'noopEdit';
				}
			}
			let intent: IIntent | undefined;
			{
				// TODO@Alex: extract to host object
				const response = requestHandler.conversation.getLatestTurn()?.getMetadata(CopilotInteractiveEditorResponse);
				intent = (response ? response.promptQuery.intent : undefined);
			}
			annotations = annotations.concat(requestHandler.conversation.getLatestTurn()?.getMetadata(InteractionOutcome)?.annotations ?? []);

			let outcome: IOutcome;
			if (interactionOutcomeKind === 'none') {
				outcome = { type: 'none', annotations, chatResponseMarkdown: markdownChunks.join('') };
			} else if (result.errorDetails) {
				outcome = { type: 'error', errorDetails: result.errorDetails, annotations };
			} else if (interactionOutcomeKind === 'noopEdit') {
				outcome = { type: 'none', annotations, chatResponseMarkdown: markdownChunks.join('') };
			} else if (interactionOutcomeKind === 'inlineEdit' || interactionOutcomeKind === 'workspaceEdit') {
				const outcomeFiles: IFile[] = [];
				const workspaceEdit = new WorkspaceEdit();
				const outcomeEdits: IInlineEdit[] = [];
				for (const [uri, workingCopyDoc] of changedDocuments.entries()) {
					if (uri.scheme === 'file') {
						outcomeFiles.push({
							kind: 'relativeFile',
							fileName: path.basename(uri.fsPath),
							fileContents: workspace.tryGetNotebook(uri)?.getText() ?? workspace.getDocument(uri).getText()
						});
					} else {
						outcomeFiles.push({
							kind: 'qualifiedFile',
							uri: uri,
							fileContents: workspace.tryGetNotebook(uri)?.getText() ?? workspace.getDocument(uri).getText()
						});
					}
					const offsetEdits = workingCopyDoc.appliedEdits;
					const textEdits = workingCopyDoc.transformer.toTextEdits(offsetEdits);
					if (activeEditor && isEqual(uri, activeEditor.document.uri)) {
						// edit in the same document
						for (let i = 0; i < offsetEdits.replacements.length; i++) {
							const offsetEdit = offsetEdits.replacements[i];
							const textEdit = textEdits[i];
							outcomeEdits.push({
								offset: offsetEdit.replaceRange.start,
								length: offsetEdit.replaceRange.length,
								range: textEdit.range,
								newText: textEdit.newText,
							});
						}
					}
					workspaceEdit.set(uri, textEdits);
				}

				if (interactionOutcomeKind === 'inlineEdit') {
					if (!activeEditor) {
						throw new Error(`inlineEdit should always have an open editor`);
					}
					outcome = {
						type: 'inlineEdit',
						initialDiagnostics,
						appliedEdits: outcomeEdits,
						originalFileContents: documentStateBeforeInvocation ?? '',
						fileContents: activeEditor.document.getText(),
						chatResponseMarkdown: markdownChunks.join(''),
						annotations
					};
				} else {
					outcome = {
						type: 'workspaceEdit',
						files: outcomeFiles,
						annotations,
						edits: workspaceEdit,
						chatResponseMarkdown: markdownChunks.join('')
					};
				}
			} else {
				outcome = {
					type: 'conversational',
					chatResponseMarkdown: markdownChunks.join(''),
					annotations
				};
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
					if (location !== ChatLocation.Editor && !seenFiles.find((v) => URI.isUri(v.value) && isEqual(v.value, changedDoc.uri))) {
						seenFiles.push(createWorkingSetFileVariable(changedDoc.uri));
					}

					if (isNotebook(changedDoc.uri)) {
						const notebook = workspace.getNotebook(changedDoc.uri);
						changedFilePaths.push({
							workspacePath,
							relativeDiskPath: await testRuntime.writeFile(workspacePath, notebook.getText(), INLINE_CHANGED_DOC_TAG),
							languageId: changedDoc.languageId
						});
					} else {
						changedFilePaths.push({
							workspacePath,
							relativeDiskPath: await testRuntime.writeFile(workspacePath, changedDoc.getText(), INLINE_CHANGED_DOC_TAG),
							languageId: changedDoc.languageId
						});
					}
				}

				// We managed to edit some files!
				testRuntime.setOutcome({
					kind: 'edit',
					files: changedFilePaths.map(f => ({ srcUri: f.workspacePath, post: f.relativeDiskPath })),
					annotations: outcome.annotations
				});
			} else {
				if (activeEditor) {
					const workspacePath = workspace.getFilePath(activeEditor.document.uri);
					changedFilePaths.push({
						workspacePath,
						relativeDiskPath: await testRuntime.writeFile(workspacePath, activeEditor.document.getText(), INLINE_CHANGED_DOC_TAG),
						languageId: activeEditor.document.languageId
					});
				}

				if (markdownChunks.length > 0) {
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
						annotations: outcome.annotations,
						critical: false,
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
				fileName: activeEditor ? workspace.getFilePath(activeEditor.document.uri) : undefined,
				languageId: activeEditor?.document.languageId,
				diagnostics,
				selection: activeEditor ? toIRange(activeEditor.selection) : undefined,
				range: activeEditor ? toIRange(range ?? activeEditor.selection) : undefined,
				interaction: {
					query: query.query,
					actualIntent: query.expectedIntent,
					detectedIntent: intent?.id,
				},
				requestCount,
			});

			await Promise.resolve(query.validate(outcome, workspace, accessor));
		}
		for (const [_, workspaceStateFilePromise] of changedDocsInitialStates) {
			if (workspaceStateFilePromise === null) {
				continue;
			}
			const workspaceStateFile = await workspaceStateFilePromise;
			if (states.length > 0 && states[0].kind === 'initial') {
				states[0].additionalFiles?.push(workspaceStateFile);
			}
		}
	} finally {
		await teardownSimulationWorkspace(accessor, workspace);
		await testRuntime.writeFile('inline-simulator.txt', JSON.stringify(states, undefined, 2), INLINE_STATE_TAG); // TODO@test: using .txt instead of .json to avoid breaking test scripts
	}
}

function setupTools(stream: vscode.ChatResponseStream, request: ChatRequest, accessor: ITestingServicesAccessor) {
	const toolsService = accessor.get(IToolsService) as TestToolsService | SimulationExtHostToolsService;
	const instaService = accessor.get(IInstantiationService);
	const editTool = instaService.createInstance(TestEditFileTool, stream);
	toolsService.addTestToolOverride(
		editTool.info,
		editTool);

	toolsService.addTestToolOverride(
		{
			name: 'inline_chat_exit',
			description: 'Moves the inline chat session to the richer panel chat which supports edits across files, creating new files, and multi-turn conversations between the user and the assistant.',
			inputSchema: {},
			source: undefined,
			tags: [],
		},
		{
			invoke() {
				return new LanguageModelToolResult([]);
			}
		}
	);
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

async function fetchDiagnostics(accessor: ITestingServicesAccessor, workspace: SimulationWorkspace, providerId: DiagnosticProviderId) {
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

export function toSelection(selection: [number, number] | [number, number, number, number]): vscode.Selection {
	if (selection.length === 2) {
		return new Selection(selection[0], selection[1], selection[0], selection[1]);
	} else {
		return new Selection(selection[0], selection[1], selection[2], selection[3]);
	}
}

export function toRange(range: [number, number] | [number, number, number, number]): vscode.Range {
	if (range.length === 2) {
		return new Range(range[0], 0, range[1], 0);
	} else {
		return new Range(range[0], range[1], range[2], range[3]);
	}
}


export function forInlineAndInlineChatIntent(callback: (strategy: EditTestStrategy, configurations: NonExtensionConfiguration[] | undefined, suffix: string) => void): void {
	callback(EditTestStrategy.Inline, undefined, '');
	callback(EditTestStrategy.InlineChatIntent, [['inlineChat.enableV2', true], ['chat.agent.autoFix', false]], '-InlineChatIntent');
}

export function forInline(callback: (strategy: EditTestStrategy, configurations: NonExtensionConfiguration[] | undefined, suffix: string) => void): void {
	callback(EditTestStrategy.Inline, undefined, '');
}
