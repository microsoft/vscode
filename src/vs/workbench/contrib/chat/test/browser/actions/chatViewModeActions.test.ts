/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isICommandActionToggleInfo } from '../../../../../../platform/action/common/action.js';
import { isIMenuItem, isISubmenuItem, MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationOverrides, IConfigurationService, IConfigurationUpdateOverrides, IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { registerChatViewModeActions } from '../../../browser/actions/chatActions.js';
import { ChatViewId } from '../../../browser/chat.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ChatConfiguration, ChatProgressAnimation, ChatProgressVerbosity } from '../../../common/constants.js';

suite('Chat View Mode', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const modes = [ChatProgressVerbosity.Compact, ChatProgressVerbosity.Verbose, ChatProgressVerbosity.Conversation];

	// Register only the view mode actions, and unregister them afterwards, so that other suites in the
	// same test run don't see global chat commands such as `workbench.action.chat.open`.
	let viewModeActions: IDisposable | undefined;
	suiteSetup(() => {
		if (!CommandsRegistry.getCommand('workbench.action.chat.viewMode.compact')) {
			viewModeActions = registerChatViewModeActions();
		}
	});

	suiteTeardown(() => {
		viewModeActions?.dispose();
		viewModeActions = undefined;
	});

	function createConfiguration(animation: ChatProgressAnimation, verbosity: ChatProgressVerbosity, workspace = false) {
		const updates: { key: string; value: unknown; target: ConfigurationTarget | undefined }[] = [];
		const configuration = new class extends TestConfigurationService {
			override async updateValue(key: string, value: unknown, target?: ConfigurationTarget | IConfigurationOverrides | IConfigurationUpdateOverrides): Promise<void> {
				updates.push({ key, value, target: typeof target === 'number' ? target : undefined });
				await this.setUserConfiguration(key, value);
			}

			override inspect<T>(key: string): IConfigurationValue<T> {
				const inspected = super.inspect<T>(key);
				return { ...inspected, workspaceValue: workspace ? inspected.value : undefined };
			}
		}({
			[ChatConfiguration.PersistentProgress]: animation,
			[ChatConfiguration.PersistentProgressVerbosity]: verbosity,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IConfigurationService, configuration);
		return { configuration, instantiation, updates };
	}

	test('contributes a shared three-choice submenu only to the enabled chat view', () => {
		const { configuration } = createConfiguration(ChatProgressAnimation.Draw, ChatProgressVerbosity.Compact);
		const context = store.add(new ContextKeyService(configuration));
		const enabled = ChatContextKeys.enabled.bindTo(context);
		const view = context.createKey<string>('view', ChatViewId);
		const submenu = MenuRegistry.getMenuItems(MenuId.ViewTitle).filter(isISubmenuItem).find(item => item.submenu === MenuId.ChatViewMode);
		assert.ok(submenu);
		const items = MenuRegistry.getMenuItems(MenuId.ChatViewMode).filter(isIMenuItem);
		enabled.set(true);
		const visible = context.contextMatchesRules(submenu.when);
		view.set('anotherView');
		const otherView = context.contextMatchesRules(submenu.when);
		view.set(ChatViewId);
		enabled.set(false);

		assert.deepStrictEqual({
			title: typeof submenu.title === 'string' ? submenu.title : submenu.title.value,
			group: submenu.group,
			order: submenu.order,
			visible,
			otherView,
			hidden: !context.contextMatchesRules(submenu.when),
			choices: items.map(item => ({
				title: typeof item.command.title === 'string' ? item.command.title : item.command.title.value,
				order: item.order,
				hidden: !context.contextMatchesRules(item.when),
				disabled: !context.contextMatchesRules(item.command.precondition),
			})),
		}, {
			title: 'View Mode', group: '3_configure', order: 14, visible: true, otherView: false, hidden: true,
			choices: ['Compact', 'Verbose', 'Conversation'].map((title, order) => ({ title, order, hidden: true, disabled: true })),
		});
	});

	for (const animation of Object.values(ChatProgressAnimation)) {
		for (const mode of modes) {
			test(`selecting ${mode} with ${animation} updates the mode and preserves enabled animation choices`, async () => {
				const { configuration, instantiation, updates } = createConfiguration(animation, ChatProgressVerbosity.Compact);
				const command = CommandsRegistry.getCommand(`workbench.action.chat.viewMode.${mode}`);
				assert.ok(command);
				await command.handler(instantiation);

				assert.deepStrictEqual({
					updates,
					animation: configuration.getValue(ChatConfiguration.PersistentProgress),
					verbosity: configuration.getValue(ChatConfiguration.PersistentProgressVerbosity),
				}, {
					updates: [
						{ key: ChatConfiguration.PersistentProgressVerbosity, value: mode, target: ConfigurationTarget.USER },
						...(animation === ChatProgressAnimation.Off ? [{ key: ChatConfiguration.PersistentProgress, value: ChatProgressAnimation.Draw, target: ConfigurationTarget.USER }] : []),
					],
					animation: animation === ChatProgressAnimation.Off ? ChatProgressAnimation.Draw : animation,
					verbosity: mode,
				});
			});
		}
	}

	test('updates workspace overrides instead of writing an ineffective user preference', async () => {
		const { instantiation, updates } = createConfiguration(ChatProgressAnimation.Off, ChatProgressVerbosity.Conversation, true);
		const command = CommandsRegistry.getCommand('workbench.action.chat.viewMode.compact');
		assert.ok(command);
		await command.handler(instantiation);
		assert.deepStrictEqual(updates, [
			{ key: ChatConfiguration.PersistentProgressVerbosity, value: ChatProgressVerbosity.Compact, target: ConfigurationTarget.WORKSPACE },
			{ key: ChatConfiguration.PersistentProgress, value: ChatProgressAnimation.Draw, target: ConfigurationTarget.WORKSPACE },
		]);
	});

	for (const mode of modes) {
		test(`checks only the active ${mode} choice`, () => {
			const { configuration } = createConfiguration(ChatProgressAnimation.DrawMonochromeNoIcon, mode);
			const context = store.add(new ContextKeyService(configuration));
			assert.deepStrictEqual(MenuRegistry.getMenuItems(MenuId.ChatViewMode).filter(isIMenuItem).map(item => {
				const toggled = isICommandActionToggleInfo(item.command.toggled) ? item.command.toggled.condition : item.command.toggled;
				return context.contextMatchesRules(toggled);
			}), modes.map(candidate => candidate === mode));
		});
	}

	test('does not check a persistent view mode when persistent progress is Off', () => {
		const { configuration } = createConfiguration(ChatProgressAnimation.Off, ChatProgressVerbosity.Compact);
		const context = store.add(new ContextKeyService(configuration));
		assert.deepStrictEqual(MenuRegistry.getMenuItems(MenuId.ChatViewMode).filter(isIMenuItem).map(item => {
			const toggled = isICommandActionToggleInfo(item.command.toggled) ? item.command.toggled.condition : item.command.toggled;
			return context.contextMatchesRules(toggled);
		}), [false, false, false]);
	});

	test('propagates configuration write failures without enabling persistent progress', async () => {
		const { configuration, instantiation, updates } = createConfiguration(ChatProgressAnimation.Off, ChatProgressVerbosity.Compact);
		const failingConfiguration = new class extends TestConfigurationService {
			override async updateValue(): Promise<void> {
				throw new Error('Cannot write chat settings');
			}
		}();
		store.add(failingConfiguration.onDidChangeConfigurationEmitter);
		instantiation.stub(IConfigurationService, failingConfiguration);
		const command = CommandsRegistry.getCommand('workbench.action.chat.viewMode.verbose');
		assert.ok(command);
		await assert.rejects(async () => { await command.handler(instantiation); }, /Cannot write chat settings/);
		assert.deepStrictEqual({ updates, animation: configuration.getValue(ChatConfiguration.PersistentProgress) }, { updates: [], animation: ChatProgressAnimation.Off });
	});
});
