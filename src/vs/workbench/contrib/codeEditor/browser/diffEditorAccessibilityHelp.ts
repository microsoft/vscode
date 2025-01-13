/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { AccessibleDiffViewerNext, AccessibleDiffViewerPrev } from '../../../../editor/browser/widget/diffEditor/commands.js';
import { DiffEditorWidget } from '../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { localize } from '../../../../nls.js';
import { AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplentation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyEqualsExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { getCommentCommandInfo } from '../../accessibility/browser/editorAccessibilityHelp.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

export class DiffEditorAccessibilityHelp implements IAccessibleViewImplentation {
	readonly priority = 105;
	readonly name = 'diff-editor';
	readonly when = ContextKeyEqualsExpr.create('isInDiffEditor', true);
	readonly type = AccessibleViewType.Help;
	getProvider(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const codeEditorService = accessor.get(ICodeEditorService);
		const keybindingService = accessor.get(IKeybindingService);
		const contextKeyService = accessor.get(IContextKeyService);

		if (!(editorService.activeTextEditorControl instanceof DiffEditorWidget)) {
			return;
		}

		const codeEditor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
		if (!codeEditor) {
			return;
		}

		const switchSides = localize('msg3', "Run the command Diff Editor: Switch Side{0} to toggle between the original and modified editors.", '<keybinding:diffEditor.switchSide>');
		const diffEditorActiveAnnouncement = localize('msg5', "The setting, accessibility.verbosity.diffEditorActive, controls if a diff editor announcement is made when it becomes the active editor.");

		const keys = ['accessibility.signals.diffLineDeleted', 'accessibility.signals.diffLineInserted', 'accessibility.signals.diffLineModified'];
		const content = [
			localize('msg1', "You are in a diff editor."),
			localize('msg2', "View the next{0} or previous{1} diff in diff review mode, which is optimized for screen readers.", '<keybinding:' + AccessibleDiffViewerNext.id + '>', '<keybinding:' + AccessibleDiffViewerPrev.id + '>'),
			switchSides,
			diffEditorActiveAnnouncement,
			localize('msg4', "To control which accessibility signals should be played, the following settings can be configured: {0}.", keys.join(', ')),
		];
		const commentCommandInfo = getCommentCommandInfo(keybindingService, contextKeyService, codeEditor);
		if (commentCommandInfo) {
			content.push(commentCommandInfo);
		}
		return new AccessibleContentProvider(
			AccessibleViewProviderId.DiffEditor,
			{ type: AccessibleViewType.Help },
			() => content.join('\n'),
			() => codeEditor.focus(),
			AccessibilityVerbositySettingId.DiffEditor,
		);
	}
}
