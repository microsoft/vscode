/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IStringDictionary } from '../../../../../base/common/collections.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationOverrides, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions, IConfigurationNode, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IStorageService, WillSaveStateReason } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { DEFAULT_NAMED_LAYOUT_ID, INamedLayoutParticipant, NAMED_LAYOUTS_ENABLED_SETTING } from '../../common/namedLayouts.js';
import { NamedLayoutsService } from '../../common/namedLayoutsService.js';

const LAYOUT_SETTING = 'namedLayoutsTest.setting';

class TestLayoutConfigurationService extends TestConfigurationService {

	private layoutConfiguration: IStringDictionary<unknown> = {};

	override getValue<T>(arg1?: string | IConfigurationOverrides, arg2?: IConfigurationOverrides): T | undefined {
		if (typeof arg1 === 'string' && Object.hasOwn(this.layoutConfiguration, arg1)) {
			return this.layoutConfiguration[arg1] as T;
		}
		return super.getValue<T>(arg1, arg2);
	}

	getLayoutConfiguration(): IStringDictionary<unknown> {
		return { ...this.layoutConfiguration };
	}

	setLayoutConfiguration(settings: IStringDictionary<unknown>): void {
		this.layoutConfiguration = { ...settings };
	}
}

class TestParticipant implements INamedLayoutParticipant {

	readonly id = 'test';

	state = 'initial';

	capture(): string {
		return this.state;
	}

	async apply(state: unknown): Promise<void> {
		if (typeof state === 'string') {
			this.state = state;
		}
	}
}

suite('NamedLayoutsService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const configurationNode: IConfigurationNode = {
		id: 'namedLayoutsTest',
		properties: {
			[LAYOUT_SETTING]: { type: 'string', default: 'defaultValue', layoutOverridable: true }
		}
	};

	let configurationService: TestLayoutConfigurationService;
	let storageService: TestStorageService;
	let instantiationService: TestInstantiationService;

	suiteSetup(() => Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration(configurationNode));
	suiteTeardown(() => Registry.as<IConfigurationRegistry>(Extensions.Configuration).deregisterConfigurations([configurationNode]));

	setup(() => {
		configurationService = new TestLayoutConfigurationService({ [NAMED_LAYOUTS_ENABLED_SETTING]: true, [LAYOUT_SETTING]: 'userValue' });
		storageService = disposables.add(new TestStorageService());
		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ILogService, new NullLogService());
	});

	function createService(participant: INamedLayoutParticipant): NamedLayoutsService {
		const service = disposables.add(instantiationService.createInstance(NamedLayoutsService));
		disposables.add(service.registerParticipant(participant));
		return service;
	}

	test('switching layouts saves the outgoing layout and applies the incoming one', async () => {
		const participant = new TestParticipant();
		const testObject = createService(participant);
		const defaultLayout = testObject.activeLayout;

		participant.state = 'default state';
		const debugLayout = await testObject.createLayout('Debug');
		const afterCreate = { active: testObject.activeLayout.name, setting: configurationService.getValue(LAYOUT_SETTING) };

		// Changes made while the named layout is active belong to that layout
		configurationService.setLayoutConfiguration({ [LAYOUT_SETTING]: 'debugValue' });
		participant.state = 'debug state';

		await testObject.switchLayout(defaultLayout);
		const afterSwitchToDefault = { active: testObject.activeLayout.id, setting: configurationService.getValue(LAYOUT_SETTING), state: participant.state };

		await testObject.switchLayout(debugLayout);
		const afterSwitchToDebug = { active: testObject.activeLayout.name, setting: configurationService.getValue(LAYOUT_SETTING), state: participant.state };

		await testObject.deleteLayout(debugLayout);
		const afterDelete = { layouts: testObject.layouts.map(layout => layout.name), active: testObject.activeLayout.id, setting: configurationService.getValue(LAYOUT_SETTING), state: participant.state };

		assert.deepStrictEqual({ afterCreate, afterSwitchToDefault, afterSwitchToDebug, afterDelete }, {
			afterCreate: { active: 'Debug', setting: 'userValue' },
			afterSwitchToDefault: { active: DEFAULT_NAMED_LAYOUT_ID, setting: 'userValue', state: 'default state' },
			afterSwitchToDebug: { active: 'Debug', setting: 'debugValue', state: 'debug state' },
			afterDelete: { layouts: ['Default'], active: DEFAULT_NAMED_LAYOUT_ID, setting: 'userValue', state: 'default state' }
		});
	});

	test('restores the settings of the active named layout, including changes saved with the storage', async () => {
		const first = createService(new TestParticipant());
		await first.createLayout('Debug');
		configurationService.setLayoutConfiguration({ [LAYOUT_SETTING]: 'debugValue' });
		storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);

		// Simulate a new window of the same workspace
		configurationService.setLayoutConfiguration({});
		const second = createService(new TestParticipant());

		assert.deepStrictEqual(
			{ active: second.activeLayout.name, setting: configurationService.getValue(LAYOUT_SETTING) },
			{ active: 'Debug', setting: 'debugValue' }
		);
	});

	test('restores the default layout when another window deletes the active layout', async () => {
		const participant = new TestParticipant();
		const testObject = createService(participant);
		const defaultLayout = testObject.activeLayout;
		participant.state = 'default state';
		const debugLayout = await testObject.createLayout('Debug');
		participant.state = 'debug state';

		const otherWindow = createService(new TestParticipant());
		await otherWindow.deleteLayout(debugLayout);
		await testObject.switchLayout(defaultLayout); // queued after the switch triggered by the deletion

		assert.deepStrictEqual(
			{ active: testObject.activeLayout.id, setting: configurationService.getValue(LAYOUT_SETTING), state: participant.state },
			{ active: DEFAULT_NAMED_LAYOUT_ID, setting: 'userValue', state: 'default state' }
		);
	});
});
