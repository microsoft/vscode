/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { disableErrorLogging, parse as parsePartialJson } from 'best-effort-json-parser';
import type { ChatResponseStream, ChatVulnerability } from 'vscode';
import { IResponsePart } from '../../../platform/chat/common/chatMLFetcher';
import { IResponseDelta } from '../../../platform/networking/common/fetch';
import { FilterReason } from '../../../platform/networking/common/openai';
import { isEncryptedThinkingDelta } from '../../../platform/thinking/common/thinking';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { URI } from '../../../util/vs/base/common/uri';
import { ChatResponseClearToPreviousToolInvocationReason } from '../../../vscodeTypes';
import { getContributedToolName } from '../../tools/common/toolNames';
import { IResponseProcessor, IResponseProcessorContext } from './intents';

disableErrorLogging();

export interface StartStopMapping {
	readonly stop: string;
	readonly start?: string;
}

/**
 * This IConversationCallback skips over text that is between a start and stop word and processes it for output if applicable.
 */
export class PseudoStopStartResponseProcessor implements IResponseProcessor {
	private stagedDeltasToApply: IResponseDelta[] = [];
	private currentStartStop: StartStopMapping | undefined = undefined;
	private nonReportedDeltas: IResponseDelta[] = [];
	private thinkingActive: boolean = false;

	constructor(
		private readonly stopStartMappings: readonly StartStopMapping[],
		private readonly processNonReportedDelta: ((deltas: IResponseDelta[]) => string[]) | undefined,
		private readonly options?: { subagentInvocationId?: string }
	) { }

	async processResponse(_context: IResponseProcessorContext, inputStream: AsyncIterable<IResponsePart>, outputStream: ChatResponseStream, token: CancellationToken): Promise<void> {
		return this.doProcessResponse(inputStream, outputStream, token);
	}

	async doProcessResponse(responseStream: AsyncIterable<IResponsePart>, progress: ChatResponseStream, token: CancellationToken): Promise<void> {
		for await (const { delta } of responseStream) {
			if (token.isCancellationRequested) {
				return;
			}
			this.applyDelta(delta, progress);
		}
	}

	protected applyDeltaToProgress(delta: IResponseDelta, progress: ChatResponseStream) {
		if (delta.thinking) {
			// Don't send parts that are only encrypted content
			if (!isEncryptedThinkingDelta(delta.thinking) || delta.thinking.text) {
				progress.thinkingProgress(delta.thinking);
				this.thinkingActive = true;
			}
		} else if (this.thinkingActive) {
			progress.thinkingProgress({ id: '', text: '', metadata: { vscodeReasoningDone: true, stopReason: delta.text ? 'text' : 'other' } });
			this.thinkingActive = false;
		}

		reportCitations(delta, progress);

		const vulnerabilities: ChatVulnerability[] | undefined = delta.codeVulnAnnotations?.map(a => ({ title: a.details.type, description: a.details.description }));
		if (vulnerabilities?.length) {
			progress.markdownWithVulnerabilities(delta.text ?? '', vulnerabilities);
		} else if (delta.text) {
			progress.markdown(delta.text);
		}

		if (delta.beginToolCalls?.length) {
			for (const beginCall of delta.beginToolCalls) {
				progress.beginToolInvocation(beginCall.id ?? '', getContributedToolName(beginCall.name), { subagentInvocationId: this.options?.subagentInvocationId });
			}
		}

		if (delta.copilotToolCallStreamUpdates?.length) {
			for (const update of delta.copilotToolCallStreamUpdates) {
				if (!update.name) {
					continue;
				}
				progress.updateToolInvocation(update.id ?? '', { partialInput: tryParsePartialToolInput(update.arguments) });
			}
		}
	}

	/**
	 * Update the stagedDeltasToApply list: consume deltas up to `idx` and return them, and delete `length` after that
	 */
	private updateStagedDeltasUpToIndex(stopWordIdx: number, length: number): IResponseDelta[] {
		const result: IResponseDelta[] = [];
		for (let deltaOffset = 0; deltaOffset < stopWordIdx + length;) {
			const delta = this.stagedDeltasToApply.shift();
			if (delta) {
				if (deltaOffset + delta.text.length <= stopWordIdx) {
					// This delta is in the prefix, return it
					result.push(delta);
				} else if (deltaOffset < stopWordIdx || deltaOffset < stopWordIdx + length) {
					// This delta goes over the stop word, split it
					if (deltaOffset < stopWordIdx) {
						const prefixDelta = { ...delta };
						prefixDelta.text = delta.text.substring(0, stopWordIdx - deltaOffset);
						result.push(prefixDelta);
					}

					// This is copying the annotation onto both sides of the split delta, better to be safe
					const postfixDelta = { ...delta };
					postfixDelta.text = delta.text.substring((stopWordIdx - deltaOffset) + length);
					if (postfixDelta.text) {
						this.stagedDeltasToApply.unshift(postfixDelta);
					}

				} else {
					// This one is already over the idx, delete it
				}

				deltaOffset += delta.text.length;
			} else {
				break;
			}
		}

		return result;
	}

