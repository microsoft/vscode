/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from 'vscode';
import { ILogService, LogLevel } from '../../log/common/logService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { TelemetryData } from '../../telemetry/common/telemetryData';
import { RawThinkingDelta, ThinkingDelta } from '../../thinking/common/thinking';
import { extractThinkingDeltaFromChoice, } from '../../thinking/common/thinkingUtils';
import { FinishedCallback, getRequestId, ICodeVulnerabilityAnnotation, ICopilotBeginToolCall, ICopilotConfirmation, ICopilotError, ICopilotFunctionCall, ICopilotReference, ICopilotToolCall, ICopilotToolCallStreamUpdate, IIPCodeCitation, isCodeCitationAnnotation, isCopilotAnnotation, RequestId } from '../common/fetch';
import { DestroyableStream, Response } from '../common/fetcherService';
import { APIErrorResponse, APIJsonData, APIUsage, ChoiceLogProbs, FilterReason, FinishedCompletionReason, isApiUsage, IToolCall } from '../common/openai';

/** Gathers together many chunks of a single completion choice. */
class APIJsonDataStreaming {

	constructor(public readonly model: string) { }

	get text(): readonly string[] {
		return this._text;
	}

	private _text: string[] = [];
	private _newText: string[] = [];

	append(choice: ExtendedChoiceJSON) {
		if (choice.text) {
			const str = APIJsonDataStreaming._removeCR(choice.text);
			this._text.push(str);
			this._newText.push(str);
		}
		if (choice.delta?.content) {
			const str = APIJsonDataStreaming._removeCR(choice.delta.content);
			this._text.push(str);
			this._newText.push(str);
		}
		if (choice.delta?.function_call && (choice.delta.function_call.name || choice.delta.function_call.arguments)) {
			const str = APIJsonDataStreaming._removeCR(choice.delta.function_call.arguments);
			this._text.push(str);
			this._newText.push(str);
		}
	}

	flush(): string {
		const delta = this._newText.join('');
		this._newText = [];
		return delta;
	}

	private static _removeCR(text: string): string {
		return text.replace(/\r$/g, '');
	}

	toJSON() {
		return {
			text: this._text,
			newText: this._newText
		};
	}
}

class StreamingToolCall {
	public id: string | undefined;
	public name: string | undefined;
	public arguments: string = '';

	constructor() { }

	update(toolCall: IToolCall): boolean {
		let argumentsChanged = false;

		if (toolCall.id) {
			this.id = toolCall.id;
		}

		if (toolCall.function?.name) {
			this.name = toolCall.function.name;
		}

		if (toolCall.function?.arguments) {
			this.arguments += toolCall.function.arguments;
			argumentsChanged = true;
		}

		return argumentsChanged;
	}
}

class StreamingToolCalls {
	private toolCalls: StreamingToolCall[] = [];

	constructor() { }

	getToolCalls(): ICopilotToolCall[] {
		return this.toolCalls.map(call => {
			return {
				name: call.name!,
				arguments: call.arguments,
				id: call.id!,
			};
		});
	}

	hasToolCalls(): boolean {
		return this.toolCalls.length > 0;
	}

	update(choice: ExtendedChoiceJSON): ICopilotToolCallStreamUpdate[] {
		const updates: ICopilotToolCallStreamUpdate[] = [];
		choice.delta?.tool_calls?.forEach(toolCall => {
			let currentCall: StreamingToolCall | undefined;
			if (toolCall.id) {
				currentCall = this.toolCalls.find(call => call.id === toolCall.id);
			}
			if (!currentCall) {
				currentCall = this.toolCalls.at(-1);
			}
			if (!currentCall || (toolCall.id && currentCall.id && currentCall.id !== toolCall.id)) {
				currentCall = new StreamingToolCall();
				this.toolCalls.push(currentCall);
			}

			const argumentsChanged = currentCall.update(toolCall);
			if (argumentsChanged && currentCall.name) {
				updates.push({
					name: currentCall.name,
					arguments: currentCall.arguments,
					id: currentCall.id,
				});
			}
		});
		return updates;
	}
}

