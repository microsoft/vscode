/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { IChatMLFetcher } from '../../../src/platform/chat/common/chatMLFetcher';
import { ChatFetchResponseType, ChatResponse, ChatResponses } from '../../../src/platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../src/platform/configuration/common/configurationService';
import { IRecordingInformation, ObservableWorkspaceRecordingReplayer } from '../../../src/extension/inlineEdits/common/observableWorkspaceRecordingReplayer';
import { createNextEditProvider } from '../../../src/extension/inlineEdits/node/createNextEditProvider';
import { DebugRecorder } from '../../../src/extension/inlineEdits/node/debugRecorder';
import { NESInlineCompletionContext, NextEditProvider } from '../../../src/extension/inlineEdits/node/nextEditProvider';
import { NextEditProviderTelemetryBuilder } from '../../../src/extension/inlineEdits/node/nextEditProviderTelemetry';
import { IGitExtensionService } from '../../../src/platform/git/common/gitExtensionService';
import { InlineEditRequestLogContext } from '../../../src/platform/inlineEdits/common/inlineEditLogContext';
import { ObservableGit } from '../../../src/platform/inlineEdits/common/observableGit';
import { NesHistoryContextProvider } from '../../../src/platform/inlineEdits/common/workspaceEditTracker/nesHistoryContextProvider';
import { NesXtabHistoryTracker } from '../../../src/platform/inlineEdits/common/workspaceEditTracker/nesXtabHistoryTracker';
import { INotebookService } from '../../../src/platform/notebook/common/notebookService';
import { IExperimentationService } from '../../../src/platform/telemetry/common/nullExperimentationService';
import { IWorkspaceService } from '../../../src/platform/workspace/common/workspaceService';
import { Event } from '../../../src/util/vs/base/common/event';
import { CancellationToken } from '../../../src/util/vs/base/common/cancellation';
import { OffsetRange } from '../../../src/util/vs/editor/common/core/ranges/offsetRange';
import { generateUuid } from '../../../src/util/vs/base/common/uuid';
import { IInstantiationService, ServicesAccessor } from '../../../src/util/vs/platform/instantiation/common/instantiation';

export interface IGeneratedCursorPrompt {
	readonly system: string;
	readonly user: string;
	readonly keptRange: OffsetRange;
}

function extractTextContent(message: Raw.ChatMessage): string {
	const textPart = message.content.find(p => p.type === Raw.ChatCompletionContentPartKind.Text);
	return textPart && 'text' in textPart ? textPart.text : '';
}

/**
 * A mock fetcher that returns an empty Success response on every call. The
 * empty xtab response yields `NoSuggestions`, which the production
 * `XtabProvider` then funnels into the cursor-jump path. The cursor-jump
 * fetch also returns empty — we don't care about the response, only the
 * prompt captured via the telemetry builder before the fetch fires.
 */
class CursorJumpCapturingFetcher implements IChatMLFetcher {
	_serviceBrand: undefined;
	onDidMakeChatMLRequest = Event.None;
	private readonly _response = {
		type: ChatFetchResponseType.Success,
		requestId: 'cursor-jump-capture-id',
		serverRequestId: 'cursor-jump-capture-server-id',
		usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } },
		value: '',
		resolvedModel: 'cursor-jump-capture-model',
	} as const;

	async fetchOne(): Promise<ChatResponse> {
		return this._response;
	}

	async fetchMany(): Promise<ChatResponses> {
		return { ...this._response, value: [''] };
	}
}

/**
 * Generate a cursor-prediction prompt by running the production NES pipeline
 * with cursor prediction forced on and the model call mocked. The cursor
 * predictor stores the built prompt + keptRange on `logContext` before the
 * fetch fires, so the captured prompt is byte-identical to what production
 * would send for the same recording.
 */
