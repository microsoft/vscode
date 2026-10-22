/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { CanvasesEnabledSettingId } from '../../../../../platform/agentHost/common/agentService.js';
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
import { CopilotCanvasesWidget } from './copilotCustomizationsWidget.js';
import './copilotExtensionsService.js';

aiCustomizationManagementSectionRegistry.register({
	id: AICustomizationManagementSection.Canvases,
	label: localize('copilotCanvases.sectionLabel', "Canvases"),
	icon: Codicon.preview,
	description: localize('copilotCanvases.sectionDescription', "Review canvases registered for visible Copilot chats."),
	enablementSettings: [CanvasesEnabledSettingId],
	initializeOnEditorOpen: true,
	supportsHarness: isCopilotCliSessionType,
	create: (instantiationService, container) => instantiationService.createInstance(CopilotCanvasesWidget, container),
});

class CopilotCanvasesAccessibility implements IAccessibleViewImplementation {
	readonly priority = 125;
	readonly name = 'copilot-canvases';
	readonly when = ContextKeyExpr.and(
		ChatContextKeys.enabled,
		CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR,
		CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION.isEqualTo(AICustomizationManagementSection.Canvases),
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
				localize('copilotCanvases.help.overview', "Canvases are interactive panels that Copilot can open beside a chat."),
				localize('copilotCanvases.help.navigation', "The tree groups extension parents under User, Workspace, Plugin, or Other sections, with each extension's Canvases as children. Use Tab and Shift+Tab to move between Refresh, search, the tree, and actions in the focused row. Use the Up Arrow, Down Arrow, Home, and End keys to navigate. Use the Left Arrow and Right Arrow keys to collapse or expand sections and extensions."),
				localize('copilotCanvases.help.enablement', "Press Space on a focused extension or use its switch to enable or disable every Canvas provided by that extension. When disabling stops the extension from reporting definitions, its children are labeled as last known and remain listed so the extension can be enabled again."),
				localize('copilotCanvases.help.actions', "Open an enabled Canvas child to show it. Use More Actions on an extension to open its source or plugin and change enablement. Use More Actions on a Canvas child to show it."),
				localize('copilotCanvases.help.marketplace', "Use Browse and filter by Canvas to find catalog plugins that declare Canvas compatibility. Installable SDK results use their confirmed installation selection; discovery-only results remain unavailable until another plugin or repository flow can install them."),
			].join('\n\n') : content!,
			() => DOM.isHTMLElement(focused) && focused.isConnected ? focused.focus() : editor.focus(),
			AccessibilityVerbositySettingId.CustomizationDiscovery,
		);
	}
}

AccessibleViewRegistry.register(new CopilotCanvasesAccessibility(AccessibleViewType.Help));
AccessibleViewRegistry.register(new CopilotCanvasesAccessibility(AccessibleViewType.View));