// Given a string of lines separated by one or more newlines, returns complete
// lines and any remaining partial line data. Exported for test only.
export function splitChunk(chunk: string): [string[], string] {
	const dataLines = chunk.split('\n');
	const newExtra = dataLines.pop(); // will be empty string if chunk ends with "\n"
	return [dataLines.filter(line => line !== ''), newExtra!];
}

/**
 * A single finished completion returned from the model or proxy, along with
 * some metadata.
 */
export interface FinishedCompletion {
	solution: APIJsonDataStreaming;
	/** An optional offset into `solution.text.join('')` where the completion finishes. */
	finishOffset: number | undefined;
	/** A copilot-specific human-readable reason for the completion finishing. */
	reason: FinishedCompletionReason;
	/** A copilot-specific reason for filtering the response. Only returns when reason === FinishedCompletionReason.ContentFilter */
	filterReason?: FilterReason;
	error?: APIErrorResponse;
	/** The token usage reported from CAPI */
	usage?: APIUsage;
	requestId: RequestId;
	index: number;
}

/** What comes back from the OpenAI API for a single choice in an SSE chunk. */
interface ChoiceJSON {
	index: number;
	/**
	 * The text attribute as defined in completions streaming.
	 * See https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#event_stream_format
	 */
	text?: string;
	/**
	 * The delta attribute as defined in chat streaming.
	 * See https://github.com/openai/openai-cookbook/blob/main/examples/How_to_stream_completions.ipynb
	 */
	delta?: { content: string | null };
	finish_reason?: FinishedCompletionReason.Stop | FinishedCompletionReason.Length | FinishedCompletionReason.FunctionCall | FinishedCompletionReason.ContentFilter | FinishedCompletionReason.ServerError | FinishedCompletionReason.ToolCalls | null;
	logprobs?: ChoiceLogProbs;
}

/**
 * Extensions to the OpenAI stream format
 */
interface ExtendedChoiceJSON extends ChoiceJSON {
	content_filter_results?: Record<Exclude<FilterReason, FilterReason.Copyright>, { filtered: boolean; severity: string }>;
	message?: RawThinkingDelta;
	delta?: {
		content: string | null;
		copilot_annotations?: {
			CodeVulnerability: ICodeVulnerabilityAnnotation[];
			IPCodeCitations: IIPCodeCitation[];
			TextCopyright: boolean | undefined;
			Sexual: boolean | undefined;
			SexualPattern: boolean | undefined;
			Violence: boolean | undefined;
			HateSpeech: boolean | undefined;
			HateSpeechPattern: boolean | undefined;
			SelfHarm: boolean | undefined;
			PromptPromBlockList: boolean | undefined;
		};
		function_call?: { name: string; arguments: string };
		tool_calls?: IToolCall[];
		role?: string;
		name?: string;
	} & RawThinkingDelta;
}

/**
 * Processes an HTTP request containing what is assumed to be an SSE stream of
 * OpenAI API data. Yields a stream of `FinishedCompletion` objects, each as
 * soon as it's finished.
 */
export class SSEProcessor {
	private requestId: RequestId = getRequestId(this.response.headers);
	/**
	 * A key & value being here means at least one chunk with that choice index
	 * has been received. A null value means we've already finished the given
	 * solution and should not process incoming tokens further.
	 */
	private readonly solutions: Record<number, APIJsonDataStreaming | null> = {};

	private readonly completedFunctionCallIdxs: Map<number /* index */, 'function' | 'tool'> = new Map();
	private readonly functionCalls: Record<string, APIJsonDataStreaming | null> = {};
	private readonly toolCalls = new StreamingToolCalls();
	private functionCallName: string | undefined = undefined;

	private constructor(
		private readonly logService: ILogService,
		private readonly telemetryService: ITelemetryService,
		private readonly expectedNumChoices: number,
		private readonly response: Response,
		private readonly body: DestroyableStream<string>,
		private readonly cancellationToken?: CancellationToken
	) { }

