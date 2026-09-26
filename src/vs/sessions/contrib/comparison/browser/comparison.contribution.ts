/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './comparisonAccessibility.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { Menus } from '../../../browser/menus.js';
import { ICustomViewService } from '../../../services/customView/browser/customViewService.js';
import { COMPARISON_ENABLED_SETTING, COMPARISON_VIEW_ID, ISessionComparisonService } from '../common/comparison.js';
import { ComparisonView } from './comparisonView.js';
import { SessionComparisonService } from './sessionComparisonService.js';

const enabled = ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${COMPARISON_ENABLED_SETTING}`, true));

registerSingleton(ISessionComparisonService, SessionComparisonService, InstantiationType.Delayed);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions',
	properties: {
		[COMPARISON_ENABLED_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.WINDOW,
			tags: ['experimental'],
			description: localize('comparison.enabled', "Enable Compare Implementations in the Agents window. Send one prompt to multiple isolated agent sessions and compare their results. Each attempt uses its provider's normal billing and permissions."),
		},
	},
});

class ComparisonContribution extends Disposable {
	static readonly ID = 'sessions.contrib.comparison';
	constructor(
		@ICustomViewService customViewService: ICustomViewService,
		@IConfigurationService configurationService: IConfigurationService,
		@IChatEntitlementService entitlementService: IChatEntitlementService,
	) {
		super();
		const registration = this._register(new MutableDisposable());
		const update = () => {
			const isEnabled = configurationService.getValue<boolean>(COMPARISON_ENABLED_SETTING) && !entitlementService.sentiment.hidden;
			if (isEnabled && !registration.value) {
				registration.value = customViewService.registerCustomView({
					id: COMPARISON_VIEW_ID,
					ctor: new SyncDescriptor(ComparisonView),
					actions: { style: 'buttonBar', menuId: Menus.Comparison },
				});
			} else if (!isEnabled) {
				if (customViewService.activeCustomView.get()?.id === COMPARISON_VIEW_ID) {
					customViewService.hideCustomView();
				}
				registration.clear();
			}
		};
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(COMPARISON_ENABLED_SETTING)) { update(); }
		}));
		this._register(entitlementService.onDidChangeSentiment(update));
		update();
	}
}

registerWorkbenchContribution2(ComparisonContribution.ID, ComparisonContribution, WorkbenchPhase.BlockRestore);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.action.compareImplementations',
			title: localize2('comparison.open', "Compare Implementations"),
			category: CHAT_CATEGORY,
			icon: Codicon.diffMultiple,
			f1: true,
			precondition: enabled,
			menu: [{ id: Menus.SidebarFooter, group: 'navigation', order: 3, when: enabled }],
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(ICustomViewService).showCustomView(COMPARISON_VIEW_ID);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.action.newComparison',
			title: localize2('comparison.new', "New Comparison"),
			icon: Codicon.add,
			precondition: enabled,
			menu: [{ id: Menus.Comparison, group: 'navigation', order: 1, when: enabled }],
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(ISessionComparisonService).selectRun(undefined);
		accessor.get(ICustomViewService).showCustomView(COMPARISON_VIEW_ID);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.action.comparisonHistory',
			title: localize2('comparison.history', "Comparison History"),
			icon: Codicon.history,
			precondition: enabled,
			menu: [{ id: Menus.Comparison, group: 'navigation', order: 2, when: enabled }],
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const service = accessor.get(ISessionComparisonService);
		const customViewService = accessor.get(ICustomViewService);
		const selected = await accessor.get(IQuickInputService).pick(service.runs.get().map(run => ({
			label: run.prompt.split('\n')[0],
			description: localize('comparison.historyDescription', "{0} attempts · {1}", run.candidates.length, new Date(run.createdAt).toLocaleString()),
			run,
		})), { title: localize('comparison.history', "Comparison History"), placeHolder: localize('comparison.historyHint', "Reopen a comparison without running it again") });
		if (selected) {
			service.selectRun(selected.run.id);
			customViewService.showCustomView(COMPARISON_VIEW_ID);
		}
	}
});
