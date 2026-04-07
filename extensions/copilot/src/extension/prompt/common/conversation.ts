/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptReference, Raw } from '@vscode/prompt-tsx';
import type { ChatRequest, ChatRequestEditedFileEvent, ChatResponseStream, ChatResult, LanguageModelToolResult } from 'vscode';
import { FilterReason } from '../../../platform/networking/common/openai';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { isLocation, toLocation } from '../../../util/common/types';
import { ResourceMap } from '../../../util/vs/base/common/map';
import { assertType } from '../../../util/vs/base/common/types';
import { URI } from '../../../util/vs/base/common/uri';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Location, Range } from '../../../vscodeTypes';
import { InternalToolReference, IToolCallRound } from '../common/intents';
import { ChatVariablesCollection } from './chatVariablesCollection';
import { isContinueOnError, isSwitchToAutoOnRateLimit, isToolCallLimitAcceptance } from './specialRequestTypes';
import { ToolCallRound } from './toolCallRound';
export { PromptReference } from '@vscode/prompt-tsx';

export enum TurnStatus {
	InProgress = 'in-progress',
	Success = 'success',
	Cancelled = 'cancelled',
	OffTopic = 'off-topic',
	Filtered = 'filtered',
	PromptFiltered = 'prompt-filtered',
	Error = 'error',
}

export type TurnMessage = {
	readonly type: 'user' | 'follow-up' | 'template' | 'offtopic-detection' | 'model' | 'meta' | 'server';
	readonly name?: string;
	/* readonly  */message: string;
};


export abstract class PromptMetadata {
	readonly _marker: undefined;
	toString(): string {
		return Object.getPrototypeOf(this).constructor.name;
	}
}

export class RequestDebugInformation {
	constructor(
		readonly uri: URI,
		readonly intentId: string,
		readonly languageId: string,
		readonly initialDocumentText: string,
		readonly userPrompt: string,
		readonly userSelection: Range
	) { }
}

export class Turn {

	private _references: readonly PromptReference[] = [];

	private _responseInfo?: { message: TurnMessage | undefined; status: TurnStatus; responseId: string | undefined; chatResult?: ChatResult };

	private readonly _metadata = new Map<unknown, unknown[]>();

	/** Summaries applied during the tool-call loop, before setResponse is called. */
	private _pendingSummaries: { toolCallRoundId: string; text: string }[] = [];

	public readonly startTime = Date.now();

	static fromRequest(
		id: string | undefined,
		request: ChatRequest
	) {
		return new Turn(
			id,
			{ message: request.prompt, type: 'user' },
			new ChatVariablesCollection(request.references),
			request.toolReferences.map(InternalToolReference.from),
			request.editedFileEvents,
			request.acceptedConfirmationData,
			isToolCallLimitAcceptance(request) || isContinueOnError(request) || isSwitchToAutoOnRateLimit(request),
		);
	}

	constructor(
		readonly id: string = generateUuid(),
		readonly request: TurnMessage,
		private readonly _promptVariables: ChatVariablesCollection | undefined = undefined,
		private readonly _toolReferences: readonly InternalToolReference[] = [],
		readonly editedFileEvents?: ChatRequestEditedFileEvent[],
		readonly acceptedConfirmationData?: unknown[],
		readonly isContinuation = false
	) { }

	get promptVariables(): ChatVariablesCollection | undefined {
		return this._promptVariables;
	}

	get toolReferences(): readonly InternalToolReference[] {
		return this._toolReferences;
	}

	get references(): readonly PromptReference[] {
		return this._references;
	}

	addReferences(newReferences: readonly PromptReference[]) {
		this._references = getUniqueReferences([...this._references, ...newReferences]);
	}

	// --- response

	get responseMessage(): TurnMessage | undefined {
		return this._responseInfo?.message;
	}

	get responseStatus(): TurnStatus {
		return this._responseInfo?.status ?? TurnStatus.InProgress;
	}

