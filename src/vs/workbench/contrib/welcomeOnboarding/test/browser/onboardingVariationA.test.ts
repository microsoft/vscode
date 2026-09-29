/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IExtensionGalleryService, IExtensionManagementService } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ColorThemeData } from '../../../../services/themes/common/colorThemeData.js';
import { IWorkbenchThemeService } from '../../../../services/themes/common/workbenchThemeService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { OnboardingVariationA } from '../../browser/onboardingVariationA.js';

suite('OnboardingVariationA', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const settingsUrl of [undefined, 'https://tenant.ghe.com/settings/copilot/features']) {
		test(`settings disclaimer ${settingsUrl ? 'links to the selected server' : 'has no link or focus stop when the URL is unavailable'}`, () => {
			const container = mainWindow.document.body.appendChild($('div'));
			store.add(toDisposable(() => container.remove()));
			const instantiationService = workbenchInstantiationService(undefined, store);
			instantiationService.stub(ILayoutService, { activeContainer: container });
			instantiationService.stub(IWorkbenchThemeService, { getColorTheme: () => ColorThemeData.createLoadedEmptyTheme('test', '') });
			instantiationService.stub(IExtensionGalleryService, {});
			instantiationService.stub(IExtensionManagementService, {});
			instantiationService.stub(IDefaultAccountService, { resolveGitHubUrl: () => settingsUrl });
			const onboarding = store.add(instantiationService.createInstance(OnboardingVariationA));
			onboarding.show();

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
});
