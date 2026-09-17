/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { GUIDED_TRYOUT_PRESENTATION_KIND, SPOTLIGHT_PRESENTATION_KIND } from '../../../onboarding/browser/onboarding.js';
import { IOnboardingTryout, registerOnboardingTryout } from '../../../onboarding/common/onboardingTryout.js';
import { IGuidedTryoutPayload } from '../../../onboarding/common/onboardingTryoutActions.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../common/constants.js';
import { PREPARE_UNIFIED_WORKSPACE_PICKER_TRYOUT_COMMAND_ID, UNIFIED_WORKSPACE_PICKER_TRYOUT_ID, WORKSPACE_PICKER_ONBOARDING_TARGET_ID } from '../../common/onboarding/workspacePickerTryout.js';

export function createUnifiedWorkspacePickerTryout(): IOnboardingTryout<IGuidedTryoutPayload> {
	return {
		id: UNIFIED_WORKSPACE_PICKER_TRYOUT_ID,
		title: localize('chat.tryout.unifiedWorkspacePicker.title', "Find the Unified Workspace Picker"),
		description: localize('chat.tryout.unifiedWorkspacePicker.description', "Open a new unsent Agents composer and locate the unified workspace and repository picker."),
		isAI: true,
		targetWindow: 'agents',
		when: ContextKeyExpr.and(
			ChatContextKeys.enabled,
			ContextKeyExpr.equals(`config.${ChatConfiguration.UnifiedWorkspacePicker}`, true),
		),
		unavailableMessage: localize('chat.tryout.unifiedWorkspacePicker.unavailable', "Enable the Unified Workspace Picker setting, then try this example again."),
		setup: {
			label: localize('chat.tryout.unifiedWorkspacePicker.setup', "Open Unified Workspace Picker Setting"),
			command: {
				id: 'workbench.action.openSettings',
				arguments: [`@id:${ChatConfiguration.UnifiedWorkspacePicker}`],
			},
		},
		presentation: {
			kind: GUIDED_TRYOUT_PRESENTATION_KIND,
			payload: {
				launch: {
					kind: 'command',
					payload: {
						commandId: PREPARE_UNIFIED_WORKSPACE_PICKER_TRYOUT_COMMAND_ID,
						captureTargetScope: true,
					},
				},
				steps: [{
					id: 'workspacePicker',
					kind: SPOTLIGHT_PRESENTATION_KIND,
					payload: {
						id: 'workspacePicker',
						targetId: WORKSPACE_PICKER_ONBOARDING_TARGET_ID,
						title: localize('chat.tryout.unifiedWorkspacePicker.step.title', "Choose a Workspace or Repository"),
						description: localize('chat.tryout.unifiedWorkspacePicker.step.description', "Use Workspace to search local folders, GitHub repositories, Cloud repositories, and remote targets."),
						placement: 'above',
						openTarget: true,
						allowTargetInteraction: true,
						missingTarget: { kind: 'wait', timeoutMs: 10_000 },
					},
				}],
				unavailableMessage: localize('chat.tryout.unifiedWorkspacePicker.guidanceUnavailable', "The Agents composer opened, but its Workspace control could not be highlighted."),
			},
		},
	};
}

class UnifiedWorkspacePickerTryoutContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.unifiedWorkspacePickerTryout';

	constructor() {
		super();
		this._register(registerOnboardingTryout(createUnifiedWorkspacePickerTryout()));
	}
}

registerWorkbenchContribution2(UnifiedWorkspacePickerTryoutContribution.ID, UnifiedWorkspacePickerTryoutContribution, WorkbenchPhase.BlockRestore);
