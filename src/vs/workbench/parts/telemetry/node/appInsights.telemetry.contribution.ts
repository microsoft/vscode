/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import Platform = require('vs/platform/platform');
import AbstractTelemetryService = require('vs/platform/telemetry/common/abstractTelemetryService');
import AppInsightsTelemetryAppender = require('vs/workbench/parts/telemetry/node/nodeAppInsightsTelemetryAppender');
import {createSyncDescriptor} from 'vs/platform/instantiation/common/descriptors';

const descriptor = createSyncDescriptor(
	AppInsightsTelemetryAppender.NodeAppInsightsTelemetryAppender
);
(<AbstractTelemetryService.ITelemetryAppendersRegistry>Platform.Registry.as(AbstractTelemetryService.Extenstions.TelemetryAppenders)).registerTelemetryAppenderDescriptor(descriptor);