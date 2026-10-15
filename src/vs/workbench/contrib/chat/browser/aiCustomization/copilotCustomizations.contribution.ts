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
import './copilotExtensionsService.js';

aiCustomizationManagementSectionRegistry.register({
	id: AICustomizationManagementSection.Extensions,
	label: localize('copilotExtensions.sectionLabel', "Extensions"),
	icon: Codicon.extensions,
	description: localize('copilotExtensions.sectionDescription', "Manage executable extensions loaded by the Copilot runtime."),
	supportsHarness: isCopilotCliSessionType,
	create: (instantiationService, container) => instantiationService.createInstance(CopilotCustomizationsWidget, 'extensions', container),
});

aiCustomizationManagementSectionRegistry.register({
	id: AICustomizationManagementSection.Canvases,
	label: localize('copilotCanvases.sectionLabel', "Canvases"),
	icon: Codicon.preview,
	description: localize('copilotCanvases.sectionDescription', "Review canvases registered for visible Copilot chats."),
	supportsHarness: isCopilotCliSessionType,
	create: (instantiationService, container) => instantiationService.createInstance(CopilotCustomizationsWidget, 'canvases', container),
});

class CopilotCustomizationsAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 110;
	readonly name = 'copilot-customizations';
	readonly when = ContextKeyExpr.and(
		ChatContextKeys.enabled,
		CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR,
		ContextKeyExpr.or(
			CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION.isEqualTo(AICustomizationManagementSection.Extensions),
			CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION.isEqualTo(AICustomizationManagementSection.Canvases),
		),
	);

	constructor(readonly type: AccessibleViewType) { }

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editor = accessor.get(IEditorService).activeEditorPane;
		if (!(editor instanceof AICustomizationManagementEditor)) {
			return undefined;
		}
		const content = this.type === AccessibleViewType.View ? editor.getCustomizationDiscoveryAccessibilityContent() : undefined;
		if (this.type === AccessibleViewType.View && !content) {
			return undefined;
		}
		const focused = DOM.getActiveElement();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.CustomizationDiscovery,
			{ type: this.type, language: 'plaintext' },
			() => this.type === AccessibleViewType.Help ? [
				localize('copilotCustomizations.help.overview', "Extensions are executable modules discovered from your Copilot profile and installed plugins. Canvases are interactive interfaces registered by extensions for chats visible in this window."),
				localize('copilotCustomizations.help.navigation', "Use Tab and Shift+Tab to move between search, refresh, each row, and its actions. Use the Up Arrow, Down Arrow, Home, and End keys to navigate rows."),
				localize('copilotCustomizations.help.extensions', "In Extensions, open a user-extension row to view its module. Opening a plugin-extension row goes to the owning Plugins section. Use Enable or Disable to persist the preference and reconcile the selected live chat when available. Plugin extensions also require their owning plugin to remain enabled."),
				localize('copilotCustomizations.help.canvases', "In Canvases, open a row to use a Canvas that needs no additional input. Manage Provider routes user extensions and plugins to their owning section. A Canvas that requires input and has no manageable provider must be opened from its chat."),
				localize('copilotCustomizations.help.marketplace', "Use Browse and filter by Canvas to find catalog plugins that declare Canvas compatibility. Catalog metadata is inert; installation remains owned by the configured plugin or repository flow."),
			].join('\n\n') : content!,
			() => DOM.isHTMLElement(focused) && focused.isConnected ? focused.focus() : editor.focus(),
			AccessibilityVerbositySettingId.CustomizationDiscovery,
		);
	}
}

AccessibleViewRegistry.register(new CopilotCustomizationsAccessibilityHelp(AccessibleViewType.Help));
AccessibleViewRegistry.register(new CopilotCustomizationsAccessibilityHelp(AccessibleViewType.View));
