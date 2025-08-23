// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { TelemetryEventMeasurements, TelemetryEventProperties } from '@vscode/extension-telemetry';
import { BaseLanguageClient } from 'vscode-languageclient';

export interface TelemetryReporter {
    sendTelemetryEvent(
        eventName: string,
        properties?: TelemetryEventProperties,
        measurements?: TelemetryEventMeasurements,
    ): void;
    sendTelemetryErrorEvent(
        eventName: string,
        properties?: TelemetryEventProperties,
        measurements?: TelemetryEventMeasurements,
    ): void;
}

export interface ApiForPylance {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createClient(...args: any[]): BaseLanguageClient;
    start(client: BaseLanguageClient): Promise<void>;
    stop(client: BaseLanguageClient): Promise<void>;
    getTelemetryReporter(): TelemetryReporter;
}
