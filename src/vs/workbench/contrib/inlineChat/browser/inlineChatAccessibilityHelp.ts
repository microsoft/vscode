/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplentation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { getChatAccessibilityHelpProvider } from '../../chat/browser/actions/chatAccessibilityHelp.js';
import { ChatContextKeys } from '../../chat/common/chatContextKeys.js';
import { CTX_INLINE_CHAT_RESPONSE_FOCUSED } from '../common/inlineChat.js';

export class InlineChatAccessibilityHelp implements IAccessibleViewImplentation {
	readonly priority = 106;
	readonly name = 'inlineChat';
	readonly type = AccessibleViewType.Help;
	readonly when = ContextKeyExpr.or(CTX_INLINE_CHAT_RESPONSE_FOCUSED, ChatContextKeys.inputHasFocus);
	getProvider(accessor: ServicesAccessor) {
		const codeEditor = accessor.get(ICodeEditorService).getActiveCodeEditor() || accessor.get(ICodeEditorService).getFocusedCodeEditor();
		if (!codeEditor) {
			return;
		}
		return getChatAccessibilityHelpProvider(accessor, codeEditor, 'inlineChat');
	}
}
