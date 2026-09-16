/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { createOnboardingClickStep, GUIDED_TRYOUT_PRESENTATION_KIND, SPOTLIGHT_PRESENTATION_KIND } from '../../../onboarding/browser/onboarding.js';
import { registerOnboardingTryout } from '../../../onboarding/common/onboardingTryout.js';
import { IGuidedTryoutPayload } from '../../../onboarding/common/onboardingTryoutActions.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { AutomationOnboardingTarget, PREPARE_AUTOMATIONS_TRYOUT_COMMAND_ID } from '../../common/automations/automationOnboarding.js';
import { ChatAutomationsEnabledContext, CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../common/automations/automationsEnabled.js';

class AutomationTryoutContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.automationTryout';

	constructor() {
		super();
		this._register(registerOnboardingTryout<IGuidedTryoutPayload>({
			id: 'automations.create',
			title: localize('automations.tryout.title', "Try Creating an Automation"),
			description: localize('automations.tryout.description', "Open the New automation dialog in the Agents window. Nothing is saved until you choose Create."),
			isAI: true,
			targetWindow: 'agents',
			when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatAutomationsEnabledContext),
			unavailableMessage: localize('automations.tryout.unavailable', "Automations require an enabled Chat agent and the Automations setting."),
			setup: {
				label: localize('automations.tryout.setup', "Open Automations Setting"),
				command: { id: 'workbench.action.openSettings', arguments: [`@id:${CHAT_AUTOMATIONS_ENABLED_SETTING}`] },
			},
			presentation: {
				kind: GUIDED_TRYOUT_PRESENTATION_KIND,
				payload: {
					launch: {
						kind: 'command',
						payload: {
							commandId: PREPARE_AUTOMATIONS_TRYOUT_COMMAND_ID,
						},
					},
					steps: [
						createOnboardingClickStep({
							id: 'sidebar',
							targetId: AutomationOnboardingTarget.Sidebar,
							title: localize('automations.tryout.sidebar.title', "Open Automations"),
							description: localize('automations.tryout.sidebar.description', "Select Automations in the sidebar to manage scheduled and on-demand agent tasks."),
							missingTarget: { kind: 'abort' },
						}),
						{
							id: 'templates',
							kind: SPOTLIGHT_PRESENTATION_KIND,
							payload: {
								id: 'templates',
								targetId: AutomationOnboardingTarget.BuiltInTemplates,
								title: localize('automations.tryout.templates.title', "Start with a Built-in Template"),
								description: localize('automations.tryout.templates.description', "Choose a starting point for catching up on changes, triaging issues, or finding bugs, then customize it before creating."),
								openTarget: true,
								allowTargetInteraction: true,
								missingTarget: { kind: 'wait', timeoutMs: 10_000 },
							},
						},
						createOnboardingClickStep({
							id: 'create',
							targetId: AutomationOnboardingTarget.Create,
							title: localize('automations.tryout.create.title', "Create an Automation"),
							description: localize('automations.tryout.create.description', "Create a new automation from scratch, then review its prompt, schedule, target, and session configuration before saving."),
							hideNext: false,
						}),
					],
					unavailableMessage: localize('automations.tryout.guidanceUnavailable', "The Automations experience opened, but its guided controls could not be highlighted."),
				},
			},
		}));
	}
}

registerWorkbenchContribution2(AutomationTryoutContribution.ID, AutomationTryoutContribution, WorkbenchPhase.BlockRestore);
