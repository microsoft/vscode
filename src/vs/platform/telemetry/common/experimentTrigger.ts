/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Extensions, getConfigurationExperimentName, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import { Registry } from '../../registry/common/platform.js';
import { ITelemetryService } from './telemetry.js';

type ExperimentTriggerEvent = {
	treatmentName: string;
};

type ExperimentTriggerClassification = {
	owner: 'benibenj';
	comment: 'Marks the moment an experiment-controlled feature decides between its control and treatment behavior. Logged in every experiment arm, at most once per window for each treatment, so triggered scorecards can be limited to users who reached that moment.';
	treatmentName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The experiment treatment whose control and treatment behavior diverge at this point, for example config.<setting id> for an experiment-controlled setting.' };
};

const loggedTreatments = new WeakMap<ITelemetryService, Set<string>>();

/**
 * Logs the `experimentTrigger` event, which triggered scorecards use to limit an
 * experiment's analysis to users who reached the moment where its control and
 * treatment behavior diverge.
 *
 * Call this where the behavior is decided, under conditions that do not depend on
 * the assigned treatment, so that every experiment arm logs it in the same
 * circumstances. The event is logged at most once per telemetry service, that is
 * per window or process, for each treatment.
 *
 * @param treatmentName The treatment that selects the behavior, as it is named in
 * the experiment. Use {@link logSettingExperimentTrigger} for experiment-controlled
 * settings.
 */
export function logExperimentTrigger(telemetryService: ITelemetryService, treatmentName: string): void {
	let logged = loggedTreatments.get(telemetryService);
	if (!logged) {
		logged = new Set<string>();
		loggedTreatments.set(telemetryService, logged);
	}
	if (logged.has(treatmentName)) {
		return;
	}
	logged.add(treatmentName);
	telemetryService.publicLog2<ExperimentTriggerEvent, ExperimentTriggerClassification>('experimentTrigger', { treatmentName });
}

/**
 * Logs the {@link logExperimentTrigger experiment trigger} of an experiment-controlled
 * setting, using the treatment through which the experiment assigns its default value.
 */
export function logSettingExperimentTrigger(telemetryService: ITelemetryService, settingId: string): void {
	const schema = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties()[settingId];
	logExperimentTrigger(telemetryService, getConfigurationExperimentName(settingId, schema?.experiment));
}
