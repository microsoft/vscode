/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AriaRole } from '../../../../base/browser/ui/aria/aria.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { marked } from '../../../../base/common/marked/marked.js';
import { localize } from '../../../../nls.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { IAccessibleViewService } from '../../../../platform/accessibility/browser/accessibleView.js';
import { ChatTreeItem } from './chat.js';
import { isRequestVM, isResponseVM, isWelcomeVM, IChatResponseViewModel } from '../common/chatViewModel.js';

export class ChatAccessibilityProvider implements IListAccessibilityProvider<ChatTreeItem> {

	constructor(
		@IAccessibleViewService private readonly _accessibleViewService: IAccessibleViewService
	) {

	}
	getWidgetRole(): AriaRole {
		return 'list';
	}

	getRole(element: ChatTreeItem): AriaRole | undefined {
		return 'listitem';
	}

	getWidgetAriaLabel(): string {
		return localize('chat', "Chat");
	}

	getAriaLabel(element: ChatTreeItem): string {
		if (isRequestVM(element)) {
			return element.messageText;
		}

		if (isResponseVM(element)) {
			return this._getLabelWithCodeBlockCount(element);
		}

		if (isWelcomeVM(element)) {
			return element.content.map(c => 'value' in c ? c.value : c.map(followup => followup.message).join('\n')).join('\n');
		}

		return '';
	}

	private _getLabelWithCodeBlockCount(element: IChatResponseViewModel): string {
		const accessibleViewHint = this._accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.Chat);
		let label: string = '';
		const fileTreeCount = element.response.value.filter((v) => !('value' in v))?.length ?? 0;
		let fileTreeCountHint = '';
		switch (fileTreeCount) {
			case 0:
				break;
			case 1:
				fileTreeCountHint = localize('singleFileTreeHint', "1 file tree");
				break;
			default:
				fileTreeCountHint = localize('multiFileTreeHint', "{0} file trees", fileTreeCount);
				break;
		}
		const codeBlockCount = marked.lexer(element.response.toString()).filter(token => token.type === 'code')?.length ?? 0;
		switch (codeBlockCount) {
			case 0:
				label = accessibleViewHint ? localize('noCodeBlocksHint', "{0} {1} {2}", fileTreeCountHint, element.response.toString(), accessibleViewHint) : localize('noCodeBlocks', "{0} {1}", fileTreeCountHint, element.response.toString());
				break;
			case 1:
				label = accessibleViewHint ? localize('singleCodeBlockHint', "{0} 1 code block: {1} {2}", fileTreeCountHint, element.response.toString(), accessibleViewHint) : localize('singleCodeBlock', "{0} 1 code block: {1}", fileTreeCountHint, element.response.toString());
				break;
			default:
				label = accessibleViewHint ? localize('multiCodeBlockHint', "{0} {1} code blocks: {2}", fileTreeCountHint, codeBlockCount, element.response.toString(), accessibleViewHint) : localize('multiCodeBlock', "{0} {1} code blocks", fileTreeCountHint, codeBlockCount, element.response.toString());
				break;
		}
		return label;
	}
}