	static async create(
		logService: ILogService,
		telemetryService: ITelemetryService,
		expectedNumChoices: number,
		response: Response,
		cancellationToken?: CancellationToken
	) {
		const body = response.body.pipeThrough(new TextDecoderStream());
		return new SSEProcessor(
			logService,
			telemetryService,
			expectedNumChoices,
			response,
			body,
			cancellationToken
		);
	}

	/**
	 * Yields finished completions as soon as they are available. The finishedCb
	 * is used to determine when a completion is done and should be truncated.
	 * It is called on the whole of the received solution text, once at the end
	 * of the completion (if it stops by itself) and also on any chunk that has
	 * a newline in it.
	 *
	 * Closes the server request stream when all choices are finished/truncated
	 * (as long as fastCancellation is true).
	 *
	 * Note that for this to work, the caller must consume the entire stream.
	 * This happens automatically when using a `for await` loop, but when
	 * iterating manually this needs to be done by calling `.next()` until it
	 * returns an item with done = true (or calling `.return()`).
	 */
	async *processSSE(finishedCb: FinishedCallback = async () => undefined): AsyncIterable<FinishedCompletion> {
		try {
			// If it's n > 1 we don't handle usage as the usage is global for the stream and all our code assumes per choice
			// Therefore we will just skip over the usage and yield the completions
			if (this.expectedNumChoices > 1) {
				for await (const usageOrCompletions of this.processSSEInner(finishedCb)) {
					if (!isApiUsage(usageOrCompletions)) {
						yield usageOrCompletions;
					}
				}
			} else {
				let completion: FinishedCompletion | undefined;
				let usage: APIUsage | undefined;

				// Process both the usage and the completions, then yield one combined completions
				for await (const usageOrCompletions of this.processSSEInner(finishedCb)) {
					if (isApiUsage(usageOrCompletions)) {
						usage = usageOrCompletions;
					} else {
						completion = usageOrCompletions;
					}
				}

				if (await this.maybeCancel('after receiving the completion, but maybe before we got the usage')) {
					return;
				}

				if (completion) {
					completion.usage = usage;
					yield completion;
				}
			}
		} finally {
			await this.cancel();
			this.logService.info(
				`request done: requestId: [${this.requestId.headerRequestId}] model deployment ID: [${this.requestId.deploymentId}]`
			);
		}
	}

