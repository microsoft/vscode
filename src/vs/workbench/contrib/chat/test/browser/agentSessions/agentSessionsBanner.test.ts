/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextMenuDelegate } from '../../../../../../base/browser/contextmenu.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent, IConfigurationOverrides, IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { AgentsWindowOpenSource, isAgentsWindowOpenSource } from '../../../../../../platform/window/common/window.js';
import { NullWorkbenchAssignmentService } from '../../../../../services/assignment/test/common/nullAssignmentService.js';
import { ChatEntitlement, IChatEntitlementService, IChatSentiment } from '../../../../../services/chat/common/chatEntitlementService.js';
import { createAgentsBanner, isAgentsWindowAvailable } from '../../../browser/agentSessions/agentSessionsBanner.js';
import { AGENTS_WINDOW_BANNER_DESCRIPTION_TREATMENT, AGENTS_WINDOW_BANNER_TITLE_TREATMENT, AgentsWindowGraphic } from '../../../browser/agentSessions/agentsWindowGraphic.js';
import { resetWelcomeSignInCardHidden, WelcomeSignInCard } from '../../../browser/agentSessions/welcomeSignInCard.js';
import { AgentsWindowGraphicVariant, ChatConfiguration, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, WelcomeSignInStyle } from '../../../common/constants.js';

/**
 * Reports the `assigned` settings as the defaults that experiments assign, unlike `TestConfigurationService`, which reports every
 * setting as the user's, and the `userSettings` as values that the user set themselves.
 */
class ExperimentConfigurationService extends TestConfigurationService {
	constructor(assigned: Record<string, unknown>, private readonly userSettings: Record<string, unknown> = {}) {
		super({ ...assigned, ...userSettings });
	}

