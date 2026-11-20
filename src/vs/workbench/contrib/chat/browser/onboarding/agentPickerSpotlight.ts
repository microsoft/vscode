/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AnimationFrameScheduler, DisposableResizeObserver } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { EditorPartModalVisibleContext } from '../../../../common/contextkeys.js';
import { isVisibleOnboardingTarget, registerOnboardingTargetProvider, resolveOnboardingTarget } from '../../../onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario } from '../../../onboarding/common/onboardingScenario.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatAgentLocation, ChatConfiguration } from '../../common/constants.js';
import { CustomAgentUsage } from '../../common/customAgentUsage.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';
import { isModeConsideredBuiltIn } from '../widget/input/modePickerActionItem.js';

export const AGENT_PICKER_SPOTLIGHT_ID = 'chat.onboarding.agentPickerInAttachContext';

const CUSTOM_AGENT_RECENCY_MS = 7 * 24 * 60 * 60 * 1000;

export class AgentPickerSpotlight extends Disposable {
	static readonly ID = 'workbench.contrib.agentPickerSpotlight';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IProductService productService: IProductService,
		@IStorageService storageService: IStorageService,
	) {
		super();
		const enabled = observableConfigValue(ChatConfiguration.AgentsPickerInAttachContextMenu, false, configurationService);
		const widgetsChanged = observableSignalFromEvent(this, Event.any(
			chatWidgetService.onDidAddWidget,
			chatWidgetService.onDidRemoveWidget,
			chatWidgetService.onDidChangeWidgetVisibility,
			chatWidgetService.onDidChangeFocusedWidget,
		));
		const inputChanged = derived(this, reader => {
			widgetsChanged.read(reader);
			return observableSignalFromEvent(this, Event.any(...chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat)
				.map(widget => widget.inputPart.onDidChangeAttachContextButton)));
		});
		const eligibleChats = derived(this, reader => {
			widgetsChanged.read(reader);
			if (!enabled.read(reader)) {
				return [];
			}
			inputChanged.read(reader).read(reader);
			return chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat).filter(widget => {
				widget.inputPart.currentModeObs.read(reader);
				return widget.domNode.ownerDocument === mainWindow.document && widget.visible && widget.inputPart.isAgentPickerInAttachContextMenu;
			});
		});
		this._register(registerAgentPickerSpotlight(eligibleChats, productService, storageService));
	}
}

/** Shares the tip and shown-once state in either window, gated on custom agent use in the past seven days. */
export function registerAgentPickerSpotlight(chats: IObservable<readonly IChatWidget[]>, productService: IProductService, storageService: IStorageService): IDisposable {
	const store = new DisposableStore();
	const usage = new CustomAgentUsage(storageService);
	const lastUsed = observableFromEvent(store, usage.onDidChangeLastUsed(store), () => usage.lastUsed);
	const hasRecentUse = observableValue(store, false);
	store.add(autorun(reader => {
		const timestamp = lastUsed.read(reader);
		const now = Date.now();
		const remaining = timestamp === undefined ? 0 : timestamp + CUSTOM_AGENT_RECENCY_MS - now;
		const recent = timestamp !== undefined && timestamp <= now && remaining > 0;
		hasRecentUse.set(recent, undefined);
		if (recent) {
			disposableTimeout(() => hasRecentUse.set(false, undefined), remaining, reader.store);
		}
	}));
	const modesChanged = derived(store, reader => observableSignalFromEvent(store, Event.any(
		...chats.read(reader).map(widget => widget.inputPart.currentChatModesObs.read(reader).onDidChange),
	)));
	const eligibleChats = derived(store, reader => {
		if (!hasRecentUse.read(reader)) {
			return [];
		}
		modesChanged.read(reader).read(reader);
		return chats.read(reader).filter(widget => widget.inputPart.currentChatModesObs.read(reader).custom
			.some(mode => !isModeConsideredBuiltIn(mode, productService)));
	});
	const targetReady = observableValue(store, false);
	store.add(registerOnboardingTargetProvider(AGENT_PICKER_SPOTLIGHT_ID, scope => {
		const widget = eligibleChats.get().find(widget => {
			const element = widget.inputPart.attachContextButtonElement;
			return widget.visible && element && isVisibleOnboardingTarget(mainWindow, element);
		});
		const element = widget?.inputPart.attachContextButtonElement;
		return scope === undefined && widget?.visible && element ? { element, onDidActivate: widget.inputPart.onDidActivateAttachContext } : undefined;
	}));
	store.add(autorun(reader => {
		targetReady.set(false, undefined);
		const scheduler = reader.store.add(new AnimationFrameScheduler(mainWindow.document.body, () => {
			targetReady.set(!!resolveOnboardingTarget(mainWindow, AGENT_PICKER_SPOTLIGHT_ID), undefined);
		}));
		const observer = reader.store.add(new DisposableResizeObserver('AgentPickerSpotlight.target', () => scheduler.schedule()));
		for (const widget of eligibleChats.read(reader)) {
			if (widget.domNode.ownerDocument !== mainWindow.document) {
				continue;
			}
			const observation = reader.store.add(new MutableDisposable<IDisposable>());
			const updateTarget = () => {
				targetReady.set(false, undefined);
				const element = widget.inputPart.attachContextButtonElement;
				observation.value = element ? observer.observe(element) : undefined;
				scheduler.schedule();
			};
			reader.store.add(widget.inputPart.onDidChangeAttachContextButton(updateTarget));
			updateTarget();
		}
	}));
	const scenario: IOnboardingScenario<ISpotlightPayload> = {
		id: AGENT_PICKER_SPOTLIGHT_ID,
		when: ContextKeyExpr.and(
			ChatContextKeys.enabled,
			ContextKeyExpr.equals(`config.${ChatConfiguration.AgentsPickerInAttachContextMenu}`, true),
			EditorPartModalVisibleContext.toNegated(),
		),
		trigger: { kind: 'observable', signal: targetReady },
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
					missingTarget: { kind: 'wait', timeoutMs: 1000 },
				}],
			},
		},
	};
	store.add(onboardingScenarioRegistry.register(scenario));
	return store;
}
