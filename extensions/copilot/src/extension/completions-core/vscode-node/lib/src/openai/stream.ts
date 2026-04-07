/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotAnnotation, CopilotAnnotations, CopilotNamedAnnotationList, StreamCopilotAnnotations } from '../../../../../../platform/completions-core/common/openai/copilotAnnotations';
import { getRequestId, RequestId } from '../../../../../../platform/networking/common/fetch';
import { DestroyableStream } from '../../../../../../platform/networking/common/fetcherService';
import { IInstantiationService, ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { CancellationToken as ICancellationToken } from '../../../types/src';
import { ICompletionsLogTargetService, Logger } from '../logger';
import { Response } from '../networking';
import { TelemetryWithExp } from '../telemetry';
import { getEngineRequestInfo } from './config';
import { CopilotConfirmation, CopilotError, CopilotReference, SolutionDecision } from './fetch';
import {
	APIChoice,
	APIJsonData,
	APILogprobs,
	convertToAPIChoice,
	FinishedCallback,
} from './openai';

const streamChoicesLogger = new Logger('streamChoices');

/** Gathers together many chunks of a single completion choice. */
class APIJsonDataStreaming {
	logprobs: number[][] = [];
	top_logprobs: { [key: string]: number }[][] = [];
	text: string[] = [];
	tokens: string[][] = [];
	text_offset: number[][] = [];
	copilot_annotations: CopilotAnnotations = new StreamCopilotAnnotations();
	tool_calls: StreamingToolCalls = new StreamingToolCalls();
	function_call: StreamingFunctionCall = new StreamingFunctionCall();
	copilot_references: CopilotReference[] = [];
	finish_reason?: string;
	yielded = false;

	append(choice: ChoiceJSON) {
		if (choice.text) {
			this.text.push(choice.text);
		}
		// Role function is not included in the main answer.
		if (choice.delta?.content && choice.delta.role !== 'function') {
			this.text.push(choice.delta.content);
		}
		if (choice.logprobs) {
			this.tokens.push(choice.logprobs.tokens ?? []);
			this.text_offset.push(choice.logprobs.text_offset ?? []);
			this.logprobs.push(choice.logprobs.token_logprobs ?? []);
			this.top_logprobs.push(choice.logprobs.top_logprobs ?? []);
		}
		if (choice.copilot_annotations) {
			this.copilot_annotations.update(choice.copilot_annotations);
		}
		if (choice.delta?.copilot_annotations) {
			this.copilot_annotations.update(choice.delta.copilot_annotations);
		}
		if (choice.delta?.tool_calls && choice.delta.tool_calls.length > 0) {
			this.tool_calls.update(choice.delta.tool_calls);
		}
		if (choice.delta?.function_call) {
			this.function_call.update(choice.delta.function_call);
		}
		if (choice?.finish_reason) {
			this.finish_reason = choice.finish_reason;
		}
	}
}

// Given a string of lines separated by one or more newlines, returns complete
// lines and any remaining partial line data. Exported for test only.
export function splitChunk(chunk: string): [string[], string] {
	const dataLines = chunk.split('\n');
	const newExtra = dataLines.pop(); // will be empty string if chunk ends with "\n"
	return [dataLines.filter(line => line !== ''), newExtra!];
}

type ModelUsage = {
	completion_tokens: number;
	prompt_tokens: number;
	total_tokens: number;
};

/**
 * A single finished completion returned from the model or proxy, along with
 * some metadata.
 */
export interface FinishedCompletion {
	solution: APIJsonDataStreaming;
	/** An optional offset into `solution.text.join('')` where the completion finishes. */
	finishOffset: number | undefined;
	/** A copilot-specific human-readable reason for the completion finishing. */
	reason: string | null;
	requestId: RequestId;
	index: number;
	model?: string;
	usage?: ModelUsage;
}

class StreamingToolCall {
	// Right now we only support functions.
	name?: string;
	arguments: string[] = [];
	id?: string; // Unique ID for the tool call, if available

	update(toolCall: { type: 'function'; id?: string; function: { name?: string; arguments: string } }) {
		if (toolCall.id) {
			this.id = toolCall.id;
		}
		if (toolCall.function.name) {
			this.name = toolCall.function.name;
		}
		this.arguments.push(toolCall.function.arguments);
	}
}

class StreamingToolCalls {
	private toolCalls: StreamingToolCall[] = [];

	constructor() { }

	update(
		toolCallsArray: { type: 'function'; id?: string; index?: number; function: { name?: string; arguments: string } }[]
	) {
		toolCallsArray.forEach(toolCall => {
			let currentCall = this.toolCalls.length > 0 ? this.toolCalls[this.toolCalls.length - 1] : undefined;
			// Create a new tool call if:
			// 1. No existing tool calls, OR
			// 2. The new tool call has an ID and it's different from the current one
			if (!currentCall || (toolCall.id && currentCall.id !== toolCall.id)) {
				currentCall = new StreamingToolCall();
				this.toolCalls.push(currentCall);
			}

			currentCall.update(toolCall);
		});
	}

	getToolCalls(): StreamingToolCall[] {
		return this.toolCalls;
	}
}

class StreamingFunctionCall {
	name?: string;
	arguments: string[] = [];

	update(functionCall: { name?: string; arguments: string }) {
		if (functionCall.name) {
			this.name = functionCall.name;
		}
		this.arguments.push(functionCall.arguments);
	}
}

interface FunctionCallJSON {
	name?: string;
	arguments: string;
}

interface ToolCallJSON {
	id: string;
	function: FunctionCallJSON;
	index: number;
	type: 'function';
}

/** What comes back from the OpenAI API for a single choice in an SSE chunk. */
interface ChoiceJSON {
	index: number;
	/**
	 * The text attribute as defined in completions streaming.
	 * See https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#event_stream_format
	 */
	text: string;
	copilot_annotations: { [key: string]: CopilotAnnotation[] };
	/**
	 * The delta attribute as defined in chat streaming.
	 * See https://github.com/openai/openai-cookbook/blob/main/examples/How_to_stream_completions.ipynb
	 */
	delta: {
		content: string;
		copilot_annotations?: { [key: string]: CopilotAnnotation[] };
		role?: string;
		function_call?: FunctionCallJSON;
		tool_calls?: ToolCallJSON[];
	};
	finish_reason: string | null;
	logprobs?: APILogprobs;
	copilot_annotation?: CopilotNamedAnnotationList;
	copilot_references?: CopilotReference[];
}

/**
 * Processes an HTTP request containing what is assumed to be an SSE stream of
 * OpenAI API data. Yields a stream of `FinishedCompletion` objects, each as
 * soon as it's finished.
 */
export class SSEProcessor {
	private requestId: RequestId = getRequestId(this.response.headers);
	private stats = new ChunkStats();
	/**
	 * A key & value being here means at least one chunk with that choice index
	 * has been received. A null value means we've already finished the given
	 * solution and should not process incoming tokens further.
	 */
	private readonly solutions: Record<number, APIJsonDataStreaming | null> = {};

	private constructor(
		private readonly expectedNumChoices: number,
		private readonly response: Response,
		private readonly body: DestroyableStream<string>,
		private readonly telemetryData: TelemetryWithExp,
		private readonly dropCompletionReasons: string[],
		private readonly cancellationToken: ICancellationToken | undefined = undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICompletionsLogTargetService private readonly logTarget: ICompletionsLogTargetService,
	) { }

	/**
	 * Creates a new instance of SSEProcessor.
	 *
	 * Supports dropping completions with specific finish reasons.
	 * Historically, this was used to drop RAI ('content_filter') completions, instead of showing partially finished completions to the user. We've gone back and forth on this.
	 */
	static async create(
		accessor: ServicesAccessor,
		expectedNumChoices: number,
		response: Response,
		telemetryData: TelemetryWithExp,
		dropCompletionReasons?: string[],
		cancellationToken?: ICancellationToken
	) {
		const instantiationService = accessor.get(IInstantiationService);
		const logTargetService = accessor.get(ICompletionsLogTargetService);

		const body = response.body.pipeThrough(new TextDecoderStream());

		// TODO@benibenj can we switch to our SSEProcessor implementation?
		// It seems like they build more on top of the shared impl
		// I made this function async and commented out the web ReadableStream approach

		return new SSEProcessor(
			expectedNumChoices,
			response,
			body,
			telemetryData,
			dropCompletionReasons ?? [],
			cancellationToken,
			instantiationService,
			logTargetService,
		);
	}

	/**
	 * Yields finished completions as soon as they are available. The finishedCb
	 * is used to determine when a completion is done and should be truncated.
	 * It is called on the whole of the received solution text, once at the end
	 * of the completion (if it stops by itself) and also on any chunk that has
	 * a newline in it.
	 *
	 * Closes the server request stream when all choices are finished/truncated.
	 *
	 * Note that for this to work, the caller must consume the entire stream.
	 * This happens automatically when using a `for await` loop, but when
	 * iterating manually this needs to be done by calling `.next()` until it
	 * returns an item with done = true (or calling `.return()`).
	 */
	async *processSSE(finishedCb: FinishedCallback = () => undefined): AsyncIterable<FinishedCompletion> {
		try {
			yield* this.processSSEInner(finishedCb);
		} finally {
			await this.cancel();
			streamChoicesLogger.debug(this.logTarget,
				`request done: headerRequestId: [${this.requestId.headerRequestId}] model deployment ID: [${this.requestId.deploymentId}]`
			);
			streamChoicesLogger.debug(this.logTarget, 'request stats:', this.stats);
		}
	}

	private async *processSSEInner(finishedCb: FinishedCallback): AsyncIterable<FinishedCompletion> {
		// Collects pieces of the SSE stream that haven't been fully processed
		// yet.
		let extraData = '';

		let currentFinishReason: string | null = null;
		let model: string | undefined;
		let usage: ModelUsage | undefined;

		// Iterate over arbitrarily sized chunks coming in from the network.
		networkRead: for await (const chunk of this.body) {
			if (await this.maybeCancel('after awaiting body chunk')) {
				return;
			}

			streamChoicesLogger.debug(this.logTarget, 'chunk', chunk.toString());
			const [dataLines, remainder] = splitChunk(extraData + chunk.toString());
			extraData = remainder;

			// Each dataLine is complete since we've seen at least one \n after
			// it.
			for (const dataLine of dataLines) {
				const lineWithoutData = dataLine.slice('data:'.length).trim();
				if (lineWithoutData === '[DONE]') {
					yield* this.finishSolutions(currentFinishReason, model, usage, finishedCb);
					return;
				}
				// If this is not a DONE line, we reset the finish reason.
				currentFinishReason = null;

				interface StreamingResponse {
					choices?: ChoiceJSON[];
					error?: { message: string };
					copilot_references?: CopilotReference[];
					copilot_confirmation?: unknown;
					copilot_errors: CopilotError[];
					model?: string; // Note: model should only be expected from CAPI, not copilot-proxy
					usage?: ModelUsage;
				}

				let json;
				try {
					json = <StreamingResponse>JSON.parse(lineWithoutData);
				} catch (e) {
					streamChoicesLogger.error(this.logTarget, 'Error parsing JSON stream data', dataLine);
					continue;
				}

				// A message with a confirmation may or may not have 'choices'
				if (json.copilot_confirmation && isCopilotConfirmation(json.copilot_confirmation)) {
					await finishedCb('', {
						text: '',
						requestId: this.requestId,
						copilotConfirmation: json.copilot_confirmation,
					});
				}

				// we do not process the data from role=function right now because copilot_references seem to contain the same data in a more structured way
				if (json.copilot_references) {
					await finishedCb('', {
						text: '',
						requestId: this.requestId,
						copilotReferences: json.copilot_references,
					});
				}

				if (json.choices === undefined) {
					if (!json.copilot_references && !json.copilot_confirmation) {
						if (json.error !== undefined) {
							streamChoicesLogger.error(this.logTarget, 'Error in response:', json.error!.message);
						} else {
							streamChoicesLogger.error(this.logTarget,
								'Unexpected response with no choices or error: ' + lineWithoutData
							);
						}
					}

					// There are also messages with a null 'choices' that include copilot_errors- report these
					if (json.copilot_errors) {
						await finishedCb('', { text: '', requestId: this.requestId, copilotErrors: json.copilot_errors });
					}

					continue;
				}

				if (model === undefined && json.model) {
					model = json.model;
				}

				if (usage === undefined && json.usage) {
					usage = json.usage;
				}

				if (this.allSolutionsDone()) {
					// discard any extra data; there's no need to log it as an error
					extraData = '';
					break networkRead;
				}

				for (let i = 0; i < json.choices?.length; i++) {
					const choice: ChoiceJSON = json.choices[i];
					streamChoicesLogger.debug(this.logTarget, 'choice', choice);
					this.stats.add(choice.index);

					if (!(choice.index in this.solutions)) {
						this.solutions[choice.index] = new APIJsonDataStreaming();
					}

					const solution = this.solutions[choice.index];
					if (solution === null) {
						continue; // already finished
					}

					solution.append(choice);

					// Call finishedCb after each newline token to determine
					// if the solution is now complete. Also call it if the
					// solution has finished to make sure it's properly truncated.
					let decision = this.asSolutionDecision();
					const hasNewLine = choice.text?.indexOf('\n') > -1 || choice.delta?.content?.indexOf('\n') > -1;
					if (choice.finish_reason || hasNewLine) {
						const text = solution.text.join('');
						decision = this.asSolutionDecision(
							await finishedCb(text, {
								text,
								index: choice.index,
								requestId: this.requestId,
								annotations: solution.copilot_annotations,
								copilotReferences: solution.copilot_references,
								getAPIJsonData: () => convertToAPIJsonData(solution),
								finished: choice.finish_reason ? true : false,
								telemetryData: this.telemetryData,
							})
						);

						if (await this.maybeCancel('after awaiting finishedCb')) {
							return;
						}
					}

					/**
					 * If this is a function call and we have a finish reason, continue to the next choice.
					 * This is because of how extensibility platform agents work, where multiple finish reasons can be returned.
					 *
					 * This should be updated to tools in the future.
					 */
					if (choice.finish_reason && solution.function_call.name !== undefined) {
						currentFinishReason = choice.finish_reason;
						continue;
					}

					if (choice.finish_reason) {
						decision.yieldSolution = true;
						decision.continueStreaming = false;
					}
					if (!decision.yieldSolution) {
						continue;
					}
					// NOTE: When there is a finish_reason the text of subsequent chunks is always '',
					// (current chunk might still have useful text, that is why we add it above).
					// So we know that we already got all the text to be displayed for the user.
					// TODO: This might contain additional logprobs for excluded next tokens. We should
					// filter out indices that correspond to excluded tokens. It will not affect the
					// text though.
					const loggedReason = choice.finish_reason ?? 'client-trimmed';
					streamChoicesLogger.debug(this.logTarget,
						'completion.finishReason',
						this.telemetryData.extendedBy({
							completionChoiceFinishReason: loggedReason,
							engineName: model ?? '',
							engineChoiceSource: this.instantiationService.invokeFunction(getEngineRequestInfo, this.telemetryData).engineChoiceSource,
						})
					);
					if (this.dropCompletionReasons.includes(choice.finish_reason!)) {
						// In this case we drop the choice on the floor.
						this.solutions[choice.index] = null;
					} else if (!solution.yielded) {
						this.stats.markYielded(choice.index);
						yield {
							solution,
							finishOffset: decision.finishOffset,
							reason: choice.finish_reason,
							requestId: this.requestId,
							index: choice.index,
							model: model,
							usage: usage,
						};
						solution.yielded = true;
					}

					if (await this.maybeCancel('after yielding finished choice')) {
						return;
					}

					if (!decision.continueStreaming) {
						this.solutions[choice.index] = null;
					}
				}
			}
		}

		// Yield whatever solutions remain incomplete in case no [DONE] was received.
		// This shouldn't happen in practice unless there was an error somewhere.
		for (const [index, solution] of Object.entries(this.solutions)) {
			const solutionIndex = Number(index); // Convert `index` from string to number
			if (solution === null) {
				continue; // already finished
			}
			streamChoicesLogger.debug(this.logTarget,
				'completion.finishReason',
				this.telemetryData.extendedBy({
					completionChoiceFinishReason: 'Iteration Done',
					engineName: model ?? '',
				})
			);
			this.stats.markYielded(solutionIndex);
			yield {
				solution,
				finishOffset: undefined,
				reason: 'Iteration Done',
				requestId: this.requestId,
				index: solutionIndex,
				model: model,
				usage: usage,
			};

			if (await this.maybeCancel('after yielding after iteration done')) {
				return;
			}
		}

		// Error message can be present in `extraData`
		if (extraData.length > 0) {
			try {
				const extraDataJson = <{ error?: { message: string } }>JSON.parse(extraData);
				if (extraDataJson.error !== undefined) {
					streamChoicesLogger.error(this.logTarget,
						`Error in response: ${extraDataJson.error!.message}`,
						extraDataJson.error
					);
				}
			} catch (e) {
				streamChoicesLogger.error(this.logTarget, `Error parsing extraData: ${extraData}`);
			}
		}
	}

	private asSolutionDecision(result?: SolutionDecision | number): SolutionDecision {
		if (result === undefined) {
			return {
				yieldSolution: false,
				continueStreaming: true,
			};
		} else if (typeof result === 'number') {
			return {
				yieldSolution: true,
				continueStreaming: false,
				finishOffset: result,
			};
		}

		return result;
	}

	/** Yields the solutions that weren't yet finished, with a 'DONE' reason. */
	private async *finishSolutions(
		currentFinishReason: string | null,
		model: string | undefined,
		usage: ModelUsage | undefined,
		finishedCb: FinishedCallback
	): AsyncIterable<FinishedCompletion> {
		for (const [index, solution] of Object.entries(this.solutions)) {
			const solutionIndex = Number(index); // Convert `index` from string to number
			if (solution === null) {
				continue; // already finished
			}
			// ensure the callback receives the final result
			const text = solution.text.join('');
			await finishedCb(text, {
				text,
				index: solutionIndex,
				requestId: this.requestId,
				annotations: solution.copilot_annotations,
				copilotReferences: solution.copilot_references,
				getAPIJsonData: () => convertToAPIJsonData(solution), // observation from @ulugbekna: this conversion will make `finishReason` for this object 'stop' while we're yielding with 'DONE' below
				finished: true,
				telemetryData: this.telemetryData,
			});
			if (solution.yielded) {
				continue; // already produced
			}
			this.stats.markYielded(solutionIndex);
			streamChoicesLogger.debug(this.logTarget,
				'completion.finishReason',
				this.telemetryData.extendedBy({
					completionChoiceFinishReason: currentFinishReason ?? 'DONE',
					engineName: model ?? '',
				})
			);
			yield {
				solution,
				finishOffset: undefined,
				reason: currentFinishReason ?? 'DONE',
				requestId: this.requestId,
				index: solutionIndex,
				model: model,
				usage: usage,
			};

			if (await this.maybeCancel('after yielding on DONE')) {
				return;
			}
		}
	}

	/**
	 * Returns whether the cancellation token was cancelled and closes the
	 * stream if it was.
	 */
	private async maybeCancel(description: string) {
		if (this.cancellationToken?.isCancellationRequested) {
			streamChoicesLogger.debug(this.logTarget, 'Cancelled: ' + description);
			await this.cancel();
			return true;
		}
		return false;
	}

	/** Cancels the network request to the proxy. */
	private async cancel() {
		await this.body.destroy();
	}

	/** Returns whether we've finished receiving all expected solutions. */
	private allSolutionsDone(): boolean {
		const solutions = Object.values(this.solutions);
		return solutions.length === this.expectedNumChoices && solutions.every(s => s === null);
	}
}

export function prepareSolutionForReturn(
	accessor: ServicesAccessor,
	c: FinishedCompletion,
	telemetryData: TelemetryWithExp
): APIChoice {
	const logTarget = accessor.get(ICompletionsLogTargetService);
	let completionText = c.solution.text.join('');

	let blockFinished = false;
	if (c.finishOffset !== undefined) {
		// Trim solution to finishOffset returned by finishedCb
		streamChoicesLogger.debug(logTarget, `solution ${c.index}: early finish at offset ${c.finishOffset}`);
		completionText = completionText.substring(0, c.finishOffset);
		blockFinished = true;
	}

	streamChoicesLogger.info(logTarget, `solution ${c.index} returned. finish reason: [${c.reason}]`);
	streamChoicesLogger.debug(logTarget, `solution ${c.index} details: finishOffset: [${c.finishOffset}]`);
	const jsonData: APIJsonData = convertToAPIJsonData(c.solution);
	return convertToAPIChoice(accessor, completionText, jsonData, c.index, c.requestId, blockFinished, telemetryData);
}

// Function to convert from APIJsonDataStreaming to APIJsonData format
function convertToAPIJsonData(streamingData: APIJsonDataStreaming): APIJsonData {
	const joinedText = streamingData.text.join('');
	const annotations = streamingData.copilot_annotations.current;
	const out: APIJsonData = {
		text: joinedText,
		tokens: streamingData.text,
		copilot_annotations: annotations,
		finish_reason: streamingData.finish_reason ?? 'stop',
	};
	if (streamingData.logprobs.length === 0) {
		return out;
	}
	const flattenedLogprobs = streamingData.logprobs.reduce((acc, cur) => acc.concat(cur), []);
	const flattenedTopLogprobs = streamingData.top_logprobs.reduce((acc, cur) => acc.concat(cur), []);
	const flattenedOffsets = streamingData.text_offset.reduce((acc, cur) => acc.concat(cur), []);
	const flattenedTokens = streamingData.tokens.reduce((acc, cur) => acc.concat(cur), []);

	return {
		...out,
		logprobs: {
			token_logprobs: flattenedLogprobs,
			top_logprobs: flattenedTopLogprobs,
			text_offset: flattenedOffsets,
			tokens: flattenedTokens,
		},
	};
}

// data: {"choices":null,"copilot_confirmation":{"type":"action","title":"Are you sure you want to proceed?","message":"This action is irreversible.","confirmation":{"id":"123"}},"id":null}
function isCopilotConfirmation(obj: unknown): obj is CopilotConfirmation {
	return (
		typeof (obj as CopilotConfirmation).title === 'string' &&
		typeof (obj as CopilotConfirmation).message === 'string' &&
		!!(obj as CopilotConfirmation).confirmation
	);
}

/** Keeps track of how many chunks of a choice were read and yielded out. */
class ChunkStats {
	private readonly choices = new Map<number, ChoiceStats>();

	private getChoiceStats(choiceIndex: number): ChoiceStats {
		let choiceStat = this.choices.get(choiceIndex);
		if (!choiceStat) {
			choiceStat = new ChoiceStats();
			this.choices.set(choiceIndex, choiceStat);
		}
		return choiceStat;
	}

	add(choiceIndex: number) {
		this.getChoiceStats(choiceIndex).increment();
	}

	markYielded(choiceIndex: number) {
		this.getChoiceStats(choiceIndex).markYielded();
	}

	toString() {
		return Array.from(this.choices.entries())
			.map(([index, stats]) => `${index}: ${stats.yieldedTokens} -> ${stats.seenTokens}`)
			.join(', ');
	}
}

class ChoiceStats {
	yieldedTokens = -1;
	seenTokens = 0;

	increment() {
		this.seenTokens++;
	}

	markYielded() {
		this.yieldedTokens = this.seenTokens;
	}
}
