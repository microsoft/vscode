/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubTelemetryNotification } from '@github/copilot-sdk';
import { isValidAssignmentContext } from '../../../telemetry/common/assignmentContext.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';

const SECONDARY_ASSIGNMENT_CONTEXT_PROPERTY = 'secondary.assignmentcontext';

// __GDPR__COMMON__ "secondary.assignmentcontext" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Secondary experiment assignment context assigned by CAPI during Copilot model calls." }

export class CopilotSecondaryAssignmentContext {

	private _value: string | undefined;

	constructor(
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) { }

	update(notification: GitHubTelemetryNotification): void {
		const value = notification.event.properties.secondary_assignment_context;
		if (!value || value === this._value || !isValidAssignmentContext(value)) {
			return;
		}

		this._telemetryService.setExperimentProperty(SECONDARY_ASSIGNMENT_CONTEXT_PROPERTY, value);
		this._value = value;
	}
}