	protected checkForKeyWords(pseudoStopWords: string[], delta: IResponseDelta, applyDeltaToProgress: (delta: IResponseDelta) => void): string | undefined {
		const textDelta = this.stagedDeltasToApply.map(d => d.text).join('') + delta.text;

		// Find out if we have a complete stop word
		for (const pseudoStopWord of pseudoStopWords) {
			const stopWordIndex = textDelta.indexOf(pseudoStopWord);
			if (stopWordIndex === -1) {
				continue;
			}

			// We have a stop word, so apply the text up to the stop word
			this.stagedDeltasToApply.push(delta);
			const deltasToReport = this.updateStagedDeltasUpToIndex(stopWordIndex, pseudoStopWord.length);
			deltasToReport.forEach(item => applyDeltaToProgress(item));

			return pseudoStopWord;
		}

		// We now need to find out if we have a partial stop word
		for (const pseudoStopWord of pseudoStopWords) {
			for (let i = pseudoStopWord.length - 1; i > 0; i--) {
				const partialStopWord = pseudoStopWord.substring(0, i);
				if (textDelta.endsWith(partialStopWord)) {
					// We have a partial stop word, so we must stage the text and wait for the rest
					this.stagedDeltasToApply = [...this.stagedDeltasToApply, delta];
					return;
				}
			}
		}

		// We have no stop word or partial, so apply the text to the progress and turn
		[...this.stagedDeltasToApply, delta].forEach(item => {
			applyDeltaToProgress(item);
		});
		this.stagedDeltasToApply = [];

		return;
	}

	private postReportRecordProgress(delta: IResponseDelta) {
		this.nonReportedDeltas.push(delta);
	}

	protected applyDelta(delta: IResponseDelta, progress: ChatResponseStream): void {
		if (delta.retryReason) {
			this.stagedDeltasToApply = [];
			this.currentStartStop = undefined;
			this.nonReportedDeltas = [];
			this.thinkingActive = false;
			if (delta.retryReason === 'network_error' || delta.retryReason === 'server_error') {
				progress.clearToPreviousToolInvocation(ChatResponseClearToPreviousToolInvocationReason.NoReason);
			} else if (delta.retryReason === FilterReason.Copyright) {
				progress.clearToPreviousToolInvocation(ChatResponseClearToPreviousToolInvocationReason.CopyrightContentRetry);
			} else {
				progress.clearToPreviousToolInvocation(ChatResponseClearToPreviousToolInvocationReason.FilteredContentRetry);
			}
			return;
		}
		if (this.currentStartStop === undefined) {
			const stopWord = this.checkForKeyWords(this.stopStartMappings.map(e => e.stop), delta, delta => this.applyDeltaToProgress(delta, progress));
			if (stopWord) {
				this.currentStartStop = this.stopStartMappings.find(e => e.stop === stopWord);
			}
			return;
		} else {
			if (!this.currentStartStop.start) {
				return;
			}
			const startWord = this.checkForKeyWords([this.currentStartStop.start], delta, this.postReportRecordProgress.bind(this));
			if (startWord) {
				if (this.processNonReportedDelta) {
					const postProcessed = this.processNonReportedDelta(this.nonReportedDeltas);
					postProcessed.forEach((text) => this.applyDeltaToProgress({ text }, progress)); // processNonReportedDelta should not return anything that would have annotations
				}

				this.currentStartStop = undefined;
				if (this.stagedDeltasToApply.length > 0) {
					// since there's no guarantee that applyDelta will be called again, flush the stagedTextToApply by applying a blank string
					this.applyDelta({ text: '' }, progress);
				}
			}
		}
	}
}

/**
 * Note- IPCitations (snippy) are disabled in non-prod builds. See packagejson.ts, isProduction.
 */
export function reportCitations(delta: IResponseDelta, progress: ChatResponseStream): void {
	const citations = delta.ipCitations;
	if (citations?.length) {
		citations.forEach(c => {
			const licenseLabel = c.citations.license === 'NOASSERTION' ?
				l10n.t('unknown') :
				c.citations.license;
			progress.codeCitation(URI.parse(c.citations.url), licenseLabel, c.citations.snippet);
		});
	}
}

/**
 * Attempts to parse partial JSON using best-effort parsing.
 * For streaming tool call arguments, the JSON arrives incrementally.
 */
function tryParsePartialToolInput(raw: string | undefined): unknown {
	if (!raw) {
		return raw;
	}

	try {
		// Certain patterns, especially partially-generated unicode escape sequences, cause this to throw.
		return parsePartialJson(raw);
	} catch {
		return undefined;
	}
}
