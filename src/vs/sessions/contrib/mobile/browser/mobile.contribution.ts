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
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus } from '../../../../workbench/contrib/sessions/browser/menus.js';
import { IsPhoneLayoutContext, SessionItemIsMultiSelectionContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { ISession } from '../../../../workbench/services/sessions/common/session.js';
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
import { MobileCustomizationsFocus, MobileCustomizationsInspector } from './mobileCustomizationsInspector.js';

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

registerAction2(class extends Action2 {
	constructor() {
		const when = ContextKeyExpr.and(ChatContextKeys.enabled, IsPhoneLayoutContext);
		super({
			id: 'sessions.mobile.inspectCustomizations',
			title: localize2('inspectCustomizations', "Customizations"),
			icon: Codicon.extensions,
			precondition: ContextKeyExpr.and(when, SessionItemIsMultiSelectionContext.negate()),
			menu: { id: Menus.SessionItemContextMenu, group: 'navigation', order: 6, when },
		});
	}

	override async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		const session = Array.isArray(context) ? (context.length === 1 ? context[0] : undefined) : context;
		if (!session) {
			throw new Error(localize('inspectOneSession', "Select a single session to inspect its customizations."));
		}
		await accessor.get(IInstantiationService).createInstance(MobileCustomizationsInspector).open(session);
	}
});

for (const type of [AccessibleViewType.Help, AccessibleViewType.View]) {
	AccessibleViewRegistry.register({
		name: 'mobileSessionCustomizations',
		priority: 110,
		type,
		when: MobileCustomizationsFocus,
		getProvider: () => {
			const focused = getActiveElement();
			const page = focused?.closest<HTMLElement>('.mobile-navigation-page');
			if (!page || !isHTMLElement(focused)) {
				return undefined;
			}
			return new AccessibleContentProvider(
				AccessibleViewProviderId.MobileSessionCustomizations, { type },
				() => type === AccessibleViewType.Help
					? localize('mobileCustomizationsHelp', "Inspect the selected session's instructions, skills, and agents. Tab between items and press Enter to read one. Use Back or Escape to return without changing sessions.")
					: page.innerText,
				() => focused.focus(),
				AccessibilityVerbositySettingId.CustomizationDiscovery,
			);
		},
	});
}
