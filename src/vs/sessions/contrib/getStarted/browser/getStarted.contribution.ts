/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize, localize2 } from '../../../../nls.js';
import { AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { onboardingScenarioRegistry } from '../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { SessionsCategories } from '../../../common/categories.js';
import { ISessionsListNoticeHost, registerSessionsListNotice } from '../../sessions/browser/views/sessionsListNotice.js';
import { SessionsViewId } from '../../sessions/browser/views/sessionsView.js';
import { GET_STARTED_CHECKLIST_SETTING, GET_STARTED_DEVELOPER_MODE_ID, GET_STARTED_STATE_STORAGE_KEY, GetStartedChecklistMode } from '../common/getStartedChecklist.js';
import { GetStartedChecklistService, IGetStartedChecklistService } from './getStartedChecklistService.js';
import { getFocusedGetStartedChecklistWidget, GetStartedChecklistWidget, SessionsGetStartedFocused } from './getStartedChecklistWidget.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions',
	properties: {
		[GET_STARTED_CHECKLIST_SETTING]: {
			type: 'string',
			enum: [GetStartedChecklistMode.None, GetStartedChecklistMode.AboveSessions, GetStartedChecklistMode.BelowSessions],
			enumDescriptions: [
				localize('sessions.getStarted.checklist.none', "Don't show the Get Started checklist."),
				localize('sessions.getStarted.checklist.aboveSessions', "Show the Get Started checklist above the sessions list."),
				localize('sessions.getStarted.checklist.belowSessions', "Show the Get Started checklist below the sessions list."),
			],
			default: GetStartedChecklistMode.None,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
			description: localize('sessions.getStarted.checklist', "Controls whether and where new users of the Agents window see a Get Started checklist in the Sessions view. The checklist shows what the window can do and ticks off each item as the user tries it."),
		},
	},
});

registerSingleton(IGetStartedChecklistService, GetStartedChecklistService, InstantiationType.Delayed);

// Lists the checklist in `onboarding.developerMode`, which previews it regardless of eligibility.
onboardingScenarioRegistry.registerDescriptor({ id: GET_STARTED_DEVELOPER_MODE_ID });

/** Mounts the checklist card in one of the sessions view's slots, while the checklist should show there. */
class GetStartedChecklistNotice extends Disposable {
	constructor(
		host: ISessionsListNoticeHost,
		placement: GetStartedChecklistMode,
		@IGetStartedChecklistService service: IGetStartedChecklistService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const updateSlotVisibility = () => service.setSlotVisible(this, host.isVisible());
		updateSlotVisibility();
		this._register(host.onDidChangeVisibility(updateSlotVisibility));
		this._register(toDisposable(() => service.setSlotVisible(this, false)));

		const widget = this._register(new MutableDisposable<DisposableStore>());
		this._register(autorun(reader => {
			if (!service.visible.read(reader) || service.mode.read(reader) !== placement) {
				if (widget.value) {
					widget.clear();
					host.relayout();
				}
				return;
			}
			if (widget.value) {
				return;
			}
			const store = new DisposableStore();
			const card = store.add(instantiationService.createInstance(GetStartedChecklistWidget, service, { focusSessionsList: host.focusSessionsList }));
			card.domNode.classList.add(placement === GetStartedChecklistMode.BelowSessions ? 'below-sessions' : 'above-sessions');
			host.container.appendChild(card.domNode);
			store.add(toDisposable(() => card.domNode.remove()));
			store.add(card.onDidChangeHeight(() => host.relayout()));
			widget.value = store;
			host.relayout();
		}));
	}
}

registerSessionsListNotice((instantiation, host) => instantiation.createInstance(GetStartedChecklistNotice, host, GetStartedChecklistMode.AboveSessions), 'top');
registerSessionsListNotice((instantiation, host) => instantiation.createInstance(GetStartedChecklistNotice, host, GetStartedChecklistMode.BelowSessions), 'bottom');

const GetStartedCanShowContext = new RawContextKey<boolean>('sessionsGetStartedCanShow', false);

class GetStartedChecklistContextKeys extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.getStartedChecklistContextKeys';

	constructor(
		@IGetStartedChecklistService service: IGetStartedChecklistService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this._register(bindContextKey(GetStartedCanShowContext, contextKeyService, reader => service.canShow.read(reader)));
	}
}

registerWorkbenchContribution2(GetStartedChecklistContextKeys.ID, GetStartedChecklistContextKeys, WorkbenchPhase.AfterRestored);

registerAction2(class ShowGetStartedChecklistAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.getStarted.show',
			title: localize2('sessions.getStarted.show', "Show Getting Started Checklist"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, GetStartedCanShowContext),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const service = accessor.get(IGetStartedChecklistService);
		const viewsService = accessor.get(IViewsService);
		service.show();
		await viewsService.openView(SessionsViewId, true);
	}
});

registerAction2(class ResetGetStartedChecklistAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.getStarted.reset',
			title: localize2('sessions.getStarted.reset', "Reset Getting Started Checklist"),
			category: Categories.Developer,
			f1: true,
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(IStorageService).remove(GET_STARTED_STATE_STORAGE_KEY, StorageScope.APPLICATION);
	}
});

AccessibleViewRegistry.register({
	name: 'sessions-get-started',
	type: AccessibleViewType.Help,
	// Above the window-wide Agents window help, which applies everywhere in the window.
	priority: 125,
	when: SessionsGetStartedFocused,
	getProvider: () => getFocusedGetStartedChecklistWidget()?.createAccessibilityHelpProvider(),
});
