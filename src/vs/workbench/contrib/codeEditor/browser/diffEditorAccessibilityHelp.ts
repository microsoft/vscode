/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { AccessibleDiffViewerNext, AccessibleDiffViewerPrev } from 'vs/editor/browser/widget/diffEditor/commands';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/diffEditorWidget';
import { localize } from 'vs/nls';
import { AccessibleViewProviderId, AccessibleViewType } from 'vs/platform/accessibility/browser/accessibleView';
import { IAccessibleViewImplentation } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { ContextKeyEqualsExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { getCommentCommandInfo } from 'vs/workbench/contrib/accessibility/browser/editorAccessibilityHelp';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

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

		const next = keybindingService.lookupKeybinding(AccessibleDiffViewerNext.id)?.getAriaLabel();
		const previous = keybindingService.lookupKeybinding(AccessibleDiffViewerPrev.id)?.getAriaLabel();
		let switchSides;
		const switchSidesKb = keybindingService.lookupKeybinding('diffEditor.switchSide')?.getAriaLabel();
		if (switchSidesKb) {
			switchSides = localize('msg3', "Run the command Diff Editor: Switch Side ({0}) to toggle between the original and modified editors.", switchSidesKb);
		} else {
			switchSides = localize('switchSidesNoKb', "Run the command Diff Editor: Switch Side, which is currently not triggerable via keybinding, to toggle between the original and modified editors.");
		}

		const diffEditorActiveAnnouncement = localize('msg5', "The setting, accessibility.verbosity.diffEditorActive, controls if a diff editor announcement is made when it becomes the active editor.");

		const keys = ['accessibility.signals.diffLineDeleted', 'accessibility.signals.diffLineInserted', 'accessibility.signals.diffLineModified'];
		const content = [
			localize('msg1', "You are in a diff editor."),
			localize('msg2', "View the next ({0}) or previous ({1}) diff in diff review mode, which is optimized for screen readers.", next, previous),
			switchSides,
			diffEditorActiveAnnouncement,
			localize('msg4', "To control which accessibility signals should be played, the following settings can be configured: {0}.", keys.join(', ')),
		];
		const commentCommandInfo = getCommentCommandInfo(keybindingService, contextKeyService, codeEditor);
		if (commentCommandInfo) {
			content.push(commentCommandInfo);
		}
		return {
			id: AccessibleViewProviderId.DiffEditor,
			verbositySettingKey: AccessibilityVerbositySettingId.DiffEditor,
			provideContent: () => content.join('\n\n'),
			onClose: () => {
				codeEditor.focus();
			},
			options: { type: AccessibleViewType.Help }
		};
	}
}
