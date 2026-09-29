/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotNamedAnnotationList } from '../../../../../../platform/completions-core/common/openai/copilotAnnotations';
import { RequestId } from '../../../../../../platform/networking/common/fetch';
import { generateUuid } from '../../../../../../util/vs/base/common/uuid';
import { ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { DEFAULT_MAX_COMPLETION_LENGTH } from '../../../prompt/src/prompt';
import { logger } from '../logger';
import { TelemetryWithExp, logEngineCompletion } from '../telemetry';
import { ICompletionsRuntimeModeService } from '../util/runtimeMode';

export { FinishedCallback } from './fetch';

export interface APIChoice {
	completionText: string;
	meanLogProb: number | undefined;
	meanAlternativeLogProb: number | undefined;
	choiceIndex: number;
	requestId: RequestId;
	tokens: readonly string[];
	numTokens: number;
	blockFinished: boolean; // Whether the block completion was determined to be finished
	telemetryData: TelemetryWithExp; // optional telemetry data providing background
	copilotAnnotations?: CopilotNamedAnnotationList; // optional annotations from the proxy
	clientCompletionId: string; // Unique identifier for the completion created in the client
	finishReason: string; // Reason the API used to describe why the stream of chunks finished.
	generatedChoiceIndex?: number; // when a completion is split into multiple choices, the index of the split choice
}

/** How the logprobs field looks in the OpenAI API chunks. */
export interface APILogprobs {
	text_offset: number[];
	token_logprobs: number[];
	top_logprobs?: { [key: string]: number }[];
	tokens: string[];
}

export interface APIJsonData {
	text: string;
	/* Joining this together produces `text`, due to the way the proxy works. */
	tokens: readonly string[];
	/* These are only generated in certain situations. */
	logprobs?: APILogprobs;
	/* Copilot-specific annotations returned by the proxy. */
	copilot_annotations?: CopilotNamedAnnotationList;
	/* Reason the proxy returned for why the stream of chunks ended. */
	finish_reason: string; // Reason the API used to describe why the stream of chunks finished.
}

export function convertToAPIChoice(
	accessor: ServicesAccessor,
	completionText: string,
	jsonData: APIJsonData,
	choiceIndex: number,
	requestId: RequestId,
	blockFinished: boolean,
	telemetryData: TelemetryWithExp
): APIChoice {
	logEngineCompletion(accessor, completionText, jsonData, requestId, choiceIndex);

	// NOTE: It's possible that the completion text we care about is not exactly jsonData.text but a prefix,
	// so we pass it down directly.
	return {
		// NOTE: This does not contain stop tokens necessarily
		completionText: completionText,
		meanLogProb: calculateMeanLogProb(accessor, jsonData),
		meanAlternativeLogProb: calculateMeanAlternativeLogProb(accessor, jsonData),
		choiceIndex: choiceIndex,
		requestId: requestId,
		blockFinished: blockFinished,
		tokens: jsonData.tokens,
		numTokens: jsonData.tokens.length,
		telemetryData: telemetryData,
		copilotAnnotations: jsonData.copilot_annotations,
		clientCompletionId: generateUuid(),
		finishReason: jsonData.finish_reason,
	};
}

// Helper functions
function calculateMeanLogProb(accessor: ServicesAccessor, jsonData: APIJsonData): number | undefined {
	if (!jsonData?.logprobs?.token_logprobs) {
		return undefined;
	}

	try {
		let logProbSum = 0.0;
		let numTokens = 0;

		// Limit to first 50 logprobs, avoids up-ranking longer solutions
		let iterLimit = 50;

		// First token is always null and last token can have multiple options if it hit a stop
		for (let i = 0; i < jsonData.logprobs.token_logprobs.length - 1 && iterLimit > 0; i++, iterLimit--) {
			logProbSum += jsonData.logprobs.token_logprobs[i];
			numTokens += 1;
		}

		if (numTokens > 0) {
			return logProbSum / numTokens;
		} else {
			return undefined;
		}
	} catch (e) {
		logger.exception(accessor, e, `Error calculating mean prob`);
	}
}

function calculateMeanAlternativeLogProb(accessor: ServicesAccessor, jsonData: APIJsonData): number | undefined {
	if (!jsonData?.logprobs?.top_logprobs) {
		return undefined;
	}

	try {
		let logProbSum = 0.0;
		let numTokens = 0;

		// Limit to first 50 logprobs, avoids up-ranking longer solutions
		let iterLimit = 50;

		for (let i = 0; i < jsonData.logprobs.token_logprobs.length - 1 && iterLimit > 0; i++, iterLimit--) {
			// copy the options object to avoid mutating the original
			const options = { ...jsonData.logprobs.top_logprobs[i] };
			delete options[jsonData.logprobs.tokens[i]];
			logProbSum += Math.max(...Object.values(options));
			numTokens += 1;
		}

		if (numTokens > 0) {
			return logProbSum / numTokens;
		} else {
			return undefined;
		}
	} catch (e) {
		logger.exception(accessor, e, `Error calculating mean prob`);
	}
}

// Returns a temperature in range 0.0-1.0, using either a config setting,
// or the following ranges: 1=0.0, <10=0.2, <20=0.4, >=20=0.8
export function getTemperatureForSamples(runtime: ICompletionsRuntimeModeService, numShots: number): number {
	if (runtime.isRunningInTest()) {
		return 0.0;
	}

	if (numShots <= 1) {
		return 0.0;
	} else if (numShots < 10) {
		return 0.2;
	} else if (numShots < 20) {
		return 0.4;
	} else {
		return 0.8;
	}
}

const stopsForLanguage: { [key: string]: string[] } = {
	markdown: ['\n\n\n'],
	python: ['\ndef ', '\nclass ', '\nif ', '\n\n#'],
};

export function getStops(languageId?: string) {
	return stopsForLanguage[languageId ?? ''] ?? ['\n\n\n', '\n```'];
}

export function getTopP(): number {
	return 1;
}

export function getMaxSolutionTokens(): number {
	return DEFAULT_MAX_COMPLETION_LENGTH;
}
