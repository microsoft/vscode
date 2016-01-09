/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as Platform from 'vs/platform/platform';
import * as AbstractTelemetryService from 'vs/platform/telemetry/common/abstractTelemetryService';
import * as AppInsightsTelemetryAppender from 'vs/workbench/parts/telemetry/node/nodeAppInsightsTelemetryAppender';
import {createSyncDescriptor} from 'vs/platform/instantiation/common/descriptors';
import {ITelemetryAppender} from 'vs/platform/telemetry/common/telemetry';

const descriptor = createSyncDescriptor(
	AppInsightsTelemetryAppender.NodeAppInsightsTelemetryAppender
);
(<AbstractTelemetryService.ITelemetryAppendersRegistry>Platform.Registry.as(AbstractTelemetryService.Extenstions.TelemetryAppenders)).registerTelemetryAppenderDescriptor(descriptor);