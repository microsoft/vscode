/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { GUIDED_TRYOUT_PRESENTATION_KIND, SPOTLIGHT_PRESENTATION_KIND } from '../../onboarding/browser/onboarding.js';
import { registerOnboardingTryout } from '../../onboarding/common/onboardingTryout.js';
import { IGuidedTryoutPayload } from '../../onboarding/common/onboardingTryoutActions.js';
import { Markers } from '../common/markers.js';

class ProblemsTryoutContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.problemsTryout';

	constructor() {
		super();
		this._register(registerOnboardingTryout<IGuidedTryoutPayload>({
			id: 'problems.filter',
			title: localize('problems.tryout.title', "Try Filtering Problems"),
			description: localize('problems.tryout.description', "Open Problems and highlight its filter control."),
			presentation: {
				kind: GUIDED_TRYOUT_PRESENTATION_KIND,
				payload: {
					launch: {
						kind: 'openView',
						payload: {
							target: 'view',
							id: Markers.MARKERS_VIEW_ID,
							focus: false,
						},
					},
					steps: [{
						id: 'filter',
						kind: SPOTLIGHT_PRESENTATION_KIND,
						payload: {
							id: 'filter',
							targetId: Markers.PROBLEMS_FILTER_ONBOARDING_TARGET_ID,
							title: localize('problems.tryout.filter.title', "Focus the Problem List"),
							description: localize('problems.tryout.filter.description', "Type text, a file pattern, or a source filter to narrow the problems shown in the current workspace."),
							placement: 'above',
							openTarget: true,
							allowTargetInteraction: true,
							missingTarget: { kind: 'abort' },
						},
					}],
					unavailableMessage: localize('problems.tryout.guidanceUnavailable', "Problems opened, but its filter control could not be highlighted."),
				},
			},
		}));
	}
}

registerWorkbenchContribution2(ProblemsTryoutContribution.ID, ProblemsTryoutContribution, WorkbenchPhase.BlockRestore);
