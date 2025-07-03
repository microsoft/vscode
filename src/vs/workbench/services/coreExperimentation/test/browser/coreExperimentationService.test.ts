/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { CoreExperimentationService, startupExpContext } from '../../common/coreExperimentationService.js';
import { firstSessionDateStorageKey, ITelemetryService, ITelemetryData, TelemetryLevel } from '../../../../../platform/telemetry/common/telemetry.js';
import { StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';

interface ITelemetryEvent {
	eventName: string;
	data: ITelemetryData;
}

class MockTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;

	public events: ITelemetryEvent[] = [];
	public readonly telemetryLevel = TelemetryLevel.USAGE;
	public readonly sessionId = 'test-session';
	public readonly machineId = 'test-machine';
	public readonly sqmId = 'test-sqm';
	public readonly devDeviceId = 'test-device';
	public readonly firstSessionDate = 'test-date';
	public readonly sendErrorTelemetry = true;

	publicLog2<E, T>(eventName: string, data?: E): void {
		this.events.push({ eventName, data: (data as ITelemetryData) || {} });
	}

	publicLog(eventName: string, data?: ITelemetryData): void {
		this.events.push({ eventName, data: data || {} });
	}

	publicLogError(eventName: string, data?: ITelemetryData): void {
		this.events.push({ eventName, data: data || {} });
	}

	publicLogError2<E, T>(eventName: string, data?: E): void {
		this.events.push({ eventName, data: (data as ITelemetryData) || {} });
	}

	setExperimentProperty(): void { }
}

class MockProductService implements IProductService {
	declare readonly _serviceBrand: undefined;

	public quality: string = 'stable';

	get version() { return '1.0.0'; }
	get commit() { return 'test-commit'; }
	get nameLong() { return 'Test VSCode'; }
	get nameShort() { return 'VSCode'; }
	get applicationName() { return 'test-vscode'; }
	get serverApplicationName() { return 'test-server'; }
	get dataFolderName() { return '.test-vscode'; }
	get urlProtocol() { return 'test-vscode'; }
	get extensionAllowedProposedApi() { return []; }
	get extensionProperties() { return {}; }
}

