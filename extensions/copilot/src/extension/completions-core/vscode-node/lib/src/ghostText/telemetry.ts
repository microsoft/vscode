/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { ICompletionsLogTargetService, Logger } from '../logger';
import { PromptResponse } from '../prompt/prompt';
import { now, telemetry, TelemetryData, telemetryRaw, TelemetryWithExp } from '../telemetry';
import { CopilotCompletion } from './copilotCompletion';
import { ResultType } from './resultType';
import { ICompletionsSpeculativeRequestCache } from './speculativeRequestCache';

export type PostInsertionCategory = 'ghostText' | 'solution';

export const GHOST_TEXT_CATEGORY: PostInsertionCategory = 'ghostText';

export const logger = new Logger('getCompletions');

/** Send `.shown` event */
export function telemetryShown(accessor: ServicesAccessor, completion: CopilotCompletion) {
	const speculativeRequestCache = accessor.get(ICompletionsSpeculativeRequestCache);
	void speculativeRequestCache.request(completion.clientCompletionId);
	completion.telemetry.markAsDisplayed(); // TODO: Consider removing displayedTime as unused and generally incorrect.
	completion.telemetry.properties.reason = resultTypeToString(completion.resultType);
	telemetry(accessor, `ghostText.shown`, completion.telemetry);
}

/** Send `.accepted` event */
export function telemetryAccepted(
	accessor: ServicesAccessor,
	insertionCategory: PostInsertionCategory,
	telemetryData: TelemetryData
) {
	const telemetryName = insertionCategory + '.accepted';

	telemetry(accessor, telemetryName, telemetryData);
}

/** Send `.rejected` event */
export function telemetryRejected(
	accessor: ServicesAccessor,
	insertionCategory: PostInsertionCategory,
	telemetryData: TelemetryData
) {
	const telemetryName = insertionCategory + '.rejected';

	telemetry(accessor, telemetryName, telemetryData);
}

/** Cut down telemetry type for "result" telemetry, to avoid too much data load on Azure Monitor.
 *
 */
type BasicResultTelemetry = {
	headerRequestId: string;
	copilot_trackingId: string;
	opportunityId?: string;
	sku?: string;
	organizations_list?: string;
	enterprise_list?: string;
	clientCompletionId?: string;
};

/**
 * For `ghostText.canceled` we include all fields for backwards compatibility, as this event had it initially,
 * Note that we now send the event from more places, but it still makes sense to be consistent.
 */
type CanceledResultTelemetry = {
	telemetryBlob: TelemetryData;
	cancelledNetworkRequest?: boolean; // omitted is equivalent to false
};

/**
 * When we request ghost text, we also send a `ghostText.issued` telemetry event. To measure
 * Copilot's overall reliability, we want to make sure we consistently send a matching "result" event.
 *
 * This type allows us to keep track of what happened during the pipeline that produces ghost text results,
 * and use the TypeScript type system to reduce the chances of accidentally forgetting to send the result event.
 *
 * At the end of that pipeline, we will either have a final ghost text result and we can send a `ghostText.produced`
 * message, or something will have prevented us producing a result and we can send an alternative mesages.
 */
export type GhostTextResultWithTelemetry<T> =
	/**
	 * A result was produced successfully. If this is the final ghost text result,
	 * we should send the result message `ghostText.produced`.
	 */
	| {
		type: 'success';
		value: T;
		telemetryData: BasicResultTelemetry;
		// This is needed to populate the telemetryBlob in `ghostText.canceled` if this happens later.
		telemetryBlob: TelemetryWithExp;
		resultType: ResultType;
		performanceMetrics?: [string, number][];
	}
	/**
	 * We decided not to request ghost text this time. No `ghostText.issued` message
	 * was sent so there is no need send any result telemetry.
	 */
	| { type: 'abortedBeforeIssued'; reason: string; telemetryData: BasicResultTelemetry }
	/**
	 * We requested ghost text, but we decided to cancel mid-way, for example because the
	 * user kept typing. This will turn into a `ghostText.canceled` result message.
	 * Note: this uses the preferred American spelling "canceled" rather than "cancelled",
	 * because the telemetry message has always done that, even though it may be inconsistent
	 * with log messages and code comments etc.
	 */
	| { type: 'canceled'; reason: string; telemetryData: CanceledResultTelemetry }
	/**
	 * We requested ghost text, but didn't come up with any results for some "expected"
	 * reason, such as slur redaction or snippy. This will turn into a `ghostText.empty`
	 * result message.
	 */
	| { type: 'empty'; reason: string; telemetryData: BasicResultTelemetry }
	/**
	 * We requested ghost text, but didn't come up with any results because something
	 * unexpected went wrong. This will turn into a `ghostText.failed` result message.
	 */
	| { type: 'failed'; reason: string; telemetryData: BasicResultTelemetry }
	/**
	 * The promptOnly parameter was set to true in the request. We only need the prompt
	 * that was about to be sent to the model. This is for experimentation purposes, so
	 * there is not any need for telemetry in this case.
	 */
	| { type: 'promptOnly'; reason: string; prompt: PromptResponse };