	override inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
		const inspected = super.inspect<T>(key, overrides);
		return Object.hasOwn(this.userSettings, key) ? inspected : { ...inspected, defaultValue: inspected.value, userValue: undefined, userLocalValue: undefined };
	}
}

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
			new class extends mock<IContextMenuService>() { }(),
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
	const cardSurfaceTreatment = `config.${ChatConfiguration.WelcomePageCardSurface}`;
	const bannerCopyTreatments = [AGENTS_WINDOW_BANNER_TITLE_TREATMENT, AGENTS_WINDOW_BANNER_DESCRIPTION_TREATMENT];
	const account = new class extends mock<IDefaultAccount>() { }();
	const defaultAccountService = new class extends mock<IDefaultAccountService>() {
		override currentDefaultAccount = null;
		override onDidChangeDefaultAccount = Event.None;
		override async getDefaultAccount(): Promise<IDefaultAccount | null> {
			return null;
		}
	}();

	/** Also records the events other than experiment triggers. */
	class RecordingTelemetryService extends TestExperimentTriggerTelemetryService {
		readonly events: { name: string | undefined; data: object | undefined }[] = [];
		override publicLog2(eventName?: string, data?: object): void {
			super.publicLog2(eventName, data);
			if (eventName !== 'experimentTrigger') {
				this.events.push({ name: eventName, data });
			}
		}
	}

	/** Creates the banner with the graphic, like the Welcome page does. The user is signed in unless `signedIn` is false. */
	function createBannerWithGraphic(variant: string, telemetryService: TestExperimentTriggerTelemetryService, options: { agentEnabled?: boolean; exposed?: boolean; signedIn?: boolean; getTreatment?: (name: string) => Promise<string | undefined>; userSettings?: Record<string, unknown> } = {}) {
		const configurationService = new ExperimentConfigurationService({
			[ChatConfiguration.WelcomePageAgentsWindowGraphic]: variant,
			[ChatConfiguration.AgentEnabled]: options.agentEnabled ?? true,
		}, options.userSettings);
		store.add(configurationService.onDidChangeConfigurationEmitter);
		store.add(CommandsRegistry.registerCommand(OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, () => { }));
		const signedIn = options.signedIn ?? true;
		const entitlement = observableValue('entitlement', signedIn ? ChatEntitlement.Pro : ChatEntitlement.Unknown);
		const chatEntitlementService = new class extends mock<IChatEntitlementService>() {
			override sentiment = {};
			override onDidChangeSentiment = Event.None;
			override entitlementObs = entitlement;
		}();
		const onDidChangeDefaultAccount = store.add(new Emitter<IDefaultAccount | null>());
		const accountService = new class extends mock<IDefaultAccountService>() {
			override currentDefaultAccount: IDefaultAccount | null = signedIn ? account : null;
			override onDidChangeDefaultAccount = onDidChangeDefaultAccount.event;
			override async getDefaultAccount(): Promise<IDefaultAccount | null> {
				return this.currentDefaultAccount;
			}
		}();
		const assignmentService = new class extends NullWorkbenchAssignmentService {
			override async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
				return await options.getTreatment?.(name) as T | undefined;
			}
		}();
		const graphic = store.add(new AgentsWindowGraphic(configurationService, store.add(new InMemoryStorageService()), assignmentService, new NullLogService(), chatEntitlementService, accountService));
		const exposed = observableValue('exposed', options.exposed ?? true);
		const menus: IContextMenuDelegate[] = [];
		const contextMenuService = new class extends mock<IContextMenuService>() {
			override showContextMenu(delegate: IContextMenuDelegate): void {
				menus.push(delegate);
			}
		}();
		const banner = createAgentsBanner(
			{ cssClass: 'agents-banner', graphic: { element: graphic.element, design: graphic.design, shownDesign: graphic.shownDesign, signedIn: graphic.signedIn, isExposed: exposed, bannerCopyResolved: graphic.bannerCopyResolved, hide: () => graphic.hide() } },
			new class extends mock<ICommandService>() { }(),
			telemetryService,
			configurationService,
			chatEntitlementService,
			accountService,
			contextMenuService,
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
		/** Opens the banner's context menu and returns its actions and whether one is selected, or `undefined` when it shows none. */
		const openMenu = (event: MouseEvent | KeyboardEvent) => {
			const count = menus.length;
			banner.element.querySelector('.agents-banner-button')!.dispatchEvent(event);
			const menu = menus.length > count ? menus[menus.length - 1] : undefined;
			return menu && { actions: menu.getActions().map(action => action.label), autoSelectItem: !!menu.autoSelectItem };
		};
		return {
			element: banner.element,
			graphicElement: graphic.element,
			shownDesign: () => graphic.shownDesign.get(),
			title: () => banner.element.querySelector('.agents-window-banner-title')?.textContent,
			hide: () => graphic.hide(),
			rightClick: () => openMenu(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
			pressShiftF10: () => openMenu(new KeyboardEvent('keydown', { key: 'F10', code: 'F10', keyCode: 121, shiftKey: true, bubbles: true, cancelable: true })),
			runMenuAction: async (label: string) => {
				await menus[menus.length - 1].getActions().find(action => action.label === label)!.run();
			},
			setVariant: (value: string) => setConfiguration(ChatConfiguration.WelcomePageAgentsWindowGraphic, value),
			setAgentEnabled: (enabled: boolean) => setConfiguration(ChatConfiguration.AgentEnabled, enabled),
			setExposed: (value: boolean) => exposed.set(value, undefined),
			signIn: () => {
				accountService.currentDefaultAccount = account;
				onDidChangeDefaultAccount.fire(account);
				entitlement.set(ChatEntitlement.Free, undefined);
			},
			layout: () => ({
				visible: banner.visible.get(),
				display: banner.element.style.display,
				children: [...banner.element.children].map(child => child.className),
			}),
			button: () => {
				const button = banner.element.querySelector<HTMLButtonElement>('.agents-banner-button')!;
				return { label: button.textContent, title: button.title, classes: button.className, icon: button.querySelector<HTMLElement>('.codicon')!.style.display };
			},
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

	test('makes the button the primary action of the banner', async () => {
		const banner = createBannerWithGraphic(AgentsWindowGraphicVariant.WindowComparison, new TestExperimentTriggerTelemetryService());
		const buttons = [banner.button()];
		await banner.setVariant(AgentsWindowGraphicVariant.Banner);
		buttons.push(banner.button());
		await banner.setVariant(AgentsWindowGraphicVariant.None);
		buttons.push(banner.button());

		const tryOut = { label: 'Try out the new Agents window', title: 'Try out the new Agents window', classes: 'agents-banner-button', icon: '' };
		assert.deepStrictEqual(buttons, [
			tryOut,
			{ label: 'Open Agents Window', title: 'Open Agents Window', classes: 'agents-banner-button emphasis', icon: 'none' },
			tryOut,
		]);
	});

	for (const variant of [AgentsWindowGraphicVariant.None, AgentsWindowGraphicVariant.WindowComparison, AgentsWindowGraphicVariant.Banner]) {
		test(`logs the experiment triggers once the banner is visible and exposed (${variant})`, async () => {
			const telemetryService = new TestExperimentTriggerTelemetryService();
			const banner = createBannerWithGraphic(variant, telemetryService, { agentEnabled: false, exposed: false });
			// Lets the banner read its copy treatments.
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
			createBannerWithGraphic(variant, telemetryService);
			steps.push(await triggers());

			// The section style only applies to the window comparison, and the card surface and copy only to the banner, so their triggers wait for that graphic.
			const shown = [
				graphicTreatment,
				...(variant === AgentsWindowGraphicVariant.WindowComparison ? [sectionStyleTreatment] : []),
				...(variant === AgentsWindowGraphicVariant.Banner ? [cardSurfaceTreatment, ...bannerCopyTreatments] : []),
			];
			assert.deepStrictEqual(steps, [[], [], shown, shown]);
		});
	}

	test('shows signed-out users only the sign-in action, without a graphic or experiment triggers, until they sign in', async () => {
		const telemetryService = new TestExperimentTriggerTelemetryService();
		const banner = createBannerWithGraphic(AgentsWindowGraphicVariant.Banner, telemetryService, { signedIn: false });
		const state = async () => {
			await timeout(0);
			return { shown: banner.shownDesign(), graphic: banner.graphicElement.style.display, button: banner.button().label, triggers: [...telemetryService.triggers] };
		};
		const states = [await state()];
		banner.signIn();
		states.push(await state());

		assert.deepStrictEqual(states, [
			{ shown: undefined, graphic: 'none', button: 'Sign in to GitHub', triggers: [] },
			{ shown: 'banner', graphic: '', button: 'Open Agents Window', triggers: [graphicTreatment, cardSurfaceTreatment, ...bannerCopyTreatments] },
		]);
	});

	test('logs the section style trigger when the window comparison is shown later', async () => {
		const telemetryService = new TestExperimentTriggerTelemetryService();
		const banner = createBannerWithGraphic(AgentsWindowGraphicVariant.Banner, telemetryService);
		await timeout(0);
		const steps = [[...telemetryService.triggers]];
		await banner.setVariant(AgentsWindowGraphicVariant.WindowComparison);
		steps.push([...telemetryService.triggers]);

		assert.deepStrictEqual(steps, [[graphicTreatment, cardSurfaceTreatment, ...bannerCopyTreatments], [graphicTreatment, cardSurfaceTreatment, ...bannerCopyTreatments, sectionStyleTreatment]]);
	});

	for (const variant of [AgentsWindowGraphicVariant.WindowComparison, AgentsWindowGraphicVariant.Banner]) {
		test(`logs the experiment triggers while the user has hidden the graphic (${variant})`, async () => {
			const telemetryService = new TestExperimentTriggerTelemetryService();
			const banner = createBannerWithGraphic(variant, telemetryService, { exposed: false });
			banner.hide();
			banner.setExposed(true);
			await timeout(0);

			// Only users who see a graphic can hide it, so the triggers ignore that it is hidden.
			assert.deepStrictEqual({ shown: banner.shownDesign(), triggers: telemetryService.triggers }, {
				shown: undefined,
				triggers: [graphicTreatment, ...(variant === AgentsWindowGraphicVariant.WindowComparison ? [sectionStyleTreatment] : [cardSurfaceTreatment, ...bannerCopyTreatments])],
			});
		});
	}

	for (const [arm, title] of [['control', undefined], ['treatment', 'Treatment title']] as const) {
		test(`logs the banner copy triggers once its treatments have been read (${arm})`, async () => {
			const telemetryService = new TestExperimentTriggerTelemetryService();
			const titleTreatment = new DeferredPromise<string | undefined>();
			const banner = createBannerWithGraphic(AgentsWindowGraphicVariant.Banner, telemetryService, {
				getTreatment: name => name === AGENTS_WINDOW_BANNER_TITLE_TREATMENT ? titleTreatment.p : Promise.resolve(undefined),
			});
			await timeout(0);
			const before = { triggers: [...telemetryService.triggers], title: banner.title() };
			await titleTreatment.complete(title);
			await timeout(0);

			// Until the treatments have been read, every arm shows the default title, so the copy triggers wait for them.
			const defaultTitle = 'All your agents, across all your projects, in one window';
			assert.deepStrictEqual({ before, after: { triggers: [...telemetryService.triggers], title: banner.title() } }, {
				before: { triggers: [graphicTreatment, cardSurfaceTreatment], title: defaultTitle },
				after: { triggers: [graphicTreatment, cardSurfaceTreatment, ...bannerCopyTreatments], title: title ?? defaultTitle },
			});
		});
	}

	test('logs no trigger for a setting that the user configured, since its experiment then does not change what they see', async () => {
		const triggers = [];
		for (const [variant, userSettings] of [
			[AgentsWindowGraphicVariant.WindowComparison, { [ChatConfiguration.WelcomePageAgentsWindowSectionStyle]: 'card' }],
			[AgentsWindowGraphicVariant.Banner, { [ChatConfiguration.WelcomePageAgentsWindowGraphic]: 'banner', [ChatConfiguration.WelcomePageCardSurface]: 'tint' }],
		] as const) {
			const telemetryService = new TestExperimentTriggerTelemetryService();
			createBannerWithGraphic(variant, telemetryService, { userSettings });
			await timeout(0);
			triggers.push(telemetryService.triggers);
		}

		// The banner's copy comes from treatments, which users can't configure.
		assert.deepStrictEqual(triggers, [[graphicTreatment], bannerCopyTreatments]);
	});

	test('offers to hide the graphic from its context menu, with the mouse or the keyboard, and keeps the button', async () => {
		const telemetryService = new RecordingTelemetryService();
		const banner = createBannerWithGraphic(AgentsWindowGraphicVariant.Banner, telemetryService);
		mainWindow.document.body.append(banner.element);
		store.add(toDisposable(() => banner.element.remove()));
		const button = banner.element.querySelector<HTMLButtonElement>('.agents-banner-button')!;
		const menus = { rightClick: banner.rightClick() };
		button.focus();
		const keyboardMenu = banner.pressShiftF10();
		await banner.runMenuAction('Hide');

		assert.deepStrictEqual({
			menus: { ...menus, keyboard: keyboardMenu },
			afterHide: {
				shown: banner.shownDesign(),
				children: [...banner.element.children].map(child => child.className),
				buttonFocused: mainWindow.document.activeElement === button,
				button: banner.button(),
				events: telemetryService.events,
				menus: { rightClick: banner.rightClick(), keyboard: banner.pressShiftF10() },
			},
		}, {
			// From the keyboard, the action is selected so that Enter runs it.
			menus: { rightClick: { actions: ['Hide'], autoSelectItem: false }, keyboard: { actions: ['Hide'], autoSelectItem: true } },
			afterHide: {
				shown: undefined,
				children: ['agents-window-graphic-container', 'agents-banner-button'],
				buttonFocused: true,
				button: { label: 'Try out the new Agents window', title: 'Try out the new Agents window', classes: 'agents-banner-button', icon: '' },
				events: [{ name: 'agentsBanner.clicked', data: { source: 'welcomePage', action: 'hideGraphic' } }],
				menus: { rightClick: undefined, keyboard: undefined },
			},
		});
	});

	test('offers no context menu while the page drops the graphic or no graphic is selected', async () => {
		const banner = createBannerWithGraphic(AgentsWindowGraphicVariant.WindowComparison, new TestExperimentTriggerTelemetryService());
		mainWindow.document.body.append(banner.element);
		store.add(toDisposable(() => banner.element.remove()));
		const menus = [banner.rightClick()];
		// Like the page's CSS does when the graphic doesn't fit
		banner.graphicElement.style.display = 'none';
		menus.push(banner.rightClick());
		banner.graphicElement.style.display = '';
		await banner.setVariant(AgentsWindowGraphicVariant.None);
		menus.push(banner.rightClick());

		assert.deepStrictEqual(menus, [{ actions: ['Hide'], autoSelectItem: false }, undefined, undefined]);
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
			new class extends mock<IContextMenuService>() { }(),
		);
		store.add(banner.disposables);

		assert.deepStrictEqual({ triggers: telemetryService.triggers, children: [...banner.element.children].map(child => child.className) }, { triggers: [], children: ['agents-banner-button'] });
	});
});