suite('CoreExperimentationService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let storageService: TestStorageService;
	let telemetryService: MockTelemetryService;
	let productService: MockProductService;
	let contextKeyService: MockContextKeyService;
	let environmentService: IWorkbenchEnvironmentService;

	setup(() => {
		storageService = disposables.add(new TestStorageService());
		telemetryService = new MockTelemetryService();
		productService = new MockProductService();
		contextKeyService = new MockContextKeyService();
		environmentService = {} as IWorkbenchEnvironmentService;
	});

	test('should return experiment from storage if it exists', () => {
		storageService.store(firstSessionDateStorageKey, new Date().toUTCString(), StorageScope.APPLICATION, StorageTarget.MACHINE);

		// Set that user has already seen the experiment
		const existingExperiment = {
			cohort: 0.5,
			subCohort: 0.5,
			experimentGroup: 'control',
			iteration: 1,
			isInExperiment: true
		};
		storageService.store('coreExperimentation.startup', JSON.stringify(existingExperiment), StorageScope.APPLICATION, StorageTarget.MACHINE);

		const service = disposables.add(new CoreExperimentationService(
			storageService,
			telemetryService,
			productService,
			contextKeyService,
			environmentService
		));

		// Should not return experiment again
		assert.deepStrictEqual(service.getExperiment(), existingExperiment);

		// No telemetry should be sent for new experiment
		assert.strictEqual(telemetryService.events.length, 0);
	});

	test('should initialize experiment for new user in first session and set context key', () => {
		// Set first session date to today
		storageService.store(firstSessionDateStorageKey, new Date().toUTCString(), StorageScope.APPLICATION, StorageTarget.MACHINE);

		// Mock Math.random to return a value that puts user in experiment
		const originalMathRandom = Math.random;
		Math.random = () => 0.1; // 10% - should be in experiment for all quality levels

		try {
			const service = disposables.add(new CoreExperimentationService(
				storageService,
				telemetryService,
				productService,
				contextKeyService,
				environmentService
			));

			// Should create experiment
			const experiment = service.getExperiment();
			assert(experiment, 'Experiment should be defined');
			assert.strictEqual(experiment.isInExperiment, true);
			assert.strictEqual(experiment.iteration, 1);
			assert(experiment.cohort >= 0 && experiment.cohort < 1, 'Cohort should be between 0 and 1');
			assert(['control', 'maximizedChat', 'splitEmptyEditorChat', 'splitWelcomeChat'].includes(experiment.experimentGroup),
				'Experiment group should be one of the defined treatments');

			// Context key should be set to experiment group
			const contextValue = startupExpContext.getValue(contextKeyService);
			assert.strictEqual(contextValue, experiment.experimentGroup,
				'Context key should be set to experiment group');
		} finally {
			Math.random = originalMathRandom;
		}
	});

	test('should emit telemetry when experiment is created', () => {
		// Set first session date to today
		storageService.store(firstSessionDateStorageKey, new Date().toUTCString(), StorageScope.APPLICATION, StorageTarget.MACHINE);

		// Mock Math.random to return a value that puts user in experiment
		const originalMathRandom = Math.random;
		Math.random = () => 0.1; // 10% - should be in experiment

		try {
			const service = disposables.add(new CoreExperimentationService(
				storageService,
				telemetryService,
				productService,
				contextKeyService,
				environmentService
			));

			const experiment = service.getExperiment();
			assert(experiment, 'Experiment should be defined');

			// Check that telemetry was sent
			assert.strictEqual(telemetryService.events.length, 1);
			const telemetryEvent = telemetryService.events[0];
			assert.strictEqual(telemetryEvent.eventName, 'coreExperimentation.experimentCohort');
			// Verify telemetry data
			const data = telemetryEvent.data as any;
			assert.strictEqual(data.experimentName, 'startup');
			assert.strictEqual(data.cohort, experiment.cohort);
			assert.strictEqual(data.subCohort, experiment.subCohort);
			assert.strictEqual(data.experimentGroup, experiment.experimentGroup);
			assert.strictEqual(data.iteration, experiment.iteration);
			assert.strictEqual(data.isInExperiment, experiment.isInExperiment);
		} finally {
			Math.random = originalMathRandom;
		}
	});

	test('should not include user in experiment if random value exceeds target percentage', () => {
		// Set first session date to today
		storageService.store(firstSessionDateStorageKey, new Date().toUTCString(), StorageScope.APPLICATION, StorageTarget.MACHINE);
		productService.quality = 'stable'; // 20% target

		// Mock Math.random to return a value outside experiment range
		const originalMathRandom = Math.random;
		Math.random = () => 0.25; // 25% - should be outside 20% target for stable

		try {
			const service = disposables.add(new CoreExperimentationService(
				storageService,
				telemetryService,
				productService,
				contextKeyService,
				environmentService
			));

			// Should not create experiment
			const experiment = service.getExperiment();
			assert.strictEqual(experiment, undefined);

			// No telemetry should be sent
			assert.strictEqual(telemetryService.events.length, 0);
		} finally {
			Math.random = originalMathRandom;
		}
	});

	test('should assign correct experiment group based on cohort normalization', () => {
		// Set first session date to today
		storageService.store(firstSessionDateStorageKey, new Date().toUTCString(), StorageScope.APPLICATION, StorageTarget.MACHINE);
		productService.quality = 'stable'; // 20% target

		const testCases = [
			{ random: 0.02, expectedGroup: 'control' }, // 2% -> 10% normalized -> first 25% of experiment
			{ random: 0.07, expectedGroup: 'maximizedChat' }, // 7% -> 35% normalized -> second 25% of experiment
			{ random: 0.12, expectedGroup: 'splitEmptyEditorChat' }, // 12% -> 60% normalized -> third 25% of experiment
			{ random: 0.17, expectedGroup: 'splitWelcomeChat' } // 17% -> 85% normalized -> fourth 25% of experiment
		];

		const originalMathRandom = Math.random;

		try {
			for (const testCase of testCases) {
				Math.random = () => testCase.random;
				storageService.remove('coreExperimentation.startup', StorageScope.APPLICATION);
				telemetryService.events = []; // Reset telemetry events

				const service = disposables.add(new CoreExperimentationService(
					storageService,
					telemetryService,
					productService,
					contextKeyService,
					environmentService
				));

				const experiment = service.getExperiment();
				assert(experiment, `Experiment should be defined for random ${testCase.random}`);
				assert.strictEqual(experiment.experimentGroup, testCase.expectedGroup,
					`Expected group ${testCase.expectedGroup} for random ${testCase.random}, got ${experiment.experimentGroup}`);
			}
		} finally {
			Math.random = originalMathRandom;
		}
	});

	test('should store experiment in storage when created', () => {
		// Set first session date to today
		storageService.store(firstSessionDateStorageKey, new Date().toUTCString(), StorageScope.APPLICATION, StorageTarget.MACHINE);

		const originalMathRandom = Math.random;
		Math.random = () => 0.1; // Ensure user is in experiment

		try {
			const service = disposables.add(new CoreExperimentationService(
				storageService,
				telemetryService,
				productService,
				contextKeyService,
				environmentService
			));

			const experiment = service.getExperiment();
			assert(experiment, 'Experiment should be defined');

			// Check that experiment was stored
			const storedValue = storageService.get('coreExperimentation.startup', StorageScope.APPLICATION);
			assert(storedValue, 'Experiment should be stored');

			const storedExperiment = JSON.parse(storedValue);
			assert.strictEqual(storedExperiment.experimentGroup, experiment.experimentGroup);
			assert.strictEqual(storedExperiment.iteration, experiment.iteration);
			assert.strictEqual(storedExperiment.isInExperiment, experiment.isInExperiment);
			assert.strictEqual(storedExperiment.cohort, experiment.cohort);
			assert.strictEqual(storedExperiment.subCohort, experiment.subCohort);
		} finally {
			Math.random = originalMathRandom;
		}
	});

	test('should handle missing first session date by using current date', () => {
		// Don't set first session date - service should use current date
		const originalMathRandom = Math.random;
		Math.random = () => 0.1; // Ensure user would be in experiment

		try {
			const service = disposables.add(new CoreExperimentationService(
				storageService,
				telemetryService,
				productService,
				contextKeyService,
				environmentService
			));

			const experiment = service.getExperiment();
			assert(experiment, 'Experiment should be defined when first session date is missing');
			assert.strictEqual(telemetryService.events.length, 1);
		} finally {
			Math.random = originalMathRandom;
		}
	});

	test('should handle sub-cohort calculation correctly', () => {
		// Set first session date to today
		storageService.store(firstSessionDateStorageKey, new Date().toUTCString(), StorageScope.APPLICATION, StorageTarget.MACHINE);
		productService.quality = 'stable'; // 20% target

		const originalMathRandom = Math.random;
		Math.random = () => 0.1; // 10% cohort -> 50% normalized sub-cohort

		try {
			const service = disposables.add(new CoreExperimentationService(
				storageService,
				telemetryService,
				productService,
				contextKeyService,
				environmentService
			));

			const experiment = service.getExperiment();
			assert(experiment, 'Experiment should be defined');

			// Verify sub-cohort calculation
			const expectedSubCohort = 0.1 / (20 / 100); // 0.1 / 0.2 = 0.5
			assert.strictEqual(experiment.subCohort, expectedSubCohort,
				'Sub-cohort should be correctly normalized');
		} finally {
			Math.random = originalMathRandom;
		}
	});
});
