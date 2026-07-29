/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { IObservable, constObservable, observableFromEvent } from '../../../../../base/common/observable.js';
import { ChatWidget } from '../widget/chatWidget.js';

/**
 * Observes whether a chat widget's input currently has user content, i.e. the
 * user has typed text or attached context. Voice mode uses this to keep the
 * input open (and its transcript overlay suppressed) so the user can still see
 * and edit their prompt while voice is active.
 */
export function observeChatWidgetHasInputContent(owner: object, widget: ChatWidget): IObservable<boolean> {
	const inputEditor = widget.inputPart.inputEditor;
	if (!inputEditor) {
		return constObservable(false);
	}
	const attachmentModel = widget.attachmentModel;
	return observableFromEvent(owner,
		Event.any(inputEditor.onDidChangeModelContent, attachmentModel.onDidChange),
		() => widget.getInput().trim().length > 0 || attachmentModel.attachments.length > 0
	);
}
