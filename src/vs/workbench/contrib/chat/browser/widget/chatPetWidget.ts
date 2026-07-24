/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatPet.css';
import * as dom from '../../../../../base/browser/dom.js';
import { GlobalPointerMoveMonitor } from '../../../../../base/browser/globalPointerMoveMonitor.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { IHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegate.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { autorun, IObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import product from '../../../../../platform/product/common/product.js';
import { IChatModel } from '../../common/model/chatModel.js';
import { IChatPetService } from '../chatPetService.js';

export type ChatPetState = 'idle' | 'sleep' | 'processing' | 'complete' | 'love' | 'clapping';

const IDLE_SLEEP_DELAY = 60_000;
const TRANSIENT_STATE_DURATION = 2_000;
const DRAG_THRESHOLD = 2;
const KEYBOARD_MOVE_DISTANCE = 8;

export function getChatPetBuddyName(quality: string | undefined): 'buddy-idle-stable' | 'buddy-idle-insiders' {
	return quality === 'stable' ? 'buddy-idle-stable' : 'buddy-idle-insiders';
}

const buddyName = getChatPetBuddyName(product.quality);
let spriteSources: Record<ChatPetState, { animated: string; reducedMotion: string }> | undefined;

function createSpriteSources(name: string): { animated: string; reducedMotion: string } {
	const root = 'vs/workbench/contrib/chat/browser/widget/media/chatPet';
	return {
		animated: FileAccess.asBrowserUri(`${root}/${name}-tracking-96.gif`).toString(true),
		reducedMotion: FileAccess.asBrowserUri(`${root}/${name}-tracking-96.png`).toString(true),
	};
}

function getSpriteSources(): Record<ChatPetState, { animated: string; reducedMotion: string }> {
	if (!spriteSources) {
		const buddySources = createSpriteSources(buddyName);
		spriteSources = {
			idle: buddySources,
			sleep: buddySources,
			processing: buddySources,
			complete: buddySources,
			love: buddySources,
			clapping: buddySources,
		};
	}

	return spriteSources;
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
	private readonly _image: HTMLImageElement;
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
	private _currentState: ChatPetState = 'idle';
	private _motionReduced = false;
	private _enabled = false;
	private _enablementInitialized = false;
	private _hasCustomPosition = false;
	private _suppressNextPointerClick = false;

	constructor(
		private readonly parent: HTMLElement,
		private readonly dragBounds: HTMLElement,
		model: IObservable<IChatModel | undefined>,
		@IChatPetService private readonly chatPetService: IChatPetService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IHoverService hoverService: IHoverService,
	) {
		super();

		this.parent.classList.add('chat-pet-host');
		this._button = this._register(new Button(this.parent, {
			ariaLabel: localize('chatPet.love', "Show the VS Code pet some love!"),
		}));
		this._button.element.classList.add('chat-pet-button');
		const resizeObserver = this._register(new dom.DisposableResizeObserver('ChatPetWidget.dragBounds', () => {
			if (this._hasCustomPosition) {
				this._setHorizontalPosition(this._getCurrentLeft());
			}
		}, dom.getWindow(this._button.element)));
		this._register(resizeObserver.observe(this.dragBounds));
		this._image = dom.append(this._button.element, dom.$('img.chat-pet-sprite')) as HTMLImageElement;
		this._image.alt = '';
		this._image.setAttribute('aria-hidden', 'true');
		this._register(dom.addDisposableListener(this._image, 'load', () => this._restartEyeAnimation()));
		this._eyes = dom.append(this._button.element, dom.$('.chat-pet-eyes'));
		this._eyes.setAttribute('aria-hidden', 'true');
		for (const side of ['left', 'right']) {
			const eye = dom.append(this._eyes, dom.$(`.chat-pet-eye.${side}`));
			this._pupils.push(dom.append(eye, dom.$('.chat-pet-pupil')));
		}
		this._gazeScheduler = this._register(new dom.AnimationFrameScheduler(this._button.element, () => this._updateGaze()));
		this._register(dom.addDisposableListener(dom.getWindow(this._button.element).document, dom.EventType.POINTER_MOVE, (event: PointerEvent) => {
			this._cursorPosition = [event.clientX, event.clientY];
			if (this._enabled) {
				this._gazeScheduler.schedule();
			}
		}));
		this._register(dom.addDisposableListener(this._button.element, dom.EventType.ANIMATION_END, event => {
			if (event.animationName === 'chat-pet-exit' && !this._enabled) {
				this._finishDisable();
			}
		}));
		this._register(dom.addDisposableListener(this._button.element, dom.EventType.POINTER_DOWN, event => this._startDrag(event)));
		this._register(dom.addDisposableListener(this._button.element, dom.EventType.KEY_DOWN, event => this._onKeyDown(event)));

		const defaultHoverDelegate = getDefaultHoverDelegate('element');
		const hoverDelegate: IHoverDelegate = {
			get delay() { return defaultHoverDelegate.delay; },
			showHover: (options, focus) => hoverService.showInstantHover({
				...options,
				position: {
					...options.position,
					hoverPosition: HoverPosition.ABOVE,
				},
			}, focus),
		};
		const managedHover = this._register(hoverService.setupManagedHover(
			hoverDelegate,
			this._button.element,
			localize('chatPet.hover', "Show the VS Code pet some love! Stay tuned for more interactions..."),
		));

		this._register(this._button.onDidClick(e => {
			dom.EventHelper.stop(e, true);
			if (this._suppressNextPointerClick && e.type !== dom.EventType.KEY_DOWN) {
				this._suppressNextPointerClick = false;
				this._clickSuppressionScheduler.cancel();
				return;
			}
			this._showTransientState('love');
			managedHover.show();
			status(localize('chatPet.loved', "The VS Code pet feels loved"));
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
		this._image.removeAttribute('src');
	}

	private _showTransientState(state: ChatPetState): void {
		if (!this.chatPetService.enabled.get()) {
			return;
		}

		this._idleExpired.set(false, undefined);
		this._idleScheduler.schedule();
		this._transientState.set(state, undefined);
		this._transientScheduler.schedule();
		this._renderState(state, true);
	}

	private _renderState(state: ChatPetState, restart = false): void {
		const sources = getSpriteSources()[state];
		const source = this._motionReduced ? sources.reducedMotion : sources.animated;
		if (restart || this._currentState !== state || this._image.src !== source) {
			if (restart) {
				this._image.removeAttribute('src');
			}
			this._eyes.classList.remove('animated');
			this._image.src = source;
		}
		this._currentState = state;
		this._button.element.dataset.state = state;
	}

	private _restartEyeAnimation(): void {
		this._eyes.classList.remove('animated');
		this._eyes.getBoundingClientRect();
		if (!this._motionReduced) {
			this._eyes.classList.add('animated');
		}
	}
}
