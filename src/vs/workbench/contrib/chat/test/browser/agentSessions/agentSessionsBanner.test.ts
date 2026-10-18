/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { AgentsWindowOpenSource, isAgentsWindowOpenSource } from '../../../../../../platform/window/common/window.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../services/chat/common/chatEntitlementService.js';
import { canShowAgentsBanner, createAgentsBanner, IAgentsBannerOptions } from '../../../browser/agentSessions/agentSessionsBanner.js';
import { ChatConfiguration, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID } from '../../../common/constants.js';

suite('AgentsBanner', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createBanner(options: { source?: IAgentsBannerOptions['source']; label?: string; configuration?: TestConfigurationService; sentiment?: IChatSentiment } = {}) {
		const onDidChangeSentiment = store.add(new Emitter<void>());
		const configurationService = options.configuration ?? new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		store.add(CommandsRegistry.registerCommand(OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, () => { }));
		const chatEntitlementService = new class extends mock<IChatEntitlementService>() {
			override sentiment = options.sentiment ?? {};
			override onDidChangeSentiment = onDidChangeSentiment.event;
		}();
		const setConfiguration = async (key: string, value: boolean) => {
			await configurationService.setUserConfiguration(key, value);
			configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
				override affectsConfiguration(section: string): boolean {
					return section === key;
				}
			}());
		};
		let onButtonClickCalls = 0;
		const commands: { id: string; args: unknown[] }[] = [];
		const commandService = new class extends mock<ICommandService>() {
			override async executeCommand<T>(id: string, ...args: unknown[]): Promise<T | undefined> {
				commands.push({ id, args });
				return undefined;
			}
		}();
		const banner = createAgentsBanner(
			{
				cssClass: 'agents-banner',
				source: options.source ?? 'welcomePage',
				label: options.label,
				onButtonClick: () => onButtonClickCalls++,
			},
			commandService,
			NullTelemetryService,
			configurationService,
			chatEntitlementService,
		);
		store.add(banner.disposables);
		const button = banner.element.querySelector('button')!;
		return {
			banner,
			button,
			setAgentEnabled: (enabled: boolean) => setConfiguration(ChatConfiguration.AgentEnabled, enabled),
			setSentiment(sentiment: IChatSentiment) {
				chatEntitlementService.sentiment = sentiment;
				onDidChangeSentiment.fire();
			},
			visibility: () => ({
				canShow: canShowAgentsBanner(chatEntitlementService, configurationService),
				display: banner.element.style.display,
				ariaHidden: banner.element.getAttribute('aria-hidden'),
				disabled: button.disabled,
			}),
			state: () => ({
				label: button.textContent,
				title: button.title,
				icon: button.querySelector('.codicon')?.className,
				iconHidden: button.querySelector('.codicon')?.getAttribute('aria-hidden'),
				onButtonClickCalls,
				commands: [...commands],
			}),
		};
	}

	for (const enabled of [false, true]) {
		test(`initial visibility reflects effective agent enablement (${enabled})`, () => {
			const banner = createBanner({ configuration: new TestConfigurationService({ [ChatConfiguration.AgentEnabled]: enabled }) });
			banner.button.click();

			assert.deepStrictEqual({
				...banner.visibility(),
				commands: banner.state().commands.length,
				onButtonClickCalls: banner.state().onButtonClickCalls,
			}, {
				canShow: enabled,
				display: enabled ? '' : 'none',
				ariaHidden: enabled ? null : 'true',
				disabled: !enabled,
				commands: enabled ? 1 : 0,
				onButtonClickCalls: enabled ? 1 : 0,
			});
		});
	}

	test('updates an existing banner as effective agent enablement changes', async () => {
		const banner = createBanner({ configuration: new TestConfigurationService({ [ChatConfiguration.AgentEnabled]: false }) });
		const states = [banner.visibility()];
		for (const enabled of [true, false, true]) {
			await banner.setAgentEnabled(enabled);
			states.push(banner.visibility());
			banner.button.click();
		}

		const visible = { canShow: true, display: '', ariaHidden: null, disabled: false };
		const hidden = { canShow: false, display: 'none', ariaHidden: 'true', disabled: true };
		assert.deepStrictEqual({
			states,
			sameButton: banner.button === banner.banner.element.querySelector('button'),
			commands: banner.state().commands.length,
		}, {
			states: [hidden, visible, hidden, visible],
			sameButton: true,
			commands: 2,
		});
	});

	for (const sentiment of [{ hidden: true }, { disabled: true }]) {
		test(`keeps the banner hidden when chat is ${sentiment.hidden ? 'hidden' : 'disabled'}`, async () => {
			const banner = createBanner({ sentiment });
			const states = [banner.visibility().display];
			await banner.setAgentEnabled(false);
			banner.setSentiment({});
			states.push(banner.visibility().display);
			await banner.setAgentEnabled(true);
			states.push(banner.visibility().display);
			banner.setSentiment(sentiment);
			states.push(banner.visibility().display);

			assert.deepStrictEqual(states, ['none', 'none', '', 'none']);
		});
	}

	test('disposes the visibility listeners and click handler', async () => {
		const banner = createBanner();
		banner.banner.disposables.dispose();
		await banner.setAgentEnabled(false);
		banner.setSentiment({ hidden: true });
		banner.button.click();

		assert.deepStrictEqual({
			display: banner.banner.element.style.display,
			disabled: banner.button.disabled,
			commands: banner.state().commands.length,
			onButtonClickCalls: banner.state().onButtonClickCalls,
		}, { display: '', disabled: false, commands: 0, onButtonClickCalls: 0 });
	});

	for (const [source, windowOpenSource] of [
		['welcomePage', 'welcomeTryOut'],
		['agentSessionsWelcome', 'welcomeViewAll'],
	] as const) {
		test(`reports ${windowOpenSource} when opening Agents from ${source}`, () => {
			const banner = createBanner({ source });
			banner.button.click();

			assert.deepStrictEqual({
				commands: banner.state().commands,
				accepted: isAgentsWindowOpenSource(windowOpenSource),
			}, {
				commands: [{ id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, args: [{ source: windowOpenSource }] }],
				accepted: true,
			});
		});
	}

	test('offers the Agents window action by default', () => {
		const banner = createBanner();
		banner.button.click();

		assert.deepStrictEqual(banner.state(), {
			label: 'Try out the new Agents window',
			title: 'Try out the new Agents window',
			icon: 'codicon codicon-agent icon-widget',
			iconHidden: 'true',
			onButtonClickCalls: 1,
			commands: [{ id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, args: [{ source: AgentsWindowOpenSource.WelcomeTryOut }] }],
		});
	});

	test('preserves custom labels', () => {
		const banner = createBanner({ source: 'agentSessionsWelcome', label: 'View All Sessions' });
		banner.button.click();

		assert.deepStrictEqual(banner.state(), {
			label: 'View All Sessions',
			title: 'View All Sessions',
			icon: 'codicon codicon-agent icon-widget',
			iconHidden: 'true',
			onButtonClickCalls: 1,
			commands: [{ id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, args: [{ source: AgentsWindowOpenSource.WelcomeViewAll }] }],
		});
	});
});
