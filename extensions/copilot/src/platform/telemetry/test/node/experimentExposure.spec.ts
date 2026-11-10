/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import type { IExperimentationService as ITASExperimentationService } from 'vscode-tas-client';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ICopilotTokenStore } from '../../../authentication/common/copilotTokenStore';
import { IConfigurationService } from '../../../configuration/common/configurationService';
import { IVSCodeExtensionContext } from '../../../extContext/common/extensionContext';
import { ILogService } from '../../../log/common/logService';
import { createPlatformServices } from '../../../test/node/services';
import { EXP_EXPOSURE_EVENT, EXPOSURE_GATE_TREATMENTS, ExperimentExposureTracker, exposureMetadata, IExperimentExposure, IExposureContext, sendExperimentExposureTelemetry, TreatmentValue } from '../../common/experimentExposure';
import { TelemetryDestination, TelemetryEventMeasurements, TelemetryEventProperties, TelemetryTrustedValue } from '../../common/telemetry';
import { BaseExperimentationService, TASClientDelegateFn } from '../../node/baseExperimentationService';

const VSCODE_GATE = EXPOSURE_GATE_TREATMENTS.vscode;

const CONTEXT: IExposureContext = {
	dataVersion: '42',
	entryPoint: 'GitHub.copilot-chat',
	trackingId: 'tid-1',
	deviceId: 'device-1',
};

function createTracker(treatments: Record<string, TreatmentValue>) {
	const exposures: IExperimentExposure[] = [];
	const tracker = new ExperimentExposureTracker('vscode', name => treatments[name], () => CONTEXT, exposure => exposures.push(exposure));
	return { tracker, exposures };
}

describe('ExperimentExposureTracker', () => {
	it('reports the first read of each flag and the next read after its value changes', () => {
		const { tracker, exposures } = createTracker({ [VSCODE_GATE]: true });

		tracker.onRead('copilotchat.a', 'treatment');
		tracker.onRead('copilotchat.a', 'treatment');
		tracker.onRead('copilotchat.b', false);
		tracker.onRead('copilotchat.a', 'control');

		expect(exposures.map(e => [e.flag, e.value])).toEqual([
			['copilotchat.a', 'treatment'],
			['copilotchat.b', false],
			['copilotchat.a', 'control'],
		]);
		expect(exposures[0]).toEqual({ ...CONTEXT, flag: 'copilotchat.a', value: 'treatment', surface: 'vscode' });
	});

	it('does not report while the gate is off, and reports the first read once it is on', () => {
		const treatments: Record<string, TreatmentValue> = { [VSCODE_GATE]: false };
		const { tracker, exposures } = createTracker(treatments);

		tracker.onRead('copilotchat.a', true);
		expect(exposures).toHaveLength(0);

		treatments[VSCODE_GATE] = true;
		tracker.onRead('copilotchat.a', true);
		expect(exposures).toHaveLength(1);
	});

	it('treats a non-boolean gate value as off', () => {
		const { tracker, exposures } = createTracker({ [VSCODE_GATE]: 'true' });

		tracker.onRead('copilotchat.a', true);

		expect(exposures).toHaveLength(0);
	});

	it('never reports unassigned reads or reads of a gate', () => {
		const { tracker, exposures } = createTracker({ [VSCODE_GATE]: true });

		tracker.onRead('copilotchat.missing', undefined);
		tracker.onRead(VSCODE_GATE, true);

		expect(exposures).toHaveLength(0);
	});

	it('does not throw when building the context or reporting fails', () => {
		const failingContext = new ExperimentExposureTracker('vscode', () => true, () => { throw new Error('boom'); }, () => { });
		const failingReport = new ExperimentExposureTracker('vscode', () => true, () => CONTEXT, () => { throw new Error('boom'); });

		expect(() => failingContext.onRead('copilotchat.a', 1)).not.toThrow();
		expect(() => failingReport.onRead('copilotchat.a', 1)).not.toThrow();
	});

	it('does not report a flag again when reporting reads it', () => {
		const exposures: IExperimentExposure[] = [];
		let tracker: ExperimentExposureTracker;
		tracker = new ExperimentExposureTracker('vscode', () => true, () => CONTEXT, exposure => {
			exposures.push(exposure);
			tracker.onRead('copilotchat.a', 1);
		});

		tracker.onRead('copilotchat.a', 1);

		expect(exposures).toHaveLength(1);
	});
});

