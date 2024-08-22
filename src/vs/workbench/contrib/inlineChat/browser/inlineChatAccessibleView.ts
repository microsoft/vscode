/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InlineChatController } from './inlineChatController';
import { CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_RESPONSE_FOCUSED } from '../common/inlineChat';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey';
import { AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider } from '../../../../platform/accessibility/browser/accessibleView';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation';
import { IAccessibleViewImplentation } from '../../../../platform/accessibility/browser/accessibleViewRegistry';
import { MarkdownString } from '../../../../base/common/htmlContent';
import { renderMarkdownAsPlaintext } from '../../../../base/browser/markdownRenderer';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration';

export class InlineChatAccessibleView implements IAccessibleViewImplentation {
	readonly priority = 100;
	readonly name = 'inlineChat';
	readonly when = ContextKeyExpr.or(CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_RESPONSE_FOCUSED);
	readonly type = AccessibleViewType.View;
	getProvider(accessor: ServicesAccessor) {
		const codeEditorService = accessor.get(ICodeEditorService);

		const editor = (codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor());
		if (!editor) {
			return;
		}
		const controller = InlineChatController.get(editor);
		if (!controller) {
			return;
		}
		const responseContent = controller?.getMessage();
		if (!responseContent) {
			return;
		}
		return new AccessibleContentProvider(
			AccessibleViewProviderId.InlineChat,
			{ type: AccessibleViewType.View },
			() => renderMarkdownAsPlaintext(new MarkdownString(responseContent), true),
			() => controller.focus(),
			AccessibilityVerbositySettingId.InlineChat
		);
	}
}
