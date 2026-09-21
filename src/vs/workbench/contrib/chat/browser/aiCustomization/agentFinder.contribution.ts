/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { AgentFinderService, IAgentFinderService } from '../../../../../platform/agentFinder/common/agentFinderService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IAgentFinderInstallService } from '../../common/agentFinderInstallService.js';
import { AICustomizationManagementSection, CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR, CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION } from './aiCustomizationManagement.js';
import { AICustomizationManagementEditor } from './aiCustomizationManagementEditor.js';
import { aiCustomizationManagementSectionRegistry } from './aiCustomizationManagementSectionRegistry.js';
import { AgentFinderInstallService } from './agentFinderInstallService.js';
import { AgentFinderWidget } from './agentFinderWidget.js';

registerSingleton(IAgentFinderService, AgentFinderService, InstantiationType.Delayed);
registerSingleton(IAgentFinderInstallService, AgentFinderInstallService, InstantiationType.Delayed);

aiCustomizationManagementSectionRegistry.register({
	id: AICustomizationManagementSection.AgentFinder,
	label: localize('agentFinder.label', "AgentFinder"),
	icon: Codicon.search,
	description: localize('agentFinder.description', "Discover skills, MCP servers, and plugins in GitHub's public catalog."),
	supportsHarness: () => true,
	create: (instantiationService, container) => instantiationService.createInstance(AgentFinderWidget, container),
});

class AgentFinderAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 110;
	readonly name = 'agent-finder';
	readonly when = ContextKeyExpr.and(
		ChatContextKeys.enabled,
		CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR,
		CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION.isEqualTo(AICustomizationManagementSection.AgentFinder),
	);

	constructor(readonly type: AccessibleViewType) { }

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editor = accessor.get(IEditorService).activeEditorPane;
		const widget = editor instanceof AICustomizationManagementEditor ? editor.getActiveSectionWidget() : undefined;
		if (!(widget instanceof AgentFinderWidget)) {
			return undefined;
		}
		const focused = DOM.getActiveElement();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.AgentFinder,
			{ type: this.type, language: 'plaintext' },
			() => this.type === AccessibleViewType.Help ? [
				localize('agentFinder.help.overview', "AgentFinder browses GitHub's public catalog of skills, MCP servers, and plugins. Browsing does not install or enable anything."),
				localize('agentFinder.help.search', "Type in the search field to find resources, or clear it to browse. Press Enter to search immediately. The resource type selector filters both browsing and search."),
				localize('agentFinder.help.navigation', "Use Tab and Shift+Tab to move between controls and result cards. When a card is focused, use the arrow keys, Home, and End to navigate the results."),
				localize('agentFinder.help.metadata', "Each card shows catalog metadata. Expand Details with Enter or Space for capabilities and example queries. GitHub images identify repository owners, not verified publishers."),
				localize('agentFinder.help.install', "Review a resource's source and compatibility, then choose Install. Installation uses VS Code's existing prompts, including destination and trust choices when required. Each card and the Accessible View report installation progress and availability."),
				localize('agentFinder.help.installUnavailable', "An unavailable Install action explains why it is disabled. Cursor plugins and resources without trusted installation information cannot be installed here."),
				localize('agentFinder.help.installRetry', "Installing becomes Installed only when the installation service confirms success. Cancelling restores the action without an error. Failed installations show an error and Retry Install without clearing the catalog. Installation can continue after leaving AgentFinder."),
				localize('agentFinder.help.links', "Open Resource and View Repository open external websites so you can review their contents before installing."),
				localize('agentFinder.help.paging', "Load More adds the next page of results. Retry repeats a failed request without removing previously loaded results. Refresh reloads the current search from the first page."),
				localize('agentFinder.help.view', "Use {0} to read all loaded results, including their descriptions and metadata, in the Accessible View.", '<keybinding:editor.action.accessibleView>'),
			].join('\n\n') : widget.getAccessibilityContent(),
			() => DOM.isHTMLElement(focused) && focused.isConnected ? focused.focus() : widget.focus(),
			AccessibilityVerbositySettingId.AgentFinder,
		);
	}
}

AccessibleViewRegistry.register(new AgentFinderAccessibleView(AccessibleViewType.Help));
AccessibleViewRegistry.register(new AgentFinderAccessibleView(AccessibleViewType.View));
