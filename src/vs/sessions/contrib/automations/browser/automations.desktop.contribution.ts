/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ChatAIDisabledSettingId } from '../../../../platform/chat/common/chatSettings.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IAutomationDialogService } from '../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../../../../workbench/contrib/sessions/browser/automationsConstants.js';
import { ICustomViewService } from '../../../../workbench/contrib/sessions/browser/customView.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { AutomationsCustomViewAccessibilityHelp, AutomationsCustomViewAccessibleView } from '../../sessions/browser/views/automationsAccessibility.js';
import { AutomationsCustomViewContribution } from '../../sessions/browser/views/automationsView.js';
import { AUTOMATIONS_MODAL_SETTING, AutomationsEditorInput } from './automationsEditorInput.js';
import { DefaultAutomationDialogService } from './defaultAutomationDialogService.js';
import './automationsEditor.js';

// Automations presentation for the desktop (and desktop-web) workbench: the cards view, the
// catalogue editor, the dialog form, and their accessibility help. The shared catalogue state,
// runner, and commands live in automations.contribution.ts; the phone bundle imports that file
// but not this one.

registerSingleton(IAutomationDialogService, DefaultAutomationDialogService, InstantiationType.Delayed);
registerWorkbenchContribution2(AutomationsCustomViewContribution.ID, AutomationsCustomViewContribution, WorkbenchPhase.BlockRestore);
AccessibleViewRegistry.register(new AutomationsCustomViewAccessibilityHelp());
AccessibleViewRegistry.register(new AutomationsCustomViewAccessibleView());

registerAction2(class ManageAutomationsAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsView.manageAutomations',
			title: localize2('manageAutomations', "Manage Automations"),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		if (configurationService.getValue<boolean>(AUTOMATIONS_MODAL_SETTING) === true) {
			if (configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) !== true || configurationService.getValue<boolean>(ChatAIDisabledSettingId)) {
				return;
			}
			accessor.get(ICustomViewService).hideCustomView();
			await accessor.get(IEditorService).openEditor(AutomationsEditorInput.getOrCreate(), { pinned: true });
			return;
		}
		accessor.get(ICustomViewService).showCustomView(AUTOMATIONS_CUSTOM_VIEW_ID);
	}
});
