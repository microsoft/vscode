/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatPet.css';
import * as dom from '../../../../../base/browser/dom.js';
import { GlobalPointerMoveMonitor } from '../../../../../base/browser/globalPointerMoveMonitor.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { autorun, IObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import product from '../../../../../platform/product/common/product.js';
import { IChatModel } from '../../common/model/chatModel.js';
import { IChatPetService } from '../chatPetService.js';

export type ChatPetState = 'idle' | 'sleep' | 'processing' | 'complete' | 'love' | 'clapping' | 'jump' | 'yapping' | 'yappingMouthOpen';
export type ChatPetClickInteraction = Extract<ChatPetState, 'love' | 'jump' | 'yapping'>;

const IDLE_SLEEP_DELAY = 60_000;
const TRANSIENT_STATE_DURATION = 2_000;
const COMPLETE_STATE_DURATION = 2_140;
const LOVE_STATE_DURATION = 2_940;
const DRAG_THRESHOLD = 2;
const KEYBOARD_MOVE_DISTANCE = 8;

export function getChatPetBuddyName(quality: string | undefined): 'buddy-idle-stable' | 'buddy-idle-insiders' {
	return quality === 'stable' ? 'buddy-idle-stable' : 'buddy-idle-insiders';
}

let spriteSources: Record<ChatPetState, { animated: string; reducedMotion: string }> | undefined;

export function doesChatPetStateTrackCursor(state: ChatPetState | undefined): boolean {
	return state !== undefined && state !== 'complete' && state !== 'love' && state !== 'yappingMouthOpen';
}

export function getChatPetSpriteName(state: ChatPetState, quality: string | undefined): string {
	const variant = quality === 'stable' ? 'stable' : 'insiders';
	switch (state) {
		case 'love':
			return `buddy-love-${variant}`;
		case 'clapping':
			return `buddy-clapping-${variant}`;
		case 'yappingMouthOpen':
			return `buddy-yapping-${variant}`;
		default:
			return getChatPetBuddyName(quality);
	}
}

// TODO @justschen: convert resources to spritesheet instead of gif
function createSpriteSources(name: string, tracksCursor = true): { animated: string; reducedMotion: string } {
	const root = 'vs/workbench/contrib/chat/browser/widget/media/chatPet';
	const suffix = tracksCursor ? '-tracking-96' : '-96';
	return {
		animated: FileAccess.asBrowserUri(`${root}/${name}${suffix}.gif`).toString(true),
		reducedMotion: FileAccess.asBrowserUri(`${root}/${name}${suffix}.png`).toString(true),
	};
}

function getSpriteSources(): Record<ChatPetState, { animated: string; reducedMotion: string }> {
	if (!spriteSources) {
		const createStateSpriteSources = (state: ChatPetState) => createSpriteSources(getChatPetSpriteName(state, product.quality), doesChatPetStateTrackCursor(state));
		spriteSources = {
			idle: createStateSpriteSources('idle'),
			sleep: createStateSpriteSources('sleep'),
			processing: createStateSpriteSources('processing'),
			complete: createStateSpriteSources('complete'),
			love: createStateSpriteSources('love'),
			clapping: createStateSpriteSources('clapping'),
			jump: createStateSpriteSources('jump'),
			yapping: createStateSpriteSources('yapping'),
			yappingMouthOpen: createStateSpriteSources('yappingMouthOpen'),
		};
	}

	return spriteSources;
}

export function isChatPetImageSource(image: Pick<HTMLImageElement, 'getAttribute'>, source: string): boolean {
	return image.getAttribute('src') === source;
}

export function getChatPetBaseState(hasActiveRequest: boolean, needsInput: boolean, idleExpired: boolean): ChatPetState {
	if (needsInput) {
		return 'clapping';
	}
	if (hasActiveRequest) {
		return 'processing';
	}
	return idleExpired ? 'sleep' : 'idle';
}

function getTransientStateDuration(state: ChatPetState): number {
	switch (state) {
		case 'complete':
			return COMPLETE_STATE_DURATION;
		case 'love':
			return LOVE_STATE_DURATION;
		default:
			return TRANSIENT_STATE_DURATION;
	}
}

export function getChatPetClickInteraction(random: number, previousInteraction?: ChatPetClickInteraction): ChatPetClickInteraction {
	const interactions: readonly ChatPetClickInteraction[] = ['love', 'jump', 'yapping'];
	const availableInteractions = interactions.filter(interaction => interaction !== previousInteraction);
	return availableInteractions[Math.min(Math.floor(random * availableInteractions.length), availableInteractions.length - 1)];
}

