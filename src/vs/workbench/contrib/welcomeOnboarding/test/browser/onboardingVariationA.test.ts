/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IExtensionGalleryService, IExtensionManagementService } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { ColorThemeData } from '../../../../services/themes/common/colorThemeData.js';
import { IWorkbenchThemeService } from '../../../../services/themes/common/workbenchThemeService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { OnboardingVariationA } from '../../browser/onboardingVariationA.js';
import { IChatMicrosoftSignInProbeService } from '../../../chat/browser/chatSetup/chatSetupMicrosoftProbe.js';
import { ChatSetupStrategy } from '../../../chat/browser/chatSetup/chatSetup.js';
import { gitHubEnterpriseUrisSetting } from '../../../../services/accounts/common/githubEnterprise.js';

suite('OnboardingVariationA', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	function createOnboarding(configuration = new TestConfigurationService(), settingsUrl?: string, trusted = true, microsoftSignIn: IChatMicrosoftSignInProbeService = { _serviceBrand: undefined, offerMicrosoftSignIn: constObservable(false), notifySignInShown() { } }) {
		const container = mainWindow.document.body.appendChild($('div'));
		store.add(toDisposable(() => container.remove()));
		store.add(configuration.onDidChangeConfigurationEmitter);
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ILayoutService, { activeContainer: container });
		instantiationService.stub(IWorkbenchThemeService, { getColorTheme: () => ColorThemeData.createLoadedEmptyTheme('test', '') });
		instantiationService.stub(IExtensionGalleryService, {});
		instantiationService.stub(IExtensionManagementService, {});
		instantiationService.stub(IDefaultAccountService, { resolveGitHubUrl: () => settingsUrl });
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IWorkspaceTrustManagementService, { isWorkspaceTrusted: () => trusted });
		instantiationService.stub(IChatMicrosoftSignInProbeService, microsoftSignIn);
		const commandInvoked = new DeferredPromise<void>();
		const executeCommand = sinon.stub().callsFake(async () => {
			await commandInvoked.complete();
			return false;
		});
		instantiationService.stub(ICommandService, { executeCommand });
		const onboarding = store.add(instantiationService.createInstance(OnboardingVariationA));
		onboarding.show();
		return { container, executeCommand, commandInvoked: commandInvoked.p };
	}

	function clickEnterpriseSignIn(container: HTMLElement): void {
		const button = container.querySelector<HTMLElement>('[aria-label="Continue with GitHub Enterprise"]');
		assert.ok(button);
		button.click();
	}

	test('onboarding keeps all provider choices and waits for shared setup completion', async () => {
		const f = createOnboarding(undefined, undefined, true, { _serviceBrand: undefined, offerMicrosoftSignIn: constObservable(true), notifySignInShown() { } });
		f.executeCommand.resolves(false);
		const microsoft = f.container.querySelector<HTMLButtonElement>('[aria-label="Continue with Microsoft"]');
		assert.ok(microsoft);
		microsoft.click();
		await timeout(0);
		assert.deepStrictEqual({
			commands: f.executeCommand.getCalls().map(call => call.args),
			githubOffered: !!f.container.querySelector('[aria-label="Continue with GitHub"]'),
			stillOnSignIn: !!f.container.querySelector('.onboarding-a-signin-actions'),
		}, {
			commands: [['workbench.action.chat.triggerSetup', undefined, { disableChatViewReveal: true, setupStrategy: ChatSetupStrategy.SetupWithMicrosoftProvider }]],
			githubOffered: true,
			stillOnSignIn: true,
		});
	});

	test('Microsoft availability updates leave provider controls and dialog focus intact', () => {
		const observed = [];
		for (const externalFocus of [false, true]) {
			const offered = observableValue('offerMicrosoft', false);
			const { container } = createOnboarding(undefined, undefined, true, { _serviceBrand: undefined, offerMicrosoftSignIn: offered, notifySignInShown() { } });
			const externalButton = mainWindow.document.body.appendChild($('button'));
			store.add(toDisposable(() => externalButton.remove()));
			const original = container.querySelector<HTMLButtonElement>('[aria-label="Continue with GitHub"]')!;
			(externalFocus ? externalButton : original).focus();
			offered.set(true, undefined);
			observed.push({ externalFocus, correctFocus: mainWindow.document.activeElement === (externalFocus ? externalButton : original) });
			if (!externalFocus) {
				mainWindow.document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
				container.querySelector('.onboarding-a-overlay.exiting')?.dispatchEvent(new mainWindow.Event('transitionend'));
				observed.push({ dismissedByEscape: !container.querySelector('.onboarding-a-overlay') });
			}
		}
		assert.deepStrictEqual(observed, [
			{ externalFocus: false, correctFocus: true }, { dismissedByEscape: true }, { externalFocus: true, correctFocus: true },
		]);
	});

	for (const settingsUrl of [undefined, 'https://tenant.ghe.com/settings/copilot/features']) {
		test(`settings disclaimer ${settingsUrl ? 'links to the selected server' : 'has no link or focus stop when the URL is unavailable'}`, () => {
			const { container } = createOnboarding(undefined, settingsUrl);

			const disclaimer = container.querySelector('.onboarding-a-signin-disclaimer');
			assert.ok(disclaimer);
			const settingsLinks = Array.from(disclaimer.querySelectorAll('a, [tabindex]'))
				.filter(element => element.textContent === 'settings');
			assert.deepStrictEqual({
				coherentText: disclaimer.textContent?.endsWith('You can change these settings anytime.'),
				settingsLinks: settingsLinks.map(link => ({
					tag: link.tagName,
					href: link.getAttribute('href'),
				})),
			}, {
				coherentText: true,
				settingsLinks: settingsUrl ? [{ tag: 'A', href: settingsUrl }] : [],
			});
		});
	}

	test('offers Microsoft sign-in as soon as the probe service does, even while the step is showing', () => {
		const offered = observableValue('offerMicrosoftSignIn', false);
		let shown = 0;
		const { container } = createOnboarding(undefined, undefined, true, {
			_serviceBrand: undefined,
			offerMicrosoftSignIn: offered,
			notifySignInShown: () => { shown++; },
		});
		const microsoftButton = () => container.querySelector<HTMLElement>('.onboarding-a-signin-actions button[aria-label="Continue with Microsoft"]');
		const visibleBefore = microsoftButton()?.style.display !== 'none';
		offered.set(true, undefined);

		assert.deepStrictEqual({ shown, exists: !!microsoftButton(), visibleBefore, visibleOnceOffered: microsoftButton()?.style.display !== 'none' }, {
			shown: 1,
			exists: true,
			visibleBefore: false,
			visibleOnceOffered: true,
		});
	});

	for (const uris of [['https://a.ghe.com', 'https://b.ghe.com'], ['https://b.ghe.com', 'https://a.ghe.com']]) {
		test(`enterprise setup leaves host selection to authentication (${uris.join(', ')})`, async () => {
			const configuration = new TestConfigurationService({ [gitHubEnterpriseUrisSetting]: uris, 'github-enterprise.uri': 'https://legacy.ghe.com' });
			const { container, executeCommand, commandInvoked } = createOnboarding(configuration);
			clickEnterpriseSignIn(container);
			await commandInvoked;
			await executeCommand.firstCall.returnValue;
			assert.deepStrictEqual({
				commands: executeCommand.getCalls().map(call => call.args),
				hosts: configuration.getValue(gitHubEnterpriseUrisSetting),
				hasInstanceInput: !!container.querySelector('.onboarding-a-signin-ghe-input')
			}, {
				commands: [['workbench.action.chat.triggerSetup', undefined, { disableChatViewReveal: true, setupStrategy: ChatSetupStrategy.SetupWithEnterpriseProvider }]],
				hosts: uris,
				hasInstanceInput: false
			});
		});
	}

	test('explicit empty configuration prompts for enrollment without preselecting the deprecated host', () => {
		const configuration = new TestConfigurationService({ [gitHubEnterpriseUrisSetting]: [], 'github-enterprise.uri': 'https://legacy.ghe.com' });
		const { container, executeCommand } = createOnboarding(configuration);
		clickEnterpriseSignIn(container);
		assert.deepStrictEqual({
			value: container.querySelector<HTMLInputElement>('.onboarding-a-signin-ghe-input input')?.value,
			commands: executeCommand.getCalls()
		}, { value: '', commands: [] });
	});

	for (const values of [
		{ 'github-enterprise.uri': 'not-a-url' },
		{ [gitHubEnterpriseUrisSetting]: ['not-a-url'] },
		{ [gitHubEnterpriseUrisSetting]: ['https://valid.ghe.com', 'not-a-url'] },
	]) {
		test(`corrects invalid enterprise URLs without discarding other hosts (${JSON.stringify(values)})`, async () => {
			const configuration = new TestConfigurationService({ ...values });
			sinon.stub(configuration, 'updateValue').callsFake((key, value) => configuration.setUserConfiguration(key, value));
			const { container, executeCommand, commandInvoked } = createOnboarding(configuration);
			clickEnterpriseSignIn(container);
			const input = container.querySelector<HTMLInputElement>('.onboarding-a-signin-ghe-input input');
			assert.strictEqual(input?.value, 'not-a-url');
			assert.ok(input);
			input.value = 'https://corrected.ghe.com';
			input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
			input.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
			await commandInvoked;
			await executeCommand.firstCall.returnValue;
			assert.deepStrictEqual({
				hosts: configuration.getValue(gitHubEnterpriseUrisSetting),
				setupCalls: executeCommand.callCount
			}, {
				hosts: [...(values[gitHubEnterpriseUrisSetting] ?? []).filter(uri => uri !== 'not-a-url'), 'https://corrected.ghe.com'],
				setupCalls: 1
			});
		});
	}

	test('cancelling enterprise URL correction does not change the host list', () => {
		const hosts = ['https://valid.ghe.com', 'not-a-url'];
		const configuration = new TestConfigurationService({ [gitHubEnterpriseUrisSetting]: hosts });
		const write = sinon.stub(configuration, 'updateValue').resolves();
		const { container, executeCommand } = createOnboarding(configuration);
		clickEnterpriseSignIn(container);
		const input = container.querySelector<HTMLInputElement>('.onboarding-a-signin-ghe-input input');
		assert.ok(input);
		input.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
		assert.deepStrictEqual({
			hosts: configuration.getValue(gitHubEnterpriseUrisSetting),
			writes: write.callCount,
			setupCalls: executeCommand.callCount
		}, { hosts, writes: 0, setupCalls: 0 });
	});

	test('Copilot enrollment rejects a GHES URL without changing general enterprise configuration', () => {
		const hosts = ['https://github.example.com', 'not-a-url'];
		const configuration = new TestConfigurationService({ [gitHubEnterpriseUrisSetting]: hosts });
		const write = sinon.stub(configuration, 'updateValue').resolves();
		const { container, executeCommand } = createOnboarding(configuration);
		clickEnterpriseSignIn(container);
		const input = container.querySelector<HTMLInputElement>('.onboarding-a-signin-ghe-input input');
		assert.ok(input);
		input.value = 'https://another-server.example.com';
		input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		input.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		assert.deepStrictEqual({
			hosts: configuration.getValue(gitHubEnterpriseUrisSetting),
			writes: write.callCount,
			setupCalls: executeCommand.callCount,
			message: container.querySelector('.onboarding-a-signin-ghe-message')?.textContent
		}, { hosts, writes: 0, setupCalls: 0, message: 'Enter a GHE.com instance name or HTTPS URL.' });
	});

	test('a GHES-only configuration prompts for a cloud instance and preserves the server', async () => {
		const configuration = new TestConfigurationService({ [gitHubEnterpriseUrisSetting]: ['https://github.example.com/Team'] });
		sinon.stub(configuration, 'updateValue').callsFake((key, value) => configuration.setUserConfiguration(key, value));
		const { container, executeCommand, commandInvoked } = createOnboarding(configuration);
		clickEnterpriseSignIn(container);
		const input = container.querySelector<HTMLInputElement>('.onboarding-a-signin-ghe-input input');
		assert.ok(input);
		assert.deepStrictEqual({ value: input.value, setupCalls: executeCommand.callCount }, { value: '', setupCalls: 0 });
		input.value = 'https://cloud.ghe.com';
		input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		input.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		await commandInvoked;
		await executeCommand.firstCall.returnValue;
		assert.deepStrictEqual(configuration.getValue(gitHubEnterpriseUrisSetting), ['https://github.example.com/Team', 'https://cloud.ghe.com']);
	});

	test('correction preserves hosts added while the invalid URI is being edited', async () => {
		const configuration = new TestConfigurationService({ [gitHubEnterpriseUrisSetting]: ['https://valid.ghe.com', 'not-a-url'] });
		sinon.stub(configuration, 'updateValue').callsFake((key, value) => configuration.setUserConfiguration(key, value));
		const { container, executeCommand, commandInvoked } = createOnboarding(configuration);
		clickEnterpriseSignIn(container);
		await configuration.setUserConfiguration(gitHubEnterpriseUrisSetting, ['https://valid.ghe.com', 'not-a-url', 'https://added.ghe.com']);
		const input = container.querySelector<HTMLInputElement>('.onboarding-a-signin-ghe-input input');
		assert.ok(input);
		input.value = 'https://corrected.ghe.com';
		input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		input.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		await commandInvoked;
		await executeCommand.firstCall.returnValue;
		assert.deepStrictEqual(configuration.getValue(gitHubEnterpriseUrisSetting), ['https://valid.ghe.com', 'https://added.ghe.com', 'https://corrected.ghe.com']);
	});

	test('repairs each invalid URI before starting setup and focuses the next correction', async () => {
		const configuration = new TestConfigurationService({ [gitHubEnterpriseUrisSetting]: ['first invalid', 'second invalid'] });
		sinon.stub(configuration, 'updateValue').callsFake((key, value) => configuration.setUserConfiguration(key, value));
		const { container, executeCommand, commandInvoked } = createOnboarding(configuration);
		clickEnterpriseSignIn(container);
		const first = container.querySelector<HTMLInputElement>('.onboarding-a-signin-ghe-input input');
		assert.ok(first);
		const nextPrompt = new DeferredPromise<void>();
		const observer = new mainWindow.MutationObserver(() => {
			if (container.querySelector<HTMLInputElement>('.onboarding-a-signin-ghe-input input')?.value === 'second invalid') {
				nextPrompt.complete();
			}
		});
		store.add(toDisposable(() => observer.disconnect()));
		observer.observe(container, { childList: true, subtree: true });
		first.value = 'https://first.ghe.com';
		first.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		first.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		await nextPrompt.p;
		observer.disconnect();
		const second = container.querySelector<HTMLInputElement>('.onboarding-a-signin-ghe-input input');
		assert.ok(second);
		assert.deepStrictEqual({ setupCalls: executeCommand.callCount, focused: mainWindow.document.activeElement === second }, { setupCalls: 0, focused: true });
		second.value = 'https://second.ghe.com';
		second.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		second.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		await commandInvoked;
		await executeCommand.firstCall.returnValue;
		assert.deepStrictEqual(configuration.getValue(gitHubEnterpriseUrisSetting), ['https://first.ghe.com', 'https://second.ghe.com']);
	});

	test('enrollment preserves hosts added while the instance prompt is open', async () => {
		const configuration = new TestConfigurationService({ [gitHubEnterpriseUrisSetting]: [] });
		const update = sinon.stub(configuration, 'updateValue').callsFake((key, value) => configuration.setUserConfiguration(key, value));
		const { container, executeCommand, commandInvoked } = createOnboarding(configuration);
		clickEnterpriseSignIn(container);
		await configuration.setUserConfiguration(gitHubEnterpriseUrisSetting, ['https://other.ghe.com']);
		const input = container.querySelector<HTMLInputElement>('.onboarding-a-signin-ghe-input input');
		assert.ok(input);
		input.value = 'chosen';
		input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		input.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		await commandInvoked;
		await executeCommand.firstCall.returnValue;
		assert.deepStrictEqual({
			writes: update.getCalls().map(call => call.args),
			setupCalls: executeCommand.callCount
		}, {
			writes: [[gitHubEnterpriseUrisSetting, ['https://other.ghe.com', 'https://chosen.ghe.com'], ConfigurationTarget.USER]],
			setupCalls: 1
		});
	});

	test('untrusted workspace configuration does not prompt over a legacy user host', async () => {
		const configuration = new TestConfigurationService({ [gitHubEnterpriseUrisSetting]: [], 'github-enterprise.uri': 'https://legacy.ghe.com' });
		sinon.stub(configuration, 'inspect').returns({ defaultValue: [], workspaceValue: [], value: [] });
		const { container, executeCommand, commandInvoked } = createOnboarding(configuration, undefined, false);
		clickEnterpriseSignIn(container);
		await commandInvoked;
		await executeCommand.firstCall.returnValue;
		assert.deepStrictEqual({
			setupCalls: executeCommand.callCount,
			hasInstanceInput: !!container.querySelector('.onboarding-a-signin-ghe-input')
		}, { setupCalls: 1, hasInstanceInput: false });
	});

	test('untrusted enrollment writes a user host rather than the ignored workspace setting', async () => {
		const configuration = new TestConfigurationService({ [gitHubEnterpriseUrisSetting]: [] });
		sinon.stub(configuration, 'inspect').callsFake(key => ({ defaultValue: [], userValue: configuration.getValue(key), workspaceValue: [], value: configuration.getValue(key) }));
		const update = sinon.stub(configuration, 'updateValue').callsFake((key, value) => configuration.setUserConfiguration(key, value));
		const { container, executeCommand, commandInvoked } = createOnboarding(configuration, undefined, false);
		clickEnterpriseSignIn(container);
		const input = container.querySelector<HTMLInputElement>('.onboarding-a-signin-ghe-input input');
		assert.ok(input);
		input.value = 'chosen';
		input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		input.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		await commandInvoked;
		await executeCommand.firstCall.returnValue;
		assert.deepStrictEqual(update.firstCall.args, [gitHubEnterpriseUrisSetting, ['https://chosen.ghe.com'], ConfigurationTarget.USER]);
	});
});
