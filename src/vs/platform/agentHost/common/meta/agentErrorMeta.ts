/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ErrorInfo } from '../state/protocol/common/state.js';

export interface IAgentErrorTelemetryMeta {
	readonly providerCallId?: string;
	readonly serviceRequestId?: string;
}

export function readAgentErrorTelemetryMeta(error: ErrorInfo): IAgentErrorTelemetryMeta {
	const meta = error._meta;
	if (!meta) {
		return {};
	}
	const chatError = meta['chatError'];
	const fetchError = chatError && typeof chatError === 'object' ? (chatError as { fetchError?: unknown }).fetchError : undefined;
	const providerCallId = fetchError && typeof fetchError === 'object' && typeof (fetchError as { requestId?: unknown }).requestId === 'string' && (fetchError as { requestId: string }).requestId.length > 0
		? (fetchError as { requestId: string }).requestId
		: undefined;
	const serviceRequestId = fetchError && typeof fetchError === 'object' && typeof (fetchError as { serverRequestId?: unknown }).serverRequestId === 'string' && (fetchError as { serverRequestId: string }).serverRequestId.length > 0
		? (fetchError as { serverRequestId: string }).serverRequestId
		: undefined;
	return { providerCallId, serviceRequestId };
}
