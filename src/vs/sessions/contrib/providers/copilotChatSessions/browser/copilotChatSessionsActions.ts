/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../../workbench/common/contributions.js';
import { Menus } from '../../../../browser/menus.js';
import { SessionProviderIdContext, IsNewChatSessionContext } from '../../../../common/contextkeys.js';
import { COPILOT_PROVIDER_ID } from './copilotChatSessionsProvider.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ISessionContext } from '../../../../services/sessions/browser/sessionContext.js';
import { CLOUD_SANDBOX_CREATION_PROVIDER_ID } from '../../remoteAgentHost/browser/cloudSandboxAgentHostContribution.js';
import { AgentHostModePicker } from '../../agentHost/browser/agentHostModePicker.js';
import { AgentHostPermissionPickerDelegate } from '../../agentHost/browser/agentHostPermissionPickerDelegate.js';
import { PickerActionViewItem } from '../../agentHost/browser/agentHostSessionConfigPicker.js';
import { MobilePermissionPicker } from './mobilePermissionPicker.js';
import { MobileAgentHostModePicker } from '../../agentHost/browser/mobile/mobileAgentHostModePicker.js';
import { isPhoneLayout } from '../../../../browser/parts/mobile/mobileLayout.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';

const IsActiveCopilotChatSessionProvider = ContextKeyExpr.equals(SessionProviderIdContext.key, COPILOT_PROVIDER_ID);

// -- Actions --

const IsNewCloudSession = ContextKeyExpr.and(IsNewChatSessionContext, ChatContextKeys.enabled, ContextKeyExpr.or(
	IsActiveCopilotChatSessionProvider,
	SessionProviderIdContext.isEqualTo(CLOUD_SANDBOX_CREATION_PROVIDER_ID),
));

for (const [id, title, order] of [
	['sessions.sandbox.modePicker', localize2('sandbox.modePicker', "Agent Mode"), 0],
	['sessions.sandbox.approvalPicker', localize2('sandbox.approvalPicker', "Approvals"), 1],
] as const) {
	registerAction2(class extends Action2 {
		constructor() {
			super({ id, title, menu: [{ id: Menus.NewSessionControl, group: 'navigation', order, when: IsNewCloudSession }] });
		}
		override run(): void { }
	});
}

// -- Action View Item Registrations --

class CopilotPickerActionViewItemContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.copilotPickerActionViewItems';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
	) {
		super();
		this._register(actionViewItemService.register(Menus.NewSessionControl, 'sessions.sandbox.modePicker', (_action, _options, scopedInstantiationService) => {
			const { session } = scopedInstantiationService.invokeFunction(accessor => accessor.get(ISessionContext));
			return new PickerActionViewItem(scopedInstantiationService.createInstance(isPhoneLayout(layoutService) ? MobileAgentHostModePicker : AgentHostModePicker, session));
		}));
		this._register(actionViewItemService.register(Menus.NewSessionControl, 'sessions.sandbox.approvalPicker', (_action, _options, scopedInstantiationService) => {
			const { session } = scopedInstantiationService.invokeFunction(accessor => accessor.get(ISessionContext));
			const delegate = scopedInstantiationService.createInstance(AgentHostPermissionPickerDelegate, session);
			return new PickerActionViewItem(scopedInstantiationService.createInstance(MobilePermissionPicker, delegate), delegate, true);
		}));
	}
}

registerWorkbenchContribution2(CopilotPickerActionViewItemContribution.ID, CopilotPickerActionViewItemContribution, WorkbenchPhase.AfterRestored);
