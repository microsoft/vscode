/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED } from '../../webview/browser/webview.js';
import { CONTEXT_ACTIVE_WEBVIEW_PANEL_ID } from '../../webviewPanel/browser/webviewEditor.js';
import { WebviewInput } from '../../webviewPanel/browser/webviewEditorInput.js';

export class ReleaseNotesAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 100;
	readonly name = 'releaseNotes';
	readonly type = AccessibleViewType.Help;
	readonly when = ContextKeyExpr.and(CONTEXT_ACTIVE_WEBVIEW_PANEL_ID.isEqualTo('releaseNotes'), KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED.toNegated());

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editorService = accessor.get(IEditorService);
		const input = editorService.activeEditor;
		if (!(input instanceof WebviewInput) || input.viewType !== 'releaseNotes' || !input.webview.isFocused) {
			return undefined;
		}
		return new AccessibleContentProvider(
			AccessibleViewProviderId.ReleaseNotes,
			{ type: AccessibleViewType.Help },
			() => [
				localize('releaseNotes.help.overview', "You are in the release notes. Use your screen reader's reading and heading navigation commands to explore the document and its table of contents."),
				localize('releaseNotes.help.navigation', "Press Tab or Shift+Tab to move between links, settings, the update preference checkbox, and available setup actions. Press Enter to activate a link. Press Space or Enter to activate a setup button."),
				localize('releaseNotes.help.tryouts', "Try This links open locally registered feature examples. Reading, hovering, or focusing a link does not run it. If an example is unavailable, its explanation and any available setup action appear beside it. Setup does not automatically run the example."),
				localize('releaseNotes.help.windows', "Some actions open another editor or window, including the Agents window. Chat examples prepare an input for you to review and do not send it automatically."),
				localize('releaseNotes.help.find', "Use {0} to find text in the release notes. The Find input has its own accessibility help.", '<keybinding:editor.action.webvieweditor.showFind>'),
				localize('releaseNotes.help.close', "Press Escape to close this help and return focus to the release notes."),
			].join('\n\n'),
			() => {
				if (!input.isDisposed() && editorService.activeEditor === input) {
					input.webview.focus();
				}
			},
			AccessibilityVerbositySettingId.ReleaseNotes,
		);
	}
}
