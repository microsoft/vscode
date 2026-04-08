/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken as ICancellationToken } from 'vscode-languageserver-protocol';
import { ConfigKey as ChatConfigKey, IConfigurationService } from '../../../../../../platform/configuration/common/configurationService';
import { NoNextEditReason, StatelessNextEditTelemetryBuilder } from '../../../../../../platform/inlineEdits/common/statelessNextEditProvider';
import { IExperimentationService } from '../../../../../../platform/telemetry/common/nullExperimentationService';
import { ErrorUtils } from '../../../../../../util/common/errors';
import { Result } from '../../../../../../util/common/result';
import { assertNever } from '../../../../../../util/vs/base/common/assert';
import { StringText } from '../../../../../../util/vs/editor/common/core/text/abstractText';
import { IInstantiationService, ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { LlmNESTelemetryBuilder } from '../../../../../inlineEdits/node/nextEditProviderTelemetry';
import { BlockMode, shouldDoServerTrimming } from '../config';
import { ICompletionsUserErrorNotifierService } from '../error/userErrorNotifier';
import { ICompletionsFeaturesService } from '../experiments/featuresService';
import { ICompletionsLogTargetService, Logger } from '../logger';
import { isAbortError } from '../networkingTypes';
import { CompletionRequestExtra, CopilotUiKind, FinishedCallback, ICompletionsOpenAIFetcherService, PostOptions } from '../openai/fetch';
import { APIChoice, getTemperatureForSamples } from '../openai/openai';
import { telemetry, TelemetryWithExp } from '../telemetry';
import { ICompletionsRuntimeModeService } from '../util/runtimeMode';
import { BlockTrimmer } from './blockTrimmer';
import { appendToCache } from './cacheUtils';
import { ICompletionsCacheService } from './completionsCache';
import { RequestContext } from './requestContext';
import { ResultType } from './resultType';
import { GhostTextResultWithTelemetry, mkBasicResultTelemetry, mkCanceledResultTelemetry } from './telemetry';

export type GetNetworkCompletionsType = GhostTextResultWithTelemetry<[APIChoice, Promise<void>]>;

export type GetAllNetworkCompletionsType = GhostTextResultWithTelemetry<[APIChoice[], Promise<void>]>;

export const logger = new Logger('ghostText');

export class CompletionsFromNetwork {

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICompletionsOpenAIFetcherService private readonly fetcherService: ICompletionsOpenAIFetcherService,
		@ICompletionsFeaturesService private readonly featuresService: ICompletionsFeaturesService,
		@ICompletionsRuntimeModeService private readonly runtimeMode: ICompletionsRuntimeModeService,
		@ICompletionsLogTargetService private readonly logTarget: ICompletionsLogTargetService,
		@ICompletionsCacheService private readonly completionsCacheService: ICompletionsCacheService,
		@ICompletionsUserErrorNotifierService private readonly userErrorNotifier: ICompletionsUserErrorNotifierService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly expService: IExperimentationService
	) { }

	/** Requests new completion from OpenAI, should be called if and only if the completions for given prompt were not cached before.
	 *  It returns only first completion, additional completions are added to the caches in the background.
	 *  Copies from the base telemetry data are used as the basis for each choice's telemetry.
	 */
	public async getCompletionsFromNetwork(
		requestContext: RequestContext,
		baseTelemetryData: TelemetryWithExp,
		cancellationToken: ICancellationToken | undefined,
		finishedCb: FinishedCallback,
		telemetryBuilder: LlmNESTelemetryBuilder,
	): Promise<GetNetworkCompletionsType> {
		return this.genericGetCompletionsFromNetwork(
			requestContext,
			baseTelemetryData,
			cancellationToken,
			finishedCb,
			telemetryBuilder,
			'completions',
			async (requestStart, processingTime, choicesStream): Promise<GetNetworkCompletionsType> => {
				const choicesIterator = choicesStream[Symbol.asyncIterator]();

				const firstRes = await choicesIterator.next();

				if (firstRes.done) {
					logger.debug(this.logTarget, 'All choices redacted');
					return {
						type: 'empty',
						reason: 'all choices redacted',
						telemetryData: mkBasicResultTelemetry(baseTelemetryData),
					};
				}
				if (cancellationToken?.isCancellationRequested) {
					logger.debug(this.logTarget, 'Cancelled after awaiting redactedChoices iterator');
					return {
						type: 'canceled',
						reason: 'after awaiting redactedChoices iterator',
						telemetryData: mkCanceledResultTelemetry(baseTelemetryData),
					};
				}

				const firstChoice: APIChoice = firstRes.value;

				if (firstChoice === undefined) {
					// This is probably unreachable given the firstRes.done check above
					logger.debug(this.logTarget, 'Got undefined choice from redactedChoices iterator');
					return {
						type: 'empty',
						reason: 'got undefined choice from redactedChoices iterator',
						telemetryData: mkBasicResultTelemetry(baseTelemetryData),
					};
				}

				this.instantiationService.invokeFunction(telemetryPerformance, 'performance', firstChoice, requestStart, processingTime);

				logger.debug(this.logTarget, `Awaited first result, id:  ${firstChoice.choiceIndex}`);
				// Adds first result to cache
				const processedFirstChoice = postProcessChoices(firstChoice);
				if (processedFirstChoice) {
					appendToCache(this.completionsCacheService, requestContext, processedFirstChoice);
					logger.debug(this.logTarget,
						`GhostText first completion (index ${processedFirstChoice?.choiceIndex}): ${JSON.stringify(processedFirstChoice?.completionText)}`
					);
				}
				//Create promise for each result, don't `await` it (unless in test mode) but handle asynchronously with `.then()`
				const cacheDone = (async () => {
					const apiChoices: APIChoice[] = processedFirstChoice !== undefined ? [processedFirstChoice] : [];
					for await (const choice of choicesStream) {
						if (choice === undefined) { continue; }
						logger.debug(this.logTarget,
							`GhostText later completion (index ${choice?.choiceIndex}): ${JSON.stringify(choice.completionText)}`
						);
						const processedChoice = postProcessChoices(choice, apiChoices);
						if (!processedChoice) { continue; }
						apiChoices.push(processedChoice);
						appendToCache(this.completionsCacheService, requestContext, processedChoice);
					}
				})();
				if (this.runtimeMode.isRunningInTest()) {
					await cacheDone;
				}
				if (processedFirstChoice) {
					// Because we ask the server to stop at \n above, we don't need to force single line here
					return {
						type: 'success',
						value: [makeGhostAPIChoice(processedFirstChoice, { forceSingleLine: false }), cacheDone],
						telemetryData: mkBasicResultTelemetry(baseTelemetryData),
						telemetryBlob: baseTelemetryData,
						resultType: ResultType.Network,
					};
				} else {
					return {
						type: 'empty',
						reason: 'got undefined processedFirstChoice',
						telemetryData: mkBasicResultTelemetry(baseTelemetryData),
					};
				}
			}
		);
	}

	/** Requests new completion from OpenAI, should be called if and only if we are in the servers-side termination mode, and it's follow-up cycling request
	 *  It returns all requested completions
	 *  Copies from the base telemetry data are used as the basis for each choice's telemetry.
	 */
	public async getAllCompletionsFromNetwork(
		requestContext: RequestContext,
		baseTelemetryData: TelemetryWithExp,
		cancellationToken: ICancellationToken | undefined,
		finishedCb: FinishedCallback,
		telemetryBuilder: LlmNESTelemetryBuilder,
	): Promise<GetAllNetworkCompletionsType> {
		return this.genericGetCompletionsFromNetwork(
			requestContext,
			baseTelemetryData,
			cancellationToken,
			finishedCb,
			telemetryBuilder,
			'all completions',
			async (requestStart, processingTime, choicesStream): Promise<GetAllNetworkCompletionsType> => {
				const apiChoices: APIChoice[] = [];
				for await (const choice of choicesStream) {
					if (cancellationToken?.isCancellationRequested) {
						logger.debug(this.logTarget, 'Cancelled after awaiting choices iterator');
						return {
							type: 'canceled',
							reason: 'after awaiting choices iterator',
							telemetryData: mkCanceledResultTelemetry(baseTelemetryData),
						};
					}
					const processedChoice = postProcessChoices(choice, apiChoices);
					if (!processedChoice) { continue; }
					apiChoices.push(processedChoice);
				}
				//Append results to current completions cache, and network cache
				if (apiChoices.length > 0) {
					for (const choice of apiChoices) {
						appendToCache(this.completionsCacheService, requestContext, choice);
					}

					this.instantiationService.invokeFunction(telemetryPerformance, 'cyclingPerformance', apiChoices[0], requestStart, processingTime);
				}
				return {
					type: 'success',
					value: [apiChoices, Promise.resolve()],
					telemetryData: mkBasicResultTelemetry(baseTelemetryData),
					telemetryBlob: baseTelemetryData,
					resultType: ResultType.Cycling,
				};
			}
		);
	}

	private async genericGetCompletionsFromNetwork<T>(
		requestContext: RequestContext,
		baseTelemetryData: TelemetryWithExp,
		cancellationToken: ICancellationToken | undefined,
		finishedCb: FinishedCallback,
		telemetryBuilder: LlmNESTelemetryBuilder,
		what: string,
		processChoices: (
			requestStart: number,
			processingTime: number,
			choicesStream: AsyncIterable<APIChoice>
		) => Promise<GhostTextResultWithTelemetry<T>>
	): Promise<GhostTextResultWithTelemetry<T>> {
		const statelessTelemetryBuilder = new StatelessNextEditTelemetryBuilder(requestContext.ourRequestId);
		const result = await this._genericGetCompletionsFromNetwork(
			requestContext,
			baseTelemetryData,
			cancellationToken,
			finishedCb,
			statelessTelemetryBuilder,
			what,
			processChoices
		);
		let editResult: Result<void, NoNextEditReason>;
		switch (result.type) {
			case 'success':
				editResult = Result.ok(undefined);
				break;
			case 'canceled':
				editResult = Result.error(new NoNextEditReason.GotCancelled(result.reason));
				break;
			case 'empty':
				editResult = Result.error(new NoNextEditReason.NoSuggestions(new StringText('') /* unused by completions anyway */, undefined));
				break;
			case 'failed':
				editResult = Result.error(new NoNextEditReason.Uncategorized(ErrorUtils.fromUnknown(result.reason)));
				break;
			case 'abortedBeforeIssued':
			case 'promptOnly':
				editResult = Result.error(new NoNextEditReason.GotCancelled(result.reason));
				break;
			default:
				assertNever(result);
		}
		telemetryBuilder.setStatelessNextEditTelemetry(statelessTelemetryBuilder.build(editResult));
		return result;
	}

	private async _genericGetCompletionsFromNetwork<T>(
		requestContext: RequestContext,
		baseTelemetryData: TelemetryWithExp,
		cancellationToken: ICancellationToken | undefined,
		finishedCb: FinishedCallback,
		telemetryBuilder: StatelessNextEditTelemetryBuilder,
		what: string,
		processChoices: (
			requestStart: number,
			processingTime: number,
			choicesStream: AsyncIterable<APIChoice>
		) => Promise<GhostTextResultWithTelemetry<T>>
	): Promise<GhostTextResultWithTelemetry<T>> {
		logger.debug(this.logTarget, `Getting ${what} from network`);

		// copy the base telemetry data
		baseTelemetryData = baseTelemetryData.extendedBy();

		telemetryBuilder.setModelName(requestContext.engineModelId);

		// Request one choice for automatic requests, three for invoked (cycling) requests.
		const n = requestContext.isCycling ? 3 : 1;
		const temperature = getTemperatureForSamples(this.runtimeMode, n);
		const extra: CompletionRequestExtra = {
			language: requestContext.languageId,
			next_indent: requestContext.indentation.next ?? 0,
			trim_by_indentation: shouldDoServerTrimming(requestContext.blockMode),
			prompt_tokens: requestContext.prompt.prefixTokens ?? 0,
			suffix_tokens: requestContext.prompt.suffixTokens ?? 0,
		};
		const postOptions: PostOptions = { n, temperature, code_annotations: false };
		const modelTerminatesSingleline = this.featuresService.modelAlwaysTerminatesSingleline(baseTelemetryData);
		const simulateSingleline = requestContext.blockMode === BlockMode.MoreMultiline &&
			BlockTrimmer.isSupported(requestContext.languageId) &&
			!modelTerminatesSingleline;
		if (!requestContext.multiline && !simulateSingleline) {
			// If we are not in multiline mode, we get the server to truncate the results. This does mean that we
			// also cache a single line result which will be reused even if we are later in multiline mode. This is
			// an acceptable trade-off as the transition should be relatively rare and truncating on the server is
			// more efficient.
			// Note that this also means we don't need to truncate when creating the GhostAPIChoice object below.
			postOptions['stop'] = ['\n'];
		} else if (requestContext.stop) {
			postOptions['stop'] = requestContext.stop;
		}
		if (requestContext.maxTokens !== undefined) {
			postOptions['max_tokens'] = requestContext.maxTokens;
		}

		const requestStart = Date.now();

		// extend telemetry data
		const newProperties: { [key: string]: string } = {
			endpoint: 'completions',
			uiKind: CopilotUiKind.GhostText,
			temperature: JSON.stringify(temperature),
			n: JSON.stringify(n),
			stop: JSON.stringify(postOptions['stop']) ?? 'unset',
			logit_bias: JSON.stringify(null),
		};

		Object.assign(baseTelemetryData.properties, newProperties);

		try {
			const completionParams = {
				prompt: requestContext.prompt,
				languageId: requestContext.languageId,
				repoInfo: requestContext.repoInfo,
				ourRequestId: requestContext.ourRequestId,
				engineModelId: requestContext.engineModelId,
				count: n,
				uiKind: CopilotUiKind.GhostText,
				postOptions,
				headers: requestContext.headers,
				extra,
			};
			const res = this.configurationService.getExperimentBasedConfig(ChatConfigKey.TeamInternal.GhostTextUseCompletionsFetchService, this.expService)
				? await this.fetcherService.fetchAndStreamCompletions2(completionParams, baseTelemetryData, finishedCb, cancellationToken)
				: await this.fetcherService.fetchAndStreamCompletions(completionParams, baseTelemetryData, finishedCb, cancellationToken);
			if (res.type === 'failed') {
				return {
					type: 'failed',
					reason: res.reason,
					telemetryData: mkBasicResultTelemetry(baseTelemetryData),
				};
			}

			if (res.type === 'canceled') {
				logger.debug(this.logTarget, 'Cancelled after awaiting fetchCompletions');
				return {
					type: 'canceled',
					reason: res.reason,
					telemetryData: mkCanceledResultTelemetry(baseTelemetryData),
				};
			}

			return processChoices(requestStart, res.getProcessingTime(), res.choices);
		} catch (err) {
			// If we cancelled a network request, we don't want to log an error
			if (isAbortError(err)) {
				return {
					type: 'canceled',
					reason: 'network request aborted',
					telemetryData: mkCanceledResultTelemetry(baseTelemetryData, {
						cancelledNetworkRequest: true,
					}),
				};
			} else {
				this.instantiationService.invokeFunction(acc => logger.exception(acc, err, `Error on ghost text request`));
				this.userErrorNotifier.notifyUser(err);
				if (this.runtimeMode.shouldFailForDebugPurposes()) {
					throw err;
				}
				// not including err in this result because it'll end up in standard telemetry
				return {
					type: 'failed',
					reason: 'non-abort error on ghost text request',
					telemetryData: mkBasicResultTelemetry(baseTelemetryData),
				};
			}
		}
	}
}

