/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from 'vscode';
import { generateUuid } from '../../../../../../util/vs/base/common/uuid';
import { getTokenizer } from '../../../prompt/src/tokenization';
import { ICompletionsCopilotTokenManager } from '../auth/copilotTokenManager';
import { Response } from '../networking';
import { TelemetryData, TelemetryWithExp } from '../telemetry';
import {
	CompletionError,
	CompletionParams,
	CompletionResults,
	FinishedCallback,
	LiveOpenAIFetcher,
	OpenAIFetcher,
	PostOptions,
	postProcessChoices,
	SolutionDecision,
	SpeculationFetchParams
} from './fetch';
import { APIChoice } from './openai';

/**
 * This module supports fake implementations of the completions returned by OpenAI, as well
 * as injecting synthetic completions that would be hard to trigger directly but are useful
 * for thoroughly testing the code that post-processes completions.
 *
 */

export function fakeAPIChoice(
	headerRequestId: string,
	choiceIndex: number,
	completionText: string,
	telemetryData: TelemetryWithExp = TelemetryWithExp.createEmptyConfigForTesting()
): APIChoice {
	const tokenizer = getTokenizer();

	return {
		completionText: completionText,
		meanLogProb: 0.5,
		meanAlternativeLogProb: 0.5,
		numTokens: -1,
		choiceIndex,
		requestId: {
			headerRequestId,
			serverExperiments: 'dummy',
			deploymentId: 'dummy',
			gitHubRequestId: 'dummy',
			completionId: 'dummy',
			created: 0
		},
		telemetryData,
		// This slightly convoluted way of getting the tokens as a string array is an
		// alternative to exporting a way to do it directly from the tokenizer module.
		tokens: tokenizer
			.tokenize(completionText)
			.map(token => tokenizer.detokenize([token]))
			.concat(),
		blockFinished: false,
		clientCompletionId: generateUuid(),
		finishReason: 'stop',
	};
}

export function fakeAPIChoiceFromCompletion(completion: string): APIChoice {
	return fakeAPIChoice(generateUuid(), 0, completion);
}

export async function* fakeAPIChoices(
	postOptions: PostOptions | undefined,
	finishedCb: FinishedCallback,
	completions: string[],
	telemetryData?: TelemetryWithExp
): AsyncIterable<APIChoice> {
	const fakeHeaderRequestId = generateUuid();
	let choiceIndex = 0;
	for (let completion of completions) {
		let stopOffset = -1;
		if (postOptions?.stop !== undefined) {
			for (const stopToken of postOptions.stop) {
				const thisStopOffset = completion.indexOf(stopToken);
				if (thisStopOffset !== -1 && (stopOffset === -1 || thisStopOffset < stopOffset)) {
					stopOffset = thisStopOffset;
				}
			}
		}
		if (stopOffset !== -1) {
			completion = completion.substring(0, stopOffset);
		}
		// This logic for using the finishedCb mirrors what happens in the live streamChoices function,
		// but it doesn't try to stop reading the completion early as there's no point.
		const finishOffset = asNumericOffset(await finishedCb(completion, { text: completion }));
		if (finishOffset !== undefined) {
			completion = completion.substring(0, finishOffset);
		}
		const choice = fakeAPIChoice(fakeHeaderRequestId, choiceIndex++, completion, telemetryData);
		choice.blockFinished = finishOffset === undefined ? false : true;
		yield choice;
	}
}

function asNumericOffset(result: SolutionDecision | number | undefined): number | undefined {
	if (typeof result === 'number' || result === undefined) {
		return result;
	}
	return result.finishOffset;
}

function fakeResponse(
	completions: string[],
	finishedCb: FinishedCallback,
	postOptions?: PostOptions,
	telemetryData?: TelemetryWithExp
): Promise<CompletionResults> {
	const choices = postProcessChoices(fakeAPIChoices(postOptions, finishedCb, completions, telemetryData));
	return Promise.resolve({ type: 'success', choices, getProcessingTime: () => 0 });
}

export class SyntheticCompletions extends OpenAIFetcher {
	private _wasCalled = false;

	constructor(
		private readonly _completions: string[],
		@ICompletionsCopilotTokenManager private readonly copilotTokenManager: ICompletionsCopilotTokenManager,
	) {
		super();
	}

	async fetchAndStreamCompletions(
		params: CompletionParams,
		baseTelemetryData: TelemetryWithExp,
		finishedCb: FinishedCallback,
		cancel?: CancellationToken,
		teletryProperties?: { [key: string]: string }
	): Promise<CompletionResults | CompletionError> {
		// check we have a valid token - ignore the result
		void this.copilotTokenManager.getToken();
		if (cancel?.isCancellationRequested) {
			return { type: 'canceled', reason: 'canceled during test' };
		}

		if (!this._wasCalled) {
			this._wasCalled = true;
			return fakeResponse(this._completions, finishedCb, params.postOptions, baseTelemetryData);
		} else {
			// In indentation mode, if the preview completion isn't enough to finish the completion,
			// a second call will be made with the first prompt+preview completion as the prompt.
			// As we've already returned everything we have, the second completion should be empty.
			const emptyCompletions = this._completions.map(completion => '');
			return fakeResponse(emptyCompletions, finishedCb, params.postOptions, baseTelemetryData);
		}
	}

	async fetchAndStreamCompletions2(
		params: CompletionParams,
		baseTelemetryData: TelemetryWithExp,
		finishedCb: FinishedCallback,
		cancel?: CancellationToken
	): Promise<CompletionResults | CompletionError> {
		return this.fetchAndStreamCompletions(params, baseTelemetryData, finishedCb, cancel);
	}
}


export class ErrorReturningFetcher extends LiveOpenAIFetcher {
	lastSpeculationParams?: CompletionParams | SpeculationFetchParams;

	private response: Response | 'not-sent' = 'not-sent';

	setResponse(response: Response | 'not-sent') {
		this.response = response;
	}

	override fetchWithParameters(
		endpoint: string,
		params: CompletionParams,
		_copilotToken: unknown,
		telemetryData: TelemetryData,
		cancel?: CancellationToken
	): Promise<Response | 'not-sent'> {
		const response = this.response;
		this.response = 'not-sent';
		return Promise.resolve(response);
	}
}
