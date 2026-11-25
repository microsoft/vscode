/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { IAgentHostTerminalService } from '../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js';
import { IAquariumService } from '../../../../workbench/contrib/sessions/browser/aquarium.js';
import { IChatWindowService } from '../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { IWindowCanvasService } from '../../../../workbench/contrib/sessions/browser/windowCanvas.js';
import { WindowCanvasService } from '../../../../workbench/contrib/sessions/browser/windowCanvasService.js';
import { MobileActionWidgetService } from './mobileActionWidgetService.js';
import { MobileContextMenuService } from './mobileContextMenuService.js';
import { MobileKeybindingService } from './mobileKeybindingService.js';
import { MobileNullAgentHostTerminalService } from './mobileNullAgentHostTerminalService.js';
import { MobileNullAquariumService } from './mobileNullAquariumService.js';
import { NullChatWindowService } from '../../../../workbench/contrib/chatWindow/browser/nullChatWindowService.js';
import { MobileQuickInputService } from './mobileQuickInputService.js';
import { ISessionsListPresentation } from '../../../../workbench/contrib/sessions/browser/sessionsListPresentation.js';
import { ISessionRepositoryPicker } from '../../../../workbench/contrib/sessions/browser/sessionRepositoryPicker.js';
import { MobileSessionsListPresentation } from './mobileSessionsListPresentation.js';
import { MobileRepositoryPicker } from './mobileRepositoryPicker.js';
import { IChatViewFactory } from '../../../../workbench/contrib/sessions/browser/chatViewFactory.js';
import { MobileChatViewFactory } from './mobileChatViewFactory.js';
import { IChatEditPresentationService } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatEditPresentation.js';
import { MobileChatEditPresenter } from './mobileChatEditPresenter.js';
import { ChatAttachmentWidgetRegistry, IChatAttachmentWidgetRegistry } from '../../../../workbench/contrib/chat/browser/attachments/chatAttachmentWidgetRegistry.js';
import { SessionsChatAccessibilityHelp } from '../../chat/browser/sessionsChatAccessibilityHelp.js';
import './mobileAttachmentContext.js';
import './mobileBackgroundNotifier.js';
import { mobileConfigurationDefaults } from './mobileConfigurationDefaults.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { localize2 } from '../../../../nls.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ChatAutomationsEnabledContext } from '../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { IAutomationDialogService } from '../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { MobileAutomationDialogService } from '../../automations/browser/automationDialogService.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../../../../workbench/contrib/sessions/browser/automationsConstants.js';
import { ICustomViewService } from '../../../../workbench/contrib/sessions/browser/customView.js';
import { CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID } from '../../../browser/workbench.js';
import { registerAutomationsAccessibility } from '../../sessions/browser/views/automationsAccessibility.js';
import { MobileAutomationsContribution } from './mobileAutomationsView.js';

// Phone design language. Imported here, at the end of the mobile entry point,
// so these stylesheets are evaluated after every shared stylesheet: a phone rule
// then wins on source order at equal specificity instead of needing to outrank
// the desktop rule it adapts. The order within the three is page → chat → drawer.
import '../../../browser/mobile/media/mobileWorkbench.css';
import '../../../browser/mobile/media/mobileChat.css';
import '../../../browser/mobile/media/mobileDrawer.css';

// Phone presentations of shared services. Imported by the mobile entry point
// after every other registration, so these descriptors win when the service
// collection is populated (the last registration for an id is used).

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerDefaultConfigurations([mobileConfigurationDefaults]);

// Context menus are bottom action sheets.
registerSingleton(IContextMenuService, MobileContextMenuService, InstantiationType.Delayed);

// Anchored action lists (configuration chips, mode/model/branch pickers) are
// bottom sheets. This is the service every such picker opens its popup through,
// so no caller can show the desktop widget on the phone.
registerSingleton(IActionWidgetService, MobileActionWidgetService, InstantiationType.Delayed);

// Simple picks and prompts are bottom sheets; quick access keeps the shared controller.
registerSingleton(IQuickInputService, MobileQuickInputService, InstantiationType.Delayed);
registerSingleton(IAutomationDialogService, MobileAutomationDialogService, InstantiationType.Delayed);

// Shortcuts still work with a paired keyboard, but labels stop advertising them.
registerSingleton(IKeybindingService, MobileKeybindingService, InstantiationType.Eager);

// The phone bundle ships no terminal. See MobileNullAgentHostTerminalService.
registerSingleton(IAgentHostTerminalService, MobileNullAgentHostTerminalService, InstantiationType.Delayed);

// The aquarium easter egg does not exist on the phone. See MobileNullAquariumService.
registerSingleton(IAquariumService, MobileNullAquariumService, InstantiationType.Delayed);
registerSingleton(IChatWindowService, NullChatWindowService, InstantiationType.Delayed);
registerSingleton(IWindowCanvasService, WindowCanvasService, InstantiationType.Delayed);
registerSingleton(ISessionsListPresentation, MobileSessionsListPresentation, InstantiationType.Delayed);
registerSingleton(ISessionRepositoryPicker, MobileRepositoryPicker, InstantiationType.Delayed);
registerSingleton(IChatViewFactory, MobileChatViewFactory, InstantiationType.Delayed);
registerSingleton(IChatEditPresentationService, MobileChatEditPresenter, InstantiationType.Delayed);
registerSingleton(IChatAttachmentWidgetRegistry, ChatAttachmentWidgetRegistry, InstantiationType.Delayed);
AccessibleViewRegistry.register(new SessionsChatAccessibilityHelp(undefined, false));
registerAutomationsAccessibility('phone');
registerWorkbenchContribution2('sessions.mobile.automations', MobileAutomationsContribution, WorkbenchPhase.BlockRestore);
registerAction2(class extends Action2 {
	constructor() {
		super({ id: 'sessionsView.manageAutomations', title: localize2('manageAutomations', "Manage Automations"), precondition: ChatAutomationsEnabledContext });
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		if (accessor.get(IContextKeyService).contextMatchesRules(ChatAutomationsEnabledContext)) {
			const views = accessor.get(ICustomViewService);
			await accessor.get(ICommandService).executeCommand(CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID);
			views.showCustomView(AUTOMATIONS_CUSTOM_VIEW_ID);
		}
	}
});
