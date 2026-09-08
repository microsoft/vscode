/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ErrorInfo } from '../state/protocol/common/state.js';

/** Serialized chat fetch error forwarded through `ErrorInfo._meta.chatError`. */
export interface IForwardedChatFetchError {
	readonly type: string;
	readonly reason?: string;
	readonly reasonDetail?: string;
	readonly requestId?: string;
	readonly serverRequestId?: string;
	readonly category?: string;
	readonly retryAfter?: number;
	readonly rateLimitKey?: string;
	readonly isAuto?: boolean;
	readonly capiError?: {
		readonly code?: string;
		readonly message?: string;
	};
}

/** Full chat error forwarded by an agent host harness. */
export interface IForwardedChatError {
	readonly fetchError: IForwardedChatFetchError;
	readonly copilotPlan?: string;
	readonly isUsageBasedBilling?: boolean;
	readonly quotaResetDate?: string;
}

export interface IAgentErrorTelemetryMeta {
	readonly providerCallId?: string;
	readonly serviceRequestId?: string;
}

/** Reads and validates the forwarded chat error from an error's open `_meta` bag. */
export function readForwardedChatError(error: ErrorInfo | undefined): IForwardedChatError | undefined {
	const meta = error?._meta;
	const value = meta?.['chatError'];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	const fetchError = readForwardedChatFetchError(raw['fetchError']);
	if (!fetchError) {
		return undefined;
	}
	return {
		fetchError,
		...(typeof raw['copilotPlan'] === 'string' ? { copilotPlan: raw['copilotPlan'] } : {}),
		...(typeof raw['isUsageBasedBilling'] === 'boolean' ? { isUsageBasedBilling: raw['isUsageBasedBilling'] } : {}),
		...(typeof raw['quotaResetDate'] === 'string' ? { quotaResetDate: raw['quotaResetDate'] } : {}),
	};
}

function readForwardedChatFetchError(value: unknown): IForwardedChatFetchError | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	if (typeof raw['type'] !== 'string') {
		return undefined;
	}
	const capiError = readCapiError(raw['capiError']);
	return {
		type: raw['type'],
		...(typeof raw['reason'] === 'string' ? { reason: raw['reason'] } : {}),
		...(typeof raw['reasonDetail'] === 'string' ? { reasonDetail: raw['reasonDetail'] } : {}),
		...(typeof raw['requestId'] === 'string' ? { requestId: raw['requestId'] } : {}),
		...(typeof raw['serverRequestId'] === 'string' ? { serverRequestId: raw['serverRequestId'] } : {}),
		...(typeof raw['category'] === 'string' ? { category: raw['category'] } : {}),
		...(typeof raw['retryAfter'] === 'number' ? { retryAfter: raw['retryAfter'] } : {}),
		...(typeof raw['rateLimitKey'] === 'string' ? { rateLimitKey: raw['rateLimitKey'] } : {}),
		...(typeof raw['isAuto'] === 'boolean' ? { isAuto: raw['isAuto'] } : {}),
		...(capiError ? { capiError } : {}),
	};
}

function readCapiError(value: unknown): IForwardedChatFetchError['capiError'] | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	const code = typeof raw['code'] === 'string' ? raw['code'] : undefined;
	const message = typeof raw['message'] === 'string' ? raw['message'] : undefined;
	return code !== undefined || message !== undefined ? { code, message } : undefined;
}

export function readAgentErrorTelemetryMeta(error: ErrorInfo): IAgentErrorTelemetryMeta {
	const fetchError = readForwardedChatError(error)?.fetchError;
	const providerCallId = fetchError?.requestId || undefined;
	const serviceRequestId = fetchError?.serverRequestId || undefined;
	return { providerCallId, serviceRequestId };
}
