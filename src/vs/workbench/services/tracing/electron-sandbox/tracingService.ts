/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ITracingService } from '../common/tracing.js';
import { TracingService } from '../common/tracingService.js';

registerSingleton(ITracingService, TracingService, InstantiationType.Delayed);
