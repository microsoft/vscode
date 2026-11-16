/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAgentHostOTelService } from '../../common/otel/agentHostOTelService.js';

/**
 * Records `emitSessionTitleChanged` invocations so the OTel title-span wiring
 * tests can assert what the agent forwarded to the host telemetry pipeline. All
 * other {@link IAgentHostOTelService} members are inert no-ops.
 */
export class RecordingOTelService implements IAgentHostOTelService {
	readonly _serviceBrand: undefined;
	readonly enabled = false;
	readonly diagnosticsEnabled = false;
	emitTurnTiming(): void { }
	emitFirstResponse(): void { }
	emitUserInteraction(): void { }
	readonly titleChanges: Array<{ conversationId: string; sessionUri: string; title: string }> = [];
	async getSdkTelemetryConfig(): Promise<undefined> { return undefined; }
	async getNativeSdkTelemetryConfig(): Promise<undefined> { return undefined; }
	getSessionTraceContext(): undefined { return undefined; }
	setSessionComparisonMetadata(): void { }
	releaseSessionTraceContext(): void { }
	withTraceContext<T>(_context: undefined, fn: () => T): T { return fn(); }
	getCurrentTraceContext(): undefined { return undefined; }
	getSpansDbPath(): undefined { return undefined; }
	emitSessionTitleChanged(conversationId: string, sessionUri: string, title: string): void {
		this.titleChanges.push({ conversationId, sessionUri, title });
	}
	async flush(): Promise<void> { }
}
