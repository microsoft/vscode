/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, IActionRunner } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IActionViewItem } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { localize, localize2 } from '../../../../nls.js';
import { SubmenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, MenuItemAction, MenuRegistry, registerAction2, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, ChatAutomationsEnabledContext } from '../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { AgentsWindowMenus } from '../../../browser/agentsWindowMenus.js';
import { AutomationHeaderButtonActionViewItem, AutomationHeaderSplitButtonActionViewItem } from './automationActionViewItems.js';
import { AutomationCommands } from './automationCommands.js';
import { IAutomationDescriptor } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { SessionItemIsAutomationContext, SessionItemIsInSessionsListContext } from '../../../../workbench/contrib/sessions/browser/views/sessionsList.js';
import { SessionIsArchivedContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { HIDE_AUTOMATION_SESSION_FROM_LIST_COMMAND_ID, SHOW_AUTOMATION_SESSION_IN_LIST_COMMAND_ID } from '../../../../workbench/contrib/sessions/common/sessionCommands.js';

export const AutomationsModalContext = new RawContextKey<boolean>('automationsModal', false);
export const AutomationsModalHasOthersContext = new RawContextKey<boolean>('automationsModalHasOthers', false);
export const AutomationModalRowEnabledContext = new RawContextKey<boolean>('automationModalRowEnabled', false);
export const AutomationModalRowCanUpdateContext = new RawContextKey<boolean>('automationModalRowCanUpdate', false);
export const AutomationModalRowCanDeleteContext = new RawContextKey<boolean>('automationModalRowCanDelete', false);
export const AutomationModalRowCanRunContext = new RawContextKey<boolean>('automationModalRowCanRun', false);
export const AutomationModalRowExternalContext = new RawContextKey<boolean>('automationModalRowExternal', false);
export const AutomationModalRowHasLimitsContext = new RawContextKey<boolean>('automationModalRowHasLimits', false);
export const AutomationModalRowCloudContext = new RawContextKey<boolean>('automationModalRowCloud', false);
export const AutomationModalRowEventContext = new RawContextKey<boolean>('automationModalRowEvent', false);

/** Presentation operations supplied by the owning modal, never by the active global view. */
export interface IAutomationsModalActionContext {
	openWithAgent(): Promise<void>;
	runAutomation(automation: IAutomationDescriptor): Promise<void>;
}

const modalEnabled = ContextKeyExpr.and(AutomationsModalContext, ChatContextKeys.enabled, ChatAutomationsEnabledContext);
const cloudEnabled = ContextKeyExpr.and(modalEnabled, ContextKeyExpr.equals(`config.${CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING}`, true));

MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsModalHistoryContext, {
	command: { id: SHOW_AUTOMATION_SESSION_IN_LIST_COMMAND_ID, title: localize2('automations.modal.showSession', "Show in Sessions List") },
	group: '2_organize', order: 1,
	when: ContextKeyExpr.and(modalEnabled, SessionItemIsAutomationContext, SessionItemIsInSessionsListContext.negate(), SessionIsArchivedContext.negate()),
});
MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsModalHistoryContext, {
	command: { id: HIDE_AUTOMATION_SESSION_FROM_LIST_COMMAND_ID, title: localize2('automations.modal.hideSession', "Hide from Sessions List") },
	group: '2_organize', order: 2,
	when: ContextKeyExpr.and(modalEnabled, SessionItemIsAutomationContext, SessionItemIsInSessionsListContext),
});

export const AutomationsModalCommands = {
	run: {
		id: 'sessions.automations.modal.run',
		title: AutomationCommands.run.title,
		precondition: ContextKeyExpr.and(modalEnabled, AutomationModalRowCanRunContext),
	},
	createWithAgent: {
		id: 'sessions.automations.modal.createWithAgent',
		title: AutomationCommands.createWithAgent.title,
		precondition: modalEnabled,
	},
};

registerAction2(class extends Action2 {
	constructor() {
		super({
			...AutomationsModalCommands.createWithAgent,
			menu: { id: AgentsWindowMenus.AutomationsModalToolbar, group: 'navigation', order: 1, when: modalEnabled },
		});
	}

	override async run(_accessor: ServicesAccessor, context: IAutomationsModalActionContext): Promise<void> {
		await context.openWithAgent();
	}
});

registerAction2(class extends Action2 {
	constructor() { super(AutomationsModalCommands.run); }
	override async run(_accessor: ServicesAccessor, automation: IAutomationDescriptor, context: IAutomationsModalActionContext): Promise<void> {
		await context.runAutomation(automation);
	}
});

MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsModalRowContext, {
	command: { ...AutomationCommands.edit, precondition: ContextKeyExpr.and(modalEnabled, AutomationModalRowCanUpdateContext) },
	group: '4_manage', order: 0, when: modalEnabled,
});
MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsModalRowContext, {
	command: AutomationsModalCommands.run,
	group: 'navigation', order: 2, when: modalEnabled,
});

MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsModalRowContext, {
	command: AutomationCommands.openOnGitHub,
	group: 'navigation', order: 1, when: ContextKeyExpr.and(modalEnabled, AutomationModalRowExternalContext),
});
MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsModalRowContext, {
	command: AutomationCommands.duplicate,
	group: '3_copy', order: 1, when: ContextKeyExpr.and(modalEnabled, AutomationModalRowEventContext.negate()),
});
MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsModalRowContext, {
	command: AutomationCommands.export,
	group: '3_copy', order: 2, when: ContextKeyExpr.and(modalEnabled, AutomationModalRowCloudContext.negate()),
});
MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsModalRowContext, {
	command: { ...AutomationCommands.removeEndDate, precondition: ContextKeyExpr.and(modalEnabled, AutomationModalRowCanUpdateContext, AutomationModalRowHasLimitsContext) },
	group: '1_state', order: 1.5, when: ContextKeyExpr.and(modalEnabled, AutomationModalRowHasLimitsContext),
});

MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsModalToolbar, {
	submenu: AgentsWindowMenus.AutomationsModalCreate,
	title: AutomationCommands.createManually.title,
	group: 'navigation', order: 2, when: modalEnabled,
});
MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsModalCreate, {
	command: AutomationCommands.createManually,
	group: 'navigation', order: 1, when: modalEnabled,
});
MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsModalCreate, {
	command: { ...AutomationCommands.import, title: localize2('automations.modal.import', "Import Automation...") },
	group: 'navigation', order: 2, when: modalEnabled,
});
MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsModalToolbar, {
	submenu: AgentsWindowMenus.AutomationsModalViewOptions,
	title: localize('automations.modal.viewOptions', "View options"),
	icon: Codicon.more,
	group: 'navigation', order: 3, when: modalEnabled,
});
MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsModalViewOptions, {
	command: AutomationCommands.refresh,
	group: 'navigation', order: 1, when: cloudEnabled,
});
MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsModalViewOptions, {
	command: AutomationCommands.showSharedByOthers,
	group: '1_state', order: 1, when: ContextKeyExpr.and(cloudEnabled, AutomationsModalHasOthersContext),
});
MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsModalRowContext, {
	command: { ...AutomationCommands.disable, precondition: ContextKeyExpr.and(modalEnabled, AutomationModalRowCanUpdateContext) },
	group: '1_state', order: 1, when: ContextKeyExpr.and(modalEnabled, AutomationModalRowEnabledContext),
});
MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsModalRowContext, {
	command: { ...AutomationCommands.enable, precondition: ContextKeyExpr.and(modalEnabled, AutomationModalRowCanUpdateContext) },
	group: '1_state', order: 1, when: ContextKeyExpr.and(modalEnabled, AutomationModalRowEnabledContext.negate()),
});
MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsModalRowContext, {
	command: { ...AutomationCommands.delete, precondition: ContextKeyExpr.and(modalEnabled, AutomationModalRowCanDeleteContext) },
	group: '4_manage', order: 1, when: modalEnabled,
});

/** The modal chooses its own renderers; cards retain their separate action-view-item registrations. */
export function createAutomationsModalActionViewItem(action: IAction, options: IActionViewItemOptions, instantiationService: IInstantiationService, actionRunner: IActionRunner): IActionViewItem | undefined {
	if (action instanceof MenuItemAction) {
		const createWithAgent = action.id === AutomationsModalCommands.createWithAgent.id;
		return instantiationService.createInstance(AutomationHeaderButtonActionViewItem, undefined, action, options, !createWithAgent);
	}
	if (action instanceof SubmenuItemAction && action.item.submenu === AgentsWindowMenus.AutomationsModalCreate) {
		const primary = action.actions.find(item => item.id === AutomationCommands.createManually.id);
		if (primary) {
			return instantiationService.createInstance(AutomationHeaderSplitButtonActionViewItem, primary, options, action.actions.filter(item => item !== primary));
		}
	}
	if (action instanceof SubmenuItemAction) {
		return instantiationService.createInstance(SubmenuEntryActionViewItem, action, {
			...options, actionRunner,
			classNames: ['codicon', 'codicon-more', 'automations-modal-more-actions'],
		});
	}
	return undefined;
}