export function getChatPetGazeDirection(cursorX: number, cursorY: number, petCenterX: number, petCenterY: number): readonly [number, number] {
	const deltaX = cursorX - petCenterX;
	const deltaY = cursorY - petCenterY;
	const distance = Math.hypot(deltaX, deltaY);
	if (distance === 0) {
		return [0, 0];
	}

	return [
		Math.round(deltaX / distance),
		Math.round(deltaY / distance),
	];
}

export function getChatPetHorizontalPosition(left: number, minimumLeft: number, maximumLeft: number): number {
	return Math.max(minimumLeft, Math.min(Math.max(minimumLeft, maximumLeft), left));
}

export class ChatPetWidget extends Disposable {

	private readonly _button: Button;
	private readonly _images: readonly HTMLImageElement[];
	private readonly _eyes: HTMLElement;
	private readonly _pupils: HTMLElement[] = [];
	private readonly _gazeScheduler: dom.AnimationFrameScheduler;
	private readonly _dragMonitor = this._register(new GlobalPointerMoveMonitor());
	private readonly _idleExpired = observableValue(this, false);
	private readonly _transientState = observableValue<ChatPetState | undefined>(this, undefined);
	private readonly _idleScheduler = this._register(new RunOnceScheduler(() => this._idleExpired.set(true, undefined), IDLE_SLEEP_DELAY));
	private readonly _transientScheduler = this._register(new RunOnceScheduler(() => this._transientState.set(undefined, undefined), TRANSIENT_STATE_DURATION));
	private readonly _clickSuppressionScheduler = this._register(new RunOnceScheduler(() => this._suppressNextPointerClick = false, 0));
	private _cursorPosition: readonly [number, number] | undefined;
	private _activeImage: HTMLImageElement | undefined;
	private _pendingImage: HTMLImageElement | undefined;
	private _pendingSource: string | undefined;
	private _pendingState: ChatPetState | undefined;
	private _renderedState: ChatPetState | undefined;
	private _motionReduced = false;
	private _enabled = false;
	private _enablementInitialized = false;
	private _hasCustomPosition = false;
	private _suppressNextPointerClick = false;
	private _lastClickInteraction: ChatPetClickInteraction | undefined;

