/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { AccessibilityVerbositySettingId, AccessibleViewProviderId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { AccessibleViewType, IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { AccessibleViewAction } from 'vs/workbench/contrib/accessibility/browser/accessibleViewActions';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalChatContextKeys } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChat';
import { TerminalChatController } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatController';

export class TerminalInlineChatAccessibleViewContribution extends Disposable {
	static ID: 'terminalInlineChatAccessibleViewContribution';
	constructor() {
		super();
		this._register(AccessibleViewAction.addImplementation(105, 'terminalInlineChat', accessor => {
			const accessibleViewService = accessor.get(IAccessibleViewService);
			const terminalService = accessor.get(ITerminalService);
			const controller: TerminalChatController | undefined = terminalService.activeInstance?.getContribution(TerminalChatController.ID) ?? undefined;
			if (!controller?.lastResponseContent) {
				return false;
			}
			const responseContent = controller.lastResponseContent;
			accessibleViewService.show({
				id: AccessibleViewProviderId.TerminalChat,
				verbositySettingKey: AccessibilityVerbositySettingId.InlineChat,
				provideContent(): string { return responseContent; },
				onClose() {
					controller.focus();
				},
				options: { type: AccessibleViewType.View }
			});
			return true;
		}, TerminalChatContextKeys.focused));
	}
}
