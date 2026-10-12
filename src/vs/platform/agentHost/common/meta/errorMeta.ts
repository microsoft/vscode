/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ErrorInfo } from '../state/protocol/common/state.js';
import { readCopilotErrorDetail } from './copilotd/copilotdMetadataReader.js';
import { readAgentErrorTelemetryMeta as readVSCodeErrorTelemetryMeta, readForwardedChatError } from './vscode/agentErrorMeta.js';

export interface IAgentErrorTelemetryMeta {
	readonly providerCallId?: string;
	readonly serviceRequestId?: string;
}

export type ErrorDetail =
	| { readonly kind: 'fetch'; readonly value: Record<string, unknown> }
	| {
		readonly kind: 'diagnostic';
		readonly errorCode?: string;
		readonly statusCode?: number;
		readonly url?: string;
		readonly providerCallId?: string;
		readonly serviceRequestId?: string;
		readonly eligibleForAutoSwitch?: boolean;
	};

export function readErrorDetail(error: Pick<ErrorInfo, '_meta'>): ErrorDetail | undefined {
	const value = readForwardedChatError(error);
	if (value) {
		return { kind: 'fetch', value };
	}
	const detail = readCopilotErrorDetail(error);
	return detail ? { kind: 'diagnostic', ...detail } : undefined;
}

export function readAgentErrorTelemetryMeta(error: ErrorInfo): IAgentErrorTelemetryMeta {
	const value = readVSCodeErrorTelemetryMeta(error);
	if (value) {
		return value;
	}
	const detail = readCopilotErrorDetail(error);
	return error._meta ? { providerCallId: detail?.providerCallId || undefined, serviceRequestId: detail?.serviceRequestId || undefined } : {};
}