	constructor(
		private readonly parent: HTMLElement,
		private readonly dragBounds: HTMLElement,
		model: IObservable<IChatModel | undefined>,
		@IChatPetService private readonly chatPetService: IChatPetService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
	) {
		super();

		this.parent.classList.add('chat-pet-host');
		this._button = this._register(new Button(this.parent, {
			ariaLabel: localize('chatPet.interact', "Interact with the VS Code pet"),
		}));
		this._button.element.classList.add('chat-pet-button');
		const resizeObserver = this._register(new dom.DisposableResizeObserver('ChatPetWidget.dragBounds', () => {
			if (this._hasCustomPosition) {
				this._setHorizontalPosition(this._getCurrentLeft());
			}
		}, dom.getWindow(this._button.element)));
		this._register(resizeObserver.observe(this.dragBounds));
		this._images = [0, 1].map(() => {
			const image = dom.append(this._button.element, dom.$('img.chat-pet-sprite.hidden')) as HTMLImageElement;
			image.alt = '';
			image.setAttribute('aria-hidden', 'true');
			this._register(dom.addDisposableListener(image, 'load', () => this._onImageLoad(image)));
			return image;
		});
		this._eyes = dom.append(this._button.element, dom.$('.chat-pet-eyes'));
		this._eyes.setAttribute('aria-hidden', 'true');
		for (const side of ['left', 'right']) {
			const eye = dom.append(this._eyes, dom.$(`.chat-pet-eye.${side}`));
			this._pupils.push(dom.append(eye, dom.$('.chat-pet-pupil')));
		}
		const speechBubble = dom.append(this._button.element, dom.$('.chat-pet-speech-bubble'));
		speechBubble.setAttribute('aria-hidden', 'true');
		this._gazeScheduler = this._register(new dom.AnimationFrameScheduler(this._button.element, () => this._updateGaze()));
		this._register(dom.addDisposableListener(dom.getWindow(this._button.element).document, dom.EventType.POINTER_MOVE, (event: PointerEvent) => {
			this._cursorPosition = [event.clientX, event.clientY];
			if (this._enabled && doesChatPetStateTrackCursor(this._renderedState)) {
				this._gazeScheduler.schedule();
			}
		}));
		this._register(dom.addDisposableListener(this._button.element, dom.EventType.ANIMATION_END, event => {
			if (event.animationName === 'chat-pet-exit' && !this._enabled) {
				this._finishDisable();
			} else if (event.animationName === 'chat-pet-yapping-fall' && event.target === this._activeImage && this._button.element.dataset.state === 'yapping') {
				this._transientState.set('yappingMouthOpen', undefined);
			}
		}));
		this._register(dom.addDisposableListener(this._button.element, dom.EventType.POINTER_DOWN, event => this._startDrag(event)));
		this._register(dom.addDisposableListener(this._button.element, dom.EventType.KEY_DOWN, event => this._onKeyDown(event)));

		this._register(this._button.onDidClick(e => {
			dom.EventHelper.stop(e, true);
			if (this._suppressNextPointerClick && e.type !== dom.EventType.KEY_DOWN) {
				this._suppressNextPointerClick = false;
				this._clickSuppressionScheduler.cancel();
				return;
			}
			const interaction = getChatPetClickInteraction(Math.random(), this._lastClickInteraction);
			this._lastClickInteraction = interaction;
			this._showTransientState(interaction);
			switch (interaction) {
				case 'love':
					status(localize('chatPet.loved', "The VS Code pet feels loved"));
					break;
				case 'jump':
					status(localize('chatPet.jumped', "The VS Code pet jumped"));
					break;
				case 'yapping':
					status(localize('chatPet.yapping', "The VS Code pet is yapping"));
					break;
			}
		}));

		const motionReduced = observableFromEvent(this, this.accessibilityService.onDidChangeReducedMotion, () => this.accessibilityService.isMotionReduced());
		this._register(autorun(reader => {
			this._motionReduced = motionReduced.read(reader);
			const enabled = this.chatPetService.enabled.read(reader);
			const chatModel = model.read(reader);
			const request = chatModel?.lastRequestObs.read(reader);
			const needsInput = !!request?.response?.isPendingConfirmation.read(reader);
			const hasActiveRequest = chatModel?.hasActiveRequest.read(reader) ?? false;
			const idleExpired = this._idleExpired.read(reader);
			const transientState = this._transientState.read(reader);

			if (!this._enablementInitialized || enabled !== this._enabled) {
				const wasInitialized = this._enablementInitialized;
				this._enablementInitialized = true;
				this._enabled = enabled;
				if (enabled) {
					this._startEnableAnimation();
				} else if (wasInitialized) {
					this._startDisableAnimation();
				} else {
					this._finishDisable();
				}
			}

			if (!enabled) {
				this._idleScheduler.cancel();
				this._transientScheduler.cancel();
				if (transientState !== undefined) {
					this._transientState.set(undefined, undefined);
				}
				if (this._motionReduced) {
					this._finishDisable();
				}
				return;
			}

			if (hasActiveRequest || needsInput) {
				this._idleScheduler.cancel();
				if (idleExpired) {
					this._idleExpired.set(false, undefined);
				}
			} else if (!idleExpired && !this._idleScheduler.isScheduled()) {
				this._idleScheduler.schedule();
			}

			this._renderState(transientState ?? getChatPetBaseState(hasActiveRequest, needsInput, idleExpired));
		}));

		this._register(autorun(reader => {
			const chatModel = model.read(reader);
			const response = chatModel?.lastRequestObs.read(reader)?.response;
			if (!response) {
				return;
			}
			reader.store.add(response.onDidChange(e => {
				if (e.reason === 'completedRequest' && !response.isCanceled) {
					this._showTransientState('complete');
				}
			}));
		}));
	}

	private _startDrag(event: PointerEvent): void {
		if (!this._enabled || event.button !== 0) {
			return;
		}

		this._wake();
		dom.EventHelper.stop(event);
		this._button.element.focus();
		const startX = event.clientX;
		const startLeft = this._getCurrentLeft();
		let didDrag = false;

		this._dragMonitor.startMonitoring(this._button.element, event.pointerId, event.buttons, moveEvent => {
			const delta = moveEvent.clientX - startX;
			if (!didDrag && Math.abs(delta) < DRAG_THRESHOLD) {
				return;
			}

			if (!didDrag) {
				didDrag = true;
				this._button.element.classList.add('dragging');
			}
			dom.EventHelper.stop(moveEvent, true);
			this._button.element.classList.toggle('resisting', this._setHorizontalPosition(startLeft + delta));
		}, () => {
			this._button.element.classList.remove('dragging', 'resisting');
			if (didDrag) {
				this._suppressNextPointerClick = true;
				this._clickSuppressionScheduler.schedule();
			}
		});
	}

	private _onKeyDown(event: KeyboardEvent): void {
		const keyboardEvent = new StandardKeyboardEvent(event);
		let delta: number;
		let announcement: string;
		if (keyboardEvent.equals(KeyCode.LeftArrow)) {
			delta = -KEYBOARD_MOVE_DISTANCE;
			announcement = localize('chatPet.movedLeft', "VS Code pet moved left");
		} else if (keyboardEvent.equals(KeyCode.RightArrow)) {
			delta = KEYBOARD_MOVE_DISTANCE;
			announcement = localize('chatPet.movedRight', "VS Code pet moved right");
		} else {
			return;
		}

		this._wake();
		keyboardEvent.preventDefault();
		keyboardEvent.stopPropagation();
		this._setHorizontalPosition(this._getCurrentLeft() + delta);
		status(announcement);
	}

