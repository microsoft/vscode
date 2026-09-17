/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { IOTelDiagnosticsLog, IOTelDiagnosticsMessage, IOTelDiagnosticsService, IOTelDiagnosticsSessionIdentity, IOTelDiagnosticsSessionSummary, IOTelDiagnosticsSpan, IOTelDiagnosticsTimeWindow, IOTelDiagnosticsTrace, IOTelDiagnosticsTraceDetails, IOTelDiagnosticsTraceProjection } from '../common/otelDiagnosticsService.js';

class NullOTelDiagnosticsService implements IOTelDiagnosticsService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChange = Event.None;

	async resolveSessionUri(_sessionUri: string): Promise<IOTelDiagnosticsSessionIdentity | undefined> {
		return undefined;
	}

	async getSessionSummary(_sessionUri: string): Promise<IOTelDiagnosticsSessionSummary | undefined> {
		return undefined;
	}

	async getSessionMessages(_sessionUri: string): Promise<readonly IOTelDiagnosticsMessage[]> {
		return [];
	}

	async getSessionTraces(_sessionUri: string): Promise<readonly IOTelDiagnosticsTrace[]> {
		return [];
	}

	async getSessionTraceProjections(_sessionUri: string, _windows: readonly IOTelDiagnosticsTimeWindow[]): Promise<readonly IOTelDiagnosticsTraceProjection[]> {
		return [];
	}

	async getSessionLogs(_sessionUri: string): Promise<readonly IOTelDiagnosticsLog[]> {
		return [];
	}

	async getSessionHookSpans(_sessionUri: string): Promise<readonly IOTelDiagnosticsSpan[]> {
		return [];
	}

	async getTraceDetails(_traceId: string, _startTime?: number, _endTime?: number): Promise<IOTelDiagnosticsTraceDetails | undefined> {
		return undefined;
	}
}

registerSingleton(IOTelDiagnosticsService, NullOTelDiagnosticsService, InstantiationType.Delayed);
