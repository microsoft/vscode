/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryAppender } from './telemetryUtils.js';

// Son of Anton: Microsoft 1DS telemetry has been removed.
// This module retains the interface so that consumers compile,
// but all telemetry submission is a no-op.

export interface IAppInsightsCore {
	pluginVersionString: string;
	track(item: unknown): void;
	unload(isAsync: boolean, unloadComplete: (unloadState: unknown) => void): void;
}

export abstract class AbstractOneDataSystemAppender implements ITelemetryAppender {

	protected _aiCoreOrKey: IAppInsightsCore | string | undefined;

	constructor(
		_isInternalTelemetry: boolean,
		_eventPrefix: string,
		_defaultData: { [key: string]: unknown } | null,
		_iKeyOrClientFactory: string | (() => IAppInsightsCore),
		_xhrOverride?: unknown
	) {
		// No-op: telemetry disabled
		this._aiCoreOrKey = undefined;
	}

	log(_eventName: string, _data?: unknown): void {
		// No-op: telemetry disabled
	}

	flush(): Promise<void> {
		return Promise.resolve(undefined);
	}
}