	private _getCurrentLeft(): number {
		return this._button.element.offsetLeft;
	}

	private _setHorizontalPosition(left: number): boolean {
		const parentBounds = this.parent.getBoundingClientRect();
		const bounds = this.dragBounds.getBoundingClientRect();
		const minimumLeft = bounds.left - parentBounds.left;
		const maximumLeft = bounds.right - parentBounds.left - this._button.element.offsetWidth;
		const clampedLeft = getChatPetHorizontalPosition(left, minimumLeft, maximumLeft);
		this._button.element.style.left = `${clampedLeft}px`;
		this._button.element.style.right = 'auto';
		this._hasCustomPosition = true;
		return clampedLeft !== left;
	}

	private _updateGaze(): void {
		if (!this._cursorPosition) {
			return;
		}

		const bounds = this._button.element.getBoundingClientRect();
		const [x, y] = getChatPetGazeDirection(
			this._cursorPosition[0],
			this._cursorPosition[1],
			bounds.left + bounds.width / 2,
			bounds.top + bounds.height / 2,
		);
		for (const pupil of this._pupils) {
			pupil.style.transform = `translate(${x * 2}px, ${y * 2}px)`;
		}
	}

	private _startEnableAnimation(): void {
		this._button.element.classList.remove('hidden', 'exiting', 'entering');
		this._button.element.tabIndex = 0;
		this._button.element.getBoundingClientRect();
		this._gazeScheduler.schedule();
		if (!this._motionReduced) {
			this._button.element.classList.add('entering');
		}
	}

	private _startDisableAnimation(): void {
		this._button.element.tabIndex = -1;
		this._button.element.classList.remove('entering');
		if (this._motionReduced || this._button.element.classList.contains('hidden')) {
			this._finishDisable();
			return;
		}
		this._button.element.classList.add('exiting');
	}

	private _finishDisable(): void {
		this._button.element.classList.remove('entering', 'exiting');
		this._button.element.classList.add('hidden');
		this._pendingImage = undefined;
		this._pendingSource = undefined;
		this._pendingState = undefined;
		this._activeImage = undefined;
		this._renderedState = undefined;
		for (const image of this._images) {
			image.classList.add('hidden');
			image.removeAttribute('src');
		}
	}

	private _showTransientState(state: ChatPetState): void {
		if (!this.chatPetService.enabled.get()) {
			return;
		}

		this._wake();
		const renderedState = state === 'yapping' && this._motionReduced ? 'yappingMouthOpen' : state;
		this._transientState.set(renderedState, undefined);
		if (renderedState === 'yappingMouthOpen' || renderedState === 'yapping') {
			this._transientScheduler.cancel();
		} else {
			this._transientScheduler.schedule(getTransientStateDuration(renderedState));
		}
		this._renderState(renderedState, true);
	}

	private _wake(): void {
		this._idleExpired.set(false, undefined);
		this._idleScheduler.schedule();
	}

	private _renderState(state: ChatPetState, restart = false): void {
		const sources = getSpriteSources()[state];
		const source = this._motionReduced ? sources.reducedMotion : sources.animated;
		if (!restart && this._activeImage && isChatPetImageSource(this._activeImage, source)) {
			this._button.element.dataset.state = state;
			this._renderedState = state;
			return;
		}

		const image = this._images.find(candidate => candidate !== this._activeImage);
		if (!image) {
			return;
		}

		this._pendingImage = image;
		this._pendingSource = source;
		this._pendingState = state;
		image.removeAttribute('src');
		image.src = source;
	}

	private _onImageLoad(image: HTMLImageElement): void {
		if (image !== this._pendingImage || this._pendingSource === undefined || !isChatPetImageSource(image, this._pendingSource) || this._pendingState === undefined) {
			return;
		}

		this._activeImage?.classList.add('hidden');
		image.classList.remove('hidden');
		this._activeImage = image;
		this._button.element.dataset.state = this._pendingState;
		this._renderedState = this._pendingState;
		this._pendingImage = undefined;
		this._pendingSource = undefined;
		this._pendingState = undefined;
		this._restartEyeAnimation();
		if (doesChatPetStateTrackCursor(this._renderedState)) {
			this._gazeScheduler.schedule();
		}
	}

	private _restartEyeAnimation(): void {
		this._eyes.classList.remove('animated');
		this._eyes.getBoundingClientRect();
		if (!this._motionReduced) {
			this._eyes.classList.add('animated');
		}
	}
}
