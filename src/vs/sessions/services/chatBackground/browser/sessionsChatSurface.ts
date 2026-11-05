/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { triggerConfettiAnimation } from '../../../../base/browser/ui/animations/animations.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { SessionsChatBackgroundRenderer } from './chatBackgroundRenderer.js';
import { ISessionsChatBackgroundService } from './chatBackgroundService.js';

/**
 * The class of an element that shows chats over the chat background, such as the Sessions part. Its `.content` child
 * shows above the background. The rules for it match `:is(.part.sessionspart, .sessions-chat-surface)`, which weighs as
 * much as the `.part.sessionspart` rules that the ones letting the background show through the chats override.
 */
export const SESSIONS_CHAT_SURFACE_CLASS = 'sessions-chat-surface';

type CodiconConfettiActivationEvent = {};

type CodiconConfettiActivationClassification = {
	owner: 'tyleonha';
	comment: 'Tracks how often users discover and activate the Codicon background confetti button.';
};

/**
 * Paints the chat background that the user picked behind the chats of an element, such as the Sessions part, and keeps
 * it in sync with {@link ISessionsChatBackgroundService}. Its codicons are interactive: activating one celebrates.
 */
export class SessionsChatSurface extends Disposable {

	constructor(
		element: HTMLElement,
		@ISessionsChatBackgroundService private readonly chatBackgroundService: ISessionsChatBackgroundService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		element.classList.add(SESSIONS_CHAT_SURFACE_CLASS);
		this._register(toDisposable(() => element.classList.remove(SESSIONS_CHAT_SURFACE_CLASS)));

		const renderer = this._register(new SessionsChatBackgroundRenderer(element, true));
		this._register(renderer.onDidActivateCodicon(codicon => this.activateCodicon(codicon)));
		const update = () => renderer.setBackground(this.chatBackgroundService.getBackground());
		this._register(this.chatBackgroundService.onDidChangeBackground(update));
		update();
	}

	private activateCodicon(element: HTMLElement): void {
		if (!this.accessibilityService.isMotionReduced()) {
			triggerConfettiAnimation(element);
		}
		this.accessibilityService.status(localize('sessionsChatBackground.confetti', "Confetti!"));
		this.telemetryService.publicLog2<CodiconConfettiActivationEvent, CodiconConfettiActivationClassification>('vscodeAgents.codiconBackground/confetti', {});
	}
}
