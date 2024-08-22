/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../editor/browser/editorExtensions';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService';
import { AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView';
import { IAccessibleViewImplentation } from '../../../../platform/accessibility/browser/accessibleViewRegistry';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey';
import { getChatAccessibilityHelpProvider } from '../../chat/browser/actions/chatAccessibilityHelp';
import { CONTEXT_CHAT_INPUT_HAS_FOCUS } from '../../chat/common/chatContextKeys';
import { CTX_INLINE_CHAT_RESPONSE_FOCUSED } from '../common/inlineChat';

export class InlineChatAccessibilityHelp implements IAccessibleViewImplentation {
	readonly priority = 106;
	readonly name = 'inlineChat';
	readonly type = AccessibleViewType.Help;
	readonly when = ContextKeyExpr.or(CTX_INLINE_CHAT_RESPONSE_FOCUSED, CONTEXT_CHAT_INPUT_HAS_FOCUS);
	getProvider(accessor: ServicesAccessor) {
		const codeEditor = accessor.get(ICodeEditorService).getActiveCodeEditor() || accessor.get(ICodeEditorService).getFocusedCodeEditor();
		if (!codeEditor) {
			return;
		}
		return getChatAccessibilityHelpProvider(accessor, codeEditor, 'inlineChat');
	}
}
