/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IsWebContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IsNewChatSessionContext } from '../../../common/contextkeys.js';
import { Menus } from '../../../browser/menus.js';
import { IAgentHostFilterService } from '../common/agentHostFilter.js';
import { HostFilterActionViewItem } from './hostFilterActionViewItem.js';
import { MobileHostFilterActionViewItem } from './mobileHostFilterActionViewItem.js';

/**
 * Context key that is `true` when at least one remote agent host is known
 * (configured or connected). Controls the visibility of the host filter
 * dropdown in the titlebar.
 */
const HasAgentHostsContext = new RawContextKey<boolean>('sessions.hasAgentHosts', false);

const PICK_HOST_FILTER_ID = 'sessions.agentHostFilter.pick';

/**
 * Action that backs the host filter dropdown in the titlebar. Selection
 * is actually handled by {@link HostFilterActionViewItem}, so the action's
 * `run` is a no-op. Gated on `isWeb` via its menu `when` clause so the
 * combo only shows up in the web build.
 */
registerAction2(class PickAgentHostFilterAction extends Action2 {
	constructor() {
		super({
			id: PICK_HOST_FILTER_ID,
			title: localize2('agentHostFilter.pick', "Select Agent Host"),
			f1: false,
			menu: [{
				id: Menus.TitleBarLeftLayout,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(
					IsWebContext,
					IsAuxiliaryWindowContext.toNegated(),
					HasAgentHostsContext,
				),
			}, {
				// On phone/mobile layouts the desktop titlebar is replaced
				// by the MobileTitlebarPart. Surface the host picker in its
				// center slot while a new (empty) chat session is active,
				// so users can still switch hosts and connect from the
				// home screen.
				id: Menus.MobileTitleBarCenter,
				group: 'navigation',
				order: 0,
				when: ContextKeyExpr.and(
					IsWebContext,
					IsAuxiliaryWindowContext.toNegated(),
					HasAgentHostsContext,
					IsNewChatSessionContext,
				),
			}],
		});
	}

	override async run(_accessor: ServicesAccessor): Promise<void> {
		// Handled by HostFilterActionViewItem
	}
});

class AgentHostFilterContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.agentHostFilter';

	private readonly _hasAgentHostsContext: IContextKey<boolean>;

	constructor(
		@IAgentHostFilterService filterService: IAgentHostFilterService,
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		this._hasAgentHostsContext = HasAgentHostsContext.bindTo(contextKeyService);
		this._update(filterService);

		this._register(filterService.onDidChange(() => this._update(filterService)));

		this._register(actionViewItemService.register(
			Menus.TitleBarLeftLayout,
			PICK_HOST_FILTER_ID,
			(action, _options, instaService) => instaService.createInstance(HostFilterActionViewItem, action),
			filterService.onDidChange,
		));

		this._register(actionViewItemService.register(
			Menus.MobileTitleBarCenter,
			PICK_HOST_FILTER_ID,
			(action, _options, instaService) => instaService.createInstance(MobileHostFilterActionViewItem, action),
			filterService.onDidChange,
		));
	}

	private _update(filterService: IAgentHostFilterService): void {
		this._hasAgentHostsContext.set(filterService.hosts.length > 0);
	}
}

registerWorkbenchContribution2(
	AgentHostFilterContribution.ID,
	AgentHostFilterContribution,
	WorkbenchPhase.AfterRestored,
);
