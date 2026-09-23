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
		if (!welcomePage.isDiscover && this.type === AccessibleViewType.View) {
			return undefined;
		}
		const focused = DOM.getActiveElement();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.CustomizationDiscovery,
			{ type: this.type, language: 'plaintext' },
			() => this.type === AccessibleViewType.Help ? welcomePage.isDiscover ? [
				localize('customizationDiscovery.help.overview', "Discover customizations searches installed agents, skills, instructions, prompts, hooks, MCP servers, and plugins, and can browse available marketplace items."),
				localize('customizationDiscovery.help.descriptionLinks', "The customization type links below the heading open their respective management sections."),
				localize('customizationDiscovery.help.search', "Type words or use @installed, @type:skill, @type:mcp, and @type:plugin. The search filter menu updates the same query and filters can be combined."),
				localize('customizationDiscovery.help.ranking', "Available search results are ordered by source-assigned relevance, not trust or quality. Browsing without search text interleaves sources while preserving each catalog's order."),
				localize('customizationDiscovery.help.browse', "Clear the search to browse. Show All on a section applies its type filter and moves to search results."),
				localize('customizationDiscovery.help.sources', "Use the source picker to search all available marketplace feeds or one feed. Configure Marketplaces opens the related settings."),
				localize('customizationDiscovery.help.navigation', "Use Tab and Shift+Tab between controls. In search results, use the arrow keys, Home, and End to navigate the list. Press Enter to open an installed item."),
				localize('customizationDiscovery.help.install', "Review an available item's source, then choose Install. Installed marketplace items provide an Uninstall action. VS Code continues to apply destination, trust, policy, and compatibility checks."),
				localize('customizationDiscovery.help.links', "Available customization names open their external resource so you can review it before installing."),
				localize('customizationDiscovery.help.paging', "Scrolling near the end of search results loads another page without removing loaded items. Retry repeats a failed marketplace request."),
				localize('customizationDiscovery.help.sourceFailures', "Unavailable sources show a warning and Retry action above the results. Scrolling continues healthy sources. Retrying a source reloads all sources from the first page to restore relevance order."),
				localize('customizationDiscovery.help.sourceRecovery', "A source that needs sign-in shows a Sign In action, not a warning. Sign-in starts only when you choose it; cancelling keeps the other results available."),
				localize('customizationDiscovery.help.view', "Use {0} to read the current browse or search results in the Accessible View.", '<keybinding:editor.action.accessibleView>'),
			].join('\n\n') : [
				localize('customizationOverview.help.overview', "The Customizations overview shows categories you can open to manage agents, skills, MCP servers, plugins, and other customizations."),
				localize('customizationOverview.help.navigation', "Use Tab and Shift+Tab to navigate the category cards, and Enter or Space to open a category."),
				localize('customizationOverview.help.migrations', "When customizations need migration, choose Review Customization Migrations to see what will change."),
			].join('\n\n') : welcomePage.getAccessibilityContent(),
			() => DOM.isHTMLElement(focused) && focused.isConnected ? focused.focus() : welcomePage.focus(),
			AccessibilityVerbositySettingId.CustomizationDiscovery,
		);
	}
}

AccessibleViewRegistry.register(new CustomizationDiscoveryAccessibleView(AccessibleViewType.Help));
AccessibleViewRegistry.register(new CustomizationDiscoveryAccessibleView(AccessibleViewType.View));
