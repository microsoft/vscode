/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ConfigurationService } from '../../../../../platform/configuration/common/configurationService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullPolicyService } from '../../../../../platform/policy/common/policy.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { SharedChatInputComposer } from '../../browser/sharedChatInputComposer.js';
import { areNewSessionWelcomePhrasesEnabled, isExperimentalSessionComposerLayoutEnabled } from '../../browser/newChatWidget.js';
import { AGENTS_PICKER_IN_ATTACH_CONTEXT_MENU_SETTING, EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING, NEW_SESSION_COMPOSER_OPTIONS_EXPANDED_SETTING, NEW_SESSION_WELCOME_PHRASES_SETTING, UNIFIED_WORKSPACE_PICKER_SETTING } from '../../common/constants.js';
import '../../browser/chat.contribution.js';

// Capture the registered schema before configuration tests reset the shared registry.
const experimentalNewSessionComposerLayoutProperty = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties()[EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING];
const newSessionComposerOptionsExpandedProperty = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties()[NEW_SESSION_COMPOSER_OPTIONS_EXPANDED_SETTING];
const agentsPickerInAttachContextMenuProperty = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties()[AGENTS_PICKER_IN_ATTACH_CONTEXT_MENU_SETTING];
const newSessionWelcomePhrasesProperty = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties()[NEW_SESSION_WELCOME_PHRASES_SETTING];

