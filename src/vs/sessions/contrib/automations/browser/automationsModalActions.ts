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

export const AutomationsModalContext = new RawContextKey<boolean>('automationsModal', false);
export const AutomationsModalHasOthersContext = new RawContextKey<boolean>('automationsModalHasOthers', false);
export const AutomationModalRowEnabledContext = new RawContextKey<boolean>('automationModalRowEnabled', false);
export const AutomationModalRowCanUpdateContext = new RawContextKey<boolean>('automationModalRowCanUpdate', false);
export const AutomationModalRowCanDeleteContext = new RawContextKey<boolean>('automationModalRowCanDelete', false);
export const AutomationModalRowCanRunContext = new RawContextKey<boolean>('automationModalRowCanRun', false);

/** Presentation operations supplied by the owning modal, never by the active global view. */
export interface IAutomationsModalActionContext {
	openWithAgent(): Promise<void>;
}

const modalEnabled = ContextKeyExpr.and(AutomationsModalContext, ChatContextKeys.enabled, ChatAutomationsEnabledContext);
const cloudEnabled = ContextKeyExpr.and(modalEnabled, ContextKeyExpr.equals(`config.${CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING}`, true));

export const AutomationsModalCommands = {
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

MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsModalRowContext, {
	command: { ...AutomationCommands.edit, precondition: ContextKeyExpr.and(modalEnabled, AutomationModalRowCanUpdateContext) },
	group: 'navigation', order: 1, when: modalEnabled,
});
MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsModalRowContext, {
	command: { ...AutomationCommands.run, precondition: ContextKeyExpr.and(modalEnabled, AutomationModalRowCanRunContext) },
	group: 'navigation', order: 2, when: modalEnabled,
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
