/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatPet.css';
import * as dom from '../../../../../base/browser/dom.js';
import { GlobalPointerMoveMonitor } from '../../../../../base/browser/globalPointerMoveMonitor.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Action, IAction, Separator } from '../../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { AppResourcePath, FileAccess } from '../../../../../base/common/network.js';
import { autorun, constObservable, IObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IChatModel } from '../../common/model/chatModel.js';
import { ChatPetVariant, IChatPetService } from '../chatPetService.js';

export type ChatPetState = 'idle' | 'sleep' | 'waking' | 'typing' | 'rendering' | 'complete' | 'love' | 'clapping' | 'jump' | 'cool' | 'yapping' | 'yappingMouthOpen' | 'onTheRun' | 'searching' | 'searchingDown';
export type ChatPetAnimationDurationSource = 'sprite' | 'css' | 'all';
export type ChatPetClickInteraction = Extract<ChatPetState, 'love' | 'jump' | 'cool' | 'yapping'>;

export const CHAT_PET_IDLE_SLEEP_DELAY = 20_000;
const TRANSIENT_STATE_DURATION = 2_000;
const COMPLETE_STATE_DURATION = 2_140;
const LOVE_STATE_DURATION = 2_940;
const COOL_STATE_DURATION = 3_000;
const WAKE_STATE_DURATION = 880;
const SEARCH_INTERVAL = 10_000;
const DRAG_THRESHOLD = 2;
const KEYBOARD_MOVE_DISTANCE = 8;

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

export function isChatPetVisible(enabled: boolean, isLatestFocusedWidget: boolean): boolean {
	return enabled && isLatestFocusedWidget;
}

export function getChatPetRenderedState(baseState: ChatPetState, transientState: ChatPetState | undefined, isDragging: boolean): ChatPetState {
	return isDragging ? 'idle' : transientState ?? baseState;
}

function getTransientStateDuration(state: ChatPetState): number {
	switch (state) {
		case 'complete':
			return COMPLETE_STATE_DURATION;
		case 'love':
			return LOVE_STATE_DURATION;
		case 'cool':
			return COOL_STATE_DURATION;
		case 'waking':
			return WAKE_STATE_DURATION;
		default:
			return TRANSIENT_STATE_DURATION;
	}
}

export function getChatPetClickInteraction(random: number, previousInteraction?: ChatPetClickInteraction): ChatPetClickInteraction {
	const interactions: readonly ChatPetClickInteraction[] = ['love', 'jump', 'cool', 'yapping'];
	const availableInteractions = interactions.filter(interaction => interaction !== previousInteraction);
	return availableInteractions[Math.min(Math.floor(random * availableInteractions.length), availableInteractions.length - 1)];
}

export class ChatPetWidget extends Disposable {

	private readonly _view: ChatPetView;
	private readonly _dragMonitor = this._register(new GlobalPointerMoveMonitor());
	private readonly _idleExpired = observableValue(this, false);
	private readonly _transientState = observableValue<ChatPetState | undefined>(this, undefined);
	private readonly _isDragging = observableValue(this, false);
	private readonly _idleScheduler = this._register(new RunOnceScheduler(() => this._idleExpired.set(true, undefined), CHAT_PET_IDLE_SLEEP_DELAY));
	private readonly _transientScheduler = this._register(new RunOnceScheduler(() => this._transientState.set(undefined, undefined), TRANSIENT_STATE_DURATION));
	private readonly _searchScheduler: RunOnceScheduler;
	private readonly _clickSuppressionScheduler = this._register(new RunOnceScheduler(() => this._suppressNextPointerClick = false, 0));
	private readonly _contextMenuActions = this._register(new MutableDisposable<DisposableStore>());
	private _motionReduced = false;
	private _enabled = false;
	private _busy = false;
	private _enablementInitialized = false;
	private _suppressNextPointerClick = false;
	private _lastClickInteraction: ChatPetClickInteraction | undefined;
	private _variant: ChatPetVariant;

