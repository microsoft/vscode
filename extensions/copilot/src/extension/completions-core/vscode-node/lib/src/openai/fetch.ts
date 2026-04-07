/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAuthenticationService } from '../../../../../../platform/authentication/common/authentication';
import { CopilotAnnotations, StreamCopilotAnnotations } from '../../../../../../platform/completions-core/common/openai/copilotAnnotations';
import { IEnvService } from '../../../../../../platform/env/common/envService';
import { Completion } from '../../../../../../platform/nesFetch/common/completionsAPI';
import { Completions, ICompletionsFetchService } from '../../../../../../platform/nesFetch/common/completionsFetchService';
import { ResponseStream } from '../../../../../../platform/nesFetch/common/responseStream';
import { RequestId, getRequestId } from '../../../../../../platform/networking/common/fetch';
import { IHeaders } from '../../../../../../platform/networking/common/fetcherService';
import { createServiceIdentifier } from '../../../../../../util/common/services';
import { assertNever } from '../../../../../../util/vs/base/common/assert';
import { CancellationToken } from '../../../../../../util/vs/base/common/cancellation';
import { StopWatch } from '../../../../../../util/vs/base/common/stopwatch';
import { generateUuid } from '../../../../../../util/vs/base/common/uuid';
import { IInstantiationService, ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { CancellationToken as ICancellationToken } from '../../../types/src';
import { CopilotToken, ICompletionsCopilotTokenManager } from '../auth/copilotTokenManager';
import { onCopilotToken } from '../auth/copilotTokenNotifier';
import { apiVersion, editorVersionHeaders } from '../config';
import { asyncIterableFilter, asyncIterableMap } from '../helpers/iterableHelpers';
import { ICompletionsLogTargetService, Logger } from '../logger';
import { getEndpointUrl } from '../networkConfiguration';
import { Response, isAbortError, isInterruptedNetworkError, postRequest } from '../networking';
import { ICompletionsStatusReporter } from '../progress';
import { Prompt } from '../prompt/prompt';
import { MaybeRepoInfo, tryGetGitHubNWO } from '../prompt/repository';
import {
	TelemetryData,
	TelemetryWithExp,
	logEnginePrompt,
	now,
	telemetrizePromptLength,
	telemetry,
} from '../telemetry';
import { delay } from '../util/async';
import { ICompletionsRuntimeModeService } from '../util/runtimeMode';
import { getKey } from '../util/unknown';
import {
	APIChoice,
	APIJsonData,
	getMaxSolutionTokens,
	getStops,
	getTemperatureForSamples,
	getTopP,
} from './openai';
import { SSEProcessor, prepareSolutionForReturn } from './stream';

const logger = new Logger('fetchCompletions');

export enum CopilotUiKind {
	GhostText = 'ghostText',
	Panel = 'synthesize', // legacy value from the synthesize codelens
}

type BaseFetchRequest = {
	/**
	 * The prompt prefix to send to the model.  Called `prompt` here for compatibility
	 * with the OpenAI API.
	 */
	prompt: string;
};

/**
 * Request parameters other than the prompt, which will be included in the OAI
 * API request.
 */
type CompletionFetchRequestFields = {
	/** The prompt suffix to send to the model. */
	suffix: string;
	/** Whether to stream back a response in SSE format. Always true: non streaming requests are not supported by this proxy */
	stream: true;
	/** Maximum number of tokens the model should generate. */
	max_tokens: number;
	/** How many parallel completions the model should generate (default 1). */
	n: number;
	/** Non-negative temperature sampling parameter (default 1). */
	temperature: number;
	/** Non-negative nucleus sampling parameter (defaults 1). */
	top_p: number;
	/** Strings that will cause the model to stop generating text. */
	stop: string[];
	/** Number of alternative tokens to include logprob data for. */
	logprobs?: number;
	/** Likelihood of specified tokens appearing in the completion. */
	logit_bias?: { [key: string]: number };

	/** Copilot-only: NWO of repository, if any */
	nwo?: string;
	/**
	 * Controls whether code citation annotations are included in the response
	 * stream for non-blocking requests.
	 */
	code_annotations?: boolean;
};

/** OAI API completion request, along with additional fields specific to Copilot. */
export type CompletionRequest = BaseFetchRequest &
	CompletionFetchRequestFields & {
		/** Copilot-only: extra arguments for completion processing. */
		extra: Partial<CompletionRequestExtra>;
	};

/**
 * Completion request arguments that are Copilot-specific and don't exist in
 * the OAI API.
 */
export declare interface CompletionRequestExtra {
	/** The VSCode language ID for the file. */
	language: string;
	/**
	 * If true, the proxy will trim completions to the current block/line based
	 * on the force_indent and/or next_indent values.
	 */
	trim_by_indentation?: boolean;
	/**
	 * If set, will let the completion go on until a (non-continuation) line
	 * comes through with the given indentation level.
	 */
	force_indent?: number;
	/** Number of leading space or tab characters in the next non-empty line. */
	next_indent?: number;
	/**
	 * For testing only: A list of completions to be used instead of calling the
	 * model. The server will act as if the model returned these completions and
	 * postprocess them as it normally postprocesses model responses (i.e.
	 * filtering, trimming, etc.).
	 */
	test_completions?: string[];
	/**
	 The number of tokens (prefix)
	 */
	prompt_tokens: number;
	/**
	 The number of tokens (suffix)
	 */
	suffix_tokens: number;
	/** Additional context to send to the model.
	 * If this field is populated, then `prefix` will only contain the document prefix before the cursor.*/
	context?: string[];
}

export type PostOptions = Partial<CompletionFetchRequestFields>;

// Request helpers

function getProcessingTime(responseHeaders: IHeaders): number {
	const reqIdStr = responseHeaders.get('openai-processing-ms');
	if (reqIdStr) {
		return parseInt(reqIdStr, 10);
	}
	return 0;
}

function uiKindToIntent(uiKind: CopilotUiKind): string | undefined {
	switch (uiKind) {
		case CopilotUiKind.GhostText:
			return 'copilot-ghost';
		case CopilotUiKind.Panel:
			return 'copilot-panel';
	}
}

// Request methods

export interface CopilotError {
	type: string;
	code: string;
	message: string;
	identifier: string;
}

export interface CopilotConfirmation {
	type: string;
	title: string;
	message: string;
	confirmation: Record<string, unknown>;
}

export interface CopilotReference {
	type: string;
	id: string;
	data: Record<string, unknown>;
}

export interface RequestDelta {
	text: string;
	index?: number;
	requestId?: RequestId;
	annotations?: CopilotAnnotations;
	copilotErrors?: CopilotError[];
	copilotConfirmation?: CopilotConfirmation;
	copilotReferences?: CopilotReference[];
	getAPIJsonData?: () => APIJsonData;
	finished?: boolean;
	telemetryData?: TelemetryWithExp;
}

export interface SolutionDecision {
	yieldSolution: boolean;
	continueStreaming: boolean;
	finishOffset?: number;
}

type FinishedCallbackResult =
	| Promise<SolutionDecision | number | undefined>
	| SolutionDecision
	| number
	| undefined;

/**
 * Takes a (part of a) completion resolves to the offset of the end of the
 * block, or undefined if the block is not yet finished.
 */
export interface FinishedCallback {
	(text: string, delta: RequestDelta): FinishedCallbackResult;
}

interface InternalFetchParams {
	prompt: Prompt;
	engineModelId: string;
	uiKind: CopilotUiKind;
	ourRequestId: string;
	headers?: CompletionHeaders;
}

/**
 * Interface for the parameters passed to `fetchAndStreamCompletions` and `fetchWithParameters` wrappers,
 * which then turn them into a `CompletionRequest` to be sent with `fetchWithInstrumentation`.
 */
export interface CompletionParams extends InternalFetchParams {
	repoInfo: MaybeRepoInfo;
	languageId: string;
	count: number;
	requestLogProbs?: boolean;
	postOptions?: PostOptions;
	extra: Partial<CompletionRequestExtra>;
}

/**
 * Interface for the parameters passed to `fetchSpeculationWithParameters`,
 * which then turns them into a `SpeculationCompletionRequest` object to be sent with `fetchWithInstrumentation`.
 */
export interface SpeculationFetchParams extends InternalFetchParams {
	speculation: string;
	stops: string[] | null;
}

export const ICompletionsOpenAIFetcherService = createServiceIdentifier<ICompletionsOpenAIFetcherService>('ICompletionsOpenAIFetcherService');
export interface ICompletionsOpenAIFetcherService {
	readonly _serviceBrand: undefined;
	fetchAndStreamCompletions(
		params: CompletionParams,
		baseTelemetryData: TelemetryWithExp,
		finishedCb: FinishedCallback,
		cancellationToken?: ICancellationToken
	): Promise<CompletionResults | CompletionError>;
	fetchAndStreamCompletions2(
		params: CompletionParams,
		baseTelemetryData: TelemetryWithExp,
		finishedCb: FinishedCallback,
		cancellationToken?: ICancellationToken
	): Promise<CompletionResults | CompletionError>;
}

/** An interface to abstract away the network request to OpenAI, allowing for
 * fake or mock implementations. It's deliberately injected relatively high
 * in the call stack to avoid having to reconstruct some of the lower-level details
 * of the OpenAI API.
 */
export abstract class OpenAIFetcher implements ICompletionsOpenAIFetcherService {
	declare _serviceBrand: undefined;
	/**
	 * Sends a request to the code completion endpoint.
	 */
	abstract fetchAndStreamCompletions(
		params: CompletionParams,
		baseTelemetryData: TelemetryWithExp,
		finishedCb: FinishedCallback,
		cancellationToken?: ICancellationToken
	): Promise<CompletionResults | CompletionError>;
	abstract fetchAndStreamCompletions2(
		params: CompletionParams,
		baseTelemetryData: TelemetryWithExp,
		finishedCb: FinishedCallback,
		cancellationToken?: ICancellationToken
	): Promise<CompletionResults | CompletionError>;
}

export interface CompletionResults {
	type: 'success';
	choices: AsyncIterable<APIChoice>;
	getProcessingTime(): number;
}

export type CompletionError = { type: 'failed'; reason: string } | { type: 'canceled'; reason: string };

export type CompletionHeaders = {
	/** For speculation only**/
	Host?: string;
	Connection?: string;
	'X-Copilot-Async'?: string;
	'X-Copilot-Speculative'?: string;
};

function getProxyEngineUrl(accessor: ServicesAccessor, token: CopilotToken, modelId: string, endpoint: string): string {
	return getEndpointUrl(accessor, token, 'proxy', 'v1/engines', modelId, endpoint);
}

export function sanitizeRequestOptionTelemetry(
	request: Partial<CompletionRequest>,
	telemetryData: TelemetryWithExp,
	topLevelKeys: string[], // top-level properties to exclude from standard telemetry
	extraKeys?: (keyof CompletionRequestExtra)[] // keys under the `extra` property to exclude from standard telemetry
): void {
	for (const [key, value] of Object.entries(request)) {
		if (topLevelKeys.includes(key)) {
			continue;
		}

		let valueToLog = value as unknown;

		if (key === 'extra' && extraKeys) {
			const extra = { ...(valueToLog as CompletionRequestExtra) };
			for (const extraKey of extraKeys) {
				delete extra[extraKey];
			}
			valueToLog = extra;
		}

		telemetryData.properties[`request.option.${key}`] = JSON.stringify(valueToLog) ?? 'undefined';
	}
}

async function fetchWithInstrumentation(
	accessor: ServicesAccessor,
	prompt: Prompt,
	engineModelId: string,
	endpoint: string,
	ourRequestId: string,
	request: Record<string, unknown>,
	copilotToken: CopilotToken,
	uiKind: CopilotUiKind,
	telemetryExp: TelemetryWithExp,
	cancel?: ICancellationToken,
	headers?: CompletionHeaders
): Promise<Response> {
	const instantiationService = accessor.get(IInstantiationService);
	const logTarget = accessor.get(ICompletionsLogTargetService);
	const statusReporter = accessor.get(ICompletionsStatusReporter);
	const uri = instantiationService.invokeFunction(getProxyEngineUrl, copilotToken, engineModelId, endpoint);

	const telemetryData = telemetryExp.extendedBy(
		{
			endpoint: endpoint,
			engineName: engineModelId,
			uiKind: uiKind,
		},
		telemetrizePromptLength(prompt)
	);

	// Skip prompt info (PII)
	sanitizeRequestOptionTelemetry(request, telemetryData, ['prompt', 'suffix'], ['context']);

	// The request ID we are passed in is sent in the request to the proxy, and included in our pre-request telemetry.
	// We hope (but do not rely on) that the model will use the same ID in the response, allowing us to correlate
	// the request and response.
	telemetryData.properties['headerRequestId'] = ourRequestId;

	instantiationService.invokeFunction(telemetry, 'request.sent', telemetryData);

	const requestStart = now();
	const intent = uiKindToIntent(uiKind);

	// Wrap the Promise with success/error callbacks so we can log/measure it
	return instantiationService.invokeFunction(postRequest, uri, copilotToken.token, intent, ourRequestId, request, cancel, headers)
		.then(response => {
			// This ID is hopefully the one the same as ourRequestId, but it is not guaranteed.
			// If they are different then we will override the original one we set in telemetryData above.
			const modelRequestId = getRequestId(response.headers);
			telemetryData.extendWithRequestId(modelRequestId);

			// TODO: Add response length (requires parsing)
			const totalTimeMs = now() - requestStart;
			telemetryData.measurements.totalTimeMs = totalTimeMs;

			logger.info(
				logTarget,
				`Request ${ourRequestId} at <${uri}> finished with ${response.status} status after ${totalTimeMs}ms`
			);
			telemetryData.properties.status = String(response.status);
			logger.debug(logTarget, 'request.response properties', telemetryData.properties);
			logger.debug(logTarget, 'request.response measurements', telemetryData.measurements);

			logger.debug(logTarget, 'prompt:', prompt);

			instantiationService.invokeFunction(telemetry, 'request.response', telemetryData);

			return response;
		})
		.catch((error: unknown) => {
			if (isAbortError(error)) {
				// If we cancelled a network request, we want to log a `request.cancel` instead of `request.error`
				instantiationService.invokeFunction(telemetry, 'request.cancel', telemetryData);
				throw error;
			}
			statusReporter.setWarning(getKey(error, 'message') ?? '');
			const warningTelemetry = telemetryData.extendedBy({ error: 'Network exception' });
			instantiationService.invokeFunction(telemetry, 'request.shownWarning', warningTelemetry);

			telemetryData.properties.message = String(getKey(error, 'name') ?? '');
			telemetryData.properties.code = String(getKey(error, 'code') ?? '');
			telemetryData.properties.errno = String(getKey(error, 'errno') ?? '');
			telemetryData.properties.type = String(getKey(error, 'type') ?? '');

			const totalTimeMs = now() - requestStart;
			telemetryData.measurements.totalTimeMs = totalTimeMs;

			logger.info(
				logTarget,
				`Request ${ourRequestId} at <${uri}> rejected with ${String(error)} after ${totalTimeMs}ms`
			);
			logger.debug(logTarget, 'request.error properties', telemetryData.properties);
			logger.debug(logTarget, 'request.error measurements', telemetryData.measurements);

			instantiationService.invokeFunction(telemetry, 'request.error', telemetryData);

			throw error;
		})
		.finally(() => {
			instantiationService.invokeFunction(logEnginePrompt, prompt, telemetryData);
		});
}

export function postProcessChoices(choices: AsyncIterable<APIChoice>) {
	return asyncIterableFilter(choices, choice => choice.completionText.trim().length > 0);
}

export const CMDQuotaExceeded = 'github.copilot.completions.quotaExceeded';

export class LiveOpenAIFetcher extends OpenAIFetcher {
	#disabledReason: string | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICompletionsRuntimeModeService private readonly runtimeModeService: ICompletionsRuntimeModeService,
		@ICompletionsLogTargetService private readonly logTargetService: ICompletionsLogTargetService,
		@ICompletionsCopilotTokenManager private readonly copilotTokenManager: ICompletionsCopilotTokenManager,
		@ICompletionsStatusReporter private readonly statusReporter: ICompletionsStatusReporter,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@ICompletionsFetchService private readonly fetchService: ICompletionsFetchService,
		// @ICompletionsLogTargetService private readonly logTarget: ICompletionsLogTargetService,
		@IEnvService private readonly envService: IEnvService,
	) {
		super();
	}

	async fetchAndStreamCompletions(
		params: CompletionParams,
		baseTelemetryData: TelemetryWithExp,
		finishedCb: FinishedCallback,
		cancel?: ICancellationToken
	): Promise<CompletionResults | CompletionError> {
		if (this.#disabledReason) {
			return { type: 'canceled', reason: this.#disabledReason };
		}
		const endpoint = 'completions';
		const copilotToken = this.copilotTokenManager.token ?? await this.copilotTokenManager.getToken();
		const response = await this.fetchWithParameters(endpoint, params, copilotToken, baseTelemetryData, cancel);
		if (response === 'not-sent') {
			return { type: 'canceled', reason: 'before fetch request' };
		}
		if (cancel?.isCancellationRequested) {
			try {
				// Destroy the stream so that the server is hopefully notified we don't want any more data
				// and can cancel/forget about the request itself.
				await response.body.destroy();
			} catch (e) {
				this.instantiationService.invokeFunction(acc => logger.exception(acc, e, `Error destroying stream`));
			}
			return { type: 'canceled', reason: 'after fetch request' };
		}

		if (response.status !== 200) {
			const telemetryData = this.createTelemetryData(endpoint, params);
			return this.handleError(this.statusReporter, telemetryData, response, copilotToken);
		}
		const processor = await this.instantiationService.invokeFunction(SSEProcessor.create, params.count, response, baseTelemetryData, [], cancel);
		const finishedCompletions = processor.processSSE(finishedCb);
		const choices = asyncIterableMap(finishedCompletions, solution =>
			this.instantiationService.invokeFunction(prepareSolutionForReturn, solution, baseTelemetryData)
		);
		return {
			type: 'success',
			choices: postProcessChoices(choices),
			getProcessingTime: () => getProcessingTime(response.headers),
		};
	}

	async fetchAndStreamCompletions2(
		params: CompletionParams,
		baseTelemetryData: TelemetryWithExp,
		finishedCb: FinishedCallback,
		cancel: CancellationToken
	): Promise<CompletionResults | CompletionError> {
		if (this.#disabledReason) {
			return { type: 'canceled', reason: this.#disabledReason };
		}
		const endpoint = 'completions';
		const copilotToken = this.copilotTokenManager.token ?? await this.copilotTokenManager.getToken();

		// fetchWithParameters - start
		const request: CompletionRequest = {
			prompt: params.prompt.prefix,
			suffix: params.prompt.suffix,
			max_tokens: getMaxSolutionTokens(),
			temperature: getTemperatureForSamples(this.runtimeModeService, params.count),
			top_p: getTopP(),
			n: params.count,
			stop: getStops(params.languageId),
			stream: true, // Always true: non streaming requests are not supported by this proxy
			extra: params.extra,
		} satisfies CompletionRequest;

		{

			if (params.requestLogProbs) {
				request.logprobs = 2; // Request that logprobs of 2 tokens (i.e. including the best alternative) be returned
			}

			const githubNWO = tryGetGitHubNWO(params.repoInfo);
			if (githubNWO !== undefined) {
				request.nwo = githubNWO;
			}

			if (params.postOptions) {
				Object.assign(request, params.postOptions);
			}

			if (params.prompt.context && params.prompt.context.length > 0) {
				request.extra.context = params.prompt.context;
			}

			// Give a final opportunity to cancel the request before we send the request
			// This await line is necessary to allow the tests in extension/src/openai.test.ts to pass
			await delay(0);
			if (cancel?.isCancellationRequested) {
				// return 'not-sent';
				return { type: 'canceled', reason: 'before fetch request' };
			}
		}
		// fetchWithParameters - end

		// fetchWithInstrumentation - start
		{
			const prompt = params.prompt;
			const engineModelId = params.engineModelId;
			const ourRequestId = params.ourRequestId;
			const telemetryExp = baseTelemetryData;
			const uiKind = params.uiKind;
			const headers = params.headers;
			// const logTarget = this.logTarget;

			const uri = this.instantiationService.invokeFunction(getProxyEngineUrl, copilotToken, engineModelId, endpoint);

			const telemetryData = telemetryExp.extendedBy(
				{
					endpoint: endpoint,
					engineName: engineModelId,
					uiKind: uiKind,
				},
				telemetrizePromptLength(prompt)
			);

			// Skip prompt info (PII)
			sanitizeRequestOptionTelemetry(request, telemetryData, ['prompt', 'suffix'], ['context']);

			// The request ID we are passed in is sent in the request to the proxy, and included in our pre-request telemetry.
			// We hope (but do not rely on) that the model will use the same ID in the response, allowing us to correlate
			// the request and response.
			telemetryData.properties['headerRequestId'] = ourRequestId;

			this.instantiationService.invokeFunction(telemetry, 'request.sent', telemetryData);

			// const requestStart = now();
			const intent = uiKindToIntent(uiKind);

			// Wrap the Promise with success/error callbacks so we can log/measure it
			// return this.instantiationService.invokeFunction(postRequest, uri, copilotToken.token, intent, ourRequestId, request, cancel, headers)

			let fullHeaders: Record<string, string>;

			// postRequest - start
			{
				fullHeaders = {
					...headers,
					...this.instantiationService.invokeFunction(editorVersionHeaders),
				};

				// If we call byok endpoint, no need to add these headers
				// if (modelProviderName === undefined) {
				fullHeaders['Openai-Organization'] = 'github-copilot';
				fullHeaders['X-Request-Id'] = ourRequestId;
				fullHeaders['VScode-SessionId'] = this.envService.sessionId;
				fullHeaders['VScode-MachineId'] = this.envService.machineId;
				fullHeaders['X-GitHub-Api-Version'] = apiVersion;
				// }

				if (intent) {
					fullHeaders['OpenAI-Intent'] = intent;
				}
			}
			// postRequest - end

			const requestSw = new StopWatch();
			const res = await this.fetchService.fetch(
				uri,
				copilotToken.token,
				request,
				ourRequestId,
				cancel,
				fullHeaders,
			).then(response => {
				if (response.isError() && response.err instanceof Completions.Unexpected && isInterruptedNetworkError(response.err.error)) {
					// disconnect and retry the request once if the connection was reset
					this.instantiationService.invokeFunction(telemetry, 'networking.disconnectAll');
					return this.fetchService.disconnectAll().then(() => {
						return this.fetchService.fetch(
							uri,
							copilotToken.token,
							request,
							ourRequestId,
							cancel,
							fullHeaders,
						);
					});
				} else {
					return response;
				}
			});

			try {

				if (res.isError()) {

					const err = res.err;

					if (err instanceof Completions.RequestCancelled) {
						// abort the request when the token is canceled
						this.instantiationService.invokeFunction(telemetry,
							'networking.cancelRequest',
							TelemetryData.createAndMarkAsIssued({ headerRequestId: ourRequestId })
						);
						this.instantiationService.invokeFunction(telemetry, 'request.cancel', telemetryData);
						return { type: 'canceled', reason: 'during fetch request' };
					} else if (err instanceof Completions.UnsuccessfulResponse) {
						// Emit request.response for non-200 responses, matching fetchWithInstrumentation's .then()
						// which fires for all HTTP responses including error status codes
						const modelRequestId = getRequestId(err.headers);
						telemetryData.extendWithRequestId(modelRequestId);
						const totalTimeMs = requestSw.elapsed();
						telemetryData.measurements.totalTimeMs = totalTimeMs;
						telemetryData.properties.status = String(err.status);
						logger.info(
							this.logTargetService,
							`Request ${ourRequestId} at <${uri}> finished with ${err.status} status after ${totalTimeMs}ms`
						);
						logger.debug(this.logTargetService, 'request.response properties', telemetryData.properties);
						logger.debug(this.logTargetService, 'request.response measurements', telemetryData.measurements);
						logger.debug(this.logTargetService, 'prompt:', prompt);
						this.instantiationService.invokeFunction(telemetry, 'request.response', telemetryData);

						return this.handleError(this.statusReporter, telemetryData, {
							status: err.status,
							text: err.text,
							headers: err.headers,
						}, copilotToken);
					} else if (err instanceof Completions.Unexpected) {

						const error = err.error;

						// .catch from fetchWithInstrumentation
						if (isAbortError(error)) {
							// If we cancelled a network request, we want to log a `request.cancel` instead of `request.error`
							this.instantiationService.invokeFunction(telemetry, 'request.cancel', telemetryData);
							throw error;
						}
						this.statusReporter.setWarning(getKey(error, 'message') ?? '');
						const warningTelemetry = telemetryData.extendedBy({ error: 'Network exception' });
						this.instantiationService.invokeFunction(telemetry, 'request.shownWarning', warningTelemetry);

						telemetryData.properties.message = String(getKey(error, 'name') ?? '');
						telemetryData.properties.code = String(getKey(error, 'code') ?? '');
						telemetryData.properties.errno = String(getKey(error, 'errno') ?? '');
						telemetryData.properties.type = String(getKey(error, 'type') ?? '');

						const totalTimeMs = requestSw.elapsed();
						telemetryData.measurements.totalTimeMs = totalTimeMs;

						logger.info(
							this.logTargetService,
							`Request ${ourRequestId} at <${uri}> rejected with ${String(error)} after ${totalTimeMs}ms`
						);
						logger.debug(this.logTargetService, 'request.error properties', telemetryData.properties);
						logger.debug(this.logTargetService, 'request.error measurements', telemetryData.measurements);

						this.instantiationService.invokeFunction(telemetry, 'request.error', telemetryData);

						throw error;
					} else {
						assertNever(err);
					}
				}

				const responseStream = res.val;

				// .then from fetchWithInstrumentation
				{
					// This ID is hopefully the one the same as ourRequestId, but it is not guaranteed.
					// If they are different then we will override the original one we set in telemetryData above.
					const modelRequestId = responseStream.requestId;
					telemetryData.extendWithRequestId(modelRequestId);

					// TODO: Add response length (requires parsing)
					const totalTimeMs = requestSw.elapsed();
					telemetryData.measurements.totalTimeMs = totalTimeMs;

					const responseStatus = 200; // because otherwise it wouldn't be here
					logger.info(
						this.logTargetService,
						`Request ${ourRequestId} at <${uri}> finished with ${responseStatus} status after ${totalTimeMs}ms`
					);
					telemetryData.properties.status = String(responseStatus);
					logger.debug(this.logTargetService, 'request.response properties', telemetryData.properties);
					logger.debug(this.logTargetService, 'request.response measurements', telemetryData.measurements);

					logger.debug(this.logTargetService, 'prompt:', prompt);

					this.instantiationService.invokeFunction(telemetry, 'request.response', telemetryData);

				}

				if (cancel.isCancellationRequested) {
					try {
						// Destroy the stream so that the server is hopefully notified we don't want any more data
						// and can cancel/forget about the request itself.
						await responseStream.destroy();
					} catch (e) {
						this.instantiationService.invokeFunction(acc => logger.exception(acc, e, `Error destroying stream`));
					}
					return { type: 'canceled', reason: 'after fetch request' };
				}

				const choices = LiveOpenAIFetcher.convertStreamToApiChoices(responseStream, finishedCb, baseTelemetryData, cancel);

				return {
					type: 'success',
					choices: postProcessChoices(choices),
					getProcessingTime: () => getProcessingTime(responseStream.headers),
				};

			} finally {
				// Matches .finally() from fetchWithInstrumentation — always log engine prompt
				this.instantiationService.invokeFunction(logEnginePrompt, prompt, telemetryData);
			}
		}
	}

	private createTelemetryData(endpoint: string, params: CompletionParams | SpeculationFetchParams) {
		return TelemetryData.createAndMarkAsIssued({
			endpoint: endpoint,
			engineName: params.engineModelId,
			uiKind: params.uiKind,
			headerRequestId: params.ourRequestId,
		});
	}

	protected async fetchWithParameters(
		endpoint: string,
		params: CompletionParams,
		copilotToken: CopilotToken,
		baseTelemetryData: TelemetryWithExp,
		cancel?: ICancellationToken
	): Promise<Response | 'not-sent'> {

		const request: CompletionRequest = {
			prompt: params.prompt.prefix,
			suffix: params.prompt.suffix,
			max_tokens: getMaxSolutionTokens(),
			temperature: getTemperatureForSamples(this.runtimeModeService, params.count),
			top_p: getTopP(),
			n: params.count,
			stop: getStops(params.languageId),
			stream: true, // Always true: non streaming requests are not supported by this proxy
			extra: params.extra,
		};

		if (params.requestLogProbs) {
			request.logprobs = 2; // Request that logprobs of 2 tokens (i.e. including the best alternative) be returned
		}

		const githubNWO = tryGetGitHubNWO(params.repoInfo);
		if (githubNWO !== undefined) {
			request.nwo = githubNWO;
		}

		if (params.postOptions) {
			Object.assign(request, params.postOptions);
		}

		if (params.prompt.context && params.prompt.context.length > 0) {
			request.extra.context = params.prompt.context;
		}

		// Give a final opportunity to cancel the request before we send the request
		// This await line is necessary to allow the tests in extension/src/openai.test.ts to pass
		await delay(0);
		if (cancel?.isCancellationRequested) {
			return 'not-sent';
		}

		const response = await this.instantiationService.invokeFunction(
			fetchWithInstrumentation,
			params.prompt,
			params.engineModelId,
			endpoint,
			params.ourRequestId,
			request,
			copilotToken,
			params.uiKind,
			baseTelemetryData,
			cancel,
			params.headers
		);
		return response;
	}

	/**
	 * @remarks exposed only for testing.
	 */
	public static async *convertStreamToApiChoices(resp: ResponseStream, finishedCb: FinishedCallback, baseTelemetryData: TelemetryWithExp, cancel?: CancellationToken): AsyncIterable<APIChoice> {

		const createAPIChoice = (
			choiceIndex: number,
			completionText: string,
			finishReason: string,
			accumulator: CompletionAccumulator,
			blockFinished: boolean
		): APIChoice => ({
			choiceIndex,
			completionText,
			requestId: resp.requestId,
			finishReason,
			tokens: accumulator.chunks,
			numTokens: accumulator.chunks.length,
			blockFinished,
			telemetryData: baseTelemetryData,
			clientCompletionId: generateUuid(),
			meanLogProb: undefined,
			meanAlternativeLogProb: undefined,
		});

		const completions: { accumulator: CompletionAccumulator; isFinished: boolean; yielded: boolean }[] = [];

		try {
			for await (const chunk of resp.stream) {
				if (cancel?.isCancellationRequested) {
					return;
				}

				for (let i = 0; i < chunk.choices.length; i++) {
					const chunkIdx = chunk.choices[i].index;
					let completion = completions[chunkIdx];
					if (completion === undefined) {
						completion = { accumulator: new CompletionAccumulator(), isFinished: false, yielded: false };
						completions[chunkIdx] = completion;
					} else if (completion.isFinished) {
						// already finished, skip
						continue;
					}
					const choice = chunk.choices[i];
					completion.accumulator.append(choice);

					// finish_reason determines whether the completion is finished by the LLM
					const hasFinishReason = !!(chunk.choices[i].finish_reason);

					// Only call finishedCb when there's a newline or finish_reason, matching SSEProcessor behavior.
					// This optimization avoids calling finishedCb on every chunk which can be expensive.
					const chunkText = choice.text ?? '';
					const hasNewLine = chunkText.indexOf('\n') > -1;

					let solutionDecision: SolutionDecision | number | undefined;
					if (hasFinishReason || hasNewLine) {
						// call finishedCb to determine whether the completion is finished by the client
						solutionDecision = await finishedCb(completion.accumulator.responseSoFar, {
							index: chunkIdx,
							text: completion.accumulator.responseSoFar,
							finished: hasFinishReason,
							requestId: resp.requestId,
							telemetryData: baseTelemetryData,
							annotations: completion.accumulator.annotations,
							getAPIJsonData: () => ({
								text: completion.accumulator.responseSoFar,
								tokens: completion.accumulator.chunks,
								finish_reason: completion.accumulator.finishReason ?? 'stop', // @ulugbekna: logic to determine if last completion was accepted uses finish reason, so changing this `?? 'stop'` will change behavior of multiline completions
								copilot_annotations: completion.accumulator.annotations.current,
							} satisfies APIJsonData),
						} satisfies RequestDelta);

						if (cancel?.isCancellationRequested) {
							return;
						}
					}

					// Determine whether to yield based on finish_reason or callback decision.
					// When finish_reason is present, force yield & stop streaming (matching SSEProcessor).
					if (hasFinishReason) {
						if (solutionDecision === undefined || typeof solutionDecision !== 'object') {
							solutionDecision = { yieldSolution: true, continueStreaming: false };
						} else {
							solutionDecision.yieldSolution = true;
							solutionDecision.continueStreaming = false;
						}
					}

					if (solutionDecision !== undefined &&
						(typeof solutionDecision === 'number' || solutionDecision.yieldSolution)
					) {
						// mark as finished
						const isFinished = hasFinishReason || typeof solutionDecision === 'number' || (solutionDecision !== undefined && !solutionDecision.continueStreaming);
						completion.isFinished = isFinished;

						const finishReason = chunk.choices[i].finish_reason;
						if (finishReason) {
							completion.accumulator.finishReason = finishReason;
						}

						const finishOffset = typeof solutionDecision === 'number'
							? solutionDecision
							: (solutionDecision && solutionDecision.finishOffset !== undefined
								? solutionDecision.finishOffset
								: undefined);
						const completionText = finishOffset === undefined
							? completion.accumulator.responseSoFar
							: completion.accumulator.responseSoFar.slice(0, finishOffset);

						// Guard against double-yielding the same choice, matching
						// SSEProcessor's `solution.yielded` flag. Without this,
						// StreamedCompletionSplitter can yield the first segment
						// (via yieldSolution+continueStreaming), and then
						// finish_reason forces a second yield of the full text,
						// which ends up cached as a spurious ghost text suggestion.
						if (!completion.yielded) {
							completion.yielded = true;
							const apiChoice = createAPIChoice(
								chunkIdx,
								completionText,
								completion.accumulator.finishReason ?? 'stop',
								completion.accumulator,
								finishOffset !== undefined,
							);
							yield apiChoice;
						}

						if (cancel?.isCancellationRequested) {
							return;
						}
					}
				}
			}

			// When the stream ends, call finishedCb with finished=true for any
			// completions that weren't individually finished. This matches
			// SSEProcessor.finishSolutions which gives the callback a final
			// chance to process / trim the complete text (e.g. StreamedCompletionSplitter.trimAll).
			for (const [chunkIdx, completion] of completions.entries()) {
				if (!completion.isFinished) {
					await finishedCb(completion.accumulator.responseSoFar, {
						index: chunkIdx,
						text: completion.accumulator.responseSoFar,
						finished: true,
						requestId: resp.requestId,
						telemetryData: baseTelemetryData,
						annotations: completion.accumulator.annotations,
						getAPIJsonData: () => ({
							text: completion.accumulator.responseSoFar,
							tokens: completion.accumulator.chunks,
							finish_reason: completion.accumulator.finishReason ?? 'stop',
							copilot_annotations: completion.accumulator.annotations.current,
						} satisfies APIJsonData),
					} satisfies RequestDelta);

					if (cancel?.isCancellationRequested) {
						return;
					}

					// Skip if already yielded (matches SSEProcessor.finishSolutions)
					if (completion.yielded) {
						continue;
					}
					completion.yielded = true;

					const apiChoice = createAPIChoice(
						chunkIdx,
						completion.accumulator.responseSoFar,
						completion.accumulator.finishReason ?? 'stop', // Matches original SSEProcessor behavior: convertToAPIJsonData defaults to 'stop'
						completion.accumulator,
						false
					);
					yield apiChoice;

					if (cancel?.isCancellationRequested) {
						return;
					}
				}
			}
		} finally {
			// Destroy the network stream so the server is notified to stop sending data,
			// matching SSEProcessor's finally block behavior in processSSE.
			try {
				await resp.destroy();
			} catch {
				// ignore destroy errors
			}
		}
	}

	async handleError(
		statusReporter: ICompletionsStatusReporter,
		telemetryData: TelemetryData,
		response: { status: number; text(): Promise<string>; headers: IHeaders },
		copilotToken: CopilotToken
	): Promise<CompletionError> {
		const text = await response.text();
		if (response.status === 402) {
			this.#disabledReason = 'monthly free code completions exhausted';
			const message = 'Completions limit reached';
			statusReporter.setError(message, {
				command: CMDQuotaExceeded,
				title: 'Learn More',
			});
			const event = onCopilotToken(this.authenticationService, t => {
				this.#disabledReason = undefined;
				if (!t.isCompletionsQuotaExceeded) {
					statusReporter.forceNormal();
					event.dispose();
				}
			});
			return { type: 'failed', reason: this.#disabledReason };
		}
		if (response.status === 466) {
			statusReporter.setError(text);
			logger.info(this.logTargetService, text);
			return { type: 'failed', reason: `client not supported: ${text}` };
		}
		if (isClientError(response) && !response.headers.get('x-github-request-id')) {
			const message = `Last response was a ${response.status} error and does not appear to originate from GitHub. Is a proxy or firewall intercepting this request? https://gh.io/copilot-firewall`;
			logger.error(this.logTargetService, message);
			statusReporter.setWarning(message);
			telemetryData.properties.error = `Response status was ${response.status} with no x-github-request-id header`;
		} else if (isClientError(response)) {
			logger.warn(this.logTargetService, `Response status was ${response.status}:`, text);
			statusReporter.setWarning(`Last response was a ${response.status} error: ${text}`);
			telemetryData.properties.error = `Response status was ${response.status}: ${text}`;
		} else {
			statusReporter.setWarning(`Last response was a ${response.status} error`);
			telemetryData.properties.error = `Response status was ${response.status}`;
		}
		telemetryData.properties.status = String(response.status);
		this.instantiationService.invokeFunction(telemetry, 'request.shownWarning', telemetryData);
		// check for 4xx responses which will point to a forbidden
		if (response.status === 401 || response.status === 403) {
			// Token has expired or invalid, fetch a new one on next request
			// TODO(drifkin): these actions should probably happen in vsc specific code
			this.copilotTokenManager.resetToken(response.status);
			return { type: 'failed', reason: `token expired or invalid: ${response.status}` };
		}
		if (response.status === 429) {
			const rateLimitSeconds = 10;
			setTimeout(() => {
				this.#disabledReason = undefined;
			}, rateLimitSeconds * 1000);
			this.#disabledReason = 'rate limited';
			logger.warn(this.logTargetService, `Rate limited by server. Denying completions for the next ${rateLimitSeconds} seconds.`);
			return { type: 'failed', reason: this.#disabledReason };
		}
		if (response.status === 499) {
			logger.info(this.logTargetService, 'Cancelled by server');
			return { type: 'failed', reason: 'canceled by server' };
		}
		logger.error(this.logTargetService, 'Unhandled status from server:', response.status, text);
		return { type: 'failed', reason: `unhandled status from server: ${response.status} ${text}` };
	}
}

function isClientError(response: { status: number }): boolean {
	return response.status >= 400 && response.status < 500;
}

class CompletionAccumulator {

	private _chunks: string[] = [];
	/** concatenated version of {_chunks} */
	private _responseSoFar: string = '';

	private _finishReason: string | null = null;

	public readonly annotations: CopilotAnnotations = new StreamCopilotAnnotations();

	public get responseSoFar(): string {
		return this._responseSoFar;
	}

	public get chunks(): readonly string[] {
		return this._chunks;
	}

	public set finishReason(value: string) {
		this._finishReason = value;
	}
	public get finishReason(): string | null {
		return this._finishReason;
	}

	public append(choice: Completion.Choice): void {
		const chunk = choice.text;
		if (chunk) {
			this._chunks.push(chunk);
			this._responseSoFar = this._responseSoFar + chunk;
		}

		if (choice.copilot_annotations) {
			this.annotations.update(choice.copilot_annotations);
		}
	}
}