	get responseId(): string | undefined {
		return this._responseInfo?.responseId;
	}

	get responseChatResult(): ChatResult | undefined {
		return this._responseInfo?.chatResult;
	}

	get resultMetadata(): Partial<IResultMetadata> | undefined {
		return this._responseInfo?.chatResult?.metadata;
	}

	get renderedUserMessage(): string | Raw.ChatCompletionContentPart[] | undefined {
		const metadata = this.resultMetadata;
		return metadata?.renderedUserMessage;
	}

	// TODO@roblourens Tracking result data in "agent as chat participant" is difficult and will be replaced in the future.
	// This is likely a Turn from Ask mode that does not have tool call rounds.
	// Use consistent instances so we can save state on them.
	private _filledInMissingRounds: IToolCallRound[] | undefined;

	get rounds(): readonly IToolCallRound[] {
		const metadata = this.resultMetadata;
		const rounds = metadata?.toolCallRounds;
		if (!rounds || rounds.length === 0) {
			if (this._filledInMissingRounds?.length) {
				return this._filledInMissingRounds;
			}

			// Should always have at least one round
			const response = this.responseMessage?.message ?? '';
			this._filledInMissingRounds = [new ToolCallRound(response, [], undefined, this.id)];
			return this._filledInMissingRounds;
		}

		return rounds;
	}

	setResponse(status: TurnStatus, message: TurnMessage | undefined, responseId: string | undefined, chatResult: ChatResult | undefined) {
		if (this._responseInfo?.status === TurnStatus.Cancelled) {
			// The cancelled result can be assigned from inside ToolCallingLoop
			return;
		}

		assertType(!this._responseInfo);
		this._responseInfo = { message, status, responseId, chatResult };
	}


	// --- metadata
	// Using 'any' for constructor args here because TS will complain about passing any class if 'unknown' is used, I'm not totally sure why.
	// The idea of this is that you pass in a class and we return instances of that class.

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	getMetadata<T extends object>(key: new (...args: any[]) => T): T | undefined {
		return this._metadata.get(key)?.at(-1) as T | undefined;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	getAllMetadata<T extends object>(key: new (...args: any[]) => T): T[] | undefined {
		return this._metadata.get(key) as T[] | undefined;
	}

	setMetadata<T extends object>(value: T): void {
		const key = Object.getPrototypeOf(value).constructor;
		const arr = this._metadata.get(key) ?? [];
		arr.push(value);
		this._metadata.set(key, arr);
	}

	/**
	 * Store a background-compaction summary on this turn so it can be picked up
	 * by `normalizeSummariesOnRounds` even before `setResponse` is called
	 * (i.e. while the tool-call loop is still running).
	 */
	addPendingSummary(toolCallRoundId: string, text: string): void {
		this._pendingSummaries.push({ toolCallRoundId, text });
	}

	get pendingSummaries(): readonly { toolCallRoundId: string; text: string }[] {
		return this._pendingSummaries;
	}
}

// TODO handle persisted 'previous' and '' IDs (?)
// 'previous' -> last tool call round of previous turn
// '' -> current turn, but with user message
/**
 * Move summaries from metadata onto rounds.
 * This is needed for summaries that were produced for a different turn than the current one, because we can only
 * return resultMetadata from a particular request for the current turn, and can't modify the data for previous turns.
 */
export function normalizeSummariesOnRounds(turns: readonly Turn[]): void {
	for (const [idx, turn] of turns.entries()) {
		// Try persisted summaries from resultMetadata first, fall back to pending
		// summaries that were stored during the tool-call loop (before setResponse).
		const turnSummaries = turn.resultMetadata?.summaries ?? (turn.resultMetadata?.summary ? [turn.resultMetadata.summary] : turn.pendingSummaries);
		// Each summary supersedes all previous ones, so only the last one matters for restoration
		const turnSummary = turnSummaries.at(-1);
		if (!turnSummary) {
			continue;
		}
		const roundInTurn = turn.rounds.find(round => round.id === turnSummary.toolCallRoundId);
		if (roundInTurn) {
			roundInTurn.summary = turnSummary.text;
		} else {
			const previousTurns = turns.slice(0, idx);
			for (const turn of previousTurns) {
				const roundInPreviousTurn = turn.rounds.find(round => round.id === turnSummary.toolCallRoundId);
				if (roundInPreviousTurn) {
					roundInPreviousTurn.summary = turnSummary.text;
					break;
				}
			}
		}
	}
}

export interface IConversationState {
	readonly turns: Turn[];
}

export class Conversation {

