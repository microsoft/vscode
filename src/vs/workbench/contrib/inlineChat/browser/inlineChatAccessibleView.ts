/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_RESPONSE_FOCUSED } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { AccessibleViewType, IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { AccessibleViewAction } from 'vs/workbench/contrib/accessibility/browser/accessibleViewActions';

export class InlineChatAccessibleViewContribution extends Disposable {
	static ID: 'inlineChatAccessibleViewContribution';
	constructor() {
		super();
		this._register(AccessibleViewAction.addImplementation(100, 'inlineChat', accessor => {
			const accessibleViewService = accessor.get(IAccessibleViewService);
			const codeEditorService = accessor.get(ICodeEditorService);

			const editor = (codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor());
			if (!editor) {
				return false;
			}
			const controller = InlineChatController.get(editor);
			if (!controller) {
				return false;
			}
			const responseContent = controller?.getMessage();
			if (!responseContent) {
				return false;
			}
			accessibleViewService.show({
				verbositySettingKey: AccessibilityVerbositySettingId.InlineChat,
				provideContent(): string { return responseContent; },
				onClose() {
					controller.focus();
				},

				options: { type: AccessibleViewType.View }
			});
			return true;
		}, ContextKeyExpr.or(CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_RESPONSE_FOCUSED)));
	}
}
