/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ErrorInfo } from '../../common/state/sessionState.js';
import { httpStatusToChatFetchType, type IForwardedChatError, stripProxyErrorMarker, toChatErrorMeta, tryBuildChatErrorMeta } from '../shared/proxyChatError.js';

/** Structured fields exposed by the Copilot CLI SDK's `session.error` event. */
export interface ICopilotSdkChatErrorFields {
	readonly errorType: string;
	readonly errorCode?: string;
	readonly message: string;
	readonly stack?: string;
	readonly statusCode?: number;
	readonly providerCallId?: string;
	readonly serviceRequestId?: string;
}

function copilotSdkErrorTypeToFetchType(errorType: string, statusCode: number | undefined): string | undefined {
	switch (errorType) {
		case 'quota':
			return 'quotaExceeded';
		case 'rate_limit':
			return 'rateLimited';
		case 'context_limit':
			return 'length';
		case 'authentication':
		case 'authorization':
			return 'agent_unauthorized';
	}
	return statusCode !== undefined ? httpStatusToChatFetchType(statusCode) : undefined;
}

/** Converts a classifiable Copilot SDK error into rich chat error metadata. */
export function buildForwardedChatErrorFromCopilotSdkFields(data: ICopilotSdkChatErrorFields): IForwardedChatError | undefined {
	const type = copilotSdkErrorTypeToFetchType(data.errorType, data.statusCode);
	if (!type) {
		return undefined;
	}
	const code = data.errorCode ?? (type === 'quotaExceeded' ? 'quota_exceeded' : undefined);
	const capiError = (code || data.message) ? { code, message: data.message } : undefined;
	return {
		fetchError: {
			type,
			reason: data.message,
			requestId: data.providerCallId ?? '',
			...(data.serviceRequestId !== undefined ? { serverRequestId: data.serviceRequestId } : {}),
			...(capiError && { capiError }),
		},
	};
}

/** Converts a Copilot SDK error into the provider-neutral protocol shape. */
export function buildChatErrorInfoFromCopilotSdkFields(data: ICopilotSdkChatErrorFields): ErrorInfo {
	const forwarded = buildForwardedChatErrorFromCopilotSdkFields(data);
	const meta = forwarded ? toChatErrorMeta(forwarded) : tryBuildChatErrorMeta(data.message);
	return {
		errorType: data.errorType,
		message: stripProxyErrorMarker(data.message),
		stack: data.stack,
		...(meta ? { _meta: meta } : {}),
	};
}
