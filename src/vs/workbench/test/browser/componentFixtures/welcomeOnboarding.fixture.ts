/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { IExtensionGalleryService, IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { OnboardingVariationA } from '../../../contrib/welcomeOnboarding/browser/onboardingVariationA.js';
import { IOnboardingThemeOption } from '../../../contrib/welcomeOnboarding/common/onboardingTypes.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IWorkbenchThemeService } from '../../../services/themes/common/workbenchThemeService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';
import '../../../../base/browser/ui/button/button.css';
import '../../../../base/browser/ui/codicons/codicon/codicon.css';
import '../../../contrib/welcomeOnboarding/browser/media/variationA.css';

export default defineThemedFixtureGroup({ path: 'onboarding/' }, {
	SignedOut: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderSignedOutOnboarding(context, { holdScanning: false }),
	}),
	Detecting: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderSignedOutOnboarding(context, { holdScanning: true }),
	}),
	Stacked: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderSignedOutOnboarding(context, { holdScanning: false, layout: 'stacked' }),
	}),
});

/**
 * The Component Explorer bundle ships without `product.json`, so the onboarding
 * theme options are seeded here to exercise the Personalize step.
 */
const FIXTURE_THEMES: readonly IOnboardingThemeOption[] = [
	{ id: 'dark-2026', label: 'Dark 2026', themeId: 'Dark 2026', type: 'dark' },
	{ id: 'hc-dark', label: 'Dark High Contrast', themeId: 'Default High Contrast', type: 'hcDark' },
	{ id: 'solarized-dark', label: 'Solarized Dark', themeId: 'Solarized Dark', type: 'dark' },
	{ id: 'light-2026', label: 'Light 2026', themeId: 'Light 2026', type: 'light' },
	{ id: 'hc-light', label: 'Light High Contrast', themeId: 'Default High Contrast Light', type: 'hcLight' },
	{ id: 'solarized-light', label: 'Solarized Light', themeId: 'Solarized Light', type: 'light' },
];

class FixturePathService extends mock<IPathService>() {
	override userHome(options: { preferLocal: true }): URI;
	override userHome(options?: { preferLocal: boolean }): Promise<URI>;
	override userHome(options?: { preferLocal: boolean }): URI | Promise<URI> {
		const userHome = URI.file('/fixture-user');
		return options?.preferLocal ? userHome : Promise.resolve(userHome);
	}
}

function renderSignedOutOnboarding({ container, disposableStore, theme }: ComponentFixtureContext, options: { holdScanning: boolean; layout?: 'grid' | 'stacked' }): void {
	container.style.width = '1200px';
	container.style.height = '720px';

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registration => {
			registration.definePartialInstance(ILayoutService, {
				activeContainer: container,
			});
			registration.definePartialInstance(IWorkbenchThemeService, {
				getColorTheme: () => theme,
				getColorThemes: async () => [],
			});
			registration.definePartialInstance(IExtensionGalleryService, {
				getExtensions: async () => [],
			});
			registration.definePartialInstance(IExtensionManagementService, {});
			registration.definePartialInstance(IFileService, {
				exists: async () => false,
			});
			registration.defineInstance(IPathService, new FixturePathService());
		},
	});

	const onboarding = disposableStore.add(instantiationService.createInstance(OnboardingVariationA));
	onboarding.enableAuthenticationPrototype({
		accounts: {
			copilot: { label: 'eli-w-king', detail: 'Elijah King', avatarUrl: 'https://avatars.githubusercontent.com/u/201316543?v=4' },
			chatgpt: { label: 'Elijah King', detail: 'ChatGPT Plus' },
		},
		themes: FIXTURE_THEMES,
		holdScanning: options.holdScanning,
		layout: options.layout,
	});
	onboarding.show();
}
