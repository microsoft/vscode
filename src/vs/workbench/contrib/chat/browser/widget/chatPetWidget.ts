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
import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { autorun, IObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import product from '../../../../../platform/product/common/product.js';
import { IChatModel } from '../../common/model/chatModel.js';
import { IChatPetService } from '../chatPetService.js';

export type ChatPetState = 'idle' | 'sleep' | 'waking' | 'typing' | 'rendering' | 'complete' | 'love' | 'clapping' | 'jump' | 'yapping' | 'yappingMouthOpen';
export type ChatPetClickInteraction = Extract<ChatPetState, 'love' | 'jump' | 'yapping'>;

export const CHAT_PET_IDLE_SLEEP_DELAY = 20_000;
const TRANSIENT_STATE_DURATION = 2_000;
const COMPLETE_STATE_DURATION = 2_140;
const LOVE_STATE_DURATION = 2_940;
const WAKE_STATE_DURATION = 880;
const DRAG_THRESHOLD = 2;
const KEYBOARD_MOVE_DISTANCE = 8;
const CHAT_PET_SOURCE_SIZE = 96;

const IDLE_FRAME_DURATIONS = Array.from({ length: 50 }, () => 40);
const SLEEP_FRAME_DURATIONS = Array.from({ length: 8 }, () => 300);
const WAKE_FRAME_DURATIONS = [160, 100, 80, 90, 90, 90, 100, 170];
const TYPING_FRAME_DURATIONS = Array.from({ length: 8 }, () => 120);
const SPEECH_FRAME_DURATIONS = [220, 220, 220, 100, 160, 180];
const CLAPPING_FRAME_DURATIONS = [80, 40, 40, 40, 80, 40, 40, 40, 40, 80, 40, 40, 80];
const LOVE_FRAME_DURATIONS = [200, 200, 380, 100, 80, 1_980];
const YAPPING_FRAME_DURATIONS = [300, 240, 1_500, 240, 360];

interface ChatPetSpriteSource {
	readonly url: string;
	readonly frameDurations: readonly number[];
	readonly iterations: number;
}

interface ChatPetSpriteSources {
	readonly animated: ChatPetSpriteSource;
	readonly reducedMotion: ChatPetSpriteSource;
}

interface ChatPetSpriteElement {
	readonly container: HTMLElement;
	readonly image: HTMLImageElement;
	readonly canvas: HTMLCanvasElement;
}

export function getChatPetBuddyName(quality: string | undefined): 'buddy-idle-stable' | 'buddy-idle-insiders' {
	return quality === 'stable' ? 'buddy-idle-stable' : 'buddy-idle-insiders';
}

let spriteSources: Record<ChatPetState, ChatPetSpriteSources> | undefined;
let speechSpriteSources: ChatPetSpriteSources | undefined;

export function doesChatPetStateTrackCursor(state: ChatPetState | undefined): boolean {
	return state !== undefined && state !== 'sleep' && state !== 'waking' && state !== 'typing' && state !== 'complete' && state !== 'love' && state !== 'yappingMouthOpen';
}

export function getChatPetSpriteName(state: ChatPetState, quality: string | undefined): string {
	const variant = quality === 'stable' ? 'stable' : 'insiders';
	switch (state) {
		case 'love':
			return `buddy-love-${variant}`;
		case 'clapping':
			return `buddy-clapping-${variant}`;
		case 'sleep':
			return `buddy-sleep-${variant}`;
		case 'waking':
			return `buddy-waking-${variant}`;
		case 'typing':
			return `buddy-typing-${variant}`;
		case 'rendering':
			return `buddy-rendering-${variant}`;
		case 'yappingMouthOpen':
			return `buddy-yapping-${variant}`;
		default:
			return getChatPetBuddyName(quality);
	}
}

export function getChatPetFrameDurations(state: ChatPetState): readonly number[] {
	switch (state) {
		case 'sleep':
			return SLEEP_FRAME_DURATIONS;
		case 'waking':
			return WAKE_FRAME_DURATIONS;
		case 'typing':
			return TYPING_FRAME_DURATIONS;
		case 'rendering':
			return IDLE_FRAME_DURATIONS;
		case 'clapping':
			return CLAPPING_FRAME_DURATIONS;
		case 'love':
			return LOVE_FRAME_DURATIONS;
		case 'yappingMouthOpen':
			return YAPPING_FRAME_DURATIONS;
		case 'yapping':
			return [];
		default:
			return IDLE_FRAME_DURATIONS;
	}
}

function createSpriteSources(name: string, state: ChatPetState, tracksCursor = true): ChatPetSpriteSources {
	const root = 'vs/workbench/contrib/chat/browser/widget/media/chatPet';
	const suffix = tracksCursor ? '-tracking-96' : '-96';
	const frameDurations = getChatPetFrameDurations(state);
	const staticSource = {
		url: FileAccess.asBrowserUri(`${root}/${name}${suffix}.png`).toString(true),
		frameDurations: [],
		iterations: 1,
	};
	return {
		animated: frameDurations.length === 0 ? staticSource : {
			url: FileAccess.asBrowserUri(`${root}/${name}${suffix}.spritesheet.png`).toString(true),
			frameDurations,
			iterations: state === 'waking' ? 1 : Infinity,
		},
		reducedMotion: staticSource,
	};
}

export function getChatPetSpeechFrameDurations(): readonly number[] {
	return SPEECH_FRAME_DURATIONS;
}

function getSpriteSources(): Record<ChatPetState, ChatPetSpriteSources> {
	if (!spriteSources) {
		const createStateSpriteSources = (state: ChatPetState) => createSpriteSources(getChatPetSpriteName(state, product.quality), state, doesChatPetStateTrackCursor(state));
		spriteSources = {
			idle: createStateSpriteSources('idle'),
			sleep: createStateSpriteSources('sleep'),
			waking: createStateSpriteSources('waking'),
			typing: createStateSpriteSources('typing'),
			rendering: createStateSpriteSources('rendering'),
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

function getSpeechSpriteSources(): ChatPetSpriteSources {
	if (!speechSpriteSources) {
		const root = 'vs/workbench/contrib/chat/browser/widget/media/chatPet';
		const variant = product.quality === 'stable' ? 'stable' : 'insiders';
		const name = `buddy-speech-${variant}-96`;
		speechSpriteSources = {
			animated: {
				url: FileAccess.asBrowserUri(`${root}/${name}.spritesheet.png`).toString(true),
				frameDurations: SPEECH_FRAME_DURATIONS,
				iterations: Infinity,
			},
			reducedMotion: {
				url: FileAccess.asBrowserUri(`${root}/${name}.png`).toString(true),
				frameDurations: [],
				iterations: 1,
			},
		};
	}
	return speechSpriteSources;
}

function doesChatPetStateSpeak(state: ChatPetState | undefined): boolean {
	return state === 'rendering' || state === 'yapping' || state === 'yappingMouthOpen';
}

export function isChatPetImageSource(image: Pick<HTMLImageElement, 'getAttribute'>, source: string): boolean {
	return image.getAttribute('src') === source;
}

export function getChatPetBaseState(hasActiveRequest: boolean, needsInput: boolean, hasInput: boolean, idleExpired: boolean): ChatPetState {
	if (needsInput) {
		return 'clapping';
	}
	if (hasActiveRequest) {
		return 'rendering';
	}
	if (idleExpired) {
		return 'sleep';
	}
	if (hasInput) {
		return 'typing';
	}
	return 'idle';
}

export function getChatPetRenderedState(baseState: ChatPetState, transientState: ChatPetState | undefined, isDragging: boolean): ChatPetState {
	return isDragging ? 'idle' : transientState ?? baseState;
}

export function getChatPetAnimationFrame(frameDurations: readonly number[], elapsed: number, iterations: number): { frameIndex: number; complete: boolean } {
	if (frameDurations.length === 0) {
		return { frameIndex: 0, complete: true };
	}

	const totalDuration = frameDurations.reduce((total, duration) => total + duration, 0);
	if (elapsed >= totalDuration * iterations) {
		return { frameIndex: frameDurations.length - 1, complete: true };
	}

	const iterationElapsed = Math.max(0, elapsed) % totalDuration;
	let frameEnd = 0;
	let frameIndex = 0;
	for (; frameIndex < frameDurations.length - 1; frameIndex++) {
		frameEnd += frameDurations[frameIndex];
		if (iterationElapsed < frameEnd) {
			break;
		}
	}
	return { frameIndex, complete: false };
}

function getTransientStateDuration(state: ChatPetState): number {
	switch (state) {
		case 'complete':
			return COMPLETE_STATE_DURATION;
		case 'love':
			return LOVE_STATE_DURATION;
		case 'waking':
			return WAKE_STATE_DURATION;
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
	private readonly _sprites: readonly ChatPetSpriteElement[];
	private readonly _speechBubble: ChatPetSpriteElement;
	private readonly _eyes: HTMLElement;
	private readonly _pupils: HTMLElement[] = [];
	private readonly _gazeScheduler: dom.AnimationFrameScheduler;
	private readonly _dragMonitor = this._register(new GlobalPointerMoveMonitor());
	private readonly _idleExpired = observableValue(this, false);
	private readonly _transientState = observableValue<ChatPetState | undefined>(this, undefined);
	private readonly _isDragging = observableValue(this, false);
	private readonly _idleScheduler = this._register(new RunOnceScheduler(() => this._idleExpired.set(true, undefined), CHAT_PET_IDLE_SLEEP_DELAY));
	private readonly _transientScheduler = this._register(new RunOnceScheduler(() => this._transientState.set(undefined, undefined), TRANSIENT_STATE_DURATION));
	private readonly _clickSuppressionScheduler = this._register(new RunOnceScheduler(() => this._suppressNextPointerClick = false, 0));
	private readonly _spriteAnimation = this._register(new MutableDisposable());
	private readonly _speechAnimation = this._register(new MutableDisposable());
	private _cursorPosition: readonly [number, number] | undefined;
	private _activeSprite: ChatPetSpriteElement | undefined;
	private _pendingSprite: ChatPetSpriteElement | undefined;
	private _pendingSource: ChatPetSpriteSource | undefined;
	private _pendingState: ChatPetState | undefined;
	private _renderedState: ChatPetState | undefined;
	private _motionReduced = false;
	private _enabled = false;
	private _busy = false;
	private _enablementInitialized = false;
	private _hasCustomPosition = false;
	private _suppressNextPointerClick = false;
	private _lastClickInteraction: ChatPetClickInteraction | undefined;

	constructor(
		private readonly parent: HTMLElement,
		private readonly dragBounds: HTMLElement,
		model: IObservable<IChatModel | undefined>,
		hasInput: IObservable<boolean>,
		inputChanged: (listener: () => void) => IDisposable,
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
		this._sprites = [0, 1].map(() => {
			const container = dom.append(this._button.element, dom.$('.chat-pet-sprite.hidden'));
			const canvas = dom.append(container, dom.$('canvas.chat-pet-canvas')) as HTMLCanvasElement;
			canvas.width = CHAT_PET_SOURCE_SIZE;
			canvas.height = CHAT_PET_SOURCE_SIZE;
			canvas.setAttribute('aria-hidden', 'true');
			const image = dom.append(container, dom.$('img.chat-pet-spritesheet')) as HTMLImageElement;
			image.alt = '';
			image.setAttribute('aria-hidden', 'true');
			const sprite = { container, image, canvas };
			this._register(dom.addDisposableListener(image, 'load', () => this._onImageLoad(sprite)));
			return sprite;
		});
		this._eyes = dom.append(this._button.element, dom.$('.chat-pet-eyes'));
		this._eyes.setAttribute('aria-hidden', 'true');
		for (const side of ['left', 'right']) {
			const eye = dom.append(this._eyes, dom.$(`.chat-pet-eye.${side}`));
			this._pupils.push(dom.append(eye, dom.$('.chat-pet-pupil')));
		}
		const speechBubbleContainer = dom.append(this._button.element, dom.$('.chat-pet-speech-bubble.hidden'));
		const speechBubbleCanvas = dom.append(speechBubbleContainer, dom.$('canvas.chat-pet-canvas.chat-pet-speech-canvas')) as HTMLCanvasElement;
		speechBubbleCanvas.width = CHAT_PET_SOURCE_SIZE;
		speechBubbleCanvas.height = CHAT_PET_SOURCE_SIZE;
		speechBubbleCanvas.setAttribute('aria-hidden', 'true');
		const speechBubbleImage = dom.append(speechBubbleContainer, dom.$('img.chat-pet-spritesheet')) as HTMLImageElement;
		speechBubbleImage.alt = '';
		speechBubbleImage.setAttribute('aria-hidden', 'true');
		this._speechBubble = { container: speechBubbleContainer, image: speechBubbleImage, canvas: speechBubbleCanvas };
		this._register(dom.addDisposableListener(speechBubbleImage, 'load', () => this._updateSpeechBubble(this._renderedState, true)));
		this._gazeScheduler = this._register(new dom.AnimationFrameScheduler(this._button.element, () => this._updateGaze()));
		this._register(dom.addDisposableListener(dom.getWindow(this._button.element).document, dom.EventType.POINTER_MOVE, (event: PointerEvent) => {
			this._cursorPosition = [event.clientX, event.clientY];
			if (this._enabled && doesChatPetStateTrackCursor(this._renderedState)) {
				this._gazeScheduler.schedule();
			}
		}));
		const onAnimationComplete = (event: AnimationEvent) => {
			if (event.animationName === 'chat-pet-exit' && !this._enabled) {
				this._finishDisable();
			} else if (event.animationName === 'chat-pet-yapping-fall' && !this._isDragging.get() && event.target === this._activeSprite?.container && this._button.element.dataset.state === 'yapping') {
				this._transientState.set('yappingMouthOpen', undefined);
			}
		};
		this._register(dom.addDisposableListener(this._button.element, dom.EventType.ANIMATION_END, onAnimationComplete));
		this._register(dom.addDisposableListener(this._button.element, 'animationcancel', onAnimationComplete));
		this._register(dom.addDisposableListener(this._button.element, dom.EventType.POINTER_DOWN, event => this._startDrag(event)));
		this._register(dom.addDisposableListener(this._button.element, dom.EventType.KEY_DOWN, event => this._onKeyDown(event)));
		this._register(inputChanged(() => {
			if (this._enabled) {
				this._wake();
			}
		}));

		this._register(this._button.onDidClick(e => {
			dom.EventHelper.stop(e, true);
			if (this._suppressNextPointerClick && e.type !== dom.EventType.KEY_DOWN) {
				this._suppressNextPointerClick = false;
				this._clickSuppressionScheduler.cancel();
				return;
			}
			const wasSleeping = this._idleExpired.get() || this._renderedState === 'sleep';
			if (wasSleeping) {
				this._wake();
			}
			if (wasSleeping || this._transientState.get() === 'waking') {
				status(localize('chatPet.wokeUp', "The VS Code pet woke up"));
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
			const inputHasContent = hasInput.read(reader);
			this._busy = hasActiveRequest || needsInput;
			let idleExpired = this._idleExpired.read(reader);
			let transientState = this._transientState.read(reader);
			const isDragging = this._isDragging.read(reader);

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

			if (this._busy) {
				this._idleScheduler.cancel();
				if (idleExpired) {
					idleExpired = false;
					this._idleExpired.set(false, undefined);
					transientState = this._beginWakeAnimation() ?? transientState;
				}
			} else if (!idleExpired && !this._idleScheduler.isScheduled()) {
				this._idleScheduler.schedule();
			}

			const baseState = getChatPetBaseState(hasActiveRequest, needsInput, inputHasContent, idleExpired);
			this._renderState(getChatPetRenderedState(baseState, transientState, isDragging), false, isDragging);
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
				this._button.element.classList.remove('entering');
				this._button.element.classList.add('dragging');
				this._spriteAnimation.clear();
				this._isDragging.set(true, undefined);
			}
			dom.EventHelper.stop(moveEvent, true);
			this._button.element.classList.toggle('resisting', this._setHorizontalPosition(startLeft + delta));
		}, () => {
			this._button.element.classList.remove('dragging', 'resisting');
			this._isDragging.set(false, undefined);
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
		this._spriteAnimation.clear();
		this._speechAnimation.clear();
		this._speechBubble.container.classList.add('hidden');
		this._speechBubble.image.removeAttribute('src');
		this._pendingSprite = undefined;
		this._pendingSource = undefined;
		this._pendingState = undefined;
		this._activeSprite = undefined;
		this._renderedState = undefined;
		for (const sprite of this._sprites) {
			sprite.container.classList.add('hidden');
			sprite.image.removeAttribute('src');
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
		if (!this._isDragging.get()) {
			this._renderState(renderedState, true);
		}
	}

	private _wake(): void {
		const wasSleeping = this._idleExpired.get() || this._renderedState === 'sleep';
		this._idleExpired.set(false, undefined);
		if (this._busy) {
			this._idleScheduler.cancel();
		} else {
			this._idleScheduler.schedule();
		}
		if (wasSleeping) {
			this._beginWakeAnimation();
		}
	}

	private _beginWakeAnimation(): ChatPetState | undefined {
		if (this._motionReduced) {
			return undefined;
		}

		this._transientState.set('waking', undefined);
		this._transientScheduler.schedule(WAKE_STATE_DURATION);
		return 'waking';
	}

	private _renderState(state: ChatPetState, restart = false, useStaticSprite = false): void {
		const sources = getSpriteSources()[state];
		const source = this._motionReduced || useStaticSprite ? sources.reducedMotion : sources.animated;
		if (!restart && this._activeSprite && isChatPetImageSource(this._activeSprite.image, source.url)) {
			this._pendingSprite = undefined;
			this._pendingSource = undefined;
			this._pendingState = undefined;
			this._button.element.dataset.state = state;
			this._renderedState = state;
			this._eyes.classList.toggle('tracking', doesChatPetStateTrackCursor(state));
			this._updateSpeechBubble(state, restart);
			return;
		}

		const sprite = this._sprites.find(candidate => candidate !== this._activeSprite);
		if (!sprite) {
			return;
		}

		this._pendingSprite = sprite;
		this._pendingSource = source;
		this._pendingState = state;
		sprite.image.removeAttribute('src');
		sprite.image.src = source.url;
	}

	private _onImageLoad(sprite: ChatPetSpriteElement): void {
		if (sprite !== this._pendingSprite || this._pendingSource === undefined || !isChatPetImageSource(sprite.image, this._pendingSource.url) || this._pendingState === undefined) {
			return;
		}

		this._spriteAnimation.clear();
		this._activeSprite?.container.classList.add('hidden');
		sprite.container.classList.remove('hidden');
		this._activeSprite = sprite;
		this._startSpriteAnimation(this._pendingSource, sprite, this._spriteAnimation);
		this._button.element.dataset.state = this._pendingState;
		this._renderedState = this._pendingState;
		this._eyes.classList.toggle('tracking', doesChatPetStateTrackCursor(this._pendingState));
		this._updateSpeechBubble(this._pendingState, true);
		this._pendingSprite = undefined;
		this._pendingSource = undefined;
		this._pendingState = undefined;
		this._restartEyeAnimation();
		if (doesChatPetStateTrackCursor(this._renderedState)) {
			this._gazeScheduler.schedule();
		}
	}

	private _startSpriteAnimation(source: ChatPetSpriteSource, sprite: ChatPetSpriteElement, animationDisposable: MutableDisposable<IDisposable>): void {
		const { frameDurations } = source;
		const { image, canvas } = sprite;
		const context = canvas.getContext('2d');
		if (!context) {
			return;
		}
		context.imageSmoothingEnabled = false;
		const drawFrame = (frameIndex: number) => {
			context.clearRect(0, 0, CHAT_PET_SOURCE_SIZE, CHAT_PET_SOURCE_SIZE);
			context.drawImage(
				image,
				frameIndex * CHAT_PET_SOURCE_SIZE,
				0,
				CHAT_PET_SOURCE_SIZE,
				CHAT_PET_SOURCE_SIZE,
				0,
				0,
				CHAT_PET_SOURCE_SIZE,
				CHAT_PET_SOURCE_SIZE
			);
		};
		drawFrame(0);
		if (frameDurations.length < 2) {
			return;
		}

		const targetWindow = dom.getWindow(canvas);
		const startTime = targetWindow.performance.now();
		let currentFrame = 0;
		let animationFrame: number | undefined;
		const updateFrame = (timestamp: number) => {
			const frame = getChatPetAnimationFrame(frameDurations, timestamp - startTime, source.iterations);
			if (frame.complete) {
				drawFrame(frame.frameIndex);
				return;
			}
			if (frame.frameIndex !== currentFrame) {
				currentFrame = frame.frameIndex;
				drawFrame(frame.frameIndex);
			}
			animationFrame = targetWindow.requestAnimationFrame(updateFrame);
		};
		animationFrame = targetWindow.requestAnimationFrame(updateFrame);
		animationDisposable.value = toDisposable(() => {
			if (animationFrame !== undefined) {
				targetWindow.cancelAnimationFrame(animationFrame);
			}
		});
	}

	private _updateSpeechBubble(state: ChatPetState | undefined, restart = false): void {
		const visible = doesChatPetStateSpeak(state);
		this._speechBubble.container.classList.toggle('hidden', !visible);
		if (!visible) {
			this._speechAnimation.clear();
			return;
		}

		const sources = getSpeechSpriteSources();
		const source = this._motionReduced ? sources.reducedMotion : sources.animated;
		if (!isChatPetImageSource(this._speechBubble.image, source.url)) {
			this._speechAnimation.clear();
			this._speechBubble.image.removeAttribute('src');
			this._speechBubble.image.src = source.url;
			return;
		}
		if (restart && this._speechBubble.image.complete && this._speechBubble.image.naturalWidth > 0) {
			this._speechAnimation.clear();
			this._startSpriteAnimation(source, this._speechBubble, this._speechAnimation);
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