suite('AgentsBanner sign-in card', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const styleTreatment = `config.${ChatConfiguration.WelcomePageSignInStyle}`;
	const signInEnabledTreatment = `config.${ChatConfiguration.WelcomePageSignInEnabled}`;
	const signInCardSurfaceTreatment = `config.${ChatConfiguration.WelcomePageCardSurface}`;
	const account = new class extends mock<IDefaultAccount>() { }();

	/** Records the events other than experiment triggers. */
	class RecordingTelemetryService extends TestExperimentTriggerTelemetryService {
		readonly events: { name: string | undefined; data: object | undefined }[] = [];
		override publicLog2(eventName?: string, data?: object): void {
			super.publicLog2(eventName, data);
			if (eventName !== 'experimentTrigger') {
				this.events.push({ name: eventName, data });
			}
		}
	}

	/** Creates the banner with the sign-in card, like the Welcome page does. The user is signed out unless `signedIn` is true. */
	function createBannerWithSignInCard(style: string, options: { signedIn?: boolean; signInEnabled?: boolean; exposed?: boolean; storageService?: InMemoryStorageService; userSettings?: Record<string, unknown> } = {}) {
		const configurationService = new ExperimentConfigurationService({
			[ChatConfiguration.WelcomePageSignInStyle]: style,
			[ChatConfiguration.WelcomePageSignInEnabled]: options.signInEnabled ?? true,
		}, options.userSettings);
		store.add(configurationService.onDidChangeConfigurationEmitter);
		store.add(CommandsRegistry.registerCommand(OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, () => { }));
		const onDidChangeDefaultAccount = store.add(new Emitter<IDefaultAccount | null>());
		const defaultAccountService = new class extends mock<IDefaultAccountService>() {
			override currentDefaultAccount: IDefaultAccount | null = options.signedIn ? account : null;
			override onDidChangeDefaultAccount = onDidChangeDefaultAccount.event;
			override async getDefaultAccount(): Promise<IDefaultAccount | null> {
				return this.currentDefaultAccount;
			}
		}();
		const telemetryService = new RecordingTelemetryService();
		const card = store.add(new WelcomeSignInCard(configurationService, options.storageService ?? store.add(new InMemoryStorageService())));
		const exposed = observableValue('exposed', options.exposed ?? true);
		const menus: IContextMenuDelegate[] = [];
		const banner = createAgentsBanner(
			{ cssClass: 'agents-banner', signInCard: { element: card.element, style: card.style, hidden: card.hidden, isExposed: exposed, hide: () => card.hide() } },
			new class extends mock<ICommandService>() { }(),
			telemetryService,
			configurationService,
			new class extends mock<IChatEntitlementService>() {
				override sentiment = {};
				override onDidChangeSentiment = Event.None;
			}(),
			defaultAccountService,
			new class extends mock<IContextMenuService>() {
				override showContextMenu(delegate: IContextMenuDelegate): void {
					menus.push(delegate);
				}
			}(),
		);
		store.add(banner.disposables);
		const button = banner.element.querySelector<HTMLButtonElement>('.agents-banner-button')!;
		return {
			telemetryService,
			setExposed: (value: boolean) => exposed.set(value, undefined),
			signIn: () => {
				defaultAccountService.currentDefaultAccount = account;
				onDidChangeDefaultAccount.fire(account);
			},
			rightClick: () => {
				const count = menus.length;
				button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
				return menus.length > count ? menus[menus.length - 1].getActions().map(action => action.label) : undefined;
			},
			runMenuAction: async (label: string) => {
				await menus[menus.length - 1].getActions().find(action => action.label === label)!.run();
			},
			/** Lets the banner resolve the default account, then returns what it shows. */
			state: async () => {
				await timeout(0);
				return {
					card: banner.shownSignInCard.get(),
					text: card.element.style.display === 'none' ? '' : card.element.textContent,
					button: button.textContent,
					primary: button.classList.contains('emphasis'),
					triggers: [...telemetryService.triggers],
				};
			},
		};
	}

	test('shows signed-out users the card of the selected style, and logs the triggers in every arm once the page is shown', async () => {
		const states = [];
		for (const style of [WelcomeSignInStyle.Button, WelcomeSignInStyle.CopilotCard, WelcomeSignInStyle.GitHubCard, WelcomeSignInStyle.CompactCard, 'unknown']) {
			const banner = createBannerWithSignInCard(style, { exposed: false });
			const beforeExposure = (await banner.state()).triggers;
			banner.setExposed(true);
			states.push({ style, beforeExposure, ...await banner.state() });
		}

		// Whether sign-in is offered is an experiment too, and the card surface only applies to cards, so its trigger waits for one.
		const button = { button: 'Sign in to GitHub', primary: false, text: '', card: undefined, beforeExposure: [], triggers: [signInEnabledTreatment, styleTreatment] };
		const cardTriggers = [signInEnabledTreatment, styleTreatment, signInCardSurfaceTreatment];
		assert.deepStrictEqual(states, [
			{ style: 'button', ...button },
			{ style: 'copilotCard', card: 'copilotCard', text: 'Build software with GitHub Copilot agentsTry the free GitHub Copilot featuresHand off tasks to powerful agents that plan, code and testRun several agents at once in the new Agents window', button: 'Sign in to GitHub', primary: true, beforeExposure: [], triggers: cardTriggers },
			{ style: 'githubCard', card: 'githubCard', text: 'Connect VS Code to GitHubWork with your pull requests and issuesClone and publish your repositoriesUse GitHub Copilot to chat, edit and run agents', button: 'Sign in to GitHub', primary: true, beforeExposure: [], triggers: cardTriggers },
			{ style: 'compactCard', card: 'compactCard', text: 'Sign in with GitHub to use GitHub Copilot and work with your pull requests, issues and repositories.', button: 'Sign in to GitHub', primary: true, beforeExposure: [], triggers: cardTriggers },
			// Values that are no longer supported show the button.
			{ style: 'unknown', ...button },
		]);
	});

	test('shows no card while signed in or while sign-in is disabled, and removes the card on sign-in', async () => {
		const signedOut = createBannerWithSignInCard(WelcomeSignInStyle.GitHubCard);
		const beforeSignIn = await signedOut.state();
		signedOut.signIn();

		assert.deepStrictEqual({
			signedIn: await createBannerWithSignInCard(WelcomeSignInStyle.GitHubCard, { signedIn: true }).state(),
			signInDisabled: await createBannerWithSignInCard(WelcomeSignInStyle.GitHubCard, { signInEnabled: false }).state(),
			beforeSignIn: { card: beforeSignIn.card, button: beforeSignIn.button },
			afterSignIn: await signedOut.state(),
		}, {
			signedIn: { card: undefined, text: '', button: 'Try out the new Agents window', primary: false, triggers: [] },
			// Signed-out users see whether sign-in is offered in every arm of its experiment, but only offered sign-in shows a style.
			signInDisabled: { card: undefined, text: '', button: 'Try out the new Agents window', primary: false, triggers: [signInEnabledTreatment] },
			beforeSignIn: { card: 'githubCard', button: 'Sign in to GitHub' },
			// The user was offered sign-in, so the triggers stay logged.
			afterSignIn: { card: undefined, text: '', button: 'Try out the new Agents window', primary: false, triggers: [signInEnabledTreatment, styleTreatment, signInCardSurfaceTreatment] },
		});
	});

	test('logs no trigger for a setting that the user configured, since its experiment then does not change what they see', async () => {
		const triggers = [];
		for (const userSettings of [
			{ [ChatConfiguration.WelcomePageSignInEnabled]: true },
			{ [ChatConfiguration.WelcomePageSignInStyle]: WelcomeSignInStyle.GitHubCard, [ChatConfiguration.WelcomePageCardSurface]: 'neutral' },
		]) {
			triggers.push((await createBannerWithSignInCard(WelcomeSignInStyle.GitHubCard, { userSettings }).state()).triggers);
		}

		assert.deepStrictEqual(triggers, [[styleTreatment, signInCardSurfaceTreatment], [signInEnabledTreatment]]);
	});

	test('hides the card from its context menu in the profile, keeps the sign-in button, and still logs the trigger', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const banner = createBannerWithSignInCard(WelcomeSignInStyle.CopilotCard, { storageService });
		await banner.state();
		const menu = banner.rightClick();
		await banner.runMenuAction('Hide');
		const afterHide = { ...await banner.state(), menu: banner.rightClick(), events: banner.telemetryService.events };
		const otherPage = await createBannerWithSignInCard(WelcomeSignInStyle.CompactCard, { storageService }).state();
		resetWelcomeSignInCardHidden(storageService);

		assert.deepStrictEqual({
			menu,
			afterHide,
			otherPage,
			afterReset: (await banner.state()).card,
		}, {
			menu: ['Hide'],
			afterHide: {
				card: undefined, text: '', button: 'Sign in to GitHub', primary: false, triggers: [signInEnabledTreatment, styleTreatment, signInCardSurfaceTreatment],
				menu: undefined,
				events: [{ name: 'agentsBanner.clicked', data: { source: 'welcomePage', action: 'hideSignInCard' } }],
			},
			// Hiding the card applies to every style, but doesn't change who counts in the experiment.
			otherPage: { card: undefined, text: '', button: 'Sign in to GitHub', primary: false, triggers: [signInEnabledTreatment, styleTreatment, signInCardSurfaceTreatment] },
			afterReset: 'copilotCard',
		});
	});
});
