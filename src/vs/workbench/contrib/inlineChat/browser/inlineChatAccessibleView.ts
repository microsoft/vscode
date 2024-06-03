/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_RESPONSE_FOCUSED } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { AccessibleViewProviderId, AccessibleViewType } from 'vs/platform/accessibility/browser/accessibleView';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IAccessibleViewImplentation } from 'vs/platform/accessibility/browser/accessibleViewRegistry';

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
		return {
			id: AccessibleViewProviderId.InlineChat,
			verbositySettingKey: AccessibilityVerbositySettingId.InlineChat,
			provideContent(): string { return responseContent; },
			onClose() {
				controller.focus();
			},
			options: { type: AccessibleViewType.View }
		};
	}
	dispose() { }
}
