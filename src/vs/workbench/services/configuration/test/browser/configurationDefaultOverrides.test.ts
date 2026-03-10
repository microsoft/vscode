/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkbenchAssignmentService } from '../../../assignment/common/assignmentService.js';
import { NullExtensionService } from '../../../extensions/common/extensions.js';
import { ConfigurationDefaultOverridesContribution } from '../../browser/configurationService.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';

class MockAssignmentService implements IWorkbenchAssignmentService {
	_serviceBrand: undefined;

	private readonly _onDidRefetchAssignments = new Emitter<void>();
	readonly onDidRefetchAssignments = this._onDidRefetchAssignments.event;

	private readonly treatments = new Map<string, unknown>();

	setTreatment(name: string, value: unknown): void {
		this.treatments.set(name, value);
	}

	fireRefetch(): void {
		this._onDidRefetchAssignments.fire();
	}

	async getCurrentExperiments(): Promise<string[] | undefined> {
		return [];
	}

	async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
		return this.treatments.get(name) as T | undefined;
	}

	addTelemetryAssignmentFilter(): void { }

	dispose(): void {
		this._onDidRefetchAssignments.dispose();
	}
}

class MockConfigurationService {
	reloadConfiguration(_target: ConfigurationTarget): void { }
}

suite('ConfigurationDefaultOverridesContribution', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	let assignmentService: MockAssignmentService;
	let localDisposables: DisposableStore;

	setup(() => {
		localDisposables = disposables.add(new DisposableStore());
		assignmentService = new MockAssignmentService();
		localDisposables.add(assignmentService);
	});

	function createContribution(): ConfigurationDefaultOverridesContribution {
		const contribution = new ConfigurationDefaultOverridesContribution(
			assignmentService,
			new NullExtensionService(),
			new MockConfigurationService() as unknown as any,
			new NullLogService()
		);
		localDisposables.add(contribution);
		return contribution;
	}

	test('applies experiment treatment to a setting without experimentMode', async () => {
		configurationRegistry.registerConfiguration({
			id: 'test.experiments',
			properties: {
				'test.experiments.noMode': {
					type: 'boolean',
					default: false,
				}
			}
		});
		localDisposables.add({ dispose: () => configurationRegistry.deregisterConfigurations([{ id: 'test.experiments', properties: { 'test.experiments.noMode': { type: 'boolean', default: false } } }]) });

		assignmentService.setTreatment('config.test.experiments.noMode', true);
		createContribution();

		// Wait for the async processing
		await Event.toPromise(configurationRegistry.onDidUpdateConfiguration);

		const properties = configurationRegistry.getConfigurationProperties();
		assert.notStrictEqual(properties['test.experiments.noMode']?.defaultValueSource, undefined, 'The default value source should have been set by experiment');
	});

	test('uses config.{settingId} as the experiment name', async () => {
		configurationRegistry.registerConfiguration({
			id: 'test.experiments.naming',
			properties: {
				'test.experiments.naming.setting': {
					type: 'string',
					default: 'original',
				}
			}
		});
		localDisposables.add({ dispose: () => configurationRegistry.deregisterConfigurations([{ id: 'test.experiments.naming', properties: { 'test.experiments.naming.setting': { type: 'string', default: 'original' } } }]) });

		// Treatment name must be `config.${settingId}`
		assignmentService.setTreatment('config.test.experiments.naming.setting', 'experiment-value');
		createContribution();

		await Event.toPromise(configurationRegistry.onDidUpdateConfiguration);

		const properties = configurationRegistry.getConfigurationProperties();
		assert.strictEqual(properties['test.experiments.naming.setting']?.default, 'original');
	});

	test('does not apply experiment treatment when value equals default', async () => {
		configurationRegistry.registerConfiguration({
			id: 'test.experiments.sameDefault',
			properties: {
				'test.experiments.sameDefault.setting': {
					type: 'boolean',
					default: true,
				}
			}
		});
		localDisposables.add({ dispose: () => configurationRegistry.deregisterConfigurations([{ id: 'test.experiments.sameDefault', properties: { 'test.experiments.sameDefault.setting': { type: 'boolean', default: true } } }]) });

		// Treatment value same as default
		assignmentService.setTreatment('config.test.experiments.sameDefault.setting', true);
		createContribution();

		// Give the async processing time to complete
		await new Promise(resolve => setTimeout(resolve, 50));

		// Since value equals default, no override should be registered
		const properties = configurationRegistry.getConfigurationProperties();
		assert.strictEqual(properties['test.experiments.sameDefault.setting']?.defaultValueSource, undefined);
	});

	test('setting without experimentMode defaults to auto and re-applies on refetch', async () => {
		configurationRegistry.registerConfiguration({
			id: 'test.experiments.autoDefault',
			properties: {
				'test.experiments.autoDefault.setting': {
					type: 'number',
					default: 0,
				}
			}
		});
		localDisposables.add({ dispose: () => configurationRegistry.deregisterConfigurations([{ id: 'test.experiments.autoDefault', properties: { 'test.experiments.autoDefault.setting': { type: 'number', default: 0 } } }]) });

		assignmentService.setTreatment('config.test.experiments.autoDefault.setting', 42);
		createContribution();

		await Event.toPromise(configurationRegistry.onDidUpdateConfiguration);

		// Now change the treatment and refetch
		assignmentService.setTreatment('config.test.experiments.autoDefault.setting', 99);
		assignmentService.fireRefetch();

		await Event.toPromise(configurationRegistry.onDidUpdateConfiguration);
	});

	test('setting with experimentMode startup does not re-apply on refetch', async () => {
		configurationRegistry.registerConfiguration({
			id: 'test.experiments.startupMode',
			properties: {
				'test.experiments.startupMode.setting': {
					type: 'number',
					default: 0,
					experimentMode: 'startup',
				}
			}
		});
		localDisposables.add({ dispose: () => configurationRegistry.deregisterConfigurations([{ id: 'test.experiments.startupMode', properties: { 'test.experiments.startupMode.setting': { type: 'number', default: 0, experimentMode: 'startup' } } }]) });

		assignmentService.setTreatment('config.test.experiments.startupMode.setting', 42);
		createContribution();

		await Event.toPromise(configurationRegistry.onDidUpdateConfiguration);

		// Now change the treatment and refetch — startup mode should NOT re-apply
		let overrideRegistered = false;
		const listener = localDisposables.add(configurationRegistry.onDidUpdateConfiguration(() => {
			overrideRegistered = true;
		}));
		assignmentService.setTreatment('config.test.experiments.startupMode.setting', 99);
		assignmentService.fireRefetch();

		// Give the async processing time
		await new Promise(resolve => setTimeout(resolve, 50));

		assert.strictEqual(overrideRegistered, false, 'Startup mode setting should not be refetched');
		listener.dispose();
	});

	test('does not apply experiment when treatment returns undefined', async () => {
		configurationRegistry.registerConfiguration({
			id: 'test.experiments.noTreatment',
			properties: {
				'test.experiments.noTreatment.setting': {
					type: 'string',
					default: 'original',
				}
			}
		});
		localDisposables.add({ dispose: () => configurationRegistry.deregisterConfigurations([{ id: 'test.experiments.noTreatment', properties: { 'test.experiments.noTreatment.setting': { type: 'string', default: 'original' } } }]) });

		// No treatment set — getTreatment returns undefined
		createContribution();

		await new Promise(resolve => setTimeout(resolve, 50));

		const properties = configurationRegistry.getConfigurationProperties();
		assert.strictEqual(properties['test.experiments.noTreatment.setting']?.defaultValueSource, undefined);
	});
});
