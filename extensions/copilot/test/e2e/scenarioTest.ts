/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import type { ChatErrorDetails, LanguageModelToolInformation, MappedEditsResponseStream, TextDocument } from 'vscode';
import { CodeBlocksMetadata } from '../../src/extension/codeBlocks/node/codeBlockProcessor';
import { agentsToCommands, Intent } from '../../src/extension/common/constants';
import '../../src/extension/intents/node/allIntents';
import { ChatParticipantRequestHandler } from '../../src/extension/prompt/node/chatParticipantRequestHandler';
import { IDocumentContext } from '../../src/extension/prompt/node/documentContext';
import { CodeMapper, ICodeMapperExistingDocument } from '../../src/extension/prompts/node/codeMapper/codeMapper';
import { getContributedToolName } from '../../src/extension/tools/common/toolNames';
import '../../src/extension/tools/node/allTools';
import { getChatParticipantIdFromName } from '../../src/platform/chat/common/chatAgents';
import { IConversationOptions } from '../../src/platform/chat/common/conversationOptions';
import { ITabsAndEditorsService } from '../../src/platform/tabs/common/tabsAndEditorsService';
import { isInExtensionHost } from '../../src/platform/test/node/isInExtensionHost';
import { isNotebook, SimulationWorkspace } from '../../src/platform/test/node/simulationWorkspace';
import { SpyChatResponseStream } from '../../src/util/common/test/mockChatResponseStream';
import { ChatRequestTurn, ChatResponseTurn } from '../../src/util/common/test/shims/chatTypes';
import { CancellationToken } from '../../src/util/vs/base/common/cancellation';
import { DisposableStore } from '../../src/util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { ChatLocation, ChatRequest, ChatResponseAnchorPart, ChatResponseMarkdownPart, Uri } from '../../src/vscodeTypes';
import { SimulationWorkspaceExtHost } from '../base/extHostContext/simulationWorkspaceExtHost';
import { ISimulationTestRuntime, SimulationTestFunction } from '../base/stest';
import { INLINE_CHANGED_DOC_TAG, INLINE_INITIAL_DOC_TAG, IWorkspaceStateFile } from '../simulation/shared/sharedTypes';
import { Scenario, ScenarioEvaluator } from './scenarioLoader';
import { parseQueryForScenarioTest } from './testHelper';

/**
 * Grabs the default conversation options. Copied over from conversationFeature.ts
 * TODO @lramos15, these should use the same code as conversationFeature.ts
 */
export function fetchConversationOptions() {
	const maxResponseTokens = undefined;
	const temperature = 0.1;
	const topP = 1;

	const options: IConversationOptions = {
		_serviceBrand: undefined,

		maxResponseTokens: maxResponseTokens,
		temperature: temperature,
		topP: topP,
		rejectionMessage: 'Sorry, but I can only assist with programming related questions.',
	};
	return options;
}

