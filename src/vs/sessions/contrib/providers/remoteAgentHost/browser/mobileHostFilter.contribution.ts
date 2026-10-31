/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsWebContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { IsAuxiliaryWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus } from '../../../../browser/menus.js';
import { IsPhoneLayoutContext } from '../../../../common/contextkeys.js';
import { MobileHostDrawerHeaderViewItem } from './mobileHostDrawerHeaderViewItem.js';
import { MobileHostPlaceChipViewItem } from './mobileHostPlaceChipViewItem.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { MobileAgentHostFilterService } from './mobileAgentHostFilterService.js';

registerSingleton(IAgentHostFilterService, MobileAgentHostFilterService, InstantiationType.Delayed);

const PICK_MOBILE_HOST_FILTER_ID = 'sessions.mobile.agentHostFilter.pick';

registerAction2(class PickMobileAgentHostFilterAction extends Action2 {
	constructor() {
		super({
			id: PICK_MOBILE_HOST_FILTER_ID,
			title: localize2('mobileAgentHostFilter.pick', "Select Agent Host"),
			f1: false,
			menu: [Menus.MobileSessionsDrawerHeader, Menus.NewSessionPlace].map(id => ({
				id,
				group: 'navigation',
				order: 0,
				when: ContextKeyExpr.and(IsWebContext, IsAuxiliaryWindowContext.toNegated(), IsPhoneLayoutContext, ChatContextKeys.enabled),
			})),
		});
	}

	override async run(): Promise<void> {
		// Selection is handled by the mobile action view items.
	}
});

/** Registers the redesigned host picker only in the experimental mobile entry. */
export class MobileAgentHostFilterContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.mobileAgentHostFilter';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();

		const registered = this._register(new Emitter<void>());
		this._register(actionViewItemService.register(
			Menus.MobileSessionsDrawerHeader,
			PICK_MOBILE_HOST_FILTER_ID,
			(action, _options, instantiationService) => instantiationService.createInstance(MobileHostDrawerHeaderViewItem, action),
			registered.event,
		));
		this._register(actionViewItemService.register(
			Menus.NewSessionPlace,
			PICK_MOBILE_HOST_FILTER_ID,
			(action, _options, instantiationService) => instantiationService.createInstance(MobileHostPlaceChipViewItem, action),
			registered.event,
		));

		// Refresh already-created toolbars once without rebuilding them on host updates.
		queueMicrotask(() => registered.fire());
	}
}

registerWorkbenchContribution2(MobileAgentHostFilterContribution.ID, MobileAgentHostFilterContribution, WorkbenchPhase.AfterRestored);
