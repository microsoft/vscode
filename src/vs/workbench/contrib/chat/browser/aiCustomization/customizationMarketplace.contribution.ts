/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ICustomizationMarketplaceService } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../common/constants.js';
import { ICustomizationMarketplaceInstallService } from '../../common/customizationMarketplaceInstallService.js';
import { AICustomizationManagementSection, CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR, CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION } from './aiCustomizationManagement.js';
import { AICustomizationManagementEditor } from './aiCustomizationManagementEditor.js';
import { aiCustomizationManagementSectionRegistry } from './aiCustomizationManagementSectionRegistry.js';
import { CustomizationMarketplaceInstallService } from './customizationMarketplaceInstallService.js';
import { CustomizationMarketplaceWidget } from './customizationMarketplaceWidget.js';
import { CustomizationMarketplaceWorkbenchService } from './customizationMarketplaceWorkbenchService.js';

registerSingleton(ICustomizationMarketplaceService, CustomizationMarketplaceWorkbenchService, InstantiationType.Delayed);
registerSingleton(ICustomizationMarketplaceInstallService, CustomizationMarketplaceInstallService, InstantiationType.Delayed);

aiCustomizationManagementSectionRegistry.register({
	id: AICustomizationManagementSection.Marketplace,
	label: localize('customizationMarketplace.label', "Marketplace"),
	icon: Codicon.search,
	description: localize('customizationMarketplace.description', "Discover skills, MCP servers, and plugins for your agents."),
	enablementSetting: ChatConfiguration.ChatCustomizationsUnifiedMarketplaceEnabled,
	supportsHarness: () => true,
	create: (instantiationService, container) => instantiationService.createInstance(CustomizationMarketplaceWidget, container),
});

class CustomizationMarketplaceAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 110;
	readonly name = 'customization-marketplace';
	readonly when = ContextKeyExpr.and(
		ChatContextKeys.enabled,
		ContextKeyExpr.equals(`config.${ChatConfiguration.ChatCustomizationsUnifiedMarketplaceEnabled}`, true),
		CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR,
		CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION.isEqualTo(AICustomizationManagementSection.Marketplace),
	);

	constructor(readonly type: AccessibleViewType) { }

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editor = accessor.get(IEditorService).activeEditorPane;
		const widget = editor instanceof AICustomizationManagementEditor ? editor.getActiveSectionWidget() : undefined;
		if (!(widget instanceof CustomizationMarketplaceWidget)) {
			return undefined;
		}
		const focused = DOM.getActiveElement();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.CustomizationMarketplace,
			{ type: this.type, language: 'plaintext' },
			() => this.type === AccessibleViewType.Help ? [
				localize('customizationMarketplace.help.overview', "The marketplace helps you discover skills, MCP servers, and plugins for your agents. Browsing does not install or enable anything."),
				localize('customizationMarketplace.help.search', "Type in the search field to find resources, or clear it to browse. Press Enter to search immediately. The resource type selector filters both browsing and search."),
				localize('customizationMarketplace.help.loading', "Loading is shown with decorative placeholder cards and announced to screen readers. Placeholders are not results and cannot be selected. Previously loaded results remain available while the next page loads."),
				localize('customizationMarketplace.help.navigation', "Use Tab and Shift+Tab to move between controls and result cards. When a card is focused, use the arrow keys, Home, and End to navigate the results."),
				localize('customizationMarketplace.help.metadata', "Each card shows source metadata. Expand Details with Enter or Space for capabilities and example queries. GitHub images identify repository owners, not verified publishers."),
				localize('customizationMarketplace.help.install', "Review a resource's source and compatibility, then choose Install. Installation uses VS Code's existing prompts, including destination and trust choices when required. Each card and the Accessible View report installation progress and availability."),
				localize('customizationMarketplace.help.installUnavailable', "An unavailable Install action explains why it is disabled. Cursor plugins and resources without trusted installation information cannot be installed here."),
				localize('customizationMarketplace.help.installRetry', "Installing becomes Installed only when the installation service confirms success. Cancelling restores the action without an error. Failed installations show an error and Retry Install without clearing the results. Installation can continue after leaving the marketplace."),
				localize('customizationMarketplace.help.links', "Open Resource and View Repository open external websites so you can review their contents before installing."),
				localize('customizationMarketplace.help.paging', "Load More adds the next page of results. Retry repeats a failed request without removing previously loaded results. Refresh reloads the current search from the first page."),
				localize('customizationMarketplace.help.view', "Use {0} to read all loaded results, including their descriptions and metadata, in the Accessible View.", '<keybinding:editor.action.accessibleView>'),
			].join('\n\n') : widget.getAccessibilityContent(),
			() => DOM.isHTMLElement(focused) && focused.isConnected ? focused.focus() : widget.focus(),
			AccessibilityVerbositySettingId.CustomizationMarketplace,
		);
	}
}

AccessibleViewRegistry.register(new CustomizationMarketplaceAccessibleView(AccessibleViewType.Help));
AccessibleViewRegistry.register(new CustomizationMarketplaceAccessibleView(AccessibleViewType.View));