	constructor(
		parent: HTMLElement,
		dragBounds: HTMLElement,
		model: IObservable<IChatModel | undefined>,
		hasInput: IObservable<boolean>,
		isLatestFocusedWidget: IObservable<boolean>,
		inputChanged: (listener: () => void) => IDisposable,
		@IChatPetService private readonly chatPetService: IChatPetService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
	) {
		super();

		this._variant = this.chatPetService.variant.get();
		this._searchScheduler = this._register(new RunOnceScheduler(() => this._trySearch(), SEARCH_INTERVAL));
		this._view = this._register(new ChatPetView(parent, dragBounds, {
			ariaLabel: localize('chatPet.interact', "Interact with the VS Code pet. Use the context menu to put it on the run."),
			onDidCompleteAnimation: state => this._onAnimationComplete(state),
		}));
		this._register(dom.addDisposableListener(this._view.element, dom.EventType.POINTER_DOWN, event => this._startDrag(event)));
		this._register(dom.addDisposableListener(this._view.element, dom.EventType.KEY_DOWN, event => this._onKeyDown(event)));
		this._register(dom.addDisposableListener(this._view.element, dom.EventType.CONTEXT_MENU, event => {
			if (!this._enabled) {
				return;
			}
			dom.EventHelper.stop(event, true);
			this._showContextMenu(event);
		}));
		this._register(inputChanged(() => {
			if (this._enabled && !this.chatPetService.onTheRun.get()) {
				this._wake();
			}
		}));
		this._register(this._view.onDidClick(e => {
			dom.EventHelper.stop(e, true);
			if (this._suppressNextPointerClick && e.type !== dom.EventType.KEY_DOWN) {
				this._suppressNextPointerClick = false;
				this._clickSuppressionScheduler.cancel();
				return;
			}
			if (this.chatPetService.onTheRun.get()) {
				this._transientState.set(undefined, undefined);
				this.chatPetService.setOnTheRun(false);
				return;
			}
			const wasSleeping = this._idleExpired.get() || this._view.renderedState === 'sleep';
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
				case 'cool':
					status(localize('chatPet.cool', "The VS Code pet put on sunglasses"));
					break;
				case 'yapping':
					status(localize('chatPet.yapping', "The VS Code pet is yapping"));
					break;
			}
		}));

		const motionReduced = observableFromEvent(this, this.accessibilityService.onDidChangeReducedMotion, () => this.accessibilityService.isMotionReduced());
		this._register(autorun(reader => {
			this._motionReduced = motionReduced.read(reader);
			const enabled = isChatPetVisible(this.chatPetService.enabled.read(reader), isLatestFocusedWidget.read(reader));
			const variant = this.chatPetService.variant.read(reader);
			const variantChanged = variant !== this._variant;
			this._variant = variant;
			const onTheRun = this.chatPetService.onTheRun.read(reader);
			this._view.setOnTheRun(onTheRun);
			this._view.setAriaLabel(onTheRun
				? localize('chatPet.restore', "Bring back the VS Code pet")
				: localize('chatPet.interact', "Interact with the VS Code pet. Use the context menu to put it on the run."));
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
					this._view.show(this._motionReduced);
				} else {
					this._view.hide(!wasInitialized || this._motionReduced);
				}
			}

			if (!enabled) {
				this._idleScheduler.cancel();
				this._searchScheduler.cancel();
				this._transientScheduler.cancel();
				if (transientState !== undefined) {
					this._transientState.set(undefined, undefined);
				}
				if (this._motionReduced) {
					this._view.hide(true);
				}
				return;
			}

			if (onTheRun) {
				this._idleScheduler.cancel();
				if (!this._searchScheduler.isScheduled()) {
					this._searchScheduler.schedule();
				}
				const state = transientState === 'searching' || transientState === 'searchingDown' ? transientState : 'onTheRun';
				this._renderState(state, variantChanged);
				return;
			}
			this._searchScheduler.cancel();

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
			this._renderState(getChatPetRenderedState(baseState, transientState, isDragging), variantChanged, isDragging);
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
		if (!this._enabled || this.chatPetService.onTheRun.get() || event.button !== 0) {
			return;
		}

		this._wake();
		dom.EventHelper.stop(event);
		this._view.focus();
		const startX = event.clientX;
		const startLeft = this._view.currentLeft;
		let didDrag = false;

		this._dragMonitor.startMonitoring(this._view.element, event.pointerId, event.buttons, moveEvent => {
			const delta = moveEvent.clientX - startX;
			if (!didDrag && Math.abs(delta) < DRAG_THRESHOLD) {
				return;
			}

			if (!didDrag) {
				didDrag = true;
				this._view.setDragging(true);
				this._isDragging.set(true, undefined);
			}
			dom.EventHelper.stop(moveEvent, true);
			this._view.setResisting(this._view.setHorizontalPosition(startLeft + delta));
		}, () => {
			this._view.setDragging(false);
			this._view.setResisting(false);
			this._isDragging.set(false, undefined);
			if (didDrag) {
				this._suppressNextPointerClick = true;
				this._clickSuppressionScheduler.schedule();
			}
		});
	}

