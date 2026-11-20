/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { IStringDictionary } from '../../../../../base/common/collections.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { isEqual, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationOverrides, IConfigurationService, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions, IConfigurationNode, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../../platform/storage/common/storage.js';
import { toUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { TestLifecycleService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { ILayoutSettings } from '../../../configuration/common/configuration.js';
import { IFilesConfigurationService } from '../../../filesConfiguration/common/filesConfigurationService.js';
import { ILifecycleService, LifecyclePhase } from '../../../lifecycle/common/lifecycle.js';
import { IUserDataProfileService } from '../../../userDataProfile/common/userDataProfile.js';
import { UserDataProfileService } from '../../../userDataProfile/common/userDataProfileService.js';
import { DEFAULT_NAMED_LAYOUT_ID, IContributedNamedLayout, INamedLayoutDefinition, INamedLayoutParticipant, NAMED_LAYOUTS_ENABLED_SETTING } from '../../common/namedLayouts.js';
import { NamedLayoutsService } from '../../common/namedLayoutsService.js';

const LAYOUT_SETTING = 'namedLayoutsTest.setting';
const PROFILE_LOCATION = URI.file('/User').with({ scheme: 'vscode-tests' });

/**
 * Reads the settings of the active named layout from its settings file, like the configuration service.
 */
class TestLayoutConfigurationService extends TestConfigurationService {

	layoutSettings: ILayoutSettings | undefined;
	readonly onDidChangeLayoutSettings = Event.None;
	private layoutConfiguration: IStringDictionary<unknown> = {};

	constructor(configuration: Record<string, unknown>, private readonly fileService: IFileService) {
		super(configuration);
	}

	override getValue<T>(arg1?: string | IConfigurationOverrides, arg2?: IConfigurationOverrides): T | undefined {
		if (typeof arg1 === 'string' && Object.hasOwn(this.layoutConfiguration, arg1)) {
			return this.layoutConfiguration[arg1] as T;
		}
		return super.getValue<T>(arg1, arg2);
	}

	override inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
		return { ...super.inspect<T>(key, overrides), defaultValue: Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties()[key]?.default as T };
	}

	override async reloadConfiguration<T>(target?: ConfigurationTarget): Promise<T> {
		if (target === ConfigurationTarget.LAYOUT && this.layoutSettings) {
			try {
				this.layoutConfiguration = JSON.parse((await this.fileService.readFile(this.layoutSettings.resource)).value.toString());
			} catch {
				this.layoutConfiguration = {};
			}
		}
		return this.getValue() as T;
	}

	setLayoutSettings(layout: ILayoutSettings | undefined, lastKnownSettings?: IStringDictionary<unknown>): void {
		if (!isEqual(layout?.resource, this.layoutSettings?.resource) || lastKnownSettings) {
			this.layoutConfiguration = layout ? { ...lastKnownSettings } : {};
		}
		this.layoutSettings = layout;
	}

	getLayoutConfiguration(): IStringDictionary<unknown> {
		return { ...this.layoutConfiguration };
	}

	/**
	 * Changes the settings file of the active named layout, like the Settings editor.
	 */
	async writeLayoutSettings(settings: IStringDictionary<unknown>): Promise<void> {
		await this.fileService.writeFile(this.layoutSettings!.resource, VSBuffer.fromString(JSON.stringify(settings)));
		await this.reloadConfiguration(ConfigurationTarget.LAYOUT);
	}
}

class TestParticipant implements INamedLayoutParticipant {

	readonly id = 'test';

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange = this._onDidChange.event;

	state = 'initial';

	capture(): string {
		return this.state;
	}

	async apply(state: unknown): Promise<void> {
		if (typeof state === 'string') {
			this.state = state;
		}
	}

	change(state: string): void {
		this.state = state;
		this._onDidChange.fire();
	}
}

/**
 * A participant whose state the default layout shares with other windows.
 * Named layouts use a local copy of it.
 */
class TestSharedParticipant implements INamedLayoutParticipant {

	readonly id = 'shared';

	readonly sharedState = 'shared state';
	localState: string | undefined;

	capture(): string {
		return this.localState ?? this.sharedState;
	}

	async apply(state: unknown): Promise<void> {
		if (typeof state === 'string') {
			this.localState = state;
		}
	}

	async applyDefault(): Promise<void> {
		this.localState = undefined;
	}
}

/**
 * A participant that applies the editor orientation of a layout definition
 * on top of the state of the default layout.
 */
class TestDefinitionParticipant extends TestParticipant {

	async applyDefinition(definition: INamedLayoutDefinition, defaultState: unknown): Promise<void> {
		this.state = `${definition.editor?.orientation} over ${defaultState}`;
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
	let fileService: IFileService;
	let readonlyFiles: ResourceMap<string>;
	let storageService: TestStorageService;
	let instantiationService: TestInstantiationService;

	suiteSetup(() => Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration(configurationNode));
	suiteTeardown(() => Registry.as<IConfigurationRegistry>(Extensions.Configuration).deregisterConfigurations([configurationNode]));

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(PROFILE_LOCATION.scheme, disposables.add(new InMemoryFileSystemProvider())));
		configurationService = new TestLayoutConfigurationService({ [NAMED_LAYOUTS_ENABLED_SETTING]: true, [LAYOUT_SETTING]: 'userValue' }, fileService);
		storageService = disposables.add(new TestStorageService());
		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IFileService, fileService);
		readonlyFiles = new ResourceMap<string>();
		instantiationService.stub(IFilesConfigurationService, new class extends mock<IFilesConfigurationService>() {
			override async updateReadonly(resources: URI | URI[], readonly: true | IMarkdownString | false | 'toggle' | 'reset'): Promise<void> {
				for (const resource of Array.isArray(resources) ? resources : [resources]) {
					if (readonly === 'reset') {
						readonlyFiles.delete(resource);
					} else if (typeof readonly === 'object') {
						readonlyFiles.set(resource, readonly.value);
					}
				}
			}
		}());
		instantiationService.stub(IUserDataProfileService, disposables.add(new UserDataProfileService(toUserDataProfile('default', 'Default', PROFILE_LOCATION, joinPath(PROFILE_LOCATION, 'cache')))));
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
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
		await configurationService.writeLayoutSettings({ [LAYOUT_SETTING]: 'debugValue' });
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

	test('a switch returns the layout that was active when it ran, a conditional switch only runs while the given layout is active', async () => {
		const testObject = createService(new TestParticipant());
		const defaultLayout = testObject.activeLayout;
		const debugLayout = await testObject.createLayout('Debug');
		await testObject.switchLayout(defaultLayout);

		// Queued one after another: each switch runs after the switches queued before it
		const switchToDebug = testObject.switchLayout(debugLayout);
		const switchToDefault = testObject.switchLayout(defaultLayout);
		const switchToDebugIfDebugIsActive = testObject.switchLayout(debugLayout, { ifActiveLayoutId: debugLayout.id });
		const switchToDebugIfDefaultIsActive = testObject.switchLayout(debugLayout, { ifActiveLayoutId: DEFAULT_NAMED_LAYOUT_ID });

		assert.deepStrictEqual({
			switchToDebug: (await switchToDebug).id,
			switchToDefault: (await switchToDefault).id,
			switchToDebugIfDebugIsActive: (await switchToDebugIfDebugIsActive)?.id,
			switchToDebugIfDefaultIsActive: (await switchToDebugIfDefaultIsActive)?.id,
			active: testObject.activeLayout.id
		}, {
			switchToDebug: DEFAULT_NAMED_LAYOUT_ID,
			switchToDefault: debugLayout.id,
			switchToDebugIfDebugIsActive: undefined,
			switchToDebugIfDefaultIsActive: DEFAULT_NAMED_LAYOUT_ID,
			active: debugLayout.id
		});
	});

	test('the description of a layout only specifies settings that differ from their default values', async () => {
		const testObject = createService(new TestParticipant());
		const userValue = testObject.captureDefinition().settings?.[LAYOUT_SETTING];

		await testObject.createLayout('Debug');
		await configurationService.writeLayoutSettings({ [LAYOUT_SETTING]: 'defaultValue' });
		const describesDefaultValue = Object.hasOwn(testObject.captureDefinition().settings ?? {}, LAYOUT_SETTING);

		assert.deepStrictEqual({ userValue, describesDefaultValue }, { userValue: 'userValue', describesDefaultValue: false });
	});

	test('a new layout copies the settings of the active layout into its settings file in the profile, which is deleted with the layout', async () => {
		const testObject = createService(new TestParticipant());
		await testObject.createLayout('Debug');
		const newLayoutSettings = configurationService.getLayoutConfiguration();
		await configurationService.writeLayoutSettings({ [LAYOUT_SETTING]: 'debugValue' });

		const copy = await testObject.createLayout('Copy');
		const copySettingsFile = configurationService.layoutSettings!.resource;
		const copySettings = JSON.parse((await fileService.readFile(copySettingsFile)).value.toString());
		await testObject.deleteLayout(copy);

		assert.deepStrictEqual({
			newLayoutSettings,
			copySettingsFile: copySettingsFile.toString(),
			copySettings,
			copySettingsFileExists: await fileService.exists(copySettingsFile),
			activeLayoutSettings: configurationService.layoutSettings
		}, {
			newLayoutSettings: {},
			copySettingsFile: joinPath(PROFILE_LOCATION, 'layouts', copy.id, 'settings.json').toString(),
			copySettings: { [LAYOUT_SETTING]: 'debugValue' },
			copySettingsFileExists: false,
			activeLayoutSettings: undefined
		});
	});

	test('a layout stored before layouts had settings files gets one with its stored settings, an existing settings file is kept', async () => {
		storageService.store('workbench.namedLayouts', JSON.stringify([
			{ id: 'old', name: 'Old', settings: { [LAYOUT_SETTING]: 'storedValue' }, state: {} },
			{ id: 'kept', name: 'Kept', settings: { [LAYOUT_SETTING]: 'storedValue' }, state: {} }
		]), StorageScope.PROFILE, StorageTarget.USER);
		await fileService.writeFile(joinPath(PROFILE_LOCATION, 'layouts', 'kept', 'settings.json'), VSBuffer.fromString(JSON.stringify({ [LAYOUT_SETTING]: 'fileValue' })));
		const testObject = createService(new TestParticipant());
		const getLayout = (name: string) => testObject.layouts.find(layout => layout.name === name)!;

		await testObject.switchLayout(getLayout('Old'));
		const old = { setting: configurationService.getValue(LAYOUT_SETTING), file: JSON.parse((await fileService.readFile(joinPath(PROFILE_LOCATION, 'layouts', 'old', 'settings.json'))).value.toString()) };
		await testObject.switchLayout(getLayout('Kept'));
		const kept = configurationService.getValue(LAYOUT_SETTING);

		assert.deepStrictEqual({ old, kept }, {
			old: { setting: 'storedValue', file: { [LAYOUT_SETTING]: 'storedValue' } },
			kept: 'fileValue'
		});
	});

	test('layouts of the user and of extensions are sorted by name, those of the user first if their names are the same', async () => {
		const testObject = createService(new TestParticipant());
		await testObject.createLayout('Debug');
		await testObject.createLayout('Agentic');
		const contribute = (extensionName: string, label: string): IContributedNamedLayout => ({ extensionId: `publisher.${extensionName.toLowerCase()}`, extensionName, id: label.toLowerCase(), label, definition: {} });
		testObject.setContributedLayouts([contribute('Second', 'Agentic'), contribute('First', 'Zen'), contribute('First', 'Agentic')]);

		assert.deepStrictEqual(testObject.layouts.map(layout => `${layout.name}${layout.contribution ? ` (${layout.contribution.extensionName})` : ''}`), [
			'Default',
			'Agentic',
			'Agentic (First)',
			'Agentic (Second)',
			'Debug',
			'Zen (First)'
		]);
	});

	test('restores the settings of the active named layout, the last known settings until its settings file is read', async () => {
		const first = createService(new TestParticipant());
		await first.createLayout('Debug');
		await configurationService.writeLayoutSettings({ [LAYOUT_SETTING]: 'debugValue' });
		storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);

		// Simulate a new window of the same workspace, the settings file changed meanwhile
		await fileService.writeFile(configurationService.layoutSettings!.resource, VSBuffer.fromString(JSON.stringify({ [LAYOUT_SETTING]: 'changedValue' })));
		configurationService.setLayoutSettings(undefined);
		const second = createService(new TestParticipant());
		const beforeRead = { active: second.activeLayout.name, setting: configurationService.getValue(LAYOUT_SETTING) };
		await second.switchLayout(second.activeLayout); // queued after reading the settings file

		assert.deepStrictEqual({ beforeRead, afterRead: configurationService.getValue(LAYOUT_SETTING) }, {
			beforeRead: { active: 'Debug', setting: 'debugValue' },
			afterRead: 'changedValue'
		});
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

	test('participants that share their state with the default layout use a local copy in named layouts', async () => {
		const sharedParticipant = new TestSharedParticipant();
		const testObject = createService(new TestParticipant());
		disposables.add(testObject.registerParticipant(sharedParticipant));
		const defaultLayout = testObject.activeLayout;

		const debugLayout = await testObject.createLayout('Debug');
		const afterCreate = sharedParticipant.localState;
		sharedParticipant.localState = 'debug state';

		await testObject.switchLayout(defaultLayout);
		const afterSwitchToDefault = sharedParticipant.localState;

		await testObject.switchLayout(debugLayout);
		const afterSwitchToDebug = sharedParticipant.localState;

		// A new window of the same workspace restores the local copy when the participant registers
		storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		const secondWindow = createService(new TestParticipant());
		const secondSharedParticipant = new TestSharedParticipant();
		disposables.add(secondWindow.registerParticipant(secondSharedParticipant));
		await secondWindow.switchLayout(secondWindow.activeLayout); // queued after the restore
		const afterRestart = secondSharedParticipant.localState;

		assert.deepStrictEqual({ afterCreate, afterSwitchToDefault, afterSwitchToDebug, afterRestart }, {
			afterCreate: 'shared state',
			afterSwitchToDefault: undefined,
			afterSwitchToDebug: 'debug state',
			afterRestart: 'debug state'
		});
	});

	test('layouts contributed by extensions start from their definition and keep their changes', async () => {
		const contributedLayout: IContributedNamedLayout = {
			extensionId: 'Publisher.Extension',
			extensionName: 'Extension',
			id: 'debug',
			label: 'Debugging',
			definition: { settings: { [LAYOUT_SETTING]: 'contributedValue', 'namedLayoutsTest.unknown': true }, editor: { orientation: 'vertical' } }
		};
		const participant = new TestDefinitionParticipant();
		const testObject = createService(participant);
		const defaultLayout = testObject.activeLayout;
		participant.state = 'default state';
		testObject.setContributedLayouts([contributedLayout]);
		const layout = testObject.layouts.find(candidate => candidate.contribution)!;

		await testObject.switchLayout(layout);
		const afterFirstSwitch = { active: testObject.activeLayout, setting: configurationService.getValue(LAYOUT_SETTING), definesUnknownSetting: Object.hasOwn(configurationService.getLayoutConfiguration(), 'namedLayoutsTest.unknown'), state: participant.state };

		// Changes are saved like the changes of other named layouts
		participant.state = 'changed state';
		await testObject.switchLayout(defaultLayout);
		await testObject.switchLayout(layout);
		const afterSwitchBack = participant.state;

		await testObject.resetLayout(layout);
		const afterReset = participant.state;

		const deleteError = await testObject.deleteLayout(layout).then(() => undefined, error => error.message);

		// The extension is uninstalled, the saved changes are kept in case it is installed again
		testObject.setContributedLayouts([]);
		await testObject.switchLayout(defaultLayout); // queued after the switch triggered by the removal
		const afterUninstall = { layouts: testObject.layouts.map(candidate => candidate.name), active: testObject.activeLayout.id, setting: configurationService.getValue(LAYOUT_SETTING), state: participant.state };
		testObject.setContributedLayouts([contributedLayout]);
		const afterReinstall = testObject.layouts.map(candidate => ({ name: candidate.name, canReset: candidate.contribution?.canReset }));

		assert.deepStrictEqual({ afterFirstSwitch, afterSwitchBack, afterReset, deleteError, afterUninstall, afterReinstall }, {
			afterFirstSwitch: {
				active: { id: 'publisher.extension/debug', name: 'Debugging', contribution: { extensionId: 'Publisher.Extension', extensionName: 'Extension', id: 'debug', canReset: true, locked: false } },
				setting: 'contributedValue',
				definesUnknownSetting: false,
				state: 'vertical over default state'
			},
			afterSwitchBack: 'changed state',
			afterReset: 'vertical over default state',
			deleteError: 'A layout contributed by an extension cannot be deleted.',
			afterUninstall: { layouts: ['Default'], active: DEFAULT_NAMED_LAYOUT_ID, setting: 'userValue', state: 'default state' },
			afterReinstall: [{ name: 'Default', canReset: undefined }, { name: 'Debugging', canReset: true }]
		});
	});

	test('resetting a contributed layout that is not active writes the settings of its definition to its settings file, which other windows use', async () => {
		const testObject = createService(new TestParticipant());
		testObject.setContributedLayouts([{ extensionId: 'publisher.extension', extensionName: 'Extension', id: 'agentic', label: 'Agentic', definition: { settings: { [LAYOUT_SETTING]: 'contributedValue' } } }]);
		const layout = testObject.layouts.find(candidate => candidate.contribution)!;
		await testObject.switchLayout(layout);
		await configurationService.writeLayoutSettings({ [LAYOUT_SETTING]: 'changedValue' });
		const settingsFile = configurationService.layoutSettings!.resource;

		await testObject.switchLayout(testObject.layouts[0]);
		await testObject.resetLayout(layout);

		assert.deepStrictEqual(JSON.parse((await fileService.readFile(settingsFile)).value.toString()), { [LAYOUT_SETTING]: 'contributedValue' });
	});

	test('layouts with different identifiers have different settings files, also on file systems that ignore case', async () => {
		const testObject = createService(new TestParticipant());
		const ids = ['focus/one', 'focus_one', 'Focus_one'];
		testObject.setContributedLayouts(ids.map(id => ({ extensionId: 'publisher.extension', extensionName: 'Extension', id, label: id, definition: { settings: { [LAYOUT_SETTING]: id } } })));
		const settings: { folder: string | undefined; setting: unknown }[] = [];
		for (const id of [...ids, ids[0]]) {
			await testObject.switchLayout(testObject.layouts.find(layout => layout.contribution?.id === id)!);
			settings.push({ folder: configurationService.layoutSettings!.resource.path.split('/').at(-2), setting: configurationService.getValue(LAYOUT_SETTING) });
		}

		assert.deepStrictEqual(settings, [
			{ folder: 'publisher.extension_002ffocus_002fone', setting: 'focus/one' },
			{ folder: 'publisher.extension_002ffocus_005fone', setting: 'focus_one' },
			{ folder: 'publisher.extension_002f_0046ocus_005fone', setting: 'Focus_one' },
			{ folder: 'publisher.extension_002ffocus_002fone', setting: 'focus/one' }
		]);
	});

	test('changes to a locked layout are not saved and can be reverted, unlocking keeps them', async () => {
		const participant = new TestParticipant();
		const testObject = createService(participant);
		const defaultLayout = testObject.activeLayout;
		participant.state = 'default state';
		await testObject.createLayout('Debug');
		participant.state = 'debug state';
		await testObject.setLayoutLocked(testObject.activeLayout, true);
		const lockedLayout = testObject.activeLayout;
		const settingsLocked = configurationService.layoutSettings?.locked;

		participant.state = 'changed state';
		storageService.testEmitWillSaveState(WillSaveStateReason.NONE);
		await testObject.revertLayout();
		const afterRevert = participant.state;

		participant.state = 'changed state';
		await testObject.switchLayout(defaultLayout);
		await testObject.switchLayout(lockedLayout);
		const afterSwitchBack = participant.state;

		participant.state = 'changed state';
		await testObject.setLayoutLocked(testObject.activeLayout, false);
		await testObject.switchLayout(defaultLayout);
		await testObject.switchLayout(lockedLayout);
		const afterUnlock = { locked: testObject.activeLayout.locked, settingsLocked: configurationService.layoutSettings?.locked, state: participant.state };

		const lockDefaultError = await testObject.setLayoutLocked(defaultLayout, true).then(() => undefined, error => error.message);

		assert.deepStrictEqual({ lockedLayout, settingsLocked, afterRevert, afterSwitchBack, afterUnlock, lockDefaultError }, {
			lockedLayout: { id: lockedLayout.id, name: 'Debug', locked: true },
			settingsLocked: true,
			afterRevert: 'debug state',
			afterSwitchBack: 'debug state',
			afterUnlock: { locked: undefined, settingsLocked: false, state: 'changed state' },
			lockDefaultError: 'The default layout cannot be locked.'
		});
	});

	test('editors show the settings file of a locked layout read-only', async () => {
		const testObject = createService(new TestParticipant());
		const layout = await testObject.createLayout('Debug');
		const settingsFile = configurationService.layoutSettings!.resource;

		await testObject.setLayoutLocked(layout, true);
		const locked = readonlyFiles.get(settingsFile);
		await testObject.setLayoutLocked(testObject.activeLayout, false);

		assert.deepStrictEqual({ locked, unlocked: readonlyFiles.has(settingsFile) }, {
			locked: `The layout 'Debug' is locked. Unlock the layout to change its settings.`,
			unlocked: false
		});
	});

	test('detects the changes made to a locked layout until they are undone or reverted', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const participant = new TestParticipant();
		const testObject = createService(participant);
		await testObject.createLayout('Debug');
		participant.change('debug state');
		await testObject.setLayoutLocked(testObject.activeLayout, true);
		await timeout(1000);
		const afterLock = testObject.isActiveLayoutModified;

		participant.change('changed state');
		await timeout(1000);
		const afterChange = testObject.isActiveLayoutModified;

		participant.change('debug state');
		await timeout(1000);
		const afterUndo = testObject.isActiveLayoutModified;

		participant.change('changed state');
		await timeout(1000);
		await testObject.revertLayout();
		await timeout(1000);
		const afterRevert = { modified: testObject.isActiveLayoutModified, state: participant.state };

		await testObject.setLayoutLocked(testObject.activeLayout, false);
		participant.change('changed state');
		await timeout(1000);
		const afterUnlock = testObject.isActiveLayoutModified;

		assert.deepStrictEqual({ afterLock, afterChange, afterUndo, afterRevert, afterUnlock }, {
			afterLock: false,
			afterChange: true,
			afterUndo: false,
			afterRevert: { modified: false, state: 'debug state' },
			afterUnlock: false
		});
	}));

	test('restores the saved state of a locked layout when the window is restored', async () => {
		const first = createService(new TestParticipant());
		await first.createLayout('Debug');
		await first.setLayoutLocked(first.activeLayout, true);
		storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);

		// Simulate a new window of the same workspace, the workbench restores the changed arrangement itself
		configurationService.setLayoutSettings(undefined);
		const lifecycleService = disposables.add(new TestLifecycleService());
		lifecycleService.usePhases = true;
		instantiationService.stub(ILifecycleService, lifecycleService);
		const participant = new TestParticipant();
		participant.state = 'changed state';
		const second = createService(participant);
		const beforeRestored = participant.state;

		lifecycleService.phase = LifecyclePhase.Restored;
		await lifecycleService.when(LifecyclePhase.Restored);
		await second.switchLayout(second.activeLayout); // queued after the restore

		assert.deepStrictEqual({ beforeRestored, afterRestored: participant.state, setting: configurationService.getValue(LAYOUT_SETTING) }, {
			beforeRestored: 'changed state',
			afterRestored: 'initial',
			setting: 'userValue'
		});
	});

	test('applies the saved state of the default layout when the layout that was active is no longer available', async () => {
		const firstParticipant = new TestParticipant();
		const first = createService(firstParticipant);
		firstParticipant.state = 'default state';
		await first.createLayout('Debug');
		firstParticipant.state = 'debug state';
		storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		// Named layouts are disabled while the workspace is closed
		configurationService.setUserConfiguration(NAMED_LAYOUTS_ENABLED_SETTING, false);

		// Simulates a new window of the same workspace, the workbench restores the arrangement of the layout that was active itself
		const openWindow = () => {
			const lifecycleService = disposables.add(new TestLifecycleService());
			lifecycleService.usePhases = true;
			instantiationService.stub(ILifecycleService, lifecycleService);
			const participant = new TestParticipant();
			participant.state = 'restored by the workbench';
			const service = createService(participant);
			const restore = async () => {
				lifecycleService.phase = LifecyclePhase.Restored;
				await lifecycleService.when(LifecyclePhase.Restored);
				await service.switchLayout(service.activeLayout); // queued after the restore
			};
			return { service, participant, restore };
		};
		const getDebugLayout = (service: NamedLayoutsService) => service.layouts.find(layout => layout.name === 'Debug')!;

		const second = openWindow();
		await second.restore();
		const afterReopening = { layout: second.service.activeLayout.name, state: second.participant.state };

		// A layout that becomes active before the workbench is restored is kept
		await second.service.switchLayout(getDebugLayout(second.service));
		storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		const third = openWindow();
		await third.service.switchLayout(getDebugLayout(third.service));
		await third.restore();
		const afterSwitchBeforeRestored = { layout: third.service.activeLayout.name, state: third.participant.state };

		assert.deepStrictEqual({ afterReopening, afterSwitchBeforeRestored }, {
			afterReopening: { layout: 'Default', state: 'default state' },
			afterSwitchBeforeRestored: { layout: 'Debug', state: 'debug state' }
		});
	});

	test('a layout locked by its extension always starts from its definition and cannot be unlocked', async () => {
		const participant = new TestDefinitionParticipant();
		const testObject = createService(participant);
		const defaultLayout = testObject.activeLayout;
		participant.state = 'default state';
		testObject.setContributedLayouts([{ extensionId: 'publisher.extension', extensionName: 'Extension', id: 'focus', label: 'Focus', locked: true, definition: { editor: { orientation: 'horizontal' } } }]);
		const layout = testObject.layouts.find(candidate => candidate.contribution)!;

		await testObject.switchLayout(layout);
		participant.state = 'changed state';
		await testObject.revertLayout();
		const afterRevert = participant.state;

		participant.state = 'changed state';
		await testObject.switchLayout(defaultLayout);
		participant.state = 'changed default state';
		await testObject.switchLayout(layout);
		const afterSwitchBack = participant.state;

		const unlockError = await testObject.setLayoutLocked(layout, false).then(() => undefined, error => error.message);

		assert.deepStrictEqual({ layout: testObject.activeLayout, afterRevert, afterSwitchBack, unlockError }, {
			layout: { id: 'publisher.extension/focus', name: 'Focus', contribution: { extensionId: 'publisher.extension', extensionName: 'Extension', id: 'focus', canReset: false, locked: true }, locked: true },
			afterRevert: 'horizontal over default state',
			afterSwitchBack: 'horizontal over changed default state',
			unlockError: 'A layout locked by its extension cannot be locked or unlocked.'
		});
	});
});
