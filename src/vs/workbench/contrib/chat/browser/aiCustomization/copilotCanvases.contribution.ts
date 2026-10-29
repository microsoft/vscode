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
				localize('copilotCanvases.help.overview', "Canvases are interactive visual surfaces shared by you and the agent. The Learn more about canvases link below the heading opens the documentation."),
				localize('copilotCanvases.help.navigation', "The tree groups canvas extension parents under User, Workspace, Plugin, or Other sections, with each canvas extension's Canvases as children. Use Tab and Shift+Tab to move between the documentation link, search, the tree, and actions in the focused row. Use the Up Arrow, Down Arrow, Home, and End keys to navigate. Use the Left Arrow and Right Arrow keys to collapse or expand sections and canvas extensions."),
				localize('copilotCanvases.help.enablement', "For User and Plugin canvas extensions, Tab to the switch and press Space to enable or disable it. Workspace canvas extension enablement cannot be changed here. When disabling stops a canvas extension from reporting definitions, its children are labeled as last known and remain listed so the canvas extension can be enabled again."),
				localize('copilotCanvases.help.actions', "Single-click a Canvas child to select it. To open an enabled Canvas, use Open Canvas in More Actions, double-click, or press Enter. Use More Actions on a canvas extension to open its source or plugin and change enablement. Show Plugin opens the owning plugin's details; use Back to return to Canvases."),
			].join('\n\n') : content!,
			() => DOM.isHTMLElement(focused) && focused.isConnected ? focused.focus() : editor.focus(),
			AccessibilityVerbositySettingId.CustomizationDiscovery,
		);
	}
}

AccessibleViewRegistry.register(new CopilotCanvasesAccessibility(AccessibleViewType.Help));
AccessibleViewRegistry.register(new CopilotCanvasesAccessibility(AccessibleViewType.View));
