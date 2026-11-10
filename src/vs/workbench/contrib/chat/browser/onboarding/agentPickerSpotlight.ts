/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow, scheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { EditorPartModalVisibleContext } from '../../../../common/contextkeys.js';
import { registerOnboardingTargetProvider } from '../../../onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario } from '../../../onboarding/common/onboardingScenario.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatAgentLocation, ChatConfiguration } from '../../common/constants.js';
import { IChatWidgetService } from '../chat.js';

export const AGENT_PICKER_SPOTLIGHT_ID = 'chat.onboarding.agentPickerInAttachContext';

export class AgentPickerSpotlight extends Disposable {
	static readonly ID = 'workbench.contrib.agentPickerSpotlight';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
	) {
		super();
		const enabled = observableConfigValue(ChatConfiguration.AgentsPickerInAttachContextMenu, false, configurationService);
		const widgetsChanged = observableSignalFromEvent(this, Event.any(
			chatWidgetService.onDidAddWidget,
			chatWidgetService.onDidRemoveWidget,
			chatWidgetService.onDidChangeWidgetVisibility,
			chatWidgetService.onDidChangeFocusedWidget,
		));
		const eligibleChat = derived(this, reader => {
			widgetsChanged.read(reader);
			if (!enabled.read(reader)) {
				return undefined;
			}
			return chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat).find(widget => {
				widget.inputPart.currentModeObs.read(reader);
				return widget.visible && widget.inputPart.isAgentPickerInAttachContextMenu;
			});
		});
		const readyTarget = observableValue<HTMLElement | undefined>(this, undefined);
		this._register(autorun(reader => {
			const widget = eligibleChat.read(reader);
			readyTarget.set(undefined, undefined);
			if (widget) {
				reader.store.add(scheduleAtNextAnimationFrame(getWindow(widget.domNode), () => {
					readyTarget.set(widget.inputPart.attachContextButtonElement, undefined);
				}));
			}
		}));
		this._register(registerOnboardingTargetProvider(AGENT_PICKER_SPOTLIGHT_ID, scope => {
			const element = eligibleChat.get()?.inputPart.attachContextButtonElement;
			return scope === undefined && element && element === readyTarget.get() ? { element } : undefined;
		}));
		const scenario: IOnboardingScenario<ISpotlightPayload> = {
			id: AGENT_PICKER_SPOTLIGHT_ID,
			when: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ContextKeyExpr.equals(`config.${ChatConfiguration.AgentsPickerInAttachContextMenu}`, true),
				EditorPartModalVisibleContext.toNegated(),
			),
			trigger: { kind: 'observable', signal: derived(this, reader => !!eligibleChat.read(reader) && !!readyTarget.read(reader)) },
			presentation: {
				kind: SPOTLIGHT_PRESENTATION_KIND,
				payload: {
					steps: [{
						id: 'agentPicker',
						targetId: AGENT_PICKER_SPOTLIGHT_ID,
						title: localize('agentPickerSpotlight.title', "Find your custom agents"),
						description: localize('agentPickerSpotlight.description', "We default to Agent, find your custom agents in the + menu"),
						nextButtonLabel: localize('agentPickerSpotlight.understood', "Understood"),
						placement: 'above',
						allowTargetInteraction: true,
						advanceOnTargetClick: true,
						hideNext: false,
						missingTarget: { kind: 'abort' },
					}],
				},
			},
		};
		this._register(onboardingScenarioRegistry.register(scenario));
	}
}

registerWorkbenchContribution2(AgentPickerSpotlight.ID, AgentPickerSpotlight, WorkbenchPhase.AfterRestored);
