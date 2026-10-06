/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';


export function logAutomationViewShown(telemetryService: ITelemetryService): void {
	type AutomationViewShownEvent = {
		surface: 'agentsWindow';
	};

	type AutomationViewShownClassification = {
		surface: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The bounded surface that displayed the Automations view.' };
		owner: 'ulugbekna';
		comment: 'Tracks when the Agents window Automations view is rendered.';
	};

	telemetryService.publicLog2<AutomationViewShownEvent, AutomationViewShownClassification>('automation.viewShown', { surface: 'agentsWindow' });
}


type AutomationDialogOperation = 'create' | 'update';
type AutomationDialogOutcome = 'saved' | 'cancelled' | 'validationFailed' | 'captureFailed' | 'persistenceFailed';

type AutomationDialogOutcomeEvent = {
	operation: AutomationDialogOperation;
	outcome: AutomationDialogOutcome;
};

type AutomationDialogOutcomeClassification = {
	operation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the dialog was creating or updating an Automation.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The bounded dialog or post-dialog persistence outcome.' };
	owner: 'ulugbekna';
	comment: 'Tracks Automation dialog conversion and failures without collecting definition content or identifiers.';
};

export class AutomationDialogTelemetry {

	private readonly _reportedOutcomes = new Set<AutomationDialogOutcome>();
	private _completed = false;

	constructor(
		private readonly _telemetryService: ITelemetryService,
		private readonly _operation: AutomationDialogOperation,
	) {
		if (_operation === 'create') {
			type AutomationNewInitiatedEvent = {
				surface: 'agentsWindow';
			};

			type AutomationNewInitiatedClassification = {
				surface: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The bounded surface where the new Automation dialog was initiated.' };
				owner: 'ulugbekna';
				comment: 'Tracks initiation of a new Automation dialog without collecting its source content.';
			};

			this._telemetryService.publicLog2<AutomationNewInitiatedEvent, AutomationNewInitiatedClassification>('automation.newInitiated', { surface: 'agentsWindow' });
		}
	}

	validationFailed(): void {
		this._report('validationFailed');
	}

	captureFailed(): void {
		this._report('captureFailed');
	}

	complete(saved: boolean): void {
		if (this._completed) {
			return;
		}
		this._completed = true;
		this._report(saved ? 'saved' : 'cancelled');
	}

	private _report(outcome: AutomationDialogOutcome): void {
		if (this._reportedOutcomes.has(outcome)) {
			return;
		}
		this._reportedOutcomes.add(outcome);
		this._telemetryService.publicLog2<AutomationDialogOutcomeEvent, AutomationDialogOutcomeClassification>('automation.dialogOutcome', {
			operation: this._operation,
			outcome,
		});
	}
}

export async function withAutomationDialogPersistenceTelemetry<T>(
	telemetryService: ITelemetryService,
	operation: AutomationDialogOperation,
	persist: () => Promise<T>,
): Promise<T> {
	try {
		return await persist();
	} catch (error) {
		telemetryService.publicLog2<AutomationDialogOutcomeEvent, AutomationDialogOutcomeClassification>('automation.dialogOutcome', {
			operation,
			outcome: 'persistenceFailed',
		});
		throw error;
	}
}

export type AutomationConfigureOutcome = 'created' | 'updated' | 'blocked' | 'failed';

type AutomationConfigureOutcomeEvent = {
	operation: AutomationDialogOperation | 'unknown';
	outcome: AutomationConfigureOutcome;
};

type AutomationConfigureOutcomeClassification = {
	operation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether configureAutomation attempted a create, update, or could not parse the operation.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether configureAutomation created, updated, was blocked before persistence, or failed unexpectedly.' };
	owner: 'ulugbekna';
	comment: 'Tracks configureAutomation outcomes without collecting arguments, definition content, model IDs, paths, or Automation identifiers.';
};

export function logAutomationConfigureOutcome(
	telemetryService: ITelemetryService,
	operation: AutomationConfigureOutcomeEvent['operation'],
	outcome: AutomationConfigureOutcome,
): void {
	telemetryService.publicLog2<AutomationConfigureOutcomeEvent, AutomationConfigureOutcomeClassification>('automation.configureOutcome', { operation, outcome });
}
