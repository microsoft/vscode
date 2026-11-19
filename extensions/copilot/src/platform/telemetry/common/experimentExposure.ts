/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService, TelemetryEventProperties, TelemetryTrustedValue } from './telemetry';

/**
 * `exp_exposure` is sent the first time a session reads an assigned treatment variable, and
 * again when a later read sees a different value. Triggered experiment scorecards use it as the
 * exposure event. Its properties are the same as `query-expfeature`'s, which tas-client sends when
 * Copilot in VS Code queries a treatment variable, so a trigger on `ABExp.queriedFeature` carries
 * over to `exp_exposure` on every surface.
 *
 * A triggered scorecard is only valid when its trigger fires in every arm under the same
 * conditions. Exposures don't guarantee that on their own:
 * - Only assigned values are exposed. A flag whose control arm doesn't set it (and falls back to
 *   the code's default) is never exposed in control, so every arm, including control, must set it.
 * - Only values from Copilot's own ExP client are exposed. For settings tagged `onExp`, VS Code
 *   core can apply its own assignment as the setting's default; `getExperimentBasedConfig` falls
 *   back to that default without a treatment read, so such values aren't exposed.
 * - A flag is only exposed where code reads it. A flag read only when another flag is on (e.g.
 *   a tuning value behind a treatment-only feature flag) is exposed in that arm only, so trigger
 *   on the outer flag, which every arm reads.
 */
export const EXP_EXPOSURE_EVENT = 'exp_exposure';

/** The config ID tas-client prefixes to a treatment variable in `ABExp.queriedFeature`. */
const QUERIED_FEATURE_CONFIG_ID = 'vscode';

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
	/** The `copilottrackingid` ExP unit; unset when signed out. */
	readonly trackingId: string | undefined;
}

export interface IExperimentExposure extends IExposureContext {
	readonly flag: string;
	readonly value: TreatmentValue;
	readonly surface: ExposureSurface;
}

export class ExperimentExposureTracker {
	private readonly _exposed = new Map<string, TreatmentValue>();
	/** Reads made while the unit wasn't known, with the value they saw. */
	private readonly _pending = new Map<string, TreatmentValue>();
	private _trackingId: string | undefined;

	/**
	 * @param _readTreatment Reads a treatment variable without exposing it.
	 * @param _getContext Returns undefined while the assignment's unit isn't known yet (e.g. while
	 * signing in). Reads made then are remembered and exposed once it's known, if the value is
	 * still the same (see {@link exposePendingReads}).
	 */
	constructor(
		private readonly _surface: ExposureSurface,
		private readonly _readTreatment: (name: string) => TreatmentValue | undefined,
		private readonly _getContext: () => IExposureContext | undefined,
		private readonly _report: (exposure: IExperimentExposure) => void,
	) { }

	/**
	 * Records a read of `flag`. Unassigned reads and gate reads never expose. A read never
	 * throws because of exposure reporting.
	 */
	onRead(flag: string, value: TreatmentValue | undefined): void {
		if (GATE_TREATMENT_NAMES.has(flag)) {
			return;
		}
		if (value === undefined) {
			this._exposed.delete(flag);
			this._pending.delete(flag);
			return;
		}
		const context = this._tryGetContext();
		if (!context) {
			// Code often reads a flag only once (observables and caches keep the value, and only
			// changed treatments are re-read), so a read now may be the only one.
			this._pending.set(flag, value);
			return;
		}
		this._pending.delete(flag);
		this._exposePending(context);
		this._expose(flag, value, context);
	}

	/**
	 * Exposes reads made while the unit wasn't known, now that it may be. Call it when the unit
	 * or the assignment may have changed; any later read also does it.
	 */
	exposePendingReads(): void {
		if (this._pending.size === 0) {
			return;
		}
		const context = this._tryGetContext();
		if (context) {
			this._exposePending(context);
		}
	}

	/** Forgets past exposures, so that the next read of each flag exposes it under a new assignment. */
	reset(): void {
		this._exposed.clear();
	}

	private _tryGetContext(): IExposureContext | undefined {
		try {
			return this._getContext();
		} catch {
			return undefined;
		}
	}

	private _exposePending(context: IExposureContext): void {
		for (const [flag, value] of [...this._pending]) {
			let current: TreatmentValue | undefined;
			try {
				current = this._readTreatment(flag);
			} catch {
				current = undefined;
			}
			if (current === undefined) {
				// The assignment may still be loading (e.g. a new account's); try again later.
				continue;
			}
			this._pending.delete(flag);
			// A changed value isn't what the code used; the read that picks up the new value exposes it.
			if (current === value) {
				this._expose(flag, value, context);
			}
		}
	}

	private _expose(flag: string, value: TreatmentValue, context: IExposureContext): void {
		if (context.trackingId !== this._trackingId) {
			// A different account has its own assignment, so its reads expose again.
			this._trackingId = context.trackingId;
			this._exposed.clear();
		}
		if (this._exposed.get(flag) === value || this._readTreatment(EXPOSURE_GATE_TREATMENTS[this._surface]) !== true) {
			return;
		}

		// Mark the flag before reporting: reporting can read flags (e.g. the telemetry sender
		// resolving an experiment-based setting), and that read must not report it again.
		this._exposed.set(flag, value);
		try {
			this._report({ ...context, flag, value, surface: this._surface });
		} catch {
			// Exposure logging must never break a flag read.
		}
	}
}

/** The event's properties: the same as `query-expfeature`'s. */
export function exposureTelemetryProperties(exposure: IExperimentExposure): TelemetryEventProperties {
	return { 'ABExp.queriedFeature': new TelemetryTrustedValue(`${QUERIED_FEATURE_CONFIG_ID}.${exposure.flag}`) };
}

/**
 * Sends `exposure` to Microsoft telemetry, and to GitHub telemetry when it has a tracking ID.
 * Both carry the shared `abexp.assignmentcontext` property. Without a tracking ID (signed out),
 * the Microsoft event also omits the senders' cached `common.tid`.
 */
export function sendExperimentExposureTelemetry(telemetryService: Pick<ITelemetryService, 'sendTelemetryEvent'>, exposure: IExperimentExposure): void {
	/* __GDPR__
		"exp_exposure" : {
			"owner": "siddharth-ramesh",
			"comment": "Sent the first time a session reads an assigned ExP treatment variable, and again when a later read sees a different value. Used as the exposure event of triggered experiment scorecards. Has the same properties as query-expfeature.",
			"ABExp.queriedFeature": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The treatment variable that was read, prefixed with the vscode config ID as in query-expfeature." }
		}
	*/
	const properties = exposureTelemetryProperties(exposure);
	if (exposure.trackingId) {
		telemetryService.sendTelemetryEvent(EXP_EXPOSURE_EVENT, { github: true, microsoft: true }, properties);
	} else {
		telemetryService.sendTelemetryEvent(EXP_EXPOSURE_EVENT, { github: false, microsoft: true }, { ...properties, 'common.tid': '' });
	}
}

/**
 * Sends `exposure` through the host's GitHub telemetry sender. chat-lib hosts (the Copilot
 * language server) only forward GitHub telemetry.
 */
export function sendExperimentExposureGHTelemetry(telemetryService: Pick<ITelemetryService, 'sendGHTelemetryEvent'>, exposure: IExperimentExposure): void {
	telemetryService.sendGHTelemetryEvent(EXP_EXPOSURE_EVENT, exposureTelemetryProperties(exposure));
}
