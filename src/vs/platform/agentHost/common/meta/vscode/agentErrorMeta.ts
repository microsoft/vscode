/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ErrorInfo } from '../../state/protocol/common/state.js';
import { isObject, isString } from '../../../../../base/common/types.js';

export interface IAgentErrorTelemetryMeta {
	readonly providerCallId?: string;
	readonly serviceRequestId?: string;
}

export function readAgentErrorTelemetryMeta(error: ErrorInfo): IAgentErrorTelemetryMeta | undefined {
	const meta = error._meta;
	if (!meta) {
		return undefined;
	}
	const chatError = meta.chatError;
	if (!isObject(chatError)) {
		return undefined;
	}
	const fetchError = (chatError as Record<string, unknown>).fetchError;
	if (!isObject(fetchError)) {
		return undefined;
	}
	const value = fetchError as Record<string, unknown>;
	const providerCallId = isString(value.requestId) && value.requestId.length > 0 ? value.requestId : undefined;
	const serviceRequestId = isString(value.serverRequestId) && value.serverRequestId.length > 0 ? value.serverRequestId : undefined;
	return providerCallId || serviceRequestId ? { providerCallId, serviceRequestId } : undefined;
}

export function readForwardedChatError(error: Pick<ErrorInfo, '_meta'>): Record<string, unknown> | undefined {
	const value = error._meta?.chatError;
	if (!isObject(value)) {
		return undefined;
	}
	const record = value as Record<string, unknown>;
	if (!isObject(record.fetchError) || !isString((record.fetchError as Record<string, unknown>).type)) {
		return undefined;
	}
	return record;
}
