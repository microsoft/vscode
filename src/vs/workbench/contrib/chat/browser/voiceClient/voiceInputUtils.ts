/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatResponseModel } from '../../common/model/chatModel.js';
import { IChatWidget } from '../chat.js';
import { ChatRequestQueueKind } from '../../common/chatService/chatService.js';
import { isAncestorOfActiveElement } from '../../../../../base/browser/dom.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IVoiceSessionController } from './voiceSessionController.js';

/**
 * An explicit input wins over focus and never falls back to another chat; only
 * context-free invocations consult the host's current session. Returns `false`
 * when the explicit input cannot take Voice Mode.
 */
export async function retargetVoiceToInput(widget: IChatWidget | undefined, commandService: ICommandService, controller: IVoiceSessionController): Promise<boolean> {
	let resource = widget?.resolveVoiceTarget();
	if (!widget) {
		const currentSession = await commandService.executeCommand<string | undefined>('_chat.voice.getCurrentSession');
		resource = currentSession ? URI.parse(currentSession) : undefined;
	}
	if (!resource) {
		return !widget;
	}
	if (resource.scheme === 'sessions-voice') {
		controller.setDraftTarget();
	} else {
		controller.setTargetSession(resource);
		controller.activateSession(resource);
	}
	return true;
}

/**
 * Toolbar items keep focus where it was on mousedown, so clicking another input's
 * microphone or Voice Mode button would leave focus behind. Move it into that input,
 * where capture and its first-run card go; keyboard activation is already inside it.
 */
export function focusChatInputIfElsewhere(widget: IChatWidget): void {
	if (!isAncestorOfActiveElement(widget.input.element)) {
		widget.focusInput();
	}
}

/** Submit through the owning widget, preserving its input state and normal request options. */
export function acceptVoiceInput(widget: IChatWidget | undefined, text: string, isVoiceModeInput: boolean): boolean | Promise<IChatResponseModel | undefined> {
	const viewModel = widget?.viewModel;
	if (!text || !widget || !viewModel) {
		return false;
	}
	if (viewModel.editing) {
		widget.input.setValue(text, false);
		return false;
	}
	return widget.acceptInput(combineVoiceInput(widget.getInput(), text), {
		preserveFocus: true,
		isVoiceModeInput,
		...(viewModel.model?.requestInProgress?.get() === true ? { queue: ChatRequestQueueKind.Steering } : {}),
	});
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
