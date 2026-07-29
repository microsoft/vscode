/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { IRecordingInformation, ObservableWorkspaceRecordingReplayer } from '../../src/extension/inlineEdits/common/observableWorkspaceRecordingReplayer';
import { createNextEditProvider } from '../../src/extension/inlineEdits/node/createNextEditProvider';
import { DebugRecorder } from '../../src/extension/inlineEdits/node/debugRecorder';
import { NESInlineCompletionContext, NextEditProvider } from '../../src/extension/inlineEdits/node/nextEditProvider';
import { NextEditProviderTelemetryBuilder } from '../../src/extension/inlineEdits/node/nextEditProviderTelemetry';
import { ConfigKey, IConfigurationService } from '../../src/platform/configuration/common/configurationService';
import { IGitExtensionService } from '../../src/platform/git/common/gitExtensionService';
import { InlineEditRequestLogContext } from '../../src/platform/inlineEdits/common/inlineEditLogContext';
import { ObservableGit } from '../../src/platform/inlineEdits/common/observableGit';
import { NesHistoryContextProvider } from '../../src/platform/inlineEdits/common/workspaceEditTracker/nesHistoryContextProvider';
import { NesXtabHistoryTracker } from '../../src/platform/inlineEdits/common/workspaceEditTracker/nesXtabHistoryTracker';
import { INotebookService } from '../../src/platform/notebook/common/notebookService';
import { IExperimentationService } from '../../src/platform/telemetry/common/nullExperimentationService';
import { IWorkspaceService } from '../../src/platform/workspace/common/workspaceService';
import { CancellationToken } from '../../src/util/vs/base/common/cancellation';
import { generateUuid } from '../../src/util/vs/base/common/uuid';
import { IInstantiationService, ServicesAccessor } from '../../src/util/vs/platform/instantiation/common/instantiation';

export interface IGeneratedPrompt {
	readonly system: string;
	readonly user: string;
}

function extractTextContent(message: Raw.ChatMessage): string {
	const textPart = message.content.find(p => p.type === Raw.ChatCompletionContentPartKind.Text);
	return textPart && 'text' in textPart ? textPart.text : '';
}

function extractPromptParts(messages: Raw.ChatMessage[]): { system: string; user: string } {
	const systemMsg = messages.find(m => m.role === Raw.ChatRole.System);
	const userMsg = messages.find(m => m.role === Raw.ChatRole.User);
	return {
		system: systemMsg ? extractTextContent(systemMsg) : '',
		user: userMsg ? extractTextContent(userMsg) : '',
	};
}

/**
 * Generate a prompt from a recording using the NES pipeline.
 * Uses MockChatMLFetcher (via DI services) to capture the prompt without calling a real model.
 */
export async function generatePromptFromRecording(
	accessor: ServicesAccessor,
	recordingInfo: IRecordingInformation,
): Promise<IGeneratedPrompt | { error: string }> {
	const instaService = accessor.get(IInstantiationService);
	const configService = accessor.get(IConfigurationService);
	const expService = accessor.get(IExperimentationService);
	const gitExtensionService = accessor.get(IGitExtensionService);
	const notebookService = accessor.get(INotebookService);
	const workspaceService = accessor.get(IWorkspaceService);

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

		// Prompt is captured in logContext; model call is mocked via DI.
		// The provider may throw during response streaming (after prompt capture)
		// since we use a mock fetcher. We only tolerate errors once the prompt
		// has been captured in logContext; otherwise we rethrow so the outer
		// handler can surface a useful error message.
		try {
			await nextEditProvider.getNextEdit(
				activeDocument.docId, context, logContext,
				CancellationToken.None, telemetryBuilder.nesBuilder,
			);
		} catch (err) {
			if (!logContext.rawMessages) {
				// Error occurred before the prompt was captured; let the outer
				// handler report this as a failure.
				throw err;
			}
			// Expected: mock fetcher response causes downstream errors after
			// the prompt has already been captured in logContext.
		} finally {
			nextEditProvider.dispose();
			telemetryBuilder.dispose();
		}

		const rawMessages = logContext.rawMessages;
		if (!rawMessages) {
			return { error: 'Prompt was not captured in logContext (pipeline returned early before prompt construction)' };
		}

		const { system, user } = extractPromptParts(rawMessages);
		return { system, user };

	} catch (e) {
		const detail = e instanceof Error && e.stack
			? e.stack.split('\n').slice(0, 3).join(' | ')
			: (e instanceof Error ? e.message : String(e));
		return { error: `Prompt generation failed: ${detail}` };
	} finally {
		historyContextProvider.dispose();
		obsGit.dispose();
		replayer.dispose();
	}
}
