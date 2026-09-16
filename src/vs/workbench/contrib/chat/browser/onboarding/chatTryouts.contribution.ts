/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { registerOnboardingTryoutPresentation } from '../../../onboarding/common/onboardingTryout.js';
import { ChatDraftTryoutPresentation } from './chatDraftTryoutPresentation.js';
import './chatBackgroundTryout.contribution.js';
import './modelPickerTryout.contribution.js';
import './workspacePickerTryout.contribution.js';

class ChatTryoutsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatTryouts';

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();
		const presentation = this._register(instantiationService.createInstance(ChatDraftTryoutPresentation));
		this._register(registerOnboardingTryoutPresentation(presentation));
	}
}

registerWorkbenchContribution2(ChatTryoutsContribution.ID, ChatTryoutsContribution, WorkbenchPhase.AfterRestored);