suite('New session composer layout', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('can be configured in Agents settings', () => {
		assert.deepStrictEqual({
			layoutScope: experimentalNewSessionComposerLayoutProperty.scope,
			optionsDefault: newSessionComposerOptionsExpandedProperty.default,
			optionsScope: newSessionComposerOptionsExpandedProperty.scope,
			optionsExperimentMode: newSessionComposerOptionsExpandedProperty.experiment?.mode,
			agentsPickerScope: agentsPickerInAttachContextMenuProperty.scope,
			agentsPickerExperiment: agentsPickerInAttachContextMenuProperty.experiment,
		}, {
			layoutScope: ConfigurationScope.WINDOW,
			optionsDefault: true,
			optionsScope: ConfigurationScope.APPLICATION,
			optionsExperimentMode: 'auto',
			agentsPickerScope: ConfigurationScope.WINDOW,
			agentsPickerExperiment: { mode: 'auto' },
		});
	});

	for (const testCase of [
		{ unifiedPicker: false, experimentalLayout: false, expected: false },
		{ unifiedPicker: false, experimentalLayout: true, expected: false },
		{ unifiedPicker: true, experimentalLayout: false, expected: false },
		{ unifiedPicker: true, experimentalLayout: true, expected: true },
	]) {
		test(`unified picker ${testCase.unifiedPicker}, experimental layout ${testCase.experimentalLayout}`, () => {
			const configurationService = new TestConfigurationService({
				[UNIFIED_WORKSPACE_PICKER_SETTING]: testCase.unifiedPicker,
				[EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING]: testCase.experimentalLayout,
			});
			store.add(configurationService.onDidChangeConfigurationEmitter);

			assert.strictEqual(isExperimentalSessionComposerLayoutEnabled(configurationService), testCase.expected);
		});
	}

	test('welcome phrases are independent from the experimental composer layout', () => {
		const configurations = [
			new TestConfigurationService({
				[UNIFIED_WORKSPACE_PICKER_SETTING]: true,
				[EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING]: true,
				[NEW_SESSION_WELCOME_PHRASES_SETTING]: false,
			}),
			new TestConfigurationService({
				[UNIFIED_WORKSPACE_PICKER_SETTING]: false,
				[EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING]: false,
				[NEW_SESSION_WELCOME_PHRASES_SETTING]: true,
			}),
		];
		for (const configurationService of configurations) {
			store.add(configurationService.onDidChangeConfigurationEmitter);
		}

		assert.deepStrictEqual(configurations.map(configurationService => ({
			experimentalLayout: isExperimentalSessionComposerLayoutEnabled(configurationService),
			welcomePhrases: areNewSessionWelcomePhrasesEnabled(configurationService),
		})), [
			{ experimentalLayout: true, welcomePhrases: false },
			{ experimentalLayout: false, welcomePhrases: true },
		]);
	});

	test('welcome phrases default on while retaining automatic experiments', () => {
		assert.deepStrictEqual({
			type: newSessionWelcomePhrasesProperty.type,
			default: newSessionWelcomePhrasesProperty.default,
			scope: newSessionWelcomePhrasesProperty.scope,
			tags: newSessionWelcomePhrasesProperty.tags,
			experiment: newSessionWelcomePhrasesProperty.experiment,
		}, {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'onExP'],
			experiment: { mode: 'auto' },
		});
	});

	test('welcome phrases respect explicit off and the persisted Hide choice', async () => {
		const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		if (!configurationRegistry.getConfigurationProperties()[NEW_SESSION_WELCOME_PHRASES_SETTING]) {
			const configurationNode = { properties: { [NEW_SESSION_WELCOME_PHRASES_SETTING]: newSessionWelcomePhrasesProperty } };
			configurationRegistry.registerConfiguration(configurationNode);
			store.add(toDisposable(() => configurationRegistry.deregisterConfigurations([configurationNode])));
		}
		const logService = new NullLogService();
		const fileService = store.add(new FileService(logService));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
		const settings = URI.from({ scheme: Schemas.inMemory, path: '/settings.json' });
		await fileService.writeFile(settings, VSBuffer.fromString('{}'));
		const configurationService = store.add(new ConfigurationService(settings, fileService, new NullPolicyService(), logService));
		await configurationService.initialize();
		const defaultEnabled = areNewSessionWelcomePhrasesEnabled(configurationService);

		await configurationService.updateValue(NEW_SESSION_WELCOME_PHRASES_SETTING, false, ConfigurationTarget.USER);
		const explicitOff = areNewSessionWelcomePhrasesEnabled(configurationService);
		await configurationService.updateValue(NEW_SESSION_WELCOME_PHRASES_SETTING, undefined, ConfigurationTarget.USER);
		const resetEnabled = areNewSessionWelcomePhrasesEnabled(configurationService);

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		const hideCommand = CommandsRegistry.getCommand('workbench.action.sessions.hideWelcomeMessage');
		assert.ok(hideCommand);
		await instantiationService.invokeFunction(hideCommand.handler);
		await configurationService.reloadConfiguration();

		assert.deepStrictEqual({
			defaultEnabled,
			explicitOff,
			resetEnabled,
			hidden: areNewSessionWelcomePhrasesEnabled(configurationService),
			userValue: configurationService.inspect<boolean>(NEW_SESSION_WELCOME_PHRASES_SETTING).userValue,
		}, {
			defaultEnabled: true,
			explicitOff: false,
			resetEnabled: true,
			hidden: false,
			userValue: false,
		});
	});

	test('places repository controls in the workspace row and restores their home', () => {
		const repositoryControlsHome = document.createElement('div');
		const repositoryControls = document.createElement('div');
		repositoryControls.textContent = 'Repository';
		repositoryControlsHome.append(repositoryControls);
		const pickerRow = document.createElement('div');
		const workspacePicker = document.createElement('div');
		workspacePicker.textContent = 'Workspace';
		const harnessPicker = document.createElement('div');
		harnessPicker.classList.add('sessions-chat-session-type-picker');
		harnessPicker.textContent = 'Harness';
		pickerRow.append(workspacePicker, harnessPicker);
		let visibilityUpdates = 0;
		const harness = Object.assign(Object.create(SharedChatInputComposer.prototype), {
			_repositoryControlsContainer: repositoryControls,
			_repositoryControlsHome: repositoryControlsHome,
			_updateBottomContainerVisibility: () => visibilityUpdates++,
		});
		const placeRepositoryControls = SharedChatInputComposer.prototype.placeRepositoryControls as (this: typeof harness, container?: HTMLElement) => void;

		placeRepositoryControls.call(harness, pickerRow);
		const experimentalOrder = Array.from(pickerRow.children, element => element.textContent);
		placeRepositoryControls.call(harness);

		assert.deepStrictEqual({
			experimentalOrder,
			restoredOrder: Array.from(pickerRow.children, element => element.textContent),
			home: Array.from(repositoryControlsHome.children, element => element.textContent),
			visibilityUpdates,
		}, {
			experimentalOrder: ['Workspace', 'Repository', 'Harness'],
			restoredOrder: ['Workspace', 'Harness'],
			home: ['Repository'],
			visibilityUpdates: 2,
		});
	});

	test('tabs through repository controls when they are placed in the workspace row', () => {
		const repositoryControlsHome = document.createElement('div');
		const repositoryControls = document.createElement('div');
		repositoryControlsHome.append(repositoryControls);
		const controls = ['Worktree', 'Branch'].map(label => {
			const slot = document.createElement('div');
			slot.className = 'sessions-chat-picker-slot';
			const control = document.createElement('button');
			control.textContent = label;
			control.tabIndex = label === 'Worktree' ? 0 : -1;
			slot.append(control);
			repositoryControls.append(slot);
			return control;
		});
		const pickerRow = document.createElement('div');
		const root = document.createElement('div');
		root.append(repositoryControlsHome, pickerRow);
		document.body.append(root);
		store.add(toDisposable(() => root.remove()));
		const harness = Object.assign(Object.create(SharedChatInputComposer.prototype), {
			_repositoryControlsContainer: repositoryControls,
			_repositoryControlsHome: repositoryControlsHome,
			_updateBottomContainerVisibility: () => { },
		});
		const placeRepositoryControls = SharedChatInputComposer.prototype.placeRepositoryControls as (this: typeof harness, container?: HTMLElement) => void;
		const navigateRepositoryControls = (SharedChatInputComposer.prototype as unknown as {
			_navigateRepositionedRepositoryControls(this: typeof harness, event: KeyboardEvent): void;
		})._navigateRepositionedRepositoryControls;
		placeRepositoryControls.call(harness, pickerRow);
		repositoryControls.addEventListener('keydown', event => navigateRepositoryControls.call(harness, event));

		controls[0].focus();
		const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
		controls[0].dispatchEvent(forward);
		const afterForward = document.activeElement;
		const leaving = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
		controls[1].dispatchEvent(leaving);
		const backward = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
		controls[1].dispatchEvent(backward);

		assert.deepStrictEqual({
			forwardPrevented: forward.defaultPrevented,
			branchFocused: afterForward === controls[1],
			leavingPrevented: leaving.defaultPrevented,
			backwardPrevented: backward.defaultPrevented,
			worktreeFocused: document.activeElement === controls[0],
		}, {
			forwardPrevented: true,
			branchFocused: true,
			leavingPrevented: false,
			backwardPrevented: true,
			worktreeFocused: true,
		});
	});
});