export function mkCanceledResultTelemetry(
	telemetryBlob: TelemetryData,
	extraFlags: { cancelledNetworkRequest?: boolean } = {}
): CanceledResultTelemetry {
	return {
		...extraFlags,
		telemetryBlob,
	};
}

export function mkBasicResultTelemetry(
	telemetryBlob: TelemetryWithExp,
): BasicResultTelemetry {
	const result: BasicResultTelemetry = {
		headerRequestId: telemetryBlob.properties['headerRequestId'],
		copilot_trackingId: telemetryBlob.properties['copilot_trackingId'],
	};
	// copy certain properties if present
	if (telemetryBlob.properties['sku'] !== undefined) {
		result.sku = telemetryBlob.properties['sku'];
	}
	if (telemetryBlob.properties['opportunityId'] !== undefined) {
		result.opportunityId = telemetryBlob.properties['opportunityId'];
	}
	if (telemetryBlob.properties['organizations_list'] !== undefined) {
		result.organizations_list = telemetryBlob.properties['organizations_list'];
	}
	if (telemetryBlob.properties['enterprise_list'] !== undefined) {
		result.enterprise_list = telemetryBlob.properties['enterprise_list'];
	}
	if (telemetryBlob.properties['clientCompletionId'] !== undefined) {
		result.clientCompletionId = telemetryBlob.properties['clientCompletionId'];
	}

	return result;
}

/**
 * Given a ghost text result, send the appropriate "result" telemetry, if any, and return the
 * result value if one was produced.
 * @param start Milliseconds (since process start) when the completion request was by the editor.
 */
export function handleGhostTextResultTelemetry<T>(
	accessor: ServicesAccessor,
	result: GhostTextResultWithTelemetry<T>
): T | undefined {
	const logTarget = accessor.get(ICompletionsLogTargetService);
	// testing/debugging only case, no telemetry
	if (result.type === 'promptOnly') { return; }

	if (result.type === 'success') {
		const timeToProduceMs = now() - result.telemetryBlob.issuedTime;
		const reason = resultTypeToString(result.resultType);
		const performanceMetrics = JSON.stringify(result.performanceMetrics);
		const properties = { ...result.telemetryData, reason, performanceMetrics };
		const { foundOffset } = result.telemetryBlob.measurements;
		const perf = result.performanceMetrics?.map(([key, dur]) => `\n${dur.toFixed(2)}\t${key}`).join('') ?? '';
		logger.debug(
			logTarget,
			`ghostText produced from ${reason} in ${Math.round(timeToProduceMs)}ms with foundOffset ${foundOffset}${perf}`
		);
		telemetryRaw(accessor, 'ghostText.produced', properties, { timeToProduceMs, foundOffset });
		return result.value;
	}

	logger.debug(logTarget, 'No ghostText produced -- ' + result.type + ': ' + result.reason);
	if (result.type === 'canceled') {
		// For backwards compatibility, we send a "fat" telemetry message in this case.
		telemetry(
			accessor,
			`ghostText.canceled`,
			result.telemetryData.telemetryBlob.extendedBy({
				reason: result.reason,
				cancelledNetworkRequest: result.telemetryData.cancelledNetworkRequest ? 'true' : 'false',
			})
		);
		return;
	}
	telemetryRaw(accessor, `ghostText.${result.type}`, { ...result.telemetryData, reason: result.reason }, {});
}

export function resultTypeToString(resultType: ResultType): string {
	switch (resultType) {
		case ResultType.Network:
			return 'network';
		case ResultType.Cache:
			return 'cache';
		case ResultType.Cycling:
			return 'cycling';
		case ResultType.TypingAsSuggested:
			return 'typingAsSuggested';
		case ResultType.Async:
			return 'async';
	}
}
