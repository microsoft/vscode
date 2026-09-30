/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IExtensionGalleryService, IExtensionManagementService } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ColorThemeData } from '../../../../services/themes/common/colorThemeData.js';
import { IWorkbenchThemeService } from '../../../../services/themes/common/workbenchThemeService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { OnboardingVariationA } from '../../browser/onboardingVariationA.js';
import { IChatMicrosoftSignInProbeService } from '../../../chat/browser/chatSetup/chatSetupMicrosoftProbe.js';

suite('OnboardingVariationA', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createOnboarding(settingsUrl: string | undefined, microsoftSignIn: IChatMicrosoftSignInProbeService = { _serviceBrand: undefined, offerMicrosoftSignIn: constObservable(false), notifySignInShown() { } }) {
		const container = mainWindow.document.body.appendChild($('div'));
		store.add(toDisposable(() => container.remove()));
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ILayoutService, { activeContainer: container });
		instantiationService.stub(IWorkbenchThemeService, { getColorTheme: () => ColorThemeData.createLoadedEmptyTheme('test', '') });
		instantiationService.stub(IExtensionGalleryService, {});
		instantiationService.stub(IExtensionManagementService, {});
		instantiationService.stub(IDefaultAccountService, { resolveGitHubUrl: () => settingsUrl });
		instantiationService.stub(IChatMicrosoftSignInProbeService, microsoftSignIn);
		const onboarding = store.add(instantiationService.createInstance(OnboardingVariationA));
		onboarding.show();
		return container;
	}

	for (const settingsUrl of [undefined, 'https://tenant.ghe.com/settings/copilot/features']) {
		test(`settings disclaimer ${settingsUrl ? 'links to the selected server' : 'has no link or focus stop when the URL is unavailable'}`, () => {
			const container = createOnboarding(settingsUrl);

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
		const container = createOnboarding(undefined, {
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
});
