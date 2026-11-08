/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { InputBox } from '../../../../../../../base/browser/ui/inputbox/inputBox.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { defaultInputBoxStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { IChatToolInvocation } from '../../../../common/chatService/chatService.js';
import { IToolConfirmationFeedback } from '../../../../common/tools/languageModelToolsService.js';

let descriptionIdPool = 0;

/**
 * Renders the optional feedback field of a confirmation. The draft is kept on the live
 * invocation rather than in the confirmation reason, so every way of answering sends it,
 * a re-render keeps it, and it is never persisted with the chat.
 */
export function renderToolConfirmationFeedback(store: DisposableStore, toolInvocation: IChatToolInvocation, feedback: IToolConfirmationFeedback): HTMLElement {
	const container = dom.$('.chat-confirmation-feedback');
	// The input is named by the same text, so the visible label is not announced twice.
	dom.append(container, dom.$('.chat-confirmation-feedback-label', { 'aria-hidden': 'true' }, feedback.label));
	const inputBox = store.add(new InputBox(container, undefined, {
		ariaLabel: feedback.label,
		placeholder: feedback.placeholder,
		inputBoxStyles: defaultInputBoxStyles,
	}));
	inputBox.value = toolInvocation.confirmationFeedback ?? '';
	store.add(inputBox.onDidChange(value => {
		toolInvocation.confirmationFeedback = value;
	}));
	if (feedback.description) {
		const description = dom.append(container, dom.$('.chat-confirmation-feedback-description', { id: `chat-confirmation-feedback-description-${descriptionIdPool++}` }, feedback.description));
		inputBox.inputElement.setAttribute('aria-describedby', description.id);
	}
	return container;
}