/**
 * Post-proceses a completion choice based on the current request context and existing choices.
 */
export function postProcessChoices(
	newChoice: APIChoice,
	currentChoices?: APIChoice[]
): APIChoice | undefined {
	if (!currentChoices) { currentChoices = []; }
	newChoice.completionText = newChoice.completionText.trimEnd();
	if (!newChoice.completionText) { return undefined; }
	// Collect only unique displayTexts
	if (currentChoices.findIndex(v => v.completionText.trim() === newChoice.completionText.trim()) !== -1) {
		return undefined;
	}
	return newChoice;
}

export function makeGhostAPIChoice(choice: APIChoice, options: { forceSingleLine: boolean }): APIChoice {
	const ghostChoice = { ...choice } as APIChoice;
	if (options.forceSingleLine) {
		const { completionText } = ghostChoice;
		// Special case for when completion starts with a newline, don't count that as its own line
		const initialLineBreak = completionText.match(/^\r?\n/);
		if (initialLineBreak) {
			ghostChoice.completionText = initialLineBreak[0] + completionText.split('\n')[1];
		} else {
			ghostChoice.completionText = completionText.split('\n')[0];
		}
	}
	return ghostChoice;
}

export function telemetryPerformance(
	accessor: ServicesAccessor,
	performanceKind: string,
	choice: APIChoice,
	requestStart: number,
	processingTimeMs: number
) {
	const requestTimeMs = Date.now() - requestStart;
	const deltaMs = requestTimeMs - processingTimeMs;

	const telemetryData = choice.telemetryData.extendedBy(
		{},
		{
			completionCharLen: choice.completionText.length,
			requestTimeMs: requestTimeMs,
			processingTimeMs: processingTimeMs,
			deltaMs: deltaMs,
			// Choice properties
			meanLogProb: choice.meanLogProb || NaN,
			meanAlternativeLogProb: choice.meanAlternativeLogProb || NaN,
		}
	);
	telemetryData.extendWithRequestId(choice.requestId);
	telemetry(accessor, `ghostText.${performanceKind}`, telemetryData);
}