	private readonly _turns: Turn[] = [];

	constructor(
		readonly sessionId: string,
		turns: Turn[]
	) {
		assertType(turns.length > 0, 'A conversation must have at least one turn');
		this._turns = turns;
	}

	get turns(): readonly Turn[] {
		return this._turns;
	}

	getLatestTurn(): Turn {
		return this._turns.at(-1)!; // safe, we checked for length in the ctor
	}
}


export type ResponseStreamParticipant = (inStream: ChatResponseStream) => ChatResponseStream;

export function getUniqueReferences(references: PromptReference[]): PromptReference[] {
	const groupedPromptReferences: ResourceMap<PromptReference[] | PromptReference> = new ResourceMap();
	const variableReferences: PromptReference[] = [];

	const getCombinedRange = (a: Range, b: Range): Range | undefined => {
		if (a.contains(b)) {
			return a;
		}

		if (b.contains(a)) {
			return b;
		}

		const [firstRange, lastRange] = (a.start.line < b.start.line) ? [a, b] : [b, a];
		// check if a is before b
		if (firstRange.end.line >= (lastRange.start.line - 1)) {
			return new Range(firstRange.start, lastRange.end);
		}

		return undefined;
	};

	// remove overlaps from within the same promptContext
	references.forEach(targetReference => {
		const refAnchor = targetReference.anchor;
		if ('variableName' in refAnchor) {
			variableReferences.push(targetReference);
		} else if (!isLocation(refAnchor)) {
			groupedPromptReferences.set(refAnchor, targetReference);
		} else {
			// reference is a range
			const existingRefs = groupedPromptReferences.get(refAnchor.uri);
			const asValidLocation = toLocation(refAnchor);
			if (!asValidLocation) {
				return;
			}
			if (!existingRefs) {
				groupedPromptReferences.set(refAnchor.uri, [new PromptReference(asValidLocation, undefined, targetReference.options)]);
			} else if (!(existingRefs instanceof PromptReference)) {
				// check if existingRefs isn't already a full file
				const oldLocationsToKeep: Location[] = [];
				let newRange = asValidLocation.range;
				existingRefs.forEach(existingRef => {
					if ('variableName' in existingRef.anchor) {
						return;
					}

					if (!isLocation(existingRef.anchor)) {
						// this shouldn't be the case, since all PromptReferences added as part of an array should be ranges
						return;
					}
					const existingRange = toLocation(existingRef.anchor);
					if (!existingRange) {
						return;
					}
					const combinedRange = getCombinedRange(newRange, existingRange.range);
					if (combinedRange) {
						// if we can consume this range, incorporate it into the new range and don't add it to the locations to keep
						newRange = combinedRange;
					} else {
						oldLocationsToKeep.push(existingRange);
					}
				});
				const newRangeLocation: Location = {
					uri: refAnchor.uri,
					range: newRange,
				};
				groupedPromptReferences.set(
					refAnchor.uri,
					[...oldLocationsToKeep, newRangeLocation]
						.sort((a, b) => a.range.start.line - b.range.start.line || a.range.end.line - b.range.end.line)
						.map(location => new PromptReference(location, undefined, targetReference.options)));

			}
		}
	});

	// sort values
	const finalValues = Array.from(groupedPromptReferences.keys())
		.sort((a, b) => a.toString().localeCompare(b.toString()))
		.map(e => {
			const values = groupedPromptReferences.get(e);
			if (!values) {
				// should not happen, these are all keys
				return [];
			}
			return values;
		}).flat();

	return [
		...finalValues,
		...variableReferences
	];
}

export type CodeBlock = { readonly code: string; readonly language?: string; readonly resource?: URI; readonly markdownBeforeBlock?: string };

export interface IResultMetadata {
	modelMessageId: string;
	responseId: string;
	sessionId: string;
	agentId: string;
	/** The user message exactly as it must be rendered in history. Should not be optional, but not every prompt will adopt this immediately */
	renderedUserMessage?: Raw.ChatCompletionContentPart[];
	renderedGlobalContext?: Raw.ChatCompletionContentPart[];
	globalContextCacheKey?: string;
	command?: string;
	filterCategory?: FilterReason;

