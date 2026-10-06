/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { registerOnboardingTargetProvider } from '../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { INewSessionComposerService } from './newSessionComposerService.js';

export class NewSessionOnboardingTargets extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.newSessionOnboardingTargets';

	constructor(@INewSessionComposerService composerService: INewSessionComposerService) {
		super();
		this._register(registerOnboardingTargetProvider('sessions.newSession.modelPicker', scope => {
			if (scope !== undefined) {
				return undefined;
			}
			const picker = composerService.activeComposer.get()?.modelPicker;
			const element = picker?.getDomNode();
			return picker && element ? { element, open: () => picker.open() } : undefined;
		}));
	}
}

registerWorkbenchContribution2(NewSessionOnboardingTargets.ID, NewSessionOnboardingTargets, WorkbenchPhase.BlockRestore);