	private async *processSSEInner(finishedCb: FinishedCallback): AsyncIterable<FinishedCompletion | APIUsage> {
		// Collects pieces of the SSE stream that haven't been fully processed yet.
		let extraData = '';
		// This flag is set when at least for one solution we finished early (via `finishedCb`).
		let hadEarlyFinishedSolution = false;

		// The platform agent can return a 'function_call' finish_reason, which isn't a real function call
		// but is echoing internal function call messages back to us. So don't treat them as real function calls
		// if we received more data after that
		let allowCompletingSolution = true;
		let thinkingFound = false;

		// Iterate over arbitrarily sized chunks coming in from the network.
		for await (const chunk of this.body) {
			if (await this.maybeCancel('after awaiting body chunk')) {
				return;
			}

			// this.logService.debug(chunk.toString());
			const [dataLines, remainder] = splitChunk(extraData + chunk.toString());
			extraData = remainder;

			// Each dataLine is complete since we've seen at least one \n after it

			for (const dataLine of dataLines) {
				// Lines which start with a `:` are SSE Comments per the spec and can be ignored
				if (dataLine.startsWith(':')) {
					continue;
				}
				const lineWithoutData = dataLine.slice('data:'.length).trim();
				if (lineWithoutData === '[DONE]') {
					yield* this.finishSolutions();
					return;
				}

				// TODO @lramos15 - This should not be an ugly inlined type like this
				let json: {
					choices: ExtendedChoiceJSON[] | undefined | null;
					model: string;
					error?: APIErrorResponse;
					copilot_references?: any;
					copilot_confirmation?: any;
					copilot_errors: any;
					usage: APIUsage | undefined;
				};
				try {
					json = JSON.parse(lineWithoutData);
				} catch (e) {
					this.logService.error(`Error parsing JSON stream data for request id ${this.requestId.headerRequestId}:${dataLine}`);
					sendCommunicationErrorTelemetry(this.telemetryService, `Error parsing JSON stream data for request id ${this.requestId.headerRequestId}:`, dataLine);
					continue;
				}

				// Track usage data for this stream. Usage is global and not per choice. Therefore it's emitted as its own chunk
				if (json.usage) {
					yield json.usage;
				}

				// A message with a confirmation may or may not have 'choices'
				if (json.copilot_confirmation && isCopilotConfirmation(json.copilot_confirmation)) {
					await finishedCb('', 0, { text: '', copilotConfirmation: json.copilot_confirmation });
				}

				if (!json.choices) {
					// Currently there are messages with a null 'choices' that include copilot_references- ignore these
					if (!json.copilot_references && !json.copilot_confirmation) {
						if (json.error !== undefined) {
							this.logService.error(`Error in response for request id ${this.requestId.headerRequestId}:${json.error.message}`);
							sendCommunicationErrorTelemetry(this.telemetryService, `Error in response for request id ${this.requestId.headerRequestId}:`, json.error.message);
							// Encountered an error mid stream we immediately yield as the response is not usable.
							yield {
								index: 0,
								finishOffset: undefined,
								solution: new APIJsonDataStreaming(json.model || ''),
								reason: FinishedCompletionReason.ServerError,
								error: json.error,
								requestId: this.requestId,
							};
						} else {
							this.logService.error(`Unexpected response with no choices or error for request id ${this.requestId.headerRequestId}`);
							sendCommunicationErrorTelemetry(this.telemetryService, `Unexpected response with no choices or error for request id ${this.requestId.headerRequestId}`);
						}
					}

					// There are also messages with a null 'choices' that include copilot_errors- report these
					if (json.copilot_errors) {
						await finishedCb('', 0, { text: '', copilotErrors: json.copilot_errors });
					}

					if (json.copilot_references) {
						await finishedCb('', 0, { text: '', copilotReferences: json.copilot_references });
					}

					continue;
				}

				if (this.requestId.created === 0) {
					// Would only be 0 if we're the first actual response chunk
					this.requestId = getRequestId(this.response.headers, json);
					if (this.requestId.created === 0 && json.choices?.length) { // An initial chunk is sent with an empty choices array and no id, to hold `prompt_filter_results`
						this.requestId.created = Math.floor(Date.now() / 1000);
					}
				}

				for (let i = 0; i < json.choices.length; i++) {
					const choice = json.choices[i];

					this.logChoice(choice);


					const thinkingDelta = extractThinkingDeltaFromChoice(choice);

					// Once we observe any thinking text or an id in this batch, keep the flag true
					thinkingFound ||= !!(thinkingDelta?.text || thinkingDelta?.id);

					if (!(choice.index in this.solutions)) {
						this.solutions[choice.index] = new APIJsonDataStreaming(json.model);
					}

					const solution = this.solutions[choice.index];
					if (solution === null) {
						if (thinkingDelta) {
							await finishedCb('', choice.index, { text: '', thinking: thinkingDelta });
						}
						continue; // already finished
					}

					let finishOffset: number | undefined;

					const emitSolution = async (delta?: { vulnAnnotations?: ICodeVulnerabilityAnnotation[]; ipCodeCitations?: IIPCodeCitation[]; references?: ICopilotReference[]; toolCalls?: ICopilotToolCall[]; toolCallStreamUpdates?: ICopilotToolCallStreamUpdate[]; functionCalls?: ICopilotFunctionCall[]; errors?: ICopilotError[]; beginToolCalls?: ICopilotBeginToolCall[]; thinking?: ThinkingDelta }) => {
						if (delta?.vulnAnnotations && (!Array.isArray(delta.vulnAnnotations) || !delta.vulnAnnotations.every(a => isCopilotAnnotation(a)))) {
							delta.vulnAnnotations = undefined;
						}

						// Validate code citation annotations carefully, because the API is a work in progress
						if (delta?.ipCodeCitations && (!Array.isArray(delta.ipCodeCitations) || !delta.ipCodeCitations.every(isCodeCitationAnnotation))) {
							delta.ipCodeCitations = undefined;
						}

						finishOffset = await finishedCb(solution.text.join(''), choice.index, {
							text: solution.flush(),
							logprobs: choice.logprobs,
							codeVulnAnnotations: delta?.vulnAnnotations,
							ipCitations: delta?.ipCodeCitations,
							copilotReferences: delta?.references,
							copilotToolCalls: delta?.toolCalls,
							copilotToolCallStreamUpdates: delta?.toolCallStreamUpdates,
							_deprecatedCopilotFunctionCalls: delta?.functionCalls,
							beginToolCalls: delta?.beginToolCalls,
							copilotErrors: delta?.errors,
							thinking: thinkingDelta ?? delta?.thinking,
						});
						if (finishOffset !== undefined) {
							hadEarlyFinishedSolution = true;
						}
						return await this.maybeCancel('after awaiting finishedCb');
					};

					let handled = true;
					if (choice.delta?.tool_calls) {
						const hadExistingToolCalls = this.toolCalls.hasToolCalls();
						if (!hadExistingToolCalls) {
							const firstToolCall = choice.delta.tool_calls.at(0);
							const firstToolName = firstToolCall?.function?.name;
							if (firstToolName) {
								if (solution.text.length) {
									// Flush the linkifier stream. See #16465
									solution.append({ index: 0, delta: { content: ' ' } });
								}
								if (await emitSolution({ beginToolCalls: [{ name: firstToolName, id: firstToolCall?.id }] })) {
									continue;
								}
							}
						}
						const toolCallStreamUpdates = this.toolCalls.update(choice);
						if (toolCallStreamUpdates.length) {
							if (await emitSolution({ toolCallStreamUpdates })) {
								continue;
							}
						}
					} else if (choice.delta?.copilot_annotations?.CodeVulnerability || choice.delta?.copilot_annotations?.IPCodeCitations) {
						if (await emitSolution()) {
							continue;
						}

						if (!hadEarlyFinishedSolution) {
							solution.append(choice);
							if (await emitSolution({ vulnAnnotations: choice.delta?.copilot_annotations?.CodeVulnerability, ipCodeCitations: choice.delta?.copilot_annotations?.IPCodeCitations })) {
								continue;
							}
						}
					} else if (choice.delta?.role === 'function') {
						if (choice.delta.content) {
							try {
								const references = JSON.parse(choice.delta.content);
								if (Array.isArray(references)) {
									if (await emitSolution({ references: references })) {
										continue;
									}
								}
							} catch (ex) {
								this.logService.error(`Error parsing function references: ${JSON.stringify(ex)}`);
							}
						}
					} else if (choice.delta?.function_call && (choice.delta.function_call.name || choice.delta.function_call.arguments)) {
						allowCompletingSolution = false;
						this.functionCallName ??= choice.delta.function_call.name;
						this.functionCalls[this.functionCallName] ??= new APIJsonDataStreaming(json.model);
						const functionCall = this.functionCalls[this.functionCallName];
						functionCall!.append(choice);
					} else if ((choice.finish_reason === FinishedCompletionReason.FunctionCall || choice.finish_reason === FinishedCompletionReason.Stop) && this.functionCallName) {
						// We don't want to yield the function call until we have all the data
						const functionCallStreamObj = this.functionCalls[this.functionCallName];
						const functionCall = { name: this.functionCallName, arguments: functionCallStreamObj!.flush() };
						this.completedFunctionCallIdxs.set(choice.index, 'function');
						try {
							if (await emitSolution({ functionCalls: [functionCall] })) {
								continue;
							}
						} catch (error) {
							this.logService.error(error);
						}

						this.functionCalls[this.functionCallName] = null;
						this.functionCallName = undefined;
						if (choice.finish_reason === FinishedCompletionReason.FunctionCall) {
							// See note about the 'function_call' finish_reason below
							continue;
						}
					} else {
						handled = false;
					}

					if ((choice.finish_reason === FinishedCompletionReason.ToolCalls || choice.finish_reason === FinishedCompletionReason.Stop) && this.toolCalls.hasToolCalls()) {
						handled = true;
						const toolCalls = this.toolCalls.getToolCalls();
						this.completedFunctionCallIdxs.set(choice.index, 'tool');
						const toolId = toolCalls.length > 0 ? toolCalls[0].id : undefined;
						try {
							if (await emitSolution({ toolCalls: toolCalls, thinking: (toolId && thinkingFound) ? { metadata: { toolId } } : undefined })) {
								continue;
							}
						} catch (error) {
							this.logService.error(error);
						}
					}

					if (!handled) {
						solution.append(choice);

						// Call finishedCb to determine if the solution is now complete.
						if (await emitSolution()) {
							continue;
						}
					}

					const solutionDone = Boolean(choice.finish_reason) || finishOffset !== undefined;
					if (!solutionDone) {
						continue;
					}
					// NOTE: When there is a finish_reason the text of subsequent chunks is always '',
					// (current chunk might still have useful text, that is why we add it above).
					// So we know that we already got all the text to be displayed for the user.
					// TODO: This might contain additional logprobs for excluded next tokens. We should
					// filter out indices that correspond to excluded tokens. It will not affect the
					// text though.
					yield {
						solution,
						finishOffset,
						reason: choice.finish_reason ?? FinishedCompletionReason.ClientTrimmed,
						filterReason: choiceToFilterReason(choice),
						requestId: this.requestId,
						index: choice.index,
					};

					if (await this.maybeCancel('after yielding finished choice')) {
						return;
					}

					if (allowCompletingSolution) {
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
			yield {
				solution,
				finishOffset: undefined,
				reason: FinishedCompletionReason.ClientIterationDone,
				requestId: this.requestId,
				index: solutionIndex,
			};

			if (await this.maybeCancel('after yielding after iteration done')) {
				return;
			}
		}

		// Error message can be present in `extraData`
		//
		// When `finishedCb` decides to finish a solution early, it is possible that
		// we will have unfinished or partial JSON data in `extraData` because we
		// break out of the above for loop as soon as all solutions are finished.
		//
		// We don't want to alarm ourselves with such partial JSON data.
		if (extraData.length > 0 && !hadEarlyFinishedSolution) {
			try {
				const extraDataJson = JSON.parse(extraData);
				if (extraDataJson.error !== undefined) {
					this.logService.error(extraDataJson.error, `Error in response: ${extraDataJson.error.message}`);
					sendCommunicationErrorTelemetry(this.telemetryService, `Error in response: ${extraDataJson.error.message}`, extraDataJson.error);
				}
			} catch (e) {
				this.logService.error(`Error parsing extraData for request id ${this.requestId.headerRequestId}: ${extraData}`);
				sendCommunicationErrorTelemetry(this.telemetryService, `Error parsing extraData for request id ${this.requestId.headerRequestId}: ${extraData}`);
			}
		}
	}

	/** Yields the solutions that weren't yet finished, with a 'DONE' reason. */
	private async *finishSolutions(): AsyncIterable<FinishedCompletion> {
		for (const [index, solution] of Object.entries(this.solutions)) {
			const solutionIndex = Number(index); // Convert `index` from string to number
			if (solution === null) {
				continue; // already finished
			}
			if (this.completedFunctionCallIdxs.has(solutionIndex)) {
				yield {
					solution,
					finishOffset: undefined,
					reason: this.completedFunctionCallIdxs.get(solutionIndex) === 'function' ? FinishedCompletionReason.FunctionCall : FinishedCompletionReason.ToolCalls,
					requestId: this.requestId,
					index: solutionIndex,
				};
				continue;
			}
			yield {
				solution,
				finishOffset: undefined,
				reason: FinishedCompletionReason.ClientDone,
				requestId: this.requestId,
				index: solutionIndex,
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
			this.logService.debug('Cancelled: ' + description);
			await this.cancel();
			return true;
		}
		return false;
	}

	private async cancel() {
		await this.response.body.destroy();
	}

	private logChoice(choice: ExtendedChoiceJSON) {
		const choiceCopy: any = { ...choice };
		delete choiceCopy.index;
		delete choiceCopy.content_filter_results;
		delete choiceCopy.content_filter_offsets;
		this.logService.trace(`choice ${JSON.stringify(choiceCopy)}`);
	}
}

// data: {"choices":null,"copilot_confirmation":{"type":"action","title":"Are you sure you want to proceed?","message":"This action is irreversible.","confirmation":{"id":"123"}},"id":null}
function isCopilotConfirmation(obj: unknown): obj is ICopilotConfirmation {
	return typeof (obj as ICopilotConfirmation).title === 'string' &&
		typeof (obj as ICopilotConfirmation).message === 'string' &&
		!!(obj as ICopilotConfirmation).confirmation;
}

// Function to convert from APIJsonDataStreaming to APIJsonData format
export function convertToAPIJsonData(streamingData: APIJsonDataStreaming): APIJsonData {
	const joinedText = streamingData.text.join('');
	const out: APIJsonData = {
		text: joinedText,
		tokens: streamingData.text,
	};
	return out;
}

/**
 * Given a choice from the API call, returns the reason for filtering out the choice, or undefined if the choice should not be filtered out.
 * @param choice The choice from the API call
 * @returns The reason for filtering out the choice, or undefined if the choice should not be filtered out.
 */
function choiceToFilterReason(choice: ExtendedChoiceJSON): FilterReason | undefined {
	if (choice.finish_reason !== FinishedCompletionReason.ContentFilter) {
		return undefined;
	}

	if (choice.delta?.copilot_annotations?.TextCopyright) {
		return FilterReason.Copyright;
	}

	if (choice.delta?.copilot_annotations?.Sexual || choice.delta?.copilot_annotations?.SexualPattern) {
		return FilterReason.Sexual;
	}
	if (choice.delta?.copilot_annotations?.Violence) {
		return FilterReason.Violence;
	}

	if (choice.delta?.copilot_annotations?.HateSpeech || choice.delta?.copilot_annotations?.HateSpeechPattern) {
		return FilterReason.Hate;
	}

	if (choice.delta?.copilot_annotations?.SelfHarm) {
		return FilterReason.SelfHarm;
	}

	if (choice.delta?.copilot_annotations?.PromptPromBlockList) {
		return FilterReason.Prompt;
	}

	if (!choice.content_filter_results) {
		return undefined;
	}

	for (const filter of Object.keys(choice.content_filter_results) as Exclude<FilterReason, FilterReason.Copyright>[]) {
		if (choice.content_filter_results[filter]?.filtered) {
			return filter;
		}
	}
	return undefined;
}

export function sendCommunicationErrorTelemetry(telemetryService: ITelemetryService, message: string, extra?: any) {
	const args = [message, extra];
	const secureMessage = (args.length > 0 ? JSON.stringify(args) : 'no msg');

	const enhancedData = TelemetryData.createAndMarkAsIssued({
		context: 'fetch',
		level: LogLevel[LogLevel.Error],
		message: secureMessage,
	});

	// send full content to secure telemetry
	telemetryService.sendEnhancedGHTelemetryErrorEvent('log', enhancedData.properties, enhancedData.measurements);

	const data = TelemetryData.createAndMarkAsIssued({
		context: 'fetch',
		level: LogLevel[LogLevel.Error],
		message: '[redacted]',
	});

	// send content that excludes customer data to standard telemetry
	telemetryService.sendGHTelemetryErrorEvent(
		'log',
		data.properties,
		data.measurements
	);
}
