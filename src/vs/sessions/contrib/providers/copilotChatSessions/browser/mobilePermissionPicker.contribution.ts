/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { Menus } from '../../../../browser/menus.js';
import { ISessionInputContext } from '../../../chat/browser/sessionInputContext.js';
import { PickerActionViewItem } from './copilotChatSessionsActions.js';
import { MobilePermissionPicker } from './mobilePermissionPicker.js';
import { CopilotPermissionPickerDelegate } from './permissionPicker.js';

/**
 * Web-only contribution that registers the mobile-aware
 * {@link MobilePermissionPicker} for the Copilot CLI permission picker
 * action. The desktop contribution
 * (`CopilotPickerActionViewItemContribution` in
 * `copilotChatSessionsActions.ts`) skips this picker when `isWeb`, so
 * there is no duplicate-registration conflict. Imported only from
 * `sessions.web.main.ts`.
 *
 * On phone-layout viewports `MobilePermissionPicker.showPicker()`
 * routes the Default/Bypass/Autopilot choice through a bottom sheet;
 * on tablet/desktop web viewports it falls through to the inherited
 * desktop action-widget popup.
 */
class CopilotPermissionPickerWebContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.copilotPermissionPickerWeb';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();

		this._register(actionViewItemService.register(
			Menus.NewSessionControl,
			'sessions.defaultCopilot.permissionPicker',
			(_action, _options, scopedInstantiationService) => {
				const { session } = scopedInstantiationService.invokeFunction(accessor => accessor.get(ISessionInputContext));
				const delegate = scopedInstantiationService.createInstance(CopilotPermissionPickerDelegate, session);
				const picker = scopedInstantiationService.createInstance(MobilePermissionPicker, delegate);
				return new PickerActionViewItem(picker, delegate);
			},
		));
	}
}

registerWorkbenchContribution2(CopilotPermissionPickerWebContribution.ID, CopilotPermissionPickerWebContribution, WorkbenchPhase.AfterRestored);
