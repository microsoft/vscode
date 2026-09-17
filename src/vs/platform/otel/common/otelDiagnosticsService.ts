/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const OTEL_DIAGNOSTICS_CHANNEL_NAME = 'otelDiagnostics';

export interface IOTelDiagnosticsSessionIdentity {
	readonly sessionUri: string;
	readonly conversationId: string;
}

export interface IOTelDiagnosticsSessionSummary {
	readonly sessionUri: string;
	readonly conversationId: string;
	readonly turns: number;
	readonly traceCount: number;
	readonly spanCount: number;
	readonly startTime: number;
	readonly endTime: number;
	readonly duration: number;
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly cachedTokens: number;
}

export interface IOTelDiagnosticsMessage {
	readonly id: string;
	readonly traceId: string;
	readonly spanId: string;
	readonly role: string;
	readonly toolName?: string;
	readonly toolCallId?: string;
	readonly toolDescription?: string;
	readonly toolInput?: string;
	readonly toolOutput?: string;
	readonly toolStatus?: 'success' | 'error';
	readonly toolDuration?: number;
	readonly content: string;
	readonly timestamp: number;
}

export interface IOTelDiagnosticsTrace {
	readonly traceId: string;
	readonly name: string;
	readonly serviceName: string | undefined;
	readonly startTime: number;
	readonly endTime: number;
	readonly duration: number;
	readonly spanCount: number;
	readonly hasError: boolean;
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly cachedTokens: number;
}

export interface IOTelDiagnosticsSpanEvent {
	readonly name: string;
	readonly timestamp: number;
	readonly attributes: string | undefined;
}

export interface IOTelDiagnosticsSpan {
	readonly spanId: string;
	readonly traceId: string;
	readonly parentSpanId: string | undefined;
	readonly name: string;
	readonly startTime: number;
	readonly endTime: number;
	readonly duration: number;
	readonly statusCode: number;
	readonly statusMessage: string | undefined;
	readonly operationName: string | undefined;
	readonly providerName: string | undefined;
	readonly agentName: string | undefined;
	readonly requestModel: string | undefined;
	readonly responseModel: string | undefined;
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly cachedTokens: number;
	readonly toolName: string | undefined;
	readonly attributes: Readonly<Record<string, string>>;
	readonly events: readonly IOTelDiagnosticsSpanEvent[];
}

export interface IOTelDiagnosticsLog {
	readonly id: string;
	readonly traceId: string;
	readonly spanId: string;
	readonly timestamp: number;
	readonly name: string;
	readonly body: string | undefined;
	readonly severity: 'info' | 'error';
}

export interface IOTelDiagnosticsTraceDetails {
	readonly trace: IOTelDiagnosticsTrace;
	readonly spans: readonly IOTelDiagnosticsSpan[];
}

export interface IOTelDiagnosticsService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;

	resolveSessionUri(sessionUri: string): Promise<IOTelDiagnosticsSessionIdentity | undefined>;
	getSessionSummary(sessionUri: string): Promise<IOTelDiagnosticsSessionSummary | undefined>;
	getSessionMessages(sessionUri: string): Promise<readonly IOTelDiagnosticsMessage[]>;
	getSessionTraces(sessionUri: string): Promise<readonly IOTelDiagnosticsTrace[]>;
	getSessionLogs(sessionUri: string): Promise<readonly IOTelDiagnosticsLog[]>;
	getTraceDetails(traceId: string): Promise<IOTelDiagnosticsTraceDetails | undefined>;
}

export const IOTelDiagnosticsService = createDecorator<IOTelDiagnosticsService>('otelDiagnosticsService');
