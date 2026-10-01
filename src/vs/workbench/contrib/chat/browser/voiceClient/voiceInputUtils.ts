/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatResponseModel } from '../../common/model/chatModel.js';
import { IChatWidget } from '../chat.js';

/** Submit through the owning widget, preserving its input state and normal request options. */
export function acceptVoiceInput(widget: IChatWidget | undefined, text: string, isVoiceModeInput: boolean): boolean | Promise<IChatResponseModel | undefined> {
	if (!text || !widget?.viewModel) {
		return false;
	}
	if (widget.viewModel.editing) {
		widget.input.setValue(text, false);
		return true;
	}
	return widget.acceptInput(combineVoiceInput(widget.getInput(), text), { preserveFocus: true, isVoiceModeInput });
}

/**
 * Combine any text already typed into a chat input with a voice transcript so
 * the typed text is not dropped when voice mode submits the request.
 *
 * The transcript is appended after the existing text, inserting a single space
 * separator only when the existing text does not already end in whitespace.
 *
 * @param existing The text currently in the chat input editor.
 * @param transcript The recognized voice transcript to submit.
 */
export function combineVoiceInput(existing: string, transcript: string): string {
	if (!existing) {
		return transcript;
	}
	if (!transcript) {
		return existing;
	}
	return /\s$/.test(existing) ? `${existing}${transcript}` : `${existing} ${transcript}`;
}
