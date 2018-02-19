/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { WorkbenchMessageService } from 'vs/workbench/services/message/browser/messageService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export class MessageService extends WorkbenchMessageService {

	constructor(
		container: HTMLElement,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(container, telemetryService);
	}
}
