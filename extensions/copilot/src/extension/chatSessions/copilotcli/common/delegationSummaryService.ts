/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type { CancellationToken, ChatContext, ChatPromptReference, ChatSummarizer, Uri } from 'vscode';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { createServiceIdentifier } from '../../../../util/common/services';
import { Sequencer } from '../../../../util/vs/base/common/async';
import { ResourceMap } from '../../../../util/vs/base/common/map';
import { URI } from '../../../../util/vs/base/common/uri';

const SummaryFileScheme = 'copilot-delegated-chat-summary';
const DelegationSummaryMementoKey = 'github.copilot.chat.delegationSummary';
export const IChatDelegationSummaryService = createServiceIdentifier<IChatDelegationSummaryService>('IChatDelegationSummaryService');

export interface IChatDelegationSummaryService {
	readonly _serviceBrand: undefined;
	scheme: string;
	summarize(context: ChatContext, token: CancellationToken): Promise<string | undefined>;
	trackSummaryUsage(sessionId: string, summary: string): Promise<ChatPromptReference | undefined>;
	extractPrompt(sessionId: string, message: string): { prompt: string; reference: ChatPromptReference } | undefined;
	provideTextDocumentContent(uri: Uri): string | undefined;
}


export class ChatDelegationSummaryService implements IChatDelegationSummaryService {
	declare _serviceBrand: undefined;
	private readonly _mementoUpdater = new Sequencer();
	private readonly _summaries = new ResourceMap<string>();
	public readonly scheme = SummaryFileScheme;
	constructor(
		private readonly _chatSummarizer: ChatSummarizer,
		@IVSCodeExtensionContext private readonly context: IVSCodeExtensionContext,
	) { }
	async summarize(context: ChatContext, token: CancellationToken): Promise<string | undefined> {
		return (await this._chatSummarizer.provideChatSummary(context, token)) ?? undefined;
	}

	async trackSummaryUsage(sessionId: string, summary: string): Promise<ChatPromptReference | undefined> {
		// If summary is less than 100 characters, do not track it, we can display it directly in the chat
		if (summary.length < 100) {
			return undefined;
		}
		const uri = URI.from({ scheme: SummaryFileScheme, path: l10n.t("summary"), query: sessionId });
		this._summaries.set(uri, summary);
		const reference: ChatPromptReference = {
			id: uri.toString(),
			name: 'Delegation Summary',
			modelDescription: 'Summary of previous chat history for delegated request',
			value: uri
		};

		summary = summary.substring(0, 100);
		await this._mementoUpdater.queue(async () => {
			const details = this.context.globalState.get<Record<string, { summary: string; createdDateTime: number }>>(DelegationSummaryMementoKey, {});

			details[sessionId] = { summary, createdDateTime: Date.now() };

			// Prune entries older than 7 days.
			const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
			for (const [key, value] of Object.entries(details)) {
				if (value.createdDateTime < sevenDaysAgo) {
					delete details[key];
				}
			}

			await this.context.globalState.update(DelegationSummaryMementoKey, details);
		});

		return reference;
	}

	extractPrompt(sessionId: string, message: string): { prompt: string; reference: ChatPromptReference } | undefined {
		const details = this.context.globalState.get<Record<string, { summary: string; createdDateTime: number }>>(DelegationSummaryMementoKey, {});
		const entry = details[sessionId];
		if (!entry) {
			return undefined;
		}

		const index = message.indexOf(entry.summary);
		if (index === -1) {
			return undefined;
		}
		const uri = URI.from({ scheme: SummaryFileScheme, path: l10n.t("summary"), query: sessionId });
		const promptSuffix = l10n.t('Complete the task as described in the {0}', `[summary](${uri.toString()})`);
		const promptPrefix = message.substring(0, index).trimEnd() || '';
		const prompt = promptPrefix ? `${promptPrefix}\n${promptSuffix}` : promptSuffix;
		const summary = message.substring(index);
		this._summaries.set(uri, summary);
		const reference: ChatPromptReference = {
			id: uri.toString(),
			name: 'Delegation Summary',
			modelDescription: 'Summary of previous chat history for delegated request',
			value: uri
		};

		return { prompt, reference };
	}


	provideTextDocumentContent(uri: Uri): string | undefined {
		return this._summaries.get(uri);
	}
}
