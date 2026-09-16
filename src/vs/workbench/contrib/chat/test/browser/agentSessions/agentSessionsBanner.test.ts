/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { AgentsWindowOpenSource } from '../../../../../../platform/window/common/window.js';
import { createAgentsBanner } from '../../../browser/agentSessions/agentSessionsBanner.js';
import { ChatConfiguration, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID } from '../../../common/constants.js';

suite('AgentsBanner', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const account = new class extends mock<IDefaultAccount>() { }();

	function createBanner(initialAccount: IDefaultAccount | null, options: { offerSignIn?: boolean; label?: string; initialAccountResolution?: Promise<IDefaultAccount | null>; configuration?: TestConfigurationService } = {}) {
		const onDidChangeDefaultAccount = store.add(new Emitter<IDefaultAccount | null>());
		const configurationService = options.configuration ?? new TestConfigurationService({ [ChatConfiguration.WelcomePageSignInEnabled]: true });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		let signInCalls = 0;
		let onButtonClickCalls = 0;
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
				source: 'welcomePage',
				label: options.label,
				onButtonClick: () => onButtonClickCalls++,
			},
			commandService,
			NullTelemetryService,
			configurationService,
			options.offerSignIn !== false ? defaultAccountService : undefined,
		);
		store.add(banner.disposables);
		const button = banner.element.querySelector('button')!;
		return {
			banner,
			button,
			async setSignInEnabled(enabled: boolean) {
				await configurationService.setUserConfiguration(ChatConfiguration.WelcomePageSignInEnabled, enabled);
				configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
					override affectsConfiguration(section: string): boolean {
						return section === ChatConfiguration.WelcomePageSignInEnabled;
					}
				}());
			},
			setAccount(value: IDefaultAccount | null, fireEvent = true) {
				defaultAccountService.currentDefaultAccount = value;
				if (fireEvent) {
					onDidChangeDefaultAccount.fire(value);
				}
			},
			state: () => ({
				label: button.textContent,
				title: button.title,
				icon: button.querySelector('.codicon')?.className,
				iconHidden: button.querySelector('.codicon')?.getAttribute('aria-hidden'),
				signInCalls,
				onButtonClickCalls,
				commands: [...commands],
			}),
		};
	}

	test('signed-out users can sign in without opening the Agents window', async () => {
		const banner = createBanner(null);
		await Promise.resolve();
		banner.button.click();

		assert.deepStrictEqual(banner.state(), {
			label: 'Sign in to GitHub',
			title: 'Sign in to GitHub',
			icon: 'codicon icon-widget codicon-github',
			iconHidden: 'true',
			signInCalls: 1,
			onButtonClickCalls: 0,
			commands: [],
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
			onButtonClickCalls: 1,
			commands: [{ id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, args: [{ source: AgentsWindowOpenSource.Banner }] }],
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
			onButtonClickCalls: signedOut.onButtonClickCalls,
			commands: signedOut.commands,
		}, {
			signedIn: { label: 'Try out the new Agents window', title: 'Try out the new Agents window', icon: 'codicon icon-widget codicon-agent' },
			signedOut: { label: 'Sign in to GitHub', title: 'Sign in to GitHub', icon: 'codicon icon-widget codicon-github' },
			sameButton: true,
			signInCalls: 1,
			onButtonClickCalls: 1,
			commands: [{ id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, args: [{ source: AgentsWindowOpenSource.Banner }] }],
		});
	});

	test('preserves banners that do not offer sign-in and their custom labels', () => {
		const banner = createBanner(null, { offerSignIn: false, label: 'View All Sessions' });
		banner.button.click();

		assert.deepStrictEqual(banner.state(), {
			label: 'View All Sessions',
			title: 'View All Sessions',
			icon: 'codicon icon-widget codicon-agent',
			iconHidden: 'true',
			signInCalls: 0,
			onButtonClickCalls: 1,
			commands: [{ id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, args: [{ source: AgentsWindowOpenSource.Banner }] }],
		});
	});

	for (const enabled of [undefined, false]) {
		test(`keeps the Agents window action when the setting is ${enabled}`, async () => {
			const configuration = new TestConfigurationService({ [ChatConfiguration.WelcomePageSignInEnabled]: enabled });
			const banner = createBanner(null, { configuration });
			await Promise.resolve();
			banner.button.click();

			assert.deepStrictEqual(banner.state(), {
				label: 'Try out the new Agents window',
				title: 'Try out the new Agents window',
				icon: 'codicon icon-widget codicon-agent',
				iconHidden: 'true',
				signInCalls: 0,
				onButtonClickCalls: 1,
				commands: [{ id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, args: [{ source: AgentsWindowOpenSource.Banner }] }],
			});
		});
	}

	test('updates the button and action when the experiment setting changes', async () => {
		const banner = createBanner(null, { configuration: new TestConfigurationService() });
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
			onButtonClickCalls: disabled.onButtonClickCalls,
			commands: disabled.commands,
		}, {
			enabled: { label: 'Sign in to GitHub', title: 'Sign in to GitHub', icon: 'codicon icon-widget codicon-github' },
			disabled: { label: 'Try out the new Agents window', title: 'Try out the new Agents window', icon: 'codicon icon-widget codicon-agent' },
			signInCalls: 1,
			onButtonClickCalls: 1,
			commands: [{ id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, args: [{ source: AgentsWindowOpenSource.Banner }] }],
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

			const openAgentsCommand = { id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, args: [{ source: AgentsWindowOpenSource.Banner }] };
			assert.deepStrictEqual({ beforeResolution, afterResolution: banner.state() }, {
				beforeResolution: {
					label: 'Try out the new Agents window',
					title: 'Try out the new Agents window',
					icon: 'codicon icon-widget codicon-agent',
					iconHidden: 'true',
					signInCalls: 0,
					onButtonClickCalls: 1,
					commands: [openAgentsCommand],
				},
				afterResolution: {
					label: resolvedAccount ? 'Try out the new Agents window' : 'Sign in to GitHub',
					title: resolvedAccount ? 'Try out the new Agents window' : 'Sign in to GitHub',
					icon: resolvedAccount ? 'codicon icon-widget codicon-agent' : 'codicon icon-widget codicon-github',
					iconHidden: 'true',
					signInCalls: resolvedAccount ? 0 : 1,
					onButtonClickCalls: resolvedAccount ? 2 : 1,
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
