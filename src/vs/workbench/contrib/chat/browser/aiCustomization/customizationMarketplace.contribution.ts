/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
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
import { ICustomizationMarketplaceInstallService } from '../../common/customizationMarketplaceInstallService.js';
import { CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR, CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION } from './aiCustomizationManagement.js';
import { AICustomizationManagementEditor } from './aiCustomizationManagementEditor.js';
import { CustomizationMarketplaceInstallService } from './customizationMarketplaceInstallService.js';
import { CustomizationMarketplaceWorkbenchService } from './customizationMarketplaceWorkbenchService.js';

registerSingleton(ICustomizationMarketplaceService, CustomizationMarketplaceWorkbenchService, InstantiationType.Delayed);
registerSingleton(ICustomizationMarketplaceInstallService, CustomizationMarketplaceInstallService, InstantiationType.Delayed);

class CustomizationDiscoveryAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 110;
	readonly name = 'customization-discovery';
	readonly when = ContextKeyExpr.and(
		ChatContextKeys.enabled,
		CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR,
		CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION.isEqualTo(''),
	);

	constructor(readonly type: AccessibleViewType) { }

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editor = accessor.get(IEditorService).activeEditorPane;
		const welcomePage = editor instanceof AICustomizationManagementEditor ? editor.getWelcomePage() : undefined;
		if (!welcomePage) {
			return undefined;
		}
		const focused = DOM.getActiveElement();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.CustomizationDiscovery,
			{ type: this.type, language: 'plaintext' },
			() => this.type === AccessibleViewType.Help ? [
				localize('customizationDiscovery.help.overview', "Discover customizations searches installed agents, skills, instructions, prompts, hooks, MCP servers, and plugins, and can browse available marketplace items."),
				localize('customizationDiscovery.help.search', "Type words or use @installed, @type:skill, @type:mcp, and @type:plugin. Quick filters update the same query and can be combined."),
				localize('customizationDiscovery.help.browse', "Clear the search to browse. Show All on a section applies its type filter and moves to search results."),
				localize('customizationDiscovery.help.navigation', "Use Tab and Shift+Tab between controls. In search results, use the arrow keys, Home, and End to navigate Installed and Available groups. Press Enter to open an installed item."),
				localize('customizationDiscovery.help.install', "Review an available item's source, then choose Install. VS Code continues to apply destination, trust, policy, and compatibility checks."),
				localize('customizationDiscovery.help.paging', "Load More appends another page without removing loaded results. Retry repeats a failed marketplace request."),
				localize('customizationDiscovery.help.view', "Use {0} to read the current browse or search results in the Accessible View.", '<keybinding:editor.action.accessibleView>'),
			].join('\n\n') : welcomePage.getAccessibilityContent(),
			() => DOM.isHTMLElement(focused) && focused.isConnected ? focused.focus() : welcomePage.focus(),
			AccessibilityVerbositySettingId.CustomizationDiscovery,
		);
	}
}

AccessibleViewRegistry.register(new CustomizationDiscoveryAccessibleView(AccessibleViewType.Help));
AccessibleViewRegistry.register(new CustomizationDiscoveryAccessibleView(AccessibleViewType.View));