	/**
	 * All code blocks that were in the response
	*/
	codeBlocks?: readonly CodeBlock[];

	toolCallRounds?: readonly IToolCallRound[];
	toolCallResults?: Record<string, LanguageModelToolResult>;
	maxToolCallsExceeded?: boolean;
	/**
	 * @deprecated Use `summaries` instead. Kept for backward compatibility with
	 * persisted messages that were saved before `summaries` was introduced.
	 * `normalizeSummariesOnRounds` falls back to this field when `summaries` is absent.
	 * Safe to remove once all persisted conversations have migrated.
	 */
	summary?: {
		toolCallRoundId: string;
		text: string;
		source?: 'foreground' | 'background';
		outcome?: string;
		model?: string;
		summarizationMode?: string;
		durationMs?: number;
		contextLengthBefore?: number;
		numRounds?: number;
		numRoundsSinceLastSummarization?: number;
		usage?: { prompt_tokens: number; completion_tokens: number; prompt_tokens_details?: { cached_tokens?: number } };
	};
	summaries?: readonly {
		toolCallRoundId: string;
		text: string;
		source?: 'foreground' | 'background';
		outcome?: string;
		model?: string;
		summarizationMode?: string;
		durationMs?: number;
		contextLengthBefore?: number;
		numRounds?: number;
		numRoundsSinceLastSummarization?: number;
		usage?: { prompt_tokens: number; completion_tokens: number; prompt_tokens_details?: { cached_tokens?: number } };
	}[];
	resolvedModel?: string;
	promptTokens?: number;
	outputTokens?: number;
	shouldAutoSwitchToAuto?: boolean;
}

/** There may be no metadata for results coming from old persisted messages, or from messages that are currently in progress (TODO, try to handle this case) */
export interface ICopilotChatResultIn extends ChatResult {
	metadata?: Partial<IResultMetadata>;
}

export interface ICopilotChatResult extends ChatResult {
	metadata: IResultMetadata;
}

export class RenderedUserMessageMetadata {
	constructor(
		readonly renderedUserMessage: Raw.ChatCompletionContentPart[],
	) { }
}

export class GlobalContextMessageMetadata {
	constructor(
		readonly renderedGlobalContext: Raw.ChatCompletionContentPart[],
		readonly cacheKey: string
	) { }
}

/**
 * Metadata capturing token usage information from Anthropic Messages API.
 * Stores prompt tokens and output tokens for each turn.
 * This metadata is used to trigger summarization when token usage exceeds thresholds.
 */
export class AnthropicTokenUsageMetadata {
	constructor(
		/** Total number of prompt input tokens */
		readonly promptTokens: number,
		/** Number of output/completion tokens */
		readonly outputTokens: number,
	) { }
}

export function getGlobalContextCacheKey(accessor: ServicesAccessor): string {
	const workspaceService = accessor.get(IWorkspaceService);
	return workspaceService.getWorkspaceFolders().map(folder => folder.toString()).join(',');
}
