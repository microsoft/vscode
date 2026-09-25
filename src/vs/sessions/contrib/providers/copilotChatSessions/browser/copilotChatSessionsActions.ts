/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionViewItem, BaseActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../../workbench/common/contributions.js';
import { getNewSessionRepositoryConfigGroup, Menus } from '../../../../browser/menus.js';
import { SessionProviderIdContext, SessionTypeContext, IsNewChatSessionContext, NewSessionCreationProviderIdContext } from '../../../../common/contextkeys.js';
import { COPILOT_PROVIDER_ID, CopilotCloudSessionType } from './copilotChatSessionsProvider.js';
import { SandboxPicker } from './sandboxPicker.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ISessionContext } from '../../../../services/sessions/browser/sessionContext.js';
import { CLOUD_SANDBOX_CREATION_PROVIDER_ID } from '../../remoteAgentHost/browser/cloudSandboxAgentHostContribution.js';

const IsActiveCopilotChatSessionProvider = ContextKeyExpr.equals(SessionProviderIdContext.key, COPILOT_PROVIDER_ID);
const IsActiveSessionCopilotChatCloud = ContextKeyExpr.and(ContextKeyExpr.equals(SessionTypeContext.key, CopilotCloudSessionType.id), IsActiveCopilotChatSessionProvider);

// -- Actions --

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.sandbox.agentDefaultModel',
			title: localize2('sandbox.agentDefaultModel', "Agent Default"),
			precondition: ContextKeyExpr.false(),
			menu: [{
				id: Menus.NewSessionConfig,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(IsNewChatSessionContext, ChatContextKeys.enabled, ContextKeyExpr.or(
					SessionProviderIdContext.isEqualTo(CLOUD_SANDBOX_CREATION_PROVIDER_ID),
					NewSessionCreationProviderIdContext.isEqualTo(CLOUD_SANDBOX_CREATION_PROVIDER_ID),
				)),
			}],
		});
	}
	override run(): void { }
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.defaultCopilot.sandboxPicker',
			title: localize2('sandboxPicker', "Sandbox"),
			f1: false,
			menu: [{
				id: Menus.NewSessionRepositoryConfig,
				group: getNewSessionRepositoryConfigGroup(3, 'sessions.defaultCopilot.sandboxPicker'),
				order: 3,
				when: ContextKeyExpr.and(IsNewChatSessionContext, IsActiveSessionCopilotChatCloud, ChatContextKeys.enabled),
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

// -- Helper --

/**
 * Wraps a standalone picker widget as a {@link BaseActionViewItem}
 * so it can be rendered by a {@link MenuWorkbenchToolBar}.
 */
class PickerActionViewItem extends BaseActionViewItem {
	constructor(private readonly picker: { render(container: HTMLElement): void; dispose(): void }) {
		super(undefined, { id: '', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } });
	}

	override render(container: HTMLElement): void {
		this.picker.render(container);
	}

	override dispose(): void {
		this.picker.dispose();
		super.dispose();
	}
}

// -- Action View Item Registrations --

class CopilotPickerActionViewItemContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.copilotPickerActionViewItems';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();
		this._register(actionViewItemService.register(
			Menus.NewSessionConfig, 'sessions.sandbox.agentDefaultModel',
			action => new ActionViewItem(undefined, action, { icon: false, label: true }),
		));
		this._register(actionViewItemService.register(
			Menus.NewSessionRepositoryConfig, 'sessions.defaultCopilot.sandboxPicker',
			(_action, _options, scopedInstantiationService) => {
				const { session } = scopedInstantiationService.invokeFunction(accessor => accessor.get(ISessionContext));
				const picker = scopedInstantiationService.createInstance(SandboxPicker, session);
				return new PickerActionViewItem(picker);
			},
		));
	}
}

registerWorkbenchContribution2(CopilotPickerActionViewItemContribution.ID, CopilotPickerActionViewItemContribution, WorkbenchPhase.AfterRestored);
