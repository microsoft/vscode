/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {AbstractTelemetryService} from 'vs/platform/telemetry/common/abstractTelemetryService';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';

export class MockTelemetryService extends AbstractTelemetryService implements ITelemetryService {
}
