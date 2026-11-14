/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { AgentsWindowOpenSource, IOpenedMainWindow, isAgentsWindowOpenSource } from '../../../../../../platform/window/common/window.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { createAgentsBanner, isAgentsWindowAvailable } from '../../../browser/agentSessions/agentSessionsBanner.js';
import { AgentsWindowGraphic } from '../../../browser/agentSessions/agentsWindowGraphic.js';
import { AgentsWindowGraphicVariant, ChatConfiguration, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID } from '../../../common/constants.js';

suite('AgentsBanner', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const account = new class extends mock<IDefaultAccount>() { }();

	function createBanner(initialAccount: IDefaultAccount | null, options: { initialAccountResolution?: Promise<IDefaultAccount | null>; configuration?: TestConfigurationService; sentiment?: IChatSentiment } = {}) {
		const onDidChangeDefaultAccount = store.add(new Emitter<IDefaultAccount | null>());
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
		let signInCalls = 0;
		const commands: { id: string; args: unknown[] }[] = [];
		const defaultAccountService = new class extends mock<IDefaultAccountService>() {
			override currentDefaultAccount = initialAccount;
			override onDidChangeDefaultAccount = onDidChangeDefaultAccount.event;
			override getDefaultAccount(): Promise<IDefaultAccount | null> {
				return options.initialAccountResolution ?? Promise.resolve(this.currentDefaultAccount);
			}
			override async signIn(): Promise<IDefaultAccount | null> {
				signInCalls++;
				return null;
			}
		}();
		const commandService = new class extends mock<ICommandService>() {
			override async executeCommand<T>(id: string, ...args: unknown[]): Promise<T | undefined> {
				commands.push({ id, args });
				return undefined;
			}
		}();
		const banner = createAgentsBanner(
			{
				cssClass: 'agents-banner',
			},
			commandService,
			NullTelemetryService,
			configurationService,
			chatEntitlementService,
			defaultAccountService,
		);
		store.add(banner.disposables);
		const button = banner.element.querySelector('button')!;
		return {
			banner,
			button,
			setSignInEnabled: (enabled: boolean) => setConfiguration(ChatConfiguration.WelcomePageSignInEnabled, enabled),
			setAgentEnabled: (enabled: boolean) => setConfiguration(ChatConfiguration.AgentEnabled, enabled),
			setSentiment(sentiment: IChatSentiment) {
				chatEntitlementService.sentiment = sentiment;
				onDidChangeSentiment.fire();
			},
			setAccount(value: IDefaultAccount | null, fireEvent = true) {
				defaultAccountService.currentDefaultAccount = value;
				if (fireEvent) {
					onDidChangeDefaultAccount.fire(value);
				}
			},
			visibility: () => ({
				agentsWindowAvailable: isAgentsWindowAvailable(chatEntitlementService, configurationService),
				display: banner.element.style.display,
				ariaHidden: banner.element.getAttribute('aria-hidden'),
				disabled: button.disabled,
			}),
			state: () => ({
				label: button.textContent,
				title: button.title,
				icon: button.querySelector('.codicon')?.className,
				iconHidden: button.querySelector('.codicon')?.getAttribute('aria-hidden'),
				signInCalls,
				commands: [...commands],
			}),
		};
	}

	for (const enabled of [false, true]) {
		test(`initial visibility reflects effective agent enablement (${enabled})`, () => {
			const banner = createBanner(account, { configuration: new TestConfigurationService({ [ChatConfiguration.AgentEnabled]: enabled }) });
			banner.button.click();

			assert.deepStrictEqual({
				...banner.visibility(),
				commands: banner.state().commands.length,
			}, {
				agentsWindowAvailable: enabled,
				display: enabled ? '' : 'none',
				ariaHidden: enabled ? null : 'true',
				disabled: !enabled,
				commands: enabled ? 1 : 0,
			});
		});
	}

	test('updates an existing banner as effective agent enablement changes', async () => {
		const banner = createBanner(account, { configuration: new TestConfigurationService({ [ChatConfiguration.AgentEnabled]: false }) });
		const states = [banner.visibility()];
		for (const enabled of [true, false, true]) {
			await banner.setAgentEnabled(enabled);
			states.push(banner.visibility());
			banner.button.click();
		}

		const visible = { agentsWindowAvailable: true, display: '', ariaHidden: null, disabled: false };
		const hidden = { agentsWindowAvailable: false, display: 'none', ariaHidden: 'true', disabled: true };
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

	for (const sentiment of [{ hidden: true }, { disabled: true, disabledInWorkspace: true }]) {
		test(`keeps the banner hidden when chat is ${sentiment.hidden ? 'hidden' : 'disabled in the workspace'}`, async () => {
			const banner = createBanner(account, { sentiment });
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

	test('shows the sign-in action when the chat extension is disabled until setup completes', async () => {
		const banner = createBanner(null, { sentiment: { installed: true, disabled: true } });
		await Promise.resolve();
		banner.button.click();

		assert.deepStrictEqual({
			display: banner.visibility().display,
			label: banner.state().label,
			signInCalls: banner.state().signInCalls,
		}, {
			display: '',
			label: 'Sign in to GitHub',
			signInCalls: 1,
		});
	});

	test('does not offer sign-in when agent mode is disabled', async () => {
		const banner = createBanner(null, {
			configuration: new TestConfigurationService({
				[ChatConfiguration.AgentEnabled]: false,
				[ChatConfiguration.WelcomePageSignInEnabled]: true,
			})
		});
		await Promise.resolve();
		banner.button.click();

		assert.deepStrictEqual({
			signInCalls: banner.state().signInCalls,
			commands: banner.state().commands,
		}, { signInCalls: 0, commands: [] });
	});

	test('disposes the visibility listeners', async () => {
		const banner = createBanner(account);
		banner.banner.disposables.dispose();
		await banner.setAgentEnabled(false);
		banner.setSentiment({ hidden: true });

		assert.deepStrictEqual({
			display: banner.banner.element.style.display,
			disabled: banner.button.disabled,
		}, { display: '', disabled: false });
	});

	test('resolved signed-out users see the sign-in action by default without opening the Agents window', async () => {
		const banner = createBanner(null, { configuration: new TestConfigurationService() });
		await Promise.resolve();
		banner.button.click();

		assert.deepStrictEqual(banner.state(), {
			label: 'Sign in to GitHub',
			title: 'Sign in to GitHub',
			icon: 'codicon icon-widget codicon-github',
			iconHidden: 'true',
			signInCalls: 1,
			commands: [],
		});
	});

	test('reports welcomeTryOut when opening Agents from the welcome page', () => {
		const banner = createBanner(account);
		banner.button.click();

		assert.deepStrictEqual({
			commands: banner.state().commands,
			accepted: isAgentsWindowOpenSource(AgentsWindowOpenSource.WelcomeTryOut),
		}, {
			commands: [{ id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, args: [{ source: AgentsWindowOpenSource.WelcomeTryOut }] }],
			accepted: true,
		});
	});

	test('signed-in users keep the Agents window action', () => {
		const banner = createBanner(account);
		banner.button.click();

		assert.deepStrictEqual(banner.state(), {
			label: 'Try out the new Agents window',
			title: 'Try out the new Agents window',
			icon: 'codicon icon-widget codicon-agent',
			iconHidden: 'true',
			signInCalls: 0,
			commands: [{ id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, args: [{ source: AgentsWindowOpenSource.WelcomeTryOut }] }],
		});
	});

	test('updates the existing button on sign-in and sign-out', () => {
		const banner = createBanner(null);
		banner.setAccount(account);
		banner.button.click();
		const signedIn = banner.state();
		banner.setAccount(null);
		banner.button.click();
		const signedOut = banner.state();

		assert.deepStrictEqual({
			signedIn: { label: signedIn.label, title: signedIn.title, icon: signedIn.icon },
			signedOut: { label: signedOut.label, title: signedOut.title, icon: signedOut.icon },
			sameButton: banner.button === banner.banner.element.querySelector('button'),
			signInCalls: signedOut.signInCalls,
			commands: signedOut.commands,
		}, {
			signedIn: { label: 'Try out the new Agents window', title: 'Try out the new Agents window', icon: 'codicon icon-widget codicon-agent' },
			signedOut: { label: 'Sign in to GitHub', title: 'Sign in to GitHub', icon: 'codicon icon-widget codicon-github' },
			sameButton: true,
			signInCalls: 1,
			commands: [{ id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, args: [{ source: AgentsWindowOpenSource.WelcomeTryOut }] }],
		});
	});

	test('keeps the Agents window action when the setting is false', async () => {
		const configuration = new TestConfigurationService({ [ChatConfiguration.WelcomePageSignInEnabled]: false });
		const banner = createBanner(null, { configuration });
		await Promise.resolve();
		banner.button.click();

		assert.deepStrictEqual(banner.state(), {
			label: 'Try out the new Agents window',
			title: 'Try out the new Agents window',
			icon: 'codicon icon-widget codicon-agent',
			iconHidden: 'true',
			signInCalls: 0,
			commands: [{ id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, args: [{ source: AgentsWindowOpenSource.WelcomeTryOut }] }],
		});
	});

	test('updates the button and action when the experiment setting changes', async () => {
		const banner = createBanner(null, { configuration: new TestConfigurationService({ [ChatConfiguration.WelcomePageSignInEnabled]: false }) });
		await banner.setSignInEnabled(true);
		banner.button.click();
		const enabled = banner.state();
		await banner.setSignInEnabled(false);
		banner.button.click();
		const disabled = banner.state();

		assert.deepStrictEqual({
			enabled: { label: enabled.label, title: enabled.title, icon: enabled.icon },
			disabled: { label: disabled.label, title: disabled.title, icon: disabled.icon },
			signInCalls: disabled.signInCalls,
			commands: disabled.commands,
		}, {
			enabled: { label: 'Sign in to GitHub', title: 'Sign in to GitHub', icon: 'codicon icon-widget codicon-github' },
			disabled: { label: 'Try out the new Agents window', title: 'Try out the new Agents window', icon: 'codicon icon-widget codicon-agent' },
			signInCalls: 1,
			commands: [{ id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, args: [{ source: AgentsWindowOpenSource.WelcomeTryOut }] }],
		});
	});

	for (const resolvedAccount of [account, null]) {
		test(`preserves the Agents action until the initial account resolves as ${resolvedAccount ? 'signed in' : 'signed out'}`, async () => {
			const initialAccountResolution = new DeferredPromise<IDefaultAccount | null>();
			const banner = createBanner(null, { initialAccountResolution: initialAccountResolution.p });
			await banner.setSignInEnabled(false);
			await banner.setSignInEnabled(true);
			banner.button.click();
			const beforeResolution = banner.state();
			banner.setAccount(resolvedAccount, false);
			await initialAccountResolution.complete(resolvedAccount);
			banner.button.click();

			const openAgentsCommand = { id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, args: [{ source: AgentsWindowOpenSource.WelcomeTryOut }] };
			assert.deepStrictEqual({ beforeResolution, afterResolution: banner.state() }, {
				beforeResolution: {
					label: 'Try out the new Agents window',
					title: 'Try out the new Agents window',
					icon: 'codicon icon-widget codicon-agent',
					iconHidden: 'true',
					signInCalls: 0,
					commands: [openAgentsCommand],
				},
				afterResolution: {
					label: resolvedAccount ? 'Try out the new Agents window' : 'Sign in to GitHub',
					title: resolvedAccount ? 'Try out the new Agents window' : 'Sign in to GitHub',
					icon: resolvedAccount ? 'codicon icon-widget codicon-agent' : 'codicon icon-widget codicon-github',
					iconHidden: 'true',
					signInCalls: resolvedAccount ? 0 : 1,
					commands: resolvedAccount ? [openAgentsCommand, openAgentsCommand] : [openAgentsCommand],
				},
			});
		});
	}

	test('does not update after disposal while the initial account resolves', async () => {
		const initialAccountResolution = new DeferredPromise<IDefaultAccount | null>();
		const banner = createBanner(null, { initialAccountResolution: initialAccountResolution.p });
		const before = banner.state();
		banner.banner.disposables.dispose();
		banner.setAccount(account, false);
		await initialAccountResolution.complete(account);

		assert.deepStrictEqual(banner.state(), before);
	});

	test('disposes the account and configuration listeners and click handler', async () => {
		const banner = createBanner(null);
		await Promise.resolve();
		const before = banner.state();
		banner.banner.disposables.dispose();
		await banner.setSignInEnabled(false);
		banner.setAccount(account);
		banner.button.click();

		assert.deepStrictEqual(banner.state(), before);
	});
});

suite('AgentsBanner graphic', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const graphicTreatment = `config.${ChatConfiguration.WelcomePageAgentsWindowGraphic}`;
	const sectionStyleTreatment = `config.${ChatConfiguration.WelcomePageAgentsWindowSectionStyle}`;
	const multipleEditorWindowsTreatment = `config.${ChatConfiguration.WelcomePageAgentsWindowGraphic}.multipleEditorWindows`;
	const agentSessionsWorkspace = URI.file('/agent-sessions.code-workspace');
	const editorWindow = (id: number): IOpenedMainWindow => ({ id, title: '', dirty: false });
	const agentsWindow: IOpenedMainWindow = { id: 99, title: '', dirty: false, workspace: { id: 'agents', configPath: agentSessionsWorkspace } };
	const defaultAccountService = new class extends mock<IDefaultAccountService>() {
		override currentDefaultAccount = null;
		override onDidChangeDefaultAccount = Event.None;
		override async getDefaultAccount(): Promise<IDefaultAccount | null> {
			return null;
		}
	}();

	/** Creates the banner with the graphic, like the Welcome page does. */
	function createBannerWithGraphic(variant: string, telemetryService: TestExperimentTriggerTelemetryService, options: { agentEnabled?: boolean; exposed?: boolean; windows?: IOpenedMainWindow[] | Promise<IOpenedMainWindow[]> } = {}) {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.WelcomePageAgentsWindowGraphic]: variant,
			[ChatConfiguration.AgentEnabled]: options.agentEnabled ?? true,
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		store.add(CommandsRegistry.registerCommand(OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, () => { }));
		const chatEntitlementService = new class extends mock<IChatEntitlementService>() {
			override sentiment = {};
			override onDidChangeSentiment = Event.None;
		}();
		const hostService = new class extends mock<IHostService>() {
			override async getWindows() { return options.windows ?? [editorWindow(1)]; }
		}();
		const environmentService = new class extends mock<IWorkbenchEnvironmentService>() {
			override agentSessionsWorkspace = agentSessionsWorkspace;
		}();
		const graphic = store.add(new AgentsWindowGraphic(configurationService, hostService, environmentService));
		const exposed = observableValue('exposed', options.exposed ?? true);
		const banner = createAgentsBanner(
			{ cssClass: 'agents-banner', graphic: { element: graphic.element, shownDesign: graphic.shownDesign, isExposed: exposed, hasMultipleEditorWindows: graphic.hasMultipleEditorWindows } },
			new class extends mock<ICommandService>() { }(),
			telemetryService,
			configurationService,
			chatEntitlementService,
			defaultAccountService,
		);
		store.add(banner.disposables);
		const setConfiguration = async (key: string, value: string | boolean) => {
			await configurationService.setUserConfiguration(key, value);
			configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
				override affectsConfiguration(section: string): boolean {
					return section === key;
				}
			}());
		};
		return {
			setVariant: (value: string) => setConfiguration(ChatConfiguration.WelcomePageAgentsWindowGraphic, value),
			setAgentEnabled: (enabled: boolean) => setConfiguration(ChatConfiguration.AgentEnabled, enabled),
			setExposed: (value: boolean) => exposed.set(value, undefined),
			layout: () => ({
				visible: banner.visible.get(),
				display: banner.element.style.display,
				children: [...banner.element.children].map(child => child.className),
			}),
		};
	}

	test('shows the graphic above the button and hides them together', async () => {
		const banner = createBannerWithGraphic(AgentsWindowGraphicVariant.WindowComparison, new TestExperimentTriggerTelemetryService());
		const states = [banner.layout()];
		await banner.setAgentEnabled(false);
		states.push(banner.layout());

		const children = ['agents-window-graphic-container', 'agents-banner-button'];
		assert.deepStrictEqual(states, [
			{ visible: true, display: '', children },
			{ visible: false, display: 'none', children },
		]);
	});

	const windowSetups: [label: string, windows: IOpenedMainWindow[], multiple: boolean][] = [
		['1 editor window', [editorWindow(1)], false],
		['2 editor windows', [editorWindow(1), editorWindow(2)], true],
		['1 editor window and the Agents window', [editorWindow(1), agentsWindow], false],
	];
	for (const variant of [AgentsWindowGraphicVariant.None, AgentsWindowGraphicVariant.WindowComparison, AgentsWindowGraphicVariant.ManyWindowsToOne, AgentsWindowGraphicVariant.Auto]) {
		for (const [label, windows, multiple] of windowSetups) {
			test(`logs the experiment triggers once the banner is visible and exposed (${variant}, ${label})`, async () => {
				const telemetryService = new TestExperimentTriggerTelemetryService();
				const banner = createBannerWithGraphic(variant, telemetryService, { agentEnabled: false, exposed: false, windows });
				const triggers = async () => {
					await timeout(0);
					return [...telemetryService.triggers];
				};
				const steps = [await triggers()];
				banner.setExposed(true);
				steps.push(await triggers());
				await banner.setAgentEnabled(true);
				steps.push(await triggers());
				banner.setExposed(false);
				banner.setExposed(true);
				createBannerWithGraphic(variant, telemetryService, { windows });
				steps.push(await triggers());

				// The section style only applies while a graphic is shown, so its trigger waits for one.
				// The multiple editor windows trigger depends only on the windows, so every arm logs it alike.
				const shown = [
					graphicTreatment,
					...(variant === AgentsWindowGraphicVariant.None ? [] : [sectionStyleTreatment]),
					...(multiple ? [multipleEditorWindowsTreatment] : []),
				];
				assert.deepStrictEqual(steps, [[], [], shown, shown]);
			});
		}
	}

	test('logs the multiple editor windows trigger once the windows have been counted', async () => {
		const telemetryService = new TestExperimentTriggerTelemetryService();
		const windows = new DeferredPromise<IOpenedMainWindow[]>();
		createBannerWithGraphic(AgentsWindowGraphicVariant.WindowComparison, telemetryService, { windows: windows.p });
		await timeout(0);
		const steps = [[...telemetryService.triggers]];
		await windows.complete([editorWindow(1), editorWindow(2)]);
		await timeout(0);
		steps.push([...telemetryService.triggers]);

		assert.deepStrictEqual(steps, [
			[graphicTreatment, sectionStyleTreatment],
			[graphicTreatment, sectionStyleTreatment, multipleEditorWindowsTreatment],
		]);
	});

	test('logs the section style trigger when a graphic is shown later', async () => {
		const telemetryService = new TestExperimentTriggerTelemetryService();
		const banner = createBannerWithGraphic(AgentsWindowGraphicVariant.None, telemetryService);
		const steps = [[...telemetryService.triggers]];
		await banner.setVariant(AgentsWindowGraphicVariant.WindowComparison);
		steps.push([...telemetryService.triggers]);

		assert.deepStrictEqual(steps, [[graphicTreatment], [graphicTreatment, sectionStyleTreatment]]);
	});

	test('does not log the experiment trigger without the graphic option', () => {
		const telemetryService = new TestExperimentTriggerTelemetryService();
		const configurationService = new TestConfigurationService();
		store.add(CommandsRegistry.registerCommand(OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, () => { }));
		const banner = createAgentsBanner(
			{ cssClass: 'agents-banner' },
			new class extends mock<ICommandService>() { }(),
			telemetryService,
			configurationService,
			new class extends mock<IChatEntitlementService>() {
				override sentiment = {};
				override onDidChangeSentiment = Event.None;
			}(),
			defaultAccountService,
		);
		store.add(banner.disposables);

		assert.deepStrictEqual({ triggers: telemetryService.triggers, children: [...banner.element.children].map(child => child.className) }, { triggers: [], children: ['agents-banner-button'] });
	});
});