	private _showContextMenu(event: MouseEvent): void {
		const onTheRun = this.chatPetService.onTheRun.get();
		const actions = new DisposableStore();
		this._contextMenuActions.value = actions;
		const stable = actions.add(new Action('chat.pet.variant.stable', localize('chatPet.variant.stable.action', "Stable Colors"), undefined, true, () => this.chatPetService.setVariant('stable')));
		stable.checked = this.chatPetService.variant.get() === 'stable';
		const insiders = actions.add(new Action('chat.pet.variant.insiders', localize('chatPet.variant.insiders.action', "Insiders Colors"), undefined, true, () => this.chatPetService.setVariant('insiders')));
		insiders.checked = this.chatPetService.variant.get() === 'insiders';
		const onTheRunAction = actions.add(new Action(
			'chat.pet.onTheRun',
			onTheRun ? localize('chatPet.comeBack.action', "Come Back") : localize('chatPet.goOnTheRun.action', "Go on the Run"),
			undefined,
			true,
			() => {
				this._transientState.set(undefined, undefined);
				this.chatPetService.setOnTheRun(!onTheRun);
			}
		));
		const separator = new Separator();
		this.contextMenuService.showContextMenu({
			getAnchor: () => new StandardMouseEvent(dom.getWindow(this._view.element), event),
			getActions: (): IAction[] => [
				onTheRunAction,
				separator,
				stable,
				insiders,
			],
			onHide: () => {
				if (this._contextMenuActions.value === actions) {
					this._contextMenuActions.clear();
				}
			},
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
		this._view.setHorizontalPosition(this._view.currentLeft + delta);
		status(announcement);
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

	private _trySearch(): void {
		if (!this._enabled || !this.chatPetService.onTheRun.get()) {
			return;
		}
		if (this._motionReduced) {
			this._searchScheduler.schedule();
			return;
		}
		this._transientState.set('searching', undefined);
		this._renderState('searching', true);
		this._searchScheduler.schedule();
	}

	private _wake(): void {
		const wasSleeping = this._idleExpired.get() || this._view.renderedState === 'sleep';
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
		this._view.renderState(state, this._variant, this._motionReduced, restart, useStaticSprite);
	}

	private _onAnimationComplete(state: ChatPetState): void {
		if (state === 'searching' && this.chatPetService.onTheRun.get()) {
			this._transientState.set('searchingDown', undefined);
		} else if (state === 'searchingDown') {
			this._transientState.set(undefined, undefined);
		} else if (state === 'yapping' && !this._isDragging.get() && this._view.renderedState === 'yapping') {
			this._transientState.set('yappingMouthOpen', undefined);
		}
	}
}

const CHAT_PET_SOURCE_SIZE = 96;
const CHAT_PET_MAX_VERTICAL_OFFSET = 10;
const CHAT_PET_SPEECH_BUBBLE_RIGHT_OVERHANG = 20;

const IDLE_FRAME_DURATIONS = Array.from({ length: 50 }, () => 40);
const SLEEP_FRAME_DURATIONS = Array.from({ length: 8 }, () => 300);
const WAKE_FRAME_DURATIONS = [160, 100, 80, 90, 90, 90, 100, 170];
const TYPING_FRAME_DURATIONS = Array.from({ length: 8 }, () => 120);
const SPEECH_FRAME_DURATIONS = [220, 220, 220, 100, 160, 180];
const CLAPPING_FRAME_DURATIONS = [80, 40, 40, 40, 80, 40, 40, 40, 40, 80, 40, 40, 80];
const LOVE_FRAME_DURATIONS = [200, 200, 380, 100, 80, 1_980];
const COOL_FRAME_DURATIONS = [600, 120, 120, 120, 160, 80, 80, 80, 1_640];
const SEARCH_FRAME_DURATIONS = [500, 500, 500, 500];
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

interface ActiveChatPetSpriteAnimation {
	readonly source: ChatPetSpriteSource;
	readonly sprite: ChatPetSpriteElement;
	readonly onComplete: (() => void) | undefined;
	completionReported: boolean;
}

export interface IChatPetViewOptions {
	readonly ariaLabel: string;
	readonly animationTime?: IObservable<number | undefined>;
	readonly onDidCompleteAnimation?: (state: ChatPetState) => void;
	readonly resourceBaseUrl?: string;
	readonly loopAnimations?: boolean;
	readonly trackDocumentCursor?: boolean;
}

const spriteSources = new Map<string, Record<ChatPetState, ChatPetSpriteSources>>();
const speechSpriteSources = new Map<string, ChatPetSpriteSources>();

export function getChatPetBuddyName(quality: string | undefined): 'buddy-idle-stable' | 'buddy-idle-insiders' {
	return quality === 'stable' ? 'buddy-idle-stable' : 'buddy-idle-insiders';
}

export function doesChatPetStateTrackCursor(state: ChatPetState | undefined): boolean {
	return state !== undefined && state !== 'sleep' && state !== 'waking' && state !== 'typing' && state !== 'complete' && state !== 'love' && state !== 'cool' && state !== 'yappingMouthOpen' && state !== 'onTheRun' && state !== 'searching' && state !== 'searchingDown';
}

export function getChatPetSpriteName(state: ChatPetState, quality: string | undefined): string {
	const variant = quality === 'stable' ? 'stable' : 'insiders';
	switch (state) {
		case 'love':
			return `buddy-love-${variant}`;
		case 'clapping':
			return `buddy-clapping-${variant}`;
		case 'cool':
			return `buddy-cool-${variant}`;
		case 'onTheRun':
		case 'searching':
		case 'searchingDown':
			return `buddy-search-${variant}`;
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
		case 'cool':
			return COOL_FRAME_DURATIONS;
		case 'searching':
			return SEARCH_FRAME_DURATIONS;
		case 'onTheRun':
		case 'searchingDown':
			return [];
		case 'yappingMouthOpen':
			return YAPPING_FRAME_DURATIONS;
		case 'yapping':
			return [];
		default:
			return IDLE_FRAME_DURATIONS;
	}
}

function resolveChatPetResource(resource: AppResourcePath, resourceBaseUrl: string | undefined): string {
	return resourceBaseUrl === undefined ? FileAccess.asBrowserUri(resource).toString(true) : `${resourceBaseUrl}/${resource}`;
}

function createSpriteSources(name: string, state: ChatPetState, tracksCursor: boolean, resourceBaseUrl: string | undefined): ChatPetSpriteSources {
	const suffix = tracksCursor ? '-tracking-96' : '-96';
	const frameDurations = getChatPetFrameDurations(state);
	const staticSource = {
		url: resolveChatPetResource(`vs/workbench/contrib/chat/browser/widget/media/chatPet/${name}${suffix}.png`, resourceBaseUrl),
		frameDurations: [],
		iterations: 1,
	};
	return {
		animated: frameDurations.length === 0 ? staticSource : {
			url: resolveChatPetResource(`vs/workbench/contrib/chat/browser/widget/media/chatPet/${name}${suffix}.spritesheet.png`, resourceBaseUrl),
			frameDurations,
			iterations: state === 'waking' || state === 'cool' || state === 'searching' ? 1 : Infinity,
		},
		reducedMotion: staticSource,
	};
}

export function getChatPetSpeechFrameDurations(): readonly number[] {
	return SPEECH_FRAME_DURATIONS;
}

function getSpriteSources(variant: ChatPetVariant, resourceBaseUrl: string | undefined): Record<ChatPetState, ChatPetSpriteSources> {
	const key = `${resourceBaseUrl ?? ''}:${variant}`;
	let sources = spriteSources.get(key);
	if (!sources) {
		const createStateSpriteSources = (state: ChatPetState) => createSpriteSources(getChatPetSpriteName(state, variant), state, doesChatPetStateTrackCursor(state), resourceBaseUrl);
		sources = {
			idle: createStateSpriteSources('idle'),
			sleep: createStateSpriteSources('sleep'),
			waking: createStateSpriteSources('waking'),
			typing: createStateSpriteSources('typing'),
			rendering: createStateSpriteSources('rendering'),
			complete: createStateSpriteSources('complete'),
			love: createStateSpriteSources('love'),
			clapping: createStateSpriteSources('clapping'),
			jump: createStateSpriteSources('jump'),
			cool: createStateSpriteSources('cool'),
			yapping: createStateSpriteSources('yapping'),
			yappingMouthOpen: createStateSpriteSources('yappingMouthOpen'),
			onTheRun: createStateSpriteSources('onTheRun'),
			searching: createStateSpriteSources('searching'),
			searchingDown: createStateSpriteSources('searchingDown'),
		};
		spriteSources.set(key, sources);
	}

	return sources;
}

function getSpeechSpriteSources(variant: ChatPetVariant, resourceBaseUrl: string | undefined): ChatPetSpriteSources {
	const key = `${resourceBaseUrl ?? ''}:${variant}`;
	let sources = speechSpriteSources.get(key);
	if (!sources) {
		const name = `buddy-speech-${variant}-96`;
		sources = {
			animated: {
				url: resolveChatPetResource(`vs/workbench/contrib/chat/browser/widget/media/chatPet/${name}.spritesheet.png`, resourceBaseUrl),
				frameDurations: SPEECH_FRAME_DURATIONS,
				iterations: Infinity,
			},
			reducedMotion: {
				url: resolveChatPetResource(`vs/workbench/contrib/chat/browser/widget/media/chatPet/${name}.png`, resourceBaseUrl),
				frameDurations: [],
				iterations: 1,
			},
		};
		speechSpriteSources.set(key, sources);
	}
	return sources;
}

function doesChatPetStateSpeak(state: ChatPetState | undefined): boolean {
	return state === 'rendering' || state === 'yapping' || state === 'yappingMouthOpen';
}

export function isChatPetImageSource(image: Pick<HTMLImageElement, 'getAttribute'>, source: string): boolean {
	return image.getAttribute('src') === source;
}

type ChatPetAnimationFrame = { frameIndex: number; complete: true } | { frameIndex: number; complete: false; nextFrameDelay: number };

export function getChatPetAnimationFrame(frameDurations: readonly number[], elapsed: number, iterations: number): ChatPetAnimationFrame {
	if (frameDurations.length === 0) {
		return { frameIndex: 0, complete: true };
	}

	const totalDuration = frameDurations.reduce((total, duration) => total + duration, 0);
	if (elapsed >= totalDuration * iterations) {
		return { frameIndex: frameDurations.length - 1, complete: true };
	}
	const iterationElapsed = Math.max(0, elapsed) % totalDuration;
	let frameEnd = 0;
	for (let frameIndex = 0; frameIndex < frameDurations.length; frameIndex++) {
		frameEnd += frameDurations[frameIndex];
		if (iterationElapsed < frameEnd) {
			return { frameIndex, complete: false, nextFrameDelay: frameEnd - iterationElapsed };
		}
	}
	return { frameIndex: frameDurations.length - 1, complete: false, nextFrameDelay: totalDuration };
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

export function getChatPetVerticalOffset(hostTop: number, inputTop: number): number {
	return Math.max(0, Math.min(CHAT_PET_MAX_VERTICAL_OFFSET, inputTop - hostTop));
}

export function shouldPlaceChatPetSpeechBubbleLeft(state: ChatPetState | undefined, buttonRight: number, inputRight: number): boolean {
	return state === 'rendering' && buttonRight + CHAT_PET_SPEECH_BUBBLE_RIGHT_OVERHANG > inputRight;
}

export class ChatPetView extends Disposable {

	private readonly _overlay: HTMLElement;
	private readonly _button: Button;
	private readonly _sprites: readonly ChatPetSpriteElement[];
	private readonly _speechBubble: ChatPetSpriteElement;
	private readonly _eyes: HTMLElement;
	private readonly _pupils: HTMLElement[] = [];
	private readonly _gazeScheduler: dom.AnimationFrameScheduler;
	private readonly _spriteAnimation = this._register(new MutableDisposable());
	private readonly _speechAnimation = this._register(new MutableDisposable());
	private readonly _animationTime: IObservable<number | undefined>;
	private readonly _onDidRender = this._register(new Emitter<void>());
	private _cursorPosition: readonly [number, number] | undefined;
	private _activeSprite: ChatPetSpriteElement | undefined;
	private _pendingSprite: ChatPetSpriteElement | undefined;
	private _pendingSource: ChatPetSpriteSource | undefined;
	private _pendingState: ChatPetState | undefined;
	private _activeSpriteAnimation: ActiveChatPetSpriteAnimation | undefined;
	private _activeSpeechAnimation: ActiveChatPetSpriteAnimation | undefined;
	private _renderedState: ChatPetState | undefined;
	private _motionReduced = false;
	private _variant: ChatPetVariant = 'stable';
	private _hasCustomPosition = false;
	private _visibleRequested = false;
	private _renderError: Error | undefined;
	private _animationControlled = false;

	constructor(
		private readonly _parent: HTMLElement,
		private readonly _dragBounds: HTMLElement,
		private readonly _options: IChatPetViewOptions,
	) {
		super();

		this._animationTime = _options.animationTime ?? constObservable(undefined);
		this._parent.classList.add('chat-pet-host');
		this._overlay = dom.$('.chat-pet-overlay');
		this._parent.prepend(this._overlay);
		this._register(toDisposable(() => this._overlay.remove()));
		this._button = this._register(new Button(this._overlay, { ariaLabel: _options.ariaLabel }));
		this._button.element.classList.add('chat-pet-button');
		const resizeObserver = this._register(new dom.DisposableResizeObserver('ChatPetView.dragBounds', () => {
			this._updateVerticalPosition();
			this._updateSpeechBubblePosition();
			if (this._hasCustomPosition) {
				this.setHorizontalPosition(this.currentLeft);
			}
		}, dom.getWindow(this._button.element)));
		this._register(resizeObserver.observe(this._dragBounds));
		this._register(resizeObserver.observe(this._parent));
		this._updateVerticalPosition();
		this._updateSpeechBubblePosition();
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
			this._register(dom.addDisposableListener(image, 'error', () => this._onImageError(image)));
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
		this._register(dom.addDisposableListener(speechBubbleImage, 'load', () => {
			this._updateSpeechBubble(this._renderedState, true);
			this._onDidRender.fire();
		}));
		this._register(dom.addDisposableListener(speechBubbleImage, 'error', () => this._onImageError(speechBubbleImage)));
		this._gazeScheduler = this._register(new dom.AnimationFrameScheduler(this._button.element, () => this._updateGaze()));
		if (this._options.trackDocumentCursor ?? true) {
			this._register(dom.addDisposableListener(dom.getWindow(this._button.element).document, dom.EventType.POINTER_MOVE, (event: PointerEvent) => {
				this.setCursorPosition(event.clientX, event.clientY);
			}));
		}
		const onAnimationComplete = (event: AnimationEvent) => {
			if (event.animationName === 'chat-pet-enter') {
				this._button.element.classList.remove('entering');
			} else if (event.animationName === 'chat-pet-exit' && !this._visibleRequested) {
				this._finishHide();
			} else if (event.animationName === 'chat-pet-yapping-fall' && event.target === this._activeSprite?.container && this._button.element.dataset.state === 'yapping') {
				this._options.onDidCompleteAnimation?.('yapping');
			} else if (event.animationName === 'chat-pet-search-down' && this._button.element.dataset.state === 'searchingDown') {
				this._options.onDidCompleteAnimation?.('searchingDown');
			}
		};
		this._register(dom.addDisposableListener(this._button.element, dom.EventType.ANIMATION_END, onAnimationComplete));
		this._register(dom.addDisposableListener(this._button.element, 'animationcancel', onAnimationComplete));
		this._register(autorun(reader => {
			const animationTime = this._animationTime.read(reader);
			if (animationTime === undefined) {
				if (this._animationControlled) {
					this._animationControlled = false;
					this._resumeAnimations();
				}
				return;
			}
			this._animationControlled = true;
			this._spriteAnimation.clear();
			this._speechAnimation.clear();
			this._renderControlledAnimation(this._activeSpriteAnimation, animationTime);
			this._renderControlledAnimation(this._activeSpeechAnimation, animationTime);
			this._updateCssAnimationTime(animationTime);
		}));
	}

	get element(): HTMLElement {
		return this._button.element;
	}

	get onDidClick() {
		return this._button.onDidClick;
	}

	get renderedState(): ChatPetState | undefined {
		return this._renderedState;
	}

	get currentLeft(): number {
		return this._button.element.offsetLeft;
	}

	setAriaLabel(label: string): void {
		this._button.setAriaLabel(label);
	}

	setCursorPosition(clientX: number, clientY: number): void {
		this._cursorPosition = [clientX, clientY];
		if (this._visibleRequested && doesChatPetStateTrackCursor(this._renderedState)) {
			this._gazeScheduler.schedule();
		}
	}

	setOnTheRun(onTheRun: boolean): void {
		this._button.element.classList.toggle('on-the-run', onTheRun);
	}

	setDragging(dragging: boolean): void {
		this._button.element.classList.toggle('dragging', dragging);
		if (dragging) {
			this._button.element.classList.remove('entering');
			this._spriteAnimation.clear();
			this._activeSpriteAnimation = undefined;
		}
	}

	setResisting(resisting: boolean): void {
		this._button.element.classList.toggle('resisting', resisting);
	}

	focus(): void {
		this._button.element.focus();
	}

	show(reducedMotion: boolean): void {
		this._visibleRequested = true;
		this._button.element.classList.remove('hidden', 'exiting', 'entering');
		this._button.element.tabIndex = 0;
		this._button.element.getBoundingClientRect();
		this._gazeScheduler.schedule();
		if (!reducedMotion) {
			this._button.element.classList.add('entering');
			this._updateCssAnimationTime(this._animationTime.get());
		}
	}

	hide(reducedMotion: boolean): void {
		this._visibleRequested = false;
		this._button.element.tabIndex = -1;
		this._button.element.classList.remove('entering');
		if (reducedMotion || this._button.element.classList.contains('hidden')) {
			this._finishHide();
			return;
		}
		this._button.element.classList.add('exiting');
		this._updateCssAnimationTime(this._animationTime.get());
	}

	renderState(state: ChatPetState, variant: ChatPetVariant, reducedMotion: boolean, restart = false, useStaticSprite = false): void {
		this._renderError = undefined;
		this._variant = variant;
		this._motionReduced = reducedMotion;
		const sources = getSpriteSources(variant, this._options.resourceBaseUrl)[state];
		const source = reducedMotion || useStaticSprite ? sources.reducedMotion : sources.animated;
		if (!restart && this._activeSprite && isChatPetImageSource(this._activeSprite.image, source.url)) {
			this._pendingSprite = undefined;
			this._pendingSource = undefined;
			this._pendingState = undefined;
			this._button.element.dataset.state = state;
			this._renderedState = state;
			this._eyes.classList.toggle('tracking', doesChatPetStateTrackCursor(state));
			this._updateSpeechBubble(state, restart);
			this._updateCssAnimationTime(this._animationTime.get());
			this._onDidRender.fire();
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

	async whenReady(): Promise<void> {
		while (!this._isReady()) {
			await Event.toPromise(this._onDidRender.event);
		}
	}

	getAnimationDuration(source: ChatPetAnimationDurationSource = 'all'): number {
		const durations: number[] = [];
		if (source !== 'css') {
			for (const animation of [this._activeSpriteAnimation, this._activeSpeechAnimation]) {
				if (animation) {
					durations.push(animation.source.frameDurations.reduce((total, duration) => total + duration, 0));
				}
			}
		}
		if (source !== 'sprite') {
			for (const animation of this._button.element.getAnimations({ subtree: true })) {
				if (animation instanceof CSSAnimation && (animation.animationName === 'chat-pet-eye-bob' || animation.animationName === 'chat-pet-eye-blink')) {
					continue;
				}
				const duration = animation.effect?.getTiming().duration;
				if (typeof duration === 'number') {
					durations.push(duration);
				}
			}
		}
		return Math.max(0, ...durations);
	}

	setHorizontalPosition(left: number): boolean {
		const parentBounds = this._overlay.getBoundingClientRect();
		const bounds = this._dragBounds.getBoundingClientRect();
		const minimumLeft = bounds.left - parentBounds.left;
		const maximumLeft = bounds.right - parentBounds.left - this._button.element.offsetWidth;
		const clampedLeft = getChatPetHorizontalPosition(left, minimumLeft, maximumLeft);
		this._button.element.style.left = `${clampedLeft}px`;
		this._button.element.style.right = 'auto';
		this._hasCustomPosition = true;
		this._updateSpeechBubblePosition();
		return clampedLeft !== left;
	}

	private _finishHide(): void {
		this._button.element.classList.remove('entering', 'exiting');
		this._button.element.classList.add('hidden');
		this._spriteAnimation.clear();
		this._speechAnimation.clear();
		this._activeSpriteAnimation = undefined;
		this._activeSpeechAnimation = undefined;
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

	private _updateVerticalPosition(): void {
		const hostTop = this._overlay.getBoundingClientRect().top;
		const inputTop = this._dragBounds.getBoundingClientRect().top;
		this._button.element.style.bottom = `calc(100% - ${getChatPetVerticalOffset(hostTop, inputTop)}px)`;
	}

	private _updateSpeechBubblePosition(): void {
		const buttonRight = this._button.element.getBoundingClientRect().right;
		const inputRight = this._dragBounds.getBoundingClientRect().right;
		this._button.element.classList.toggle('speech-bubble-left', shouldPlaceChatPetSpeechBubbleLeft(this._renderedState, buttonRight, inputRight));
	}

	private _onImageLoad(sprite: ChatPetSpriteElement): void {
		if (sprite !== this._pendingSprite || this._pendingSource === undefined || !isChatPetImageSource(sprite.image, this._pendingSource.url) || this._pendingState === undefined) {
			return;
		}

		this._spriteAnimation.clear();
		this._activeSprite?.container.classList.add('hidden');
		sprite.container.classList.remove('hidden');
		this._activeSprite = sprite;
		const state = this._pendingState;
		this._startSpriteAnimation(this._pendingSource, sprite, this._spriteAnimation, () => this._options.onDidCompleteAnimation?.(state));
		this._button.element.dataset.state = state;
		this._renderedState = state;
		this._eyes.classList.toggle('tracking', doesChatPetStateTrackCursor(state));
		this._updateSpeechBubble(state, true);
		this._pendingSprite = undefined;
		this._pendingSource = undefined;
		this._pendingState = undefined;
		this._restartEyeAnimation();
		this._updateCssAnimationTime(this._animationTime.get());
		if (doesChatPetStateTrackCursor(this._renderedState)) {
			this._gazeScheduler.schedule();
		}
		this._onDidRender.fire();
	}

	private _onImageError(image: HTMLImageElement): void {
		this._renderError = new Error(`Failed to load chat pet resource: ${image.src}`);
		this._onDidRender.fire();
	}

	private _isReady(): boolean {
		if (this._renderError) {
			throw this._renderError;
		}
		if (this._pendingState !== undefined || this._activeSprite === undefined || this._renderedState === undefined) {
			return false;
		}
		return !doesChatPetStateSpeak(this._renderedState) || this._activeSpeechAnimation !== undefined;
	}

	private _startSpriteAnimation(source: ChatPetSpriteSource, sprite: ChatPetSpriteElement, animationDisposable: MutableDisposable<IDisposable>, onComplete?: () => void): void {
		const activeAnimation: ActiveChatPetSpriteAnimation = { source, sprite, onComplete, completionReported: false };
		if (sprite === this._speechBubble) {
			this._activeSpeechAnimation = activeAnimation;
		} else {
			this._activeSpriteAnimation = activeAnimation;
		}

		const animationTime = this._animationTime.get();
		if (animationTime !== undefined) {
			this._renderControlledAnimation(activeAnimation, animationTime);
			return;
		}
		if (source.frameDurations.length < 2) {
			this._drawAnimationFrame(source, sprite, 0);
			return;
		}

		const targetWindow = dom.getWindow(sprite.canvas);
		const startTime = targetWindow.performance.now();
		let frameTimer: number | undefined;
		const animationDisposables = new DisposableStore();
		const clearFrameTimer = () => {
			if (frameTimer !== undefined) {
				targetWindow.clearTimeout(frameTimer);
				frameTimer = undefined;
			}
		};
		const scheduleFrame = (delay: number) => {
			clearFrameTimer();
			if (!targetWindow.document.hidden) {
				frameTimer = targetWindow.setTimeout(updateFrame, Math.max(1, Math.ceil(delay)));
			}
		};
		const updateFrame = () => {
			frameTimer = undefined;
			const frame = this._drawAnimationFrame(source, sprite, targetWindow.performance.now() - startTime);
			if (frame.complete) {
				animationDisposables.dispose();
				onComplete?.();
				return;
			}
			scheduleFrame(frame.nextFrameDelay);
		};
		updateFrame();
		animationDisposables.add(dom.addDisposableListener(targetWindow.document, 'visibilitychange', () => {
			clearFrameTimer();
			if (!targetWindow.document.hidden) {
				updateFrame();
			}
		}));
		animationDisposables.add(toDisposable(clearFrameTimer));
		animationDisposable.value = animationDisposables;
	}

	private _renderControlledAnimation(animation: ActiveChatPetSpriteAnimation | undefined, animationTime: number): void {
		if (!animation) {
			return;
		}
		const frame = this._drawAnimationFrame(animation.source, animation.sprite, animationTime);
		if (animation.source.frameDurations.length >= 2 && frame.complete && !animation.completionReported) {
			animation.completionReported = true;
			animation.onComplete?.();
		} else if (!frame.complete) {
			animation.completionReported = false;
		}
	}

	private _resumeAnimations(): void {
		const spriteAnimation = this._activeSpriteAnimation;
		const speechAnimation = this._activeSpeechAnimation;
		this._spriteAnimation.clear();
		this._speechAnimation.clear();
		if (spriteAnimation) {
			this._startSpriteAnimation(spriteAnimation.source, spriteAnimation.sprite, this._spriteAnimation, spriteAnimation.onComplete);
		}
		if (speechAnimation) {
			this._startSpriteAnimation(speechAnimation.source, speechAnimation.sprite, this._speechAnimation, speechAnimation.onComplete);
		}
		for (const animation of this._button.element.getAnimations({ subtree: true })) {
			if (this._options.loopAnimations) {
				animation.effect?.updateTiming({ iterations: Infinity });
			}
			animation.currentTime = 0;
			animation.play();
		}
	}

	private _drawAnimationFrame(source: ChatPetSpriteSource, sprite: ChatPetSpriteElement, elapsed: number): ChatPetAnimationFrame {
		const context = sprite.canvas.getContext('2d');
		const frame = getChatPetAnimationFrame(source.frameDurations, elapsed, this._options.loopAnimations ? Infinity : source.iterations);
		if (!context) {
			return frame;
		}
		context.imageSmoothingEnabled = false;
		context.clearRect(0, 0, CHAT_PET_SOURCE_SIZE, CHAT_PET_SOURCE_SIZE);
		context.drawImage(
			sprite.image,
			frame.frameIndex * CHAT_PET_SOURCE_SIZE,
			0,
			CHAT_PET_SOURCE_SIZE,
			CHAT_PET_SOURCE_SIZE,
			0,
			0,
			CHAT_PET_SOURCE_SIZE,
			CHAT_PET_SOURCE_SIZE
		);
		return frame;
	}

	private _updateSpeechBubble(state: ChatPetState | undefined, restart = false): void {
		this._updateSpeechBubblePosition();
		const visible = doesChatPetStateSpeak(state);
		this._speechBubble.container.classList.toggle('hidden', !visible);
		if (!visible) {
			this._speechAnimation.clear();
			this._activeSpeechAnimation = undefined;
			return;
		}

		const sources = getSpeechSpriteSources(this._variant, this._options.resourceBaseUrl);
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

	private _updateCssAnimationTime(animationTime: number | undefined): void {
		if (animationTime === undefined) {
			return;
		}
		this._button.element.getBoundingClientRect();
		for (const animation of this._button.element.getAnimations({ subtree: true })) {
			animation.pause();
			animation.currentTime = animationTime;
		}
	}
}
