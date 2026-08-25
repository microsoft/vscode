/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubTelemetryNotification } from '@github/copilot-sdk';
import { isValidAssignmentContext } from '../../../telemetry/common/assignmentContext.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';

const ASSIGNMENT_CONTEXT_PROPERTY = 'abexp.assignmentcontext';
const SECONDARY_ASSIGNMENT_CONTEXT_PROPERTY = 'secondary_assignment_context';

// __GDPR__COMMON__ "secondary_assignment_context" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Secondary experiment assignment context assigned by CAPI during Copilot model calls." }

export class CopilotTelemetryAssignmentContext {

	private _assignmentContext: string | undefined;
	private _secondaryAssignmentContext: string | undefined;

	constructor(
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) { }

	update(notification: GitHubTelemetryNotification): void {
		this._assignmentContext = this._updateProperty(
			ASSIGNMENT_CONTEXT_PROPERTY,
			notification.event.exp_assignment_context,
			this._assignmentContext,
		);
		this._secondaryAssignmentContext = this._updateProperty(
			SECONDARY_ASSIGNMENT_CONTEXT_PROPERTY,
			notification.event.properties.secondary_assignment_context,
			this._secondaryAssignmentContext,
		);
	}

	private _updateProperty(name: string, value: string | undefined, currentValue: string | undefined): string | undefined {
		if (!value || value === currentValue || !isValidAssignmentContext(value)) {
			return currentValue;
		}

		this._telemetryService.setExperimentProperty(name, value);
		return value;
	}
}
