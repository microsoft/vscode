/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
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
import { ChatSetupStrategy } from '../../../chat/browser/chatSetup/chatSetup.js';
import { gitHubEnterpriseUrisSetting } from '../../../../services/accounts/common/githubEnterprise.js';

suite('OnboardingVariationA', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	function createOnboarding(configuration = new TestConfigurationService(), settingsUrl?: string, trusted = true) {
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
		sinon.stub(configuration, 'inspect').returns({ defaultValue: [], workspaceValue: [], value: [] });
		const update = sinon.stub(configuration, 'updateValue').resolves();
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
