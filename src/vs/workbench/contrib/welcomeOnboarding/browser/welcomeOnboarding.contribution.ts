/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Load styles for the remaining onboarding variant.
import './media/variationA.css';

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { OnboardingVariationA } from './onboardingVariationA.js';

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
		modal.onDidDismiss(() => modal.dispose());
		modal.show();
	}
});
