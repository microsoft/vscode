/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../../nls.js';
import { IActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { Menus } from '../../../browser/menus.js';
import { SessionProviderIdContext, IsNewChatSessionContext } from '../../../common/contextkeys.js';
import { CLOUD_SANDBOX_CREATION_PROVIDER_ID, COPILOT_PROVIDER_ID } from '../common/copilotChatSessions.js';
import { ChatContextKeys } from '../../../../chat/common/actions/chatContextKeys.js';
import { ISessionHost } from '../../../../../services/sessions/browser/sessionHost.js';
import { AgentHostModePicker } from '../../agentHost/browser/agentHostModePicker.js';
import { AgentHostPermissionPickerDelegate } from '../../agentHost/browser/agentHostPermissionPickerDelegate.js';
import { PickerActionViewItem } from '../../agentHost/browser/agentHostSessionConfigPicker.js';
import { MobilePermissionPicker } from './mobilePermissionPicker.js';
import { MobileAgentHostModePicker } from '../../agentHost/browser/mobile/mobileAgentHostModePicker.js';
import { isPhoneLayout } from '../../../../../browser/parts/sessions/mobileLayout.js';
import { IWorkbenchLayoutService } from '../../../../../services/layout/browser/layoutService.js';

const IsActiveCopilotChatSessionProvider = ContextKeyExpr.equals(SessionProviderIdContext.key, COPILOT_PROVIDER_ID);

// -- Actions --

const IsNewCloudSession = ContextKeyExpr.and(IsNewChatSessionContext, ChatContextKeys.enabled, ContextKeyExpr.or(
	IsActiveCopilotChatSessionProvider,
	SessionProviderIdContext.isEqualTo(CLOUD_SANDBOX_CREATION_PROVIDER_ID),
));

// -- Action View Item Registrations --

export class CopilotPickerActionViewItemContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.copilotPickerActionViewItems';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
	) {
		super();
		this._register(actionViewItemService.register(Menus.NewSessionControl, 'sessions.sandbox.modePicker', (_action, _options, scopedInstantiationService) => {
			const host = scopedInstantiationService.invokeFunction(accessor => accessor.get(ISessionHost));
			return new PickerActionViewItem(scopedInstantiationService.createInstance(isPhoneLayout(layoutService) ? MobileAgentHostModePicker : AgentHostModePicker, host));
		}));
		this._register(actionViewItemService.register(Menus.NewSessionControl, 'sessions.sandbox.approvalPicker', (_action, _options, scopedInstantiationService) => {
			const host = scopedInstantiationService.invokeFunction(accessor => accessor.get(ISessionHost));
			const delegate = scopedInstantiationService.createInstance(AgentHostPermissionPickerDelegate, host);
			return new PickerActionViewItem(scopedInstantiationService.createInstance(MobilePermissionPicker, delegate), delegate, true);
		}));
	}
}

/**
 * Registers the mode and approvals pickers of new Copilot Cloud and sandbox sessions, until the returned disposable is disposed.
 *
 * Call it once per window, from the one module or contribution that owns these registrations: its registrations are
 * global, and registering them twice throws or duplicates them.
 */
export function registerCopilotSandboxPickerActions(): IDisposable {
	const store = new DisposableStore();

	for (const [id, title, order] of [
		['sessions.sandbox.modePicker', localize2('sandbox.modePicker', "Agent Mode"), 0],
		['sessions.sandbox.approvalPicker', localize2('sandbox.approvalPicker', "Approvals"), 1],
	] as const) {
		store.add(registerAction2(class extends Action2 {
			constructor() {
				super({ id, title, menu: [{ id: Menus.NewSessionControl, group: 'navigation', order, when: IsNewCloudSession }] });
			}
			override run(): void { }
		}));
	}

	return store;
}
