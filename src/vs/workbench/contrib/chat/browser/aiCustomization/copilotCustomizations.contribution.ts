/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { isCopilotCliSessionType } from '../agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR, CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION } from './aiCustomizationManagement.js';
import { AICustomizationManagementEditor } from './aiCustomizationManagementEditor.js';
import { aiCustomizationManagementSectionRegistry } from './aiCustomizationManagementSectionRegistry.js';
import { CopilotCustomizationsWidget } from './copilotCustomizationsWidget.js';
import './copilotCustomizationsService.js';

aiCustomizationManagementSectionRegistry.register({
	id: AICustomizationManagementSection.Extensions,
	label: localize('copilotExtensions.sectionLabel', "Extensions"),
	icon: Codicon.extensions,
	description: localize('copilotExtensions.sectionDescription', "Manage executable extensions loaded by the Copilot runtime."),
	supportsHarness: isCopilotCliSessionType,
	create: (instantiationService, container, selectSection) => instantiationService.createInstance(CopilotCustomizationsWidget, 'extensions', container, selectSection),
});

aiCustomizationManagementSectionRegistry.register({
	id: AICustomizationManagementSection.Canvases,
	label: localize('copilotCanvases.sectionLabel', "Canvases"),
	icon: Codicon.preview,
	description: localize('copilotCanvases.sectionDescription', "Review canvases available to the active Copilot session."),
	supportsHarness: isCopilotCliSessionType,
	create: (instantiationService, container, selectSection) => instantiationService.createInstance(CopilotCustomizationsWidget, 'canvases', container, selectSection),
});

class CopilotCustomizationsAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 110;
	readonly name = 'copilot-customizations';
	readonly type = AccessibleViewType.Help;
	readonly when = ContextKeyExpr.and(
		ChatContextKeys.enabled,
		CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR,
		ContextKeyExpr.or(
			CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION.isEqualTo(AICustomizationManagementSection.Extensions),
			CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION.isEqualTo(AICustomizationManagementSection.Canvases),
		),
	);

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editor = accessor.get(IEditorService).activeEditorPane;
		if (!(editor instanceof AICustomizationManagementEditor)) {
			return undefined;
		}
		const focused = DOM.getActiveElement();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.CustomizationDiscovery,
			{ type: AccessibleViewType.Help },
			() => [
				localize('copilotCustomizations.help.overview', "Extensions are executable modules discovered from your Copilot profile and installed plugins. Canvases are interactive interfaces declared by those extensions for the active Copilot session."),
				localize('copilotCustomizations.help.navigation', "Use Tab and Shift+Tab to move between search, refresh, each row, and its actions. Use the Up Arrow, Down Arrow, Home, and End keys to navigate rows."),
				localize('copilotCustomizations.help.extensions', "In Extensions, open a user-extension row to view its module. Opening a plugin-extension row goes to the owning Plugins section. Use Enable or Disable to persist the extension preference and update the active session when it is running. Plugin extensions also require their owning plugin to remain enabled."),
				localize('copilotCustomizations.help.canvases', "In Canvases, Refresh Canvases reconciles the active session's extension membership before reading its canvas declarations. Open a row or choose Manage Provider to go to the owning Extensions or Plugins section."),
				localize('copilotCustomizations.help.marketplace', "Use Discover and filter by Canvas to find catalog canvases. Installing a canvas installs its owning plugin; the provider continues to own update, enablement, and uninstall."),
			].join('\n\n'),
			() => DOM.isHTMLElement(focused) && focused.isConnected ? focused.focus() : editor.focus(),
			AccessibilityVerbositySettingId.CustomizationDiscovery,
		);
	}
}

AccessibleViewRegistry.register(new CopilotCustomizationsAccessibilityHelp());
