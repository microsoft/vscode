/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Load styles for all variations
import './media/variationA.css';
import './media/variationB.css';
import './media/variationC.css';
import './media/variationD.css';

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { OnboardingVariationA } from './onboardingVariationA.js';
import { OnboardingVariationB } from './onboardingVariationB.js';
import { OnboardingVariationC } from './onboardingVariationC.js';
import { OnboardingVariationD } from './onboardingVariationD.js';

const category = localize2('welcome', "Welcome");

// =========================================================================
// Variation A — Classic Wizard Modal
// =========================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.welcomeOnboardingA',
			title: localize2('welcomeOnboardingA', "Welcome Onboarding: Variation A (Wizard Modal)"),
			category,
			f1: true,
		});
	}

	run(accessor: ServicesAccessor): void {
		const instantiationService = accessor.get(IInstantiationService);
		const modal = instantiationService.createInstance(OnboardingVariationA);
		modal.show();
	}
});

// =========================================================================
// Variation B — Side-Nav Modal
// =========================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.welcomeOnboardingB',
			title: localize2('welcomeOnboardingB', "Welcome Onboarding: Variation B (Side-Nav Modal)"),
			category,
			f1: true,
		});
	}

	run(accessor: ServicesAccessor): void {
		const instantiationService = accessor.get(IInstantiationService);
		const modal = instantiationService.createInstance(OnboardingVariationB);
		modal.show();
	}
});

// =========================================================================
// Variation C — Chat-Integrated Welcome
// =========================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.welcomeOnboardingC',
			title: localize2('welcomeOnboardingC', "Welcome Onboarding: Variation C (Chat-Integrated)"),
			category,
			f1: true,
		});
	}

	run(accessor: ServicesAccessor): void {
		const instantiationService = accessor.get(IInstantiationService);
		const layoutService = accessor.get(ILayoutService);

		// Create a full-screen overlay container for Variation C
		const overlay = getActiveWindow().document.createElement('div');
		overlay.style.position = 'fixed';
		overlay.style.inset = '0';
		overlay.style.zIndex = '10000';
		overlay.style.background = 'var(--vscode-editor-background)';
		layoutService.activeContainer.appendChild(overlay);

		const variationC = instantiationService.createInstance(OnboardingVariationC);
		variationC.render(overlay);

		// Dismiss on completion or prompt request
		variationC.onDidComplete(() => {
			overlay.remove();
			variationC.dispose();
		});

		variationC.onDidRequestPrompt(() => {
			overlay.remove();
			variationC.dispose();
		});

		// Add escape key handler
		const activeWin = getActiveWindow();
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				overlay.remove();
				variationC.dispose();
				activeWin.document.removeEventListener('keydown', handler);
			}
		};
		activeWin.document.addEventListener('keydown', handler);
	}
});

// =========================================================================
// Variation D — Agentic Full-Screen Chat
// =========================================================================
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.welcomeOnboardingD',
			title: localize2('welcomeOnboardingD', "Welcome Onboarding: Variation D (Agentic Chat)"),
			category,
			f1: true,
		});
	}

	run(accessor: ServicesAccessor): void {
		const instantiationService = accessor.get(IInstantiationService);
		const layoutService = accessor.get(ILayoutService);

		// Create a full-screen overlay container for Variation D
		const overlay = getActiveWindow().document.createElement('div');
		overlay.style.position = 'fixed';
		overlay.style.inset = '0';
		overlay.style.zIndex = '10000';
		overlay.style.background = 'var(--vscode-editor-background)';
		layoutService.activeContainer.appendChild(overlay);

		const variationD = instantiationService.createInstance(OnboardingVariationD);
		variationD.render(overlay);

		variationD.onDidComplete(() => {
			overlay.remove();
			variationD.dispose();
		});

		// Add escape key handler
		const activeWinD = getActiveWindow();
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				overlay.remove();
				variationD.dispose();
				activeWinD.document.removeEventListener('keydown', handler);
			}
		};
		activeWinD.document.addEventListener('keydown', handler);
	}
});
