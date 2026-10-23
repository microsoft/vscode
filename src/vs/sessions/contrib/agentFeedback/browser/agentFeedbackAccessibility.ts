/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { AgentFeedbackEditorWidget } from './agentFeedbackEditorWidget.js';

export class AgentFeedbackAccessibility implements IAccessibleViewImplementation {
	readonly priority = 120;
	readonly when = ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled);
	readonly name: string;

	constructor(readonly type: AccessibleViewType) {
		this.name = type === AccessibleViewType.Help ? 'sessionCommentsHelp' : 'sessionComments';
	}

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const focused = getActiveElement();
		const widget = isHTMLElement(focused) ? AgentFeedbackEditorWidget.getForElement(focused) : undefined;
		if (!widget || !isHTMLElement(focused)) {
			return undefined;
		}
		const editor = accessor.get(ICodeEditorService).getActiveCodeEditor();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.Comments,
			{ type: this.type },
			() => this.type === AccessibleViewType.Help ? [
				localize('sessionComments.overview', "You are in session comments. Use Tab and Shift+Tab to move between the expand button and comment actions. Use the arrow keys within an action bar and Enter or Space to activate an action."),
				localize('sessionComments.navigation', "Use Go to Next Feedback Comment and Go to Previous Feedback Comment to navigate comments across files. File-level comments are shown at the start of the file."),
				localize('sessionComments.native', "Native session comments support editing the opening entry, adding a reply, resolving or reopening the thread, and deleting the thread. These actions update the agent host only; they do not submit feedback to an agent or publish changes to GitHub. Resolved native comments remain available so they can be reopened. Actions are disabled while comments are unavailable."),
				localize('sessionComments.editing', "In an edit or reply input, press Enter to save, Shift+Enter for a new line, or Escape to cancel. If saving fails, your draft remains available to retry."),
				localize('sessionComments.view', "Open Accessible View to read the comments and replies as text{0}. Close the view to return to the comments.", '<keybinding:editor.action.accessibleView>'),
			].join('\n') : widget.getAccessibleContent(),
			() => focused.isConnected ? focused.focus() : editor?.focus(),
			AccessibilityVerbositySettingId.Comments,
		);
	}
}
