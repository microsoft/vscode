/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { DefaultsOnlyConfigurationService } from '../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { NullTelemetryService } from '../../../platform/telemetry/common/nullTelemetryService';
import { ITelemetryService, TelemetryEventMeasurements, TelemetryEventProperties } from '../../../platform/telemetry/common/telemetry';
import { SimpleExperimentationService } from '../../node/chatLibMain';

class TestTelemetryService extends NullTelemetryService {
	public readonly events: { eventName: string; properties?: TelemetryEventProperties; measurements?: TelemetryEventMeasurements }[] = [];

	override sendMSFTTelemetryEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void {
		this.events.push({ eventName, properties, measurements });
	}
}

describe('SimpleExperimentationService', () => {
	function createService(waitForTreatmentVariables = false, telemetryService: ITelemetryService = new NullTelemetryService()): SimpleExperimentationService {
		return new SimpleExperimentationService(waitForTreatmentVariables, new DefaultsOnlyConfigurationService(), telemetryService);
	}

	it('should initialize with no treatment variables', async () => {
		const service = createService();
		await service.hasTreatments();

		expect(service.getTreatmentVariable('nonexistent')).toBeUndefined();

		service.dispose();
	});

	it('should update multiple treatment variables at once', () => {
		const service = createService();
		const variables: Record<string, boolean | number | string> = {
			'feature-a': true,
			'feature-b': false,
			'max-count': 100,
			'experiment-id': 'exp-123'
		};

		service.updateTreatmentVariables(variables);

		expect(service.getTreatmentVariable<boolean>('feature-a')).toBe(true);
		expect(service.getTreatmentVariable<boolean>('feature-b')).toBe(false);
		expect(service.getTreatmentVariable<number>('max-count')).toBe(100);
		expect(service.getTreatmentVariable<string>('experiment-id')).toBe('exp-123');

		service.dispose();
	});

	it('should fire onDidTreatmentsChange event with all changed variables', () => {
		const service = createService();
		const events: string[][] = [];

		service.onDidTreatmentsChange((event) => {
			events.push(event.affectedTreatmentVariables);
		});

		const variables: Record<string, boolean | number | string> = {
			'feature-a': true,
			'feature-b': 50,
			'feature-c': 'test'
		};
		service.updateTreatmentVariables(variables);

		expect(events).toHaveLength(1);
		expect(events[0]).toHaveLength(3);
		expect(events[0]).toContain('feature-a');
		expect(events[0]).toContain('feature-b');
		expect(events[0]).toContain('feature-c');

		service.dispose();
	});

	it('should not fire onDidTreatmentsChange event when no variables change', () => {
		const service = createService();
		const events: string[][] = [];

		// Set initial value
		const variables1: Record<string, boolean | number | string> = {
			'feature-flag': true
		};
		service.updateTreatmentVariables(variables1);

		service.onDidTreatmentsChange((event) => {
			events.push(event.affectedTreatmentVariables);
		});

		// Update with same value
		const variables2: Record<string, boolean | number | string> = {
			'feature-flag': true
		};
		service.updateTreatmentVariables(variables2);

		expect(events).toHaveLength(0);

		service.dispose();
	});

	it('should fire onDidTreatmentsChange event only for changed variables', () => {
		const service = createService();

		// Set initial values
		const variables1: Record<string, boolean | number | string> = {
			'feature-a': true,
			'feature-b': 50
		};
		service.updateTreatmentVariables(variables1);

		const events: string[][] = [];
		service.onDidTreatmentsChange((event) => {
			events.push(event.affectedTreatmentVariables);
		});

		// Update with one changed value and one unchanged
		const variables2: Record<string, boolean | number | string> = {
			'feature-a': true, // unchanged
			'feature-b': 100 // changed
		};
		service.updateTreatmentVariables(variables2);

		expect(events).toHaveLength(1);
		expect(events[0]).toEqual(['feature-b']);

		service.dispose();
	});

	it('should overwrite existing treatment variables', () => {
		const service = createService();

		const variables1: Record<string, boolean | number | string> = {
			'feature-flag': true
		};
		service.updateTreatmentVariables(variables1);

		expect(service.getTreatmentVariable<boolean>('feature-flag')).toBe(true);

		const variables2: Record<string, boolean | number | string> = {
			'feature-flag': false
		};
		service.updateTreatmentVariables(variables2);

		expect(service.getTreatmentVariable<boolean>('feature-flag')).toBe(false);

		service.dispose();
	});

	it('should wait for treatment variables when waitForTreatmentVariables = true', async () => {
		const service = createService(true);

		// hasTreatments() should not resolve until updateTreatmentVariables() is called
		let hasTreatmentsResolved = false;
		const hasTreatmentsPromise = service.hasTreatments().then(() => {
			hasTreatmentsResolved = true;
		});

		// Give a bit of time to ensure promise doesn't resolve immediately
		await new Promise(resolve => setTimeout(resolve, 10));
		expect(hasTreatmentsResolved).toBe(false);

		// Now update treatment variables
		const variables: Record<string, boolean | number | string> = {
			'test-feature': true
		};
		service.updateTreatmentVariables(variables);

		// Wait for hasTreatments to resolve
		await hasTreatmentsPromise;
		expect(hasTreatmentsResolved).toBe(true);
		expect(service.getTreatmentVariable<boolean>('test-feature')).toBe(true);

		service.dispose();
	});

	it('should remove treatment variable when omitted from update', () => {
		const service = createService();

		// Set initial variables
		const variables1: Record<string, boolean | number | string> = {
			'feature-a': true,
			'feature-b': 50,
			'feature-c': 'test'
		};
		service.updateTreatmentVariables(variables1);

		expect(service.getTreatmentVariable<boolean>('feature-a')).toBe(true);
		expect(service.getTreatmentVariable<number>('feature-b')).toBe(50);
		expect(service.getTreatmentVariable<string>('feature-c')).toBe('test');

		const events: string[][] = [];
		service.onDidTreatmentsChange((event) => {
			events.push(event.affectedTreatmentVariables);
		});

		// Remove feature-b by omitting it
		const variables2: Record<string, boolean | number | string> = {
			'feature-a': true,
			'feature-c': 'test'
		};
		service.updateTreatmentVariables(variables2);

		expect(service.getTreatmentVariable<boolean>('feature-a')).toBe(true);
		expect(service.getTreatmentVariable<number>('feature-b')).toBeUndefined();
		expect(service.getTreatmentVariable<string>('feature-c')).toBe('test');

		expect(events).toHaveLength(1);
		expect(events[0]).toEqual(['feature-b']);

		service.dispose();
	});

	it('should emit telemetry when a treatment variable is evaluated', () => {
		const telemetryService = new TestTelemetryService();
		const service = createService(false, telemetryService);
		service.updateTreatmentVariables({ 'feature-flag': true });

		expect(service.getTreatmentVariable<boolean>('feature-flag')).toBe(true);

		const events = telemetryService.events.filter(event => event.eventName === 'copilot.experimentEvaluated');
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			eventName: 'copilot.experimentEvaluated',
			properties: {
				treatmentName: 'feature-flag',
				valueKind: 'boolean'
			},
			measurements: {
				hasValue: 1
			}
		});

		service.dispose();
	});
});
