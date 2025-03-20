/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyEqualsExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { getCommentCommandInfo } from '../../accessibility/browser/editorAccessibilityHelp.js';
import { MergeEditor } from './view/mergeEditor.js';

export class MergeEditorAccessibilityHelpProvider implements IAccessibleViewImplementation {
	readonly name = 'mergeEditor';
	readonly type = AccessibleViewType.Help;
	readonly priority = 105;
	readonly when = ContextKeyEqualsExpr.create('isMergeEditor', true);
	getProvider(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const codeEditorService = accessor.get(ICodeEditorService);
		const keybindingService = accessor.get(IKeybindingService);
		const contextKeyService = accessor.get(IContextKeyService);

		if (!(editorService.activeTextEditorControl instanceof MergeEditor)) {
			return;
		}

		const codeEditor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
		if (!codeEditor) {
			return;
		}

		const content = [
			localize('msg1', "You are in a merge editor."),
			localize('msg2', "Navigate between merge conflicts using the commands Go to Next Unhandled Conflict and Go to Previous Unhandled Conflict."),
			localize('msg3', "Run the command Merge Editor: Accept Merge to accept the current conflict."),
		];
		const commentCommandInfo = getCommentCommandInfo(keybindingService, contextKeyService, codeEditor);
		if (commentCommandInfo) {
			content.push(commentCommandInfo);
		}
		return new AccessibleContentProvider(
			AccessibleViewProviderId.MergeEditor,
			{ type: AccessibleViewType.Help },
			() => content.join('\n'),
			() => codeEditor.focus(),
			AccessibilityVerbositySettingId.MergeEditor,
		);
	}
}
