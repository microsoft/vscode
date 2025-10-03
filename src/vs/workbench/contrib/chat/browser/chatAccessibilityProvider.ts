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
import { isRequestVM, isResponseVM, IChatResponseViewModel } from '../common/chatViewModel.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { AcceptToolConfirmationActionId } from './actions/chatToolActions.js';
import { CancelChatActionId } from './actions/chatExecuteActions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatToolInvocation } from '../common/chatService.js';
import { migrateLegacyTerminalToolSpecificData } from '../common/chat.js';

export const getToolConfirmationAlert = (accessor: ServicesAccessor, toolInvocation: IChatToolInvocation[]) => {
	const keybindingService = accessor.get(IKeybindingService);
	const contextKeyService = accessor.get(IContextKeyService);

	const acceptKb = keybindingService.lookupKeybinding(AcceptToolConfirmationActionId, contextKeyService)?.getAriaLabel();
	const cancelKb = keybindingService.lookupKeybinding(CancelChatActionId, contextKeyService)?.getAriaLabel();
	const titles: string[] = toolInvocation.filter(t => t.confirmationMessages?.title).map(v => {
		let input = '';
		if (v.toolSpecificData) {
			if (v.toolSpecificData.kind === 'terminal') {
				const terminalData = migrateLegacyTerminalToolSpecificData(v.toolSpecificData);
				input = terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
			} else if (v.toolSpecificData.kind === 'extensions') {
				input = JSON.stringify(v.toolSpecificData.extensions);
			} else if (v.toolSpecificData.kind === 'input') {
				input = JSON.stringify(v.toolSpecificData.rawInput);
			}
		}
		const titleObj = v.confirmationMessages?.title;
		const title = typeof titleObj === 'string' ? titleObj : titleObj?.value || '';
		return (title + (input ? ': ' + input : '')).trim();
	}).filter(v => !!v);

	return acceptKb && cancelKb
		? localize('toolInvocationsHintKb', "Chat confirmation required: {0}. Press {1} to accept or {2} to cancel.", titles.join(', '), acceptKb, cancelKb)
		: localize('toolInvocationsHint', "Chat confirmation required: {0}", titles.join(', '));
};

export class ChatAccessibilityProvider implements IListAccessibilityProvider<ChatTreeItem> {

	constructor(
		@IAccessibleViewService private readonly _accessibleViewService: IAccessibleViewService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
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
			return this._getLabelWithInfo(element);
		}

		return '';
	}

	private _getLabelWithInfo(element: IChatResponseViewModel): string {
		const accessibleViewHint = this._accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.Chat);
		let label: string = '';

		const toolInvocation = element.response.value.filter(v => v.kind === 'toolInvocation');
		let toolInvocationHint = '';
		if (toolInvocation.length) {
			const waitingForConfirmation = toolInvocation.filter(v => !v.isComplete);
			if (waitingForConfirmation.length) {
				toolInvocationHint = this._instantiationService.invokeFunction(getToolConfirmationAlert, toolInvocation);
			}
		}
		const tableCount = marked.lexer(element.response.toString()).filter(token => token.type === 'table')?.length ?? 0;
		let tableCountHint = '';
		switch (tableCount) {
			case 0:
				break;
			case 1:
				tableCountHint = localize('singleTableHint', "1 table ");
				break;
			default:
				tableCountHint = localize('multiTableHint', "{0} tables ", tableCount);
				break;
		}

		const fileTreeCount = element.response.value.filter(v => v.kind === 'treeData').length ?? 0;
		let fileTreeCountHint = '';
		switch (fileTreeCount) {
			case 0:
				break;
			case 1:
				fileTreeCountHint = localize('singleFileTreeHint', "1 file tree ");
				break;
			default:
				fileTreeCountHint = localize('multiFileTreeHint', "{0} file trees ", fileTreeCount);
				break;
		}

		const elicitationCount = element.response.value.filter(v => v.kind === 'elicitation');
		let elicitationHint = '';
		for (const elicitation of elicitationCount) {
			const title = typeof elicitation.title === 'string' ? elicitation.title : elicitation.title.value;
			const message = typeof elicitation.message === 'string' ? elicitation.message : elicitation.message.value;
			elicitationHint += title + ' ' + message;
		}

		const codeBlockCount = marked.lexer(element.response.toString()).filter(token => token.type === 'code')?.length ?? 0;
		switch (codeBlockCount) {
			case 0:
				label = accessibleViewHint
					? localize('noCodeBlocksHint', "{0}{1}{2}{3}{4} {5}", toolInvocationHint, fileTreeCountHint, elicitationHint, tableCountHint, element.response.toString(), accessibleViewHint)
					: localize('noCodeBlocks', "{0}{1}{2} {3}", fileTreeCountHint, elicitationHint, tableCountHint, element.response.toString());
				break;
			case 1:
				label = accessibleViewHint
					? localize('singleCodeBlockHint', "{0}{1}{2}1 code block: {3} {4}{5}", toolInvocationHint, fileTreeCountHint, elicitationHint, tableCountHint, element.response.toString(), accessibleViewHint)
					: localize('singleCodeBlock', "{0}{1}1 code block: {2} {3}", fileTreeCountHint, elicitationHint, tableCountHint, element.response.toString());
				break;
			default:
				label = accessibleViewHint
					? localize('multiCodeBlockHint', "{0}{1}{2}{3} code blocks: {4}{5} {6}", toolInvocationHint, fileTreeCountHint, elicitationHint, tableCountHint, codeBlockCount, element.response.toString(), accessibleViewHint)
					: localize('multiCodeBlock', "{0}{1}{2} code blocks: {3} {4}", fileTreeCountHint, elicitationHint, codeBlockCount, tableCountHint, element.response.toString());
				break;
		}
		return label;
	}
}