export function generateScenarioTestRunner(scenario: Scenario, evaluator: ScenarioEvaluator): SimulationTestFunction {
	return async function (testingServiceCollection) {
		const disposables = new DisposableStore();
		try {
			testingServiceCollection.define(IConversationOptions, fetchConversationOptions());
			const simulationWorkspace = disposables.add(isInExtensionHost ? new SimulationWorkspaceExtHost() : new SimulationWorkspace());
			simulationWorkspace.setupServices(testingServiceCollection);
			const accessor = testingServiceCollection.createTestingAccessor();

			const testContext = accessor.get(ISimulationTestRuntime);
			const log = (message: string, err?: any) => testContext.log(message, err);

			const history: (ChatRequestTurn | ChatResponseTurn)[] = [];
			for (let i = 0; i < scenario.length; i++) {
				const testCase = scenario[i];
				simulationWorkspace.resetFromDeserializedWorkspaceState(testCase.getState?.());
				await testCase.setupCase?.(accessor, simulationWorkspace);
				const mockProgressReporter = new SpyChatResponseStream();
				log(`> Query "${testCase.question}"\n`);

				const parsedQuery = await parseQueryForScenarioTest(accessor, testCase, simulationWorkspace);
				const participantId = (parsedQuery.participantName && getChatParticipantIdFromName(parsedQuery.participantName)) ?? '';
				const request: ChatRequest = { prompt: parsedQuery.query, references: parsedQuery.variables, command: parsedQuery.command, location: ChatLocation.Panel, location2: undefined, attempt: 0, enableCommandDetection: false, isParticipantDetected: false, toolReferences: parsedQuery.toolReferences, toolInvocationToken: undefined as never, model: null!, tools: new Map(), id: '1', sessionId: '1', sessionResource: Uri.parse('chat:/1'), hasHooksEnabled: false };
				if (testCase.tools) {
					for (const [toolName, shouldUse] of Object.entries(testCase.tools)) {
						request.tools.set({ name: getContributedToolName(toolName) } as LanguageModelToolInformation, shouldUse);
					}
				}
				const interactiveSession = accessor.get(IInstantiationService).createInstance(
					ChatParticipantRequestHandler,
					history,
					request,
					mockProgressReporter,
					CancellationToken.None,
					{
						agentId: participantId,
						agentName: parsedQuery.participantName || '',
						intentId: (!parsedQuery.participantName && parsedQuery.command) ? parsedQuery.command :
							parsedQuery.command ? agentsToCommands[parsedQuery.participantName as Intent]![parsedQuery.command] :
								parsedQuery.participantName,
					},
					() => false,
					undefined,
				);
				const result = await interactiveSession.getResult();
				assert.ok(!result.errorDetails, result.errorDetails?.message);

				history.push(new ChatRequestTurn(request.prompt, request.command, [...request.references], getChatParticipantIdFromName(participantId), []));
				history.push(new ChatResponseTurn(mockProgressReporter.items.filter(x => x instanceof ChatResponseMarkdownPart || x instanceof ChatResponseAnchorPart), result, participantId, request.command));

				testCase.answer = mockProgressReporter.currentProgress;

				const turn = interactiveSession.conversation.getLatestTurn();
				const fullResponse = turn?.responseMessage?.message ?? '';

				accessor.get(ISimulationTestRuntime).setOutcome({
					kind: 'answer',
					content: fullResponse
				});

				// Use the evaluator passed to us to evaluate if the response is correct
				log(`## Response:\n${fullResponse}\n`);
				log(`## Commands:\n`);
				const commands = mockProgressReporter.commandButtons;
				for (const command of commands) {
					log(`- ${JSON.stringify(command)}\n`);
				}

				if (scenario[i].applyChatCodeBlocks) {
					const codeBlocks = turn?.getMetadata(CodeBlocksMetadata)?.codeBlocks ?? [];
					const testRuntime = accessor.get(ISimulationTestRuntime);

					if (codeBlocks.length !== 0) {
						const codeMapper = accessor.get(IInstantiationService).createInstance(CodeMapper);
						const changedDocs: Map<string, { document: TextDocument; originalContent: string; postContent: string }> = new Map();

						// Apply Code Block Changes
						let codeBlockApplyErrorDetails: ChatErrorDetails | undefined = undefined;
						for (const codeBlock of codeBlocks) {
							const prevDocument = simulationWorkspace.activeTextEditor?.document!;
							// Set the active document if the code resource has a uri
							if (codeBlock.resource) {
								simulationWorkspace.setCurrentDocument(codeBlock.resource);
							}
							const editor = accessor.get(ITabsAndEditorsService).activeTextEditor!;
							const codeMap = codeBlock.code;
							const document = simulationWorkspace.activeTextEditor!.document;
							const documentContext = IDocumentContext.fromEditor(editor);
							const workspacePath = simulationWorkspace.getFilePath(document.uri);

							const previousTextContent = document.getText();
							const response: MappedEditsResponseStream = {
								textEdit(target, edits) {
									simulationWorkspace.applyEdits(target, Array.isArray(edits) ? edits : [edits]);
								},
								notebookEdit(target, edits) {
									simulationWorkspace.applyNotebookEdits(target, Array.isArray(edits) ? edits : [edits]);
								},
							};
							const input: ICodeMapperExistingDocument = { createNew: false, codeBlock: codeMap, uri: document.uri, markdownBeforeBlock: undefined, existingDocument: documentContext.document };
							const result = await codeMapper.mapCode(input, response, undefined, CancellationToken.None);

							if (!result) {
								codeBlockApplyErrorDetails = {
									message: `Code block changes failed to apply to ${document.uri.toString()}`,
								};
								break;
							}

							if (result.errorDetails) {
								result.errorDetails.message = `Code block changes failed to apply to ${document.uri.toString()}:\n${result.errorDetails.message}`;
								codeBlockApplyErrorDetails = result.errorDetails;
								break;
							}

							const postEditTextContent = editor.document.getText();
							if (previousTextContent !== postEditTextContent) {
								const previousChange = changedDocs.get(workspacePath);
								if (previousChange) {
									previousChange.postContent = postEditTextContent;
									changedDocs.set(workspacePath, previousChange);
								} else {
									changedDocs.set(workspacePath, { document, originalContent: previousTextContent, postContent: postEditTextContent });
								}
							}

							if (prevDocument) {
								simulationWorkspace.setCurrentDocument(prevDocument.uri);
							}
						}

						// Log the changed files
						const changedFilePaths: IWorkspaceStateFile[] = [];
						if (!codeBlockApplyErrorDetails && changedDocs.size > 0) {
							const seenDoc = new Set<string>();
							for (const [workspacePath, changes] of changedDocs.entries()) {
								if (seenDoc.has(workspacePath)) {
									continue;
								}
								seenDoc.add(workspacePath);

								if (isNotebook(changes.document.uri)) {
									await testRuntime.writeFile(workspacePath + '.txt', changes.originalContent, INLINE_INITIAL_DOC_TAG);  // using .txt instead of real file extension to avoid breaking automation scripts

									changedFilePaths.push({
										workspacePath,
										relativeDiskPath: await testRuntime.writeFile(workspacePath, changes.postContent, INLINE_CHANGED_DOC_TAG),
										languageId: changes.document.languageId
									});
								} else {
									await testRuntime.writeFile(workspacePath + '.txt', changes.originalContent, INLINE_INITIAL_DOC_TAG);  // using .txt instead of real file extension to avoid breaking automation scripts

									changedFilePaths.push({
										workspacePath,
										relativeDiskPath: await testRuntime.writeFile(workspacePath, changes.postContent, INLINE_CHANGED_DOC_TAG),
										languageId: changes.document.languageId
									});
								}
							}

							testRuntime.setOutcome({
								kind: 'edit',
								files: changedFilePaths.map(f => ({ srcUri: f.workspacePath, post: f.relativeDiskPath }))
							});
						} else if (codeBlockApplyErrorDetails) {
							testRuntime.setOutcome({
								kind: 'failed',
								error: codeBlockApplyErrorDetails.message,
								hitContentFilter: codeBlockApplyErrorDetails.responseIsFiltered ?? false,
								critical: false
							});
						}
					}
				}

				const evaluatedResponse = await evaluator(
					accessor,
					testCase.question,
					mockProgressReporter.currentProgress,
					fullResponse,
					turn,
					i,
					commands,
					mockProgressReporter.confirmations,
					mockProgressReporter.fileTrees,
				);
				assert.ok(evaluatedResponse.success, evaluatedResponse.errorMessage);
			}
		} finally {
			disposables.dispose();
		}
	};
}

export function shouldSkip(scenario: Scenario): boolean {
	const workspaceFolderPath = scenario[0].getState?.().workspaceFolderPath;
	try {
		return !workspaceFolderPath || fs.readdirSync(workspaceFolderPath).length === 0;
	} catch (e) {
		return true;
	}
}
