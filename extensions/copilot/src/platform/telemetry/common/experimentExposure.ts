/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService, TelemetryEventProperties, TelemetryTrustedValue } from './telemetry';

/**
 * `exp_exposure` is sent the first time a session reads an assigned treatment variable, and
 * again when a later read sees a different value. Triggered experiment scorecards use it as the
 * exposure event. Its metadata matches the GitHub monolith's and the `githubexp` Go SDK's
 * `exp_exposure`, so one trigger condition works across surfaces.
 */
export const EXP_EXPOSURE_EVENT = 'exp_exposure';
export const EXPOSURE_SDK = 'copilot_chat_ts';
export const EXPOSURE_SDK_VERSION = '1.0.0';

export type ExposureSurface = 'vscode' | 'jetbrains' | 'visualstudio';

/**
 * Each surface has its own ExP gate, so exposure logging can be rolled out and turned off per
 * surface without a release. A gate is off unless its treatment variable is `true`.
 */
export const EXPOSURE_GATE_TREATMENTS: Readonly<Record<ExposureSurface, string>> = {
	vscode: 'copilotchat.expExposureEvents.vscode',
	jetbrains: 'copilotchat.expExposureEvents.jetbrains',
	visualstudio: 'copilotchat.expExposureEvents.visualstudio',
};

/**
 * The exposure surface of a chat-lib host, from its editor name (for example `JetBrains-IC` or
 * `VisualStudio`). Hosts without a surface don't log exposures.
 */
export function exposureSurfaceForEditor(editorName: string): ExposureSurface | undefined {
	const name = editorName.toLowerCase();
	if (name.includes('jetbrains')) {
		return 'jetbrains';
	}
	if (name.includes('visualstudio')) {
		return 'visualstudio';
	}
	return undefined;
}

const GATE_TREATMENT_NAMES: ReadonlySet<string> = new Set(Object.values(EXPOSURE_GATE_TREATMENTS));

export type TreatmentValue = boolean | number | string;

/** What the surface knows about the assignment when a flag is read. */
export interface IExposureContext {
	/** The ExP data version of the assignment, or empty when the client doesn't receive it. */
	readonly dataVersion: string;
	/** The extension or plugin that read the flag. */
	readonly entryPoint: string;
	/** The `copilottrackingid` ExP unit; unset when signed out. */
	readonly trackingId: string | undefined;
	/** The `devdeviceid` ExP unit. */
	readonly deviceId: string | undefined;
}

export interface IExperimentExposure extends IExposureContext {
	readonly flag: string;
	readonly value: TreatmentValue;
	readonly surface: ExposureSurface;
}

export class ExperimentExposureTracker {
	private readonly _exposed = new Map<string, TreatmentValue>();

	constructor(
		private readonly _surface: ExposureSurface,
		private readonly _readGate: (gate: string) => TreatmentValue | undefined,
		private readonly _getContext: () => IExposureContext,
		private readonly _report: (exposure: IExperimentExposure) => void,
	) { }

	/**
	 * Records a read of `flag`. Unassigned reads and gate reads never expose. A read never
	 * throws because of exposure reporting.
	 */
	onRead(flag: string, value: TreatmentValue | undefined): void {
		if (value === undefined || GATE_TREATMENT_NAMES.has(flag) || this._exposed.get(flag) === value) {
			return;
		}
		if (this._readGate(EXPOSURE_GATE_TREATMENTS[this._surface]) !== true) {
			return;
		}

		// Mark the flag before reporting: reporting can read flags (e.g. the telemetry sender
		// resolving an experiment-based setting), and that read must not report it again.
		this._exposed.set(flag, value);
		try {
			this._report({ ...this._getContext(), flag, value, surface: this._surface });
		} catch {
			// Exposure logging must never break a flag read.
		}
	}
}

export function exposureValueType(value: TreatmentValue): 'bool' | 'number' | 'string' {
	switch (typeof value) {
		case 'boolean': return 'bool';
		case 'number': return 'number';
		default: return 'string';
	}
}

/** Every ExP unit present, keyed by the analytics pipeline's entity type (as in `githubexp`). */
export function exposureAssignmentUnits(exposure: IExposureContext): Record<string, string> {
	const units: Record<string, string> = {};
	if (exposure.trackingId) {
		units.copilot_tracking_id = exposure.trackingId;
	}
	if (exposure.deviceId) {
		units.device_id = exposure.deviceId;
	}
	return units;
}

/** The event's metadata, with the same keys and values as the monolith's `exp_exposure`. */
export function exposureMetadata(exposure: IExperimentExposure): Record<string, string> {
	return {
		flag: exposure.flag,
		value: String(exposure.value),
		value_type: exposureValueType(exposure.value),
		trigger: 'automatic',
		data_version: exposure.dataVersion,
		surface: exposure.surface,
		entry_point: exposure.entryPoint,
		assignment_units: JSON.stringify(exposureAssignmentUnits(exposure)),
		sdk: EXPOSURE_SDK,
		sdk_version: EXPOSURE_SDK_VERSION,
	};
}

export function exposureTelemetryProperties(exposure: IExperimentExposure): TelemetryEventProperties {
	return Object.fromEntries(Object.entries(exposureMetadata(exposure)).map(([key, value]) => [key, new TelemetryTrustedValue(value)]));
}

/**
 * Sends `exposure` to GitHub and Microsoft telemetry. Both carry the shared
 * `abexp.assignmentcontext` property.
 */
export function sendExperimentExposureTelemetry(telemetryService: Pick<ITelemetryService, 'sendTelemetryEvent'>, exposure: IExperimentExposure): void {
	/* __GDPR__
		"exp_exposure" : {
			"owner": "siddharth-ramesh",
			"comment": "Sent the first time a session reads an assigned ExP treatment variable, and again when a later read sees a different value. Used as the exposure event of triggered experiment scorecards.",
			"flag": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The treatment variable that was read." },
			"value": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The value ExP assigned to the treatment variable." },
			"value_type": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The value's type: bool, number or string." },
			"trigger": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Always automatic: the exposure is a side effect of the read." },
			"data_version": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The ExP data version of the assignment, when known." },
			"surface": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The client surface that read the flag." },
			"entry_point": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The extension or plugin that read the flag." },
			"assignment_units": { "classification": "EndUserPseudonymizedInformation", "purpose": "FeatureInsight", "comment": "JSON of the ExP units the assignment used: the Copilot tracking ID and the device ID." },
			"sdk": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The exposure implementation." },
			"sdk_version": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The exposure implementation's version." }
		}
	*/
	telemetryService.sendTelemetryEvent(EXP_EXPOSURE_EVENT, { github: true, microsoft: true }, exposureTelemetryProperties(exposure));
}

/**
 * Sends `exposure` through the host's GitHub telemetry sender. chat-lib hosts (the Copilot
 * language server) only forward GitHub telemetry.
 */
export function sendExperimentExposureGHTelemetry(telemetryService: Pick<ITelemetryService, 'sendGHTelemetryEvent'>, exposure: IExperimentExposure): void {
	telemetryService.sendGHTelemetryEvent(EXP_EXPOSURE_EVENT, exposureTelemetryProperties(exposure));
}
