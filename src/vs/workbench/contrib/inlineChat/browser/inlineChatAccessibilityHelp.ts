/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { AccessibleViewType } from 'vs/platform/accessibility/browser/accessibleView';
import { IAccessibleViewImplentation } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { getChatAccessibilityHelpProvider } from 'vs/workbench/contrib/chat/browser/actions/chatAccessibilityHelp';
import { CTX_INLINE_CHAT_RESPONSE_FOCUSED, CTX_INLINE_CHAT_FOCUSED } from 'vs/workbench/contrib/inlineChat/common/inlineChat';

export class InlineChatAccessibilityHelp implements IAccessibleViewImplentation {
	readonly priority = 106;
	readonly name = 'inlineChat';
	readonly type = AccessibleViewType.Help;
	readonly when = ContextKeyExpr.or(CTX_INLINE_CHAT_RESPONSE_FOCUSED, CTX_INLINE_CHAT_FOCUSED);
	getProvider(accessor: ServicesAccessor) {
		const codeEditor = accessor.get(ICodeEditorService).getActiveCodeEditor() || accessor.get(ICodeEditorService).getFocusedCodeEditor();
		if (!codeEditor) {
			return;
		}
		return getChatAccessibilityHelpProvider(accessor, codeEditor, 'inlineChat');
	}
	dispose() { }
}