describe('exposureMetadata', () => {
	it('has the same keys and values as the monolith exp_exposure metadata', () => {
		expect(exposureMetadata({ ...CONTEXT, flag: 'copilotchat.a', value: 15, surface: 'vscode' })).toEqual({
			flag: 'copilotchat.a',
			value: '15',
			value_type: 'number',
			trigger: 'automatic',
			data_version: '42',
			surface: 'vscode',
			entry_point: 'GitHub.copilot-chat',
			assignment_units: '{"copilot_tracking_id":"tid-1","device_id":"device-1"}',
			sdk: 'copilot_chat_ts',
			sdk_version: '1.0.0',
		});
	});

	it('leaves the tracking ID out of the units when signed out', () => {
		const metadata = exposureMetadata({ ...CONTEXT, trackingId: undefined, flag: 'copilotchat.a', value: true, surface: 'vscode' });

		expect(metadata.assignment_units).toBe('{"device_id":"device-1"}');
		expect(metadata.value).toBe('true');
		expect(metadata.value_type).toBe('bool');
	});
});

describe('sendExperimentExposureTelemetry', () => {
	it('sends exp_exposure to GitHub and Microsoft telemetry with the metadata as trusted properties', () => {
		const sent: { eventName: string; destination: TelemetryDestination; properties?: TelemetryEventProperties; measurements?: TelemetryEventMeasurements }[] = [];
		const exposure: IExperimentExposure = { ...CONTEXT, flag: 'copilotchat.a', value: 'treatment', surface: 'vscode' };
		sendExperimentExposureTelemetry({
			sendTelemetryEvent: (eventName: string, destination: TelemetryDestination, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements) => {
				sent.push({ eventName, destination, properties, measurements });
			}
		}, exposure);

		expect(sent).toHaveLength(1);
		const [event] = sent;
		expect(event.eventName).toBe(EXP_EXPOSURE_EVENT);
		expect(event.destination).toEqual({ github: true, microsoft: true });
		expect(event.properties).toEqual(Object.fromEntries(Object.entries(exposureMetadata(exposure)).map(([k, v]) => [k, new TelemetryTrustedValue(v)])));
		expect(event.measurements).toBeUndefined();
	});
});

class MapTASService implements ITASExperimentationService {
	readonly initializePromise = Promise.resolve();
	readonly initialFetch = Promise.resolve();

	constructor(readonly treatments: Map<string, TreatmentValue>) { }

	isFlightEnabled(): boolean { return false; }
	isCachedFlightEnabled(): Promise<boolean> { return Promise.resolve(false); }
	isFlightEnabledAsync(): Promise<boolean> { return Promise.resolve(false); }
	getTreatmentVariable<T extends boolean | number | string>(_configId: string, name: string): T | undefined {
		return this.treatments.get(name) as T | undefined;
	}
	getTreatmentVariableAsync<T extends boolean | number | string>(configId: string, name: string): Promise<T | undefined> {
		return Promise.resolve(this.getTreatmentVariable<T>(configId, name));
	}
	dispose(): void { }
}

class ExposingExperimentationService extends BaseExperimentationService {
	readonly exposures: IExperimentExposure[] = [];

	constructor(
		treatments: Map<string, TreatmentValue>,
		@IVSCodeExtensionContext extensionContext: IVSCodeExtensionContext,
		@ICopilotTokenStore tokenStore: ICopilotTokenStore,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService logService: ILogService
	) {
		const delegateFn: TASClientDelegateFn = () => new MapTASService(treatments);
		super(delegateFn, extensionContext, tokenStore, configurationService, logService);
		this.enableExposureEvents(() => CONTEXT, exposure => this.exposures.push(exposure));
	}
}

describe('BaseExperimentationService exposure', () => {
	function createService(treatments: Map<string, TreatmentValue>) {
		const accessor = createPlatformServices().createTestingAccessor();
		return accessor.get(IInstantiationService).createInstance(ExposingExperimentationService, treatments);
	}

	it('exposes assigned reads, including scoped keys, when the VS Code gate is on', () => {
		const service = createService(new Map<string, TreatmentValue>([
			[`/vscode/${VSCODE_GATE}`, true],
			['/vscode/copilotchat.scoped', 'treatment'],
			['copilotchat.legacy', false],
		]));

		expect(service.getTreatmentVariable('copilotchat.scoped')).toBe('treatment');
		expect(service.getTreatmentVariable('copilotchat.legacy')).toBe(false);
		expect(service.getTreatmentVariable('copilotchat.missing')).toBeUndefined();
		expect(service.getTreatmentVariable(VSCODE_GATE)).toBe(true);

		expect(service.exposures.map(e => [e.flag, e.value])).toEqual([
			['copilotchat.scoped', 'treatment'],
			['copilotchat.legacy', false],
		]);
		service.dispose();
	});

	it('does not expose when the VS Code gate is not assigned', () => {
		const service = createService(new Map<string, TreatmentValue>([['copilotchat.legacy', true]]));

		expect(service.getTreatmentVariable('copilotchat.legacy')).toBe(true);

		expect(service.exposures).toHaveLength(0);
		service.dispose();
	});
});
