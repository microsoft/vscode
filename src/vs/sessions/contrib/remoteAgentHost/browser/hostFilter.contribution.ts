/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IsWebContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IsNewChatSessionContext } from '../../../common/contextkeys.js';
import { Menus } from '../../../browser/menus.js';
import { IAgentHostFilterService } from '../common/agentHostFilter.js';
import { HostFilterActionViewItem } from './hostFilterActionViewItem.js';
import { MobileHostFilterActionViewItem } from './mobileHostFilterActionViewItem.js';

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
				// Always shown on web (regardless of host count): when no
				// hosts are known the pill renders a re-discover affordance
				// (refresh icon + click triggers `rediscover()`); when one
				// or more are known it is the host picker.
				when: ContextKeyExpr.and(
					IsWebContext,
					IsAuxiliaryWindowContext.toNegated(),
				),
			}, {
				// On phone/mobile layouts the desktop titlebar is replaced
				// by the MobileTitlebarPart. Surface the host picker in its
				// center slot while a new (empty) chat session is active,
				// so users can still switch hosts and connect from the
				// home screen.
				//
				// Unlike the desktop pill, the mobile entry is shown even
				// when no hosts are known: tapping it opens a bottom sheet
				// with a "Re-discover hosts" action so the user always has
				// a way to retry discovery from the home screen.
				id: Menus.MobileTitleBarCenter,
				group: 'navigation',
				order: 0,
				when: ContextKeyExpr.and(
					IsWebContext,
					IsAuxiliaryWindowContext.toNegated(),
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

	constructor(
		@IAgentHostFilterService filterService: IAgentHostFilterService,
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();

		// One-shot emitter to nudge any toolbars that materialized BEFORE
		// this contribution registered. Without this, toolbars that
		// already cached the default `MenuEntryActionViewItem` (which
		// renders the action's title "Select Agent Host" with no icon)
		// stay stale until the host list or discovery state changes.
		// `onDidChangeDiscovering` covers the steady-state case once
		// discovery starts/finishes; `registered` covers the cold-start
		// race.
		const registered = this._register(new Emitter<void>());
		const refreshSignal = Event.any(filterService.onDidChange, filterService.onDidChangeDiscovering, registered.event);

		this._register(actionViewItemService.register(
			Menus.TitleBarLeftLayout,
			PICK_HOST_FILTER_ID,
			(action, _options, instaService) => instaService.createInstance(HostFilterActionViewItem, action),
			refreshSignal,
		));

		this._register(actionViewItemService.register(
			Menus.MobileTitleBarCenter,
			PICK_HOST_FILTER_ID,
			(action, _options, instaService) => instaService.createInstance(MobileHostFilterActionViewItem, action),
			refreshSignal,
		));

		// Fire the one-shot signal asynchronously so any toolbars that
		// rendered the action with the default view item before our
		// registration ran above re-evaluate and pick up our custom
		// factory on their next tick.
		queueMicrotask(() => registered.fire());
	}
}

registerWorkbenchContribution2(
	AgentHostFilterContribution.ID,
	AgentHostFilterContribution,
	WorkbenchPhase.AfterRestored,
);
