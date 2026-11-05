/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ExtensionGalleryManifestStatus, IExtensionGalleryManifestService } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE } from '../../../../platform/extensions/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR, CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { AICustomizationManagementEditor } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { AICustomizationManagementSection } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { AGENTS_WINDOW_CONFIRM_UNINSTALL_SETTING, AgentsWindowExtensionsWidget } from './agentsWindowExtensionsWidget.js';
import { IAgentsWindowExtensionSuggestionsService } from './agentsWindowExtensionSuggestions.js';

export class AgentsWindowExtensionsAccessibilityHelp implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.Help;
	readonly priority = 110;
	readonly name = 'agents-window-extensions-help';
	readonly when = ContextKeyExpr.and(CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR, CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION.isEqualTo(AICustomizationManagementSection.Extensions));

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editor = accessor.get(IEditorService).activeEditorPane;
		if (!(editor instanceof AICustomizationManagementEditor) || !(editor.getActiveSectionWidget() instanceof AgentsWindowExtensionsWidget)) {
			return undefined;
		}
		const focused = DOM.getActiveElement();
		const hasSuggestedGroup = accessor.get(IAgentsWindowExtensionSuggestionsService).suggestedExtensions.get().length > 0;
		const autoEnable = accessor.get(IConfigurationService).getValue<unknown>(EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE);
		const marketplaceStatus = accessor.get(IExtensionGalleryManifestService).extensionGalleryManifestStatus;
		return new AccessibleContentProvider(
			AccessibleViewProviderId.AgentsWindowExtensions,
			{ type: AccessibleViewType.Help },
			() => [
				localize('agentsWindowExtensions.help.overview', "You are in the Extensions section of Agent Customizations. It lists the extensions installed in VS Code and whether each one runs in the Agents window. Enabling or disabling an extension here only affects the Agents window."),
				localize('agentsWindowExtensions.help.groups', "Extensions that support the Agents window are listed under Supported and are enabled by default. Other extensions are listed under Other Extensions and are disabled by default because they might not work as expected."),
				...(hasSuggestedGroup ? [localize('agentsWindowExtensions.help.aiFeatures', "Extensions listed under AI Features haven't declared support for the Agents window but add AI features, such as tools, MCP servers, or skills, which are read as part of the extension. Like other extensions, they are disabled by default.")] : []),
				...(autoEnable === true ? [localize('agentsWindowExtensions.help.autoEnabled', "Extensions that add AI features and don't rely on views, debugging, or other features that are unavailable in the Agents window are enabled automatically instead. You can disable them like any other extension.")] : []),
				...(Array.isArray(autoEnable) && autoEnable.length > 0 ? [localize('agentsWindowExtensions.help.autoEnabledListed', "Some extensions that haven't declared support for the Agents window are enabled automatically instead. You can disable them like any other extension.")] : []),
				localize('agentsWindowExtensions.help.warnings', "Extensions that haven't declared support for the Agents window and contribute views, debuggers, status bar items, or walkthroughs, which are not supported in the Agents window, have a warning, which is read as part of the extension."),
				localize('agentsWindowExtensions.help.navigation', "Use the search box to filter extensions by name, identifier, publisher, or description. Press Tab to move to the list, use the Up and Down Arrow keys to move between extensions, and press Space or Enter to enable or disable the focused extension. Use the Left and Right Arrow keys on a group to collapse or expand it."),
				localize('agentsWindowExtensions.help.actions', "Press Shift+F10 on an installed extension to open its actions, which enable or disable it, restart extensions when required, and uninstall it. Uninstalling an extension here also uninstalls it from VS Code, so you are asked to confirm it first, unless you chose not to be asked again. The {0} setting turns the confirmation back on.", AGENTS_WINDOW_CONFIRM_UNINSTALL_SETTING),
				...(marketplaceStatus === ExtensionGalleryManifestStatus.Available ? [localize('agentsWindowExtensions.help.marketplace', "Typing in the search box also searches the Marketplace. Installed extensions are read with the install count and rating that the Marketplace reports for them. Extensions it finds that aren't installed are listed under Marketplace, which expands with each new search, with their publisher, install count, and rating. Press Space or Enter on one to install it. To install another version, such as a pre-release, press Tab to move to its Install button, then the Right Arrow key to move to the menu of other versions. Installing an extension here also installs it in VS Code, and enables it in the Agents window. If an extension can't be installed, for example because your organization doesn't allow it, it has a warning that says why, which is read as part of the extension. If the Marketplace can't be searched, a warning on the search box says that only installed extensions are shown.")] : []),
				...(marketplaceStatus === ExtensionGalleryManifestStatus.RequiresSignIn ? [localize('agentsWindowExtensions.help.marketplaceRequiresSignIn', "The search box also searches the Marketplace once you sign in to it from the Extensions view in VS Code. Until then, only installed extensions are shown.")] : []),
				...(marketplaceStatus === ExtensionGalleryManifestStatus.AccessDenied ? [localize('agentsWindowExtensions.help.marketplaceAccessDenied', "Your account does not have access to the Extensions Marketplace, so the search box only searches installed extensions.")] : []),
				localize('agentsWindowExtensions.help.restart', "When a change requires restarting extensions or reloading the window, the extension is marked as requiring a restart, and a Restart Extensions or Reload Window button appears on its row and next to the section title. The button next to the section title also appears when an extension that you uninstalled here keeps running until extensions restart. Press Shift+Tab from the search box to reach the button next to the section title."),
			].join('\n\n'),
			() => DOM.isHTMLElement(focused) && focused.isConnected ? focused.focus() : editor.focus(),
			AccessibilityVerbositySettingId.AgentsWindowExtensions,
		);
	}
}