export async function generateCursorPromptFromRecording(
	accessor: ServicesAccessor,
	recordingInfo: IRecordingInformation,
): Promise<IGeneratedCursorPrompt | { error: string }> {
	const instaService = accessor.get(IInstantiationService);
	const configService = accessor.get(IConfigurationService);
	const expService = accessor.get(IExperimentationService);
	const gitExtensionService = accessor.get(IGitExtensionService);
	const notebookService = accessor.get(INotebookService);
	const workspaceService = accessor.get(IWorkspaceService);

	await configService.setConfig(ConfigKey.InlineEditsNextCursorPredictionEnabled, true);

	const replayer = new ObservableWorkspaceRecordingReplayer(recordingInfo);
	const obsGit = instaService.createInstance(ObservableGit);
	const historyContextProvider = new NesHistoryContextProvider(replayer.workspace, obsGit);
	const nesXtabHistoryTracker = new NesXtabHistoryTracker(replayer.workspace, undefined, configService, expService);
	const debugRecorder = new DebugRecorder(replayer.workspace);

	try {
		const { lastDocId } = replayer.replay();

		const nextEditProviderId = configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsProviderId, expService);
		const statelessNextEditProvider = createNextEditProvider(nextEditProviderId, instaService);
		const nextEditProvider = instaService.createInstance(
			NextEditProvider, replayer.workspace, statelessNextEditProvider,
			historyContextProvider, nesXtabHistoryTracker, debugRecorder,
		);

		const historyContext = historyContextProvider.getHistoryContext(lastDocId);
		if (!historyContext) {
			nextEditProvider.dispose();
			return { error: `No history context for document ${lastDocId}` };
		}

		const activeDocument = historyContext.getMostRecentDocument();
		const context: NESInlineCompletionContext = {
			triggerKind: 1,
			selectedCompletionInfo: undefined,
			requestUuid: generateUuid(),
			requestIssuedDateTime: Date.now(),
			earliestShownDateTime: Date.now() + 200,
			enforceCacheDelay: false,
		};
		const logContext = new InlineEditRequestLogContext(activeDocument.docId.toString(), 1, context);
		const telemetryBuilder = new NextEditProviderTelemetryBuilder(
			gitExtensionService, notebookService, workspaceService,
			nextEditProvider.ID, replayer.workspace.getDocument(activeDocument.docId),
		);

		try {
			await nextEditProvider.getNextEdit(
				activeDocument.docId, context, logContext,
				CancellationToken.None, telemetryBuilder.nesBuilder,
			);
		} catch (err) {
			if (!logContext.cursorJumpRawMessages) {
				throw err;
			}
			// expected: downstream errors after the cursor-jump prompt was already captured
		} finally {
			nextEditProvider.dispose();
			telemetryBuilder.dispose();
		}

		const messages = logContext.cursorJumpRawMessages;
		const keptRange = logContext.cursorJumpKeptRange;
		if (!messages || !keptRange) {
			return { error: 'Cursor-jump prompt was not captured (cursor prediction path did not run)' };
		}
		const systemMsg = messages.find(m => m.role === Raw.ChatRole.System);
		const userMsg = messages.find(m => m.role === Raw.ChatRole.User);
		return {
			system: systemMsg ? extractTextContent(systemMsg) : '',
			user: userMsg ? extractTextContent(userMsg) : '',
			keptRange,
		};
	} catch (e) {
		const detail = e instanceof Error && e.stack
			? e.stack.split('\n').slice(0, 3).join(' | ')
			: (e instanceof Error ? e.message : String(e));
		return { error: `Cursor prompt generation failed: ${detail}` };
	} finally {
		historyContextProvider.dispose();
		obsGit.dispose();
		replayer.dispose();
	}
}

/**
 * Install the capturing fetcher in a service collection. Call before
 * `createTestingAccessor()`. Exposed so the pipeline can wire it up
 * alongside the standard MockChatMLFetcher when `--sample-task` selects a
 * cursor task.
 */
export function installCursorJumpCapturingFetcher(serviceCollection: { set(id: any, instance: any): void }): void {
	serviceCollection.set(IChatMLFetcher, new CursorJumpCapturingFetcher());
}
