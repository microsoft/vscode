/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { VirtualClock } from '../../../../../base/test/common/virtualScheduling/index.js';
import { localize } from '../../../../../nls.js';
import { ChatPetVariant } from '../../../../contrib/chat/browser/chatPetService.js';
import { ChatPetAnimationDurationSource, ChatPetState, ChatPetView, doesChatPetStateTrackCursor } from '../../../../contrib/chat/browser/widget/chatPetWidget.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

interface ChatPetFixtureOptions {
	readonly state: ChatPetState;
	readonly defaultProgress: number;
	readonly durationSource?: ChatPetAnimationDurationSource;
	readonly variant?: ChatPetVariant;
	readonly presentation?: 'entering' | 'exiting' | 'dragging';
	readonly position?: 'left' | 'right';
}

class ChatPetFixtureTimeline extends Disposable {

	readonly time = observableValue(this, 0);
	readonly duration = observableValue(this, 0);
	private _clock = new VirtualClock();

	configure(duration: number, defaultProgress: number): void {
		this.duration.set(duration, undefined);
		this.setTime(Math.round(duration * defaultProgress));
	}

	setTime(time: number): void {
		const clampedTime = Math.max(0, Math.min(time, this.duration.get()));
		if (clampedTime < this._clock.now) {
			this._clock = new VirtualClock();
		}
		if (clampedTime > this._clock.now) {
			this._clock.schedule({
				time: clampedTime,
				run() { },
				source: { toString: () => 'Chat pet timeline slider' },
			});
			this._clock.runNext();
		}
		this.time.set(this._clock.now, undefined);
	}
}

function formatAnimationTime(time: number, duration: number): string {
	return `${time} ms / ${duration} ms`;
}

class ChatPetFixtureGazeTarget extends Disposable {

	private readonly _element: HTMLButtonElement;
	private _x = 0;
	private _y = 0;
	private _dragOffset: readonly [number, number] | undefined;

	constructor(
		private readonly _container: HTMLElement,
		private readonly _view: ChatPetView,
	) {
		super();

		this._element = dom.append(_container, dom.$('button.chat-pet-fixture-cursor')) as HTMLButtonElement;
		this._element.type = 'button';
		this._element.ariaLabel = localize('chatPet.fixture.gazeTarget', "Pet gaze target");
		this._element.style.position = 'absolute';
		this._element.style.width = '16px';
		this._element.style.height = '16px';
		this._element.style.padding = '0';
		this._element.style.border = 'var(--vscode-strokeThickness) solid var(--vscode-focusBorder)';
		this._element.style.borderRadius = 'var(--vscode-cornerRadius-circle)';
		this._element.style.backgroundColor = 'var(--vscode-editor-background)';
		this._element.style.cursor = 'grab';
		this._element.style.touchAction = 'none';
		this._element.style.transform = 'translate(-50%, -50%)';

		const bounds = _container.getBoundingClientRect();
		this._setPosition(bounds.width * 0.75, bounds.height * 0.25);
		this._register(dom.addDisposableListener(this._element, dom.EventType.POINTER_DOWN, (event: PointerEvent) => this._startDrag(event)));
		this._register(dom.addDisposableListener(this._element, dom.EventType.POINTER_MOVE, (event: PointerEvent) => this._drag(event)));
		this._register(dom.addDisposableListener(this._element, dom.EventType.POINTER_UP, (event: PointerEvent) => this._stopDrag(event)));
		this._register(dom.addDisposableListener(this._element, 'pointercancel', (event: PointerEvent) => this._stopDrag(event)));
		this._register(dom.addDisposableListener(this._element, dom.EventType.KEY_DOWN, (event: KeyboardEvent) => this._moveWithKeyboard(event)));
	}

	private _startDrag(event: PointerEvent): void {
		const bounds = this._container.getBoundingClientRect();
		this._dragOffset = [event.clientX - bounds.left - this._x, event.clientY - bounds.top - this._y];
		this._element.setPointerCapture(event.pointerId);
		this._element.style.cursor = 'grabbing';
		event.preventDefault();
	}

	private _drag(event: PointerEvent): void {
		if (!this._dragOffset || !this._element.hasPointerCapture(event.pointerId)) {
			return;
		}
		const bounds = this._container.getBoundingClientRect();
		this._setPosition(event.clientX - bounds.left - this._dragOffset[0], event.clientY - bounds.top - this._dragOffset[1]);
	}

	private _stopDrag(event: PointerEvent): void {
		this._dragOffset = undefined;
		if (this._element.hasPointerCapture(event.pointerId)) {
			this._element.releasePointerCapture(event.pointerId);
		}
		this._element.style.cursor = 'grab';
	}

	private _moveWithKeyboard(event: KeyboardEvent): void {
		const distance = event.shiftKey ? 10 : 1;
		switch (event.key) {
			case 'ArrowLeft':
				this._setPosition(this._x - distance, this._y);
				break;
			case 'ArrowRight':
				this._setPosition(this._x + distance, this._y);
				break;
			case 'ArrowUp':
				this._setPosition(this._x, this._y - distance);
				break;
			case 'ArrowDown':
				this._setPosition(this._x, this._y + distance);
				break;
			default:
				return;
		}
		event.preventDefault();
	}

	private _setPosition(x: number, y: number): void {
		const bounds = this._container.getBoundingClientRect();
		this._x = Math.max(0, Math.min(bounds.width, x));
		this._y = Math.max(0, Math.min(bounds.height, y));
		this._element.style.left = `${this._x}px`;
		this._element.style.top = `${this._y}px`;
		this._view.setCursorPosition(bounds.left + this._x, bounds.top + this._y);
	}
}

function defineChatPetFixture(options: ChatPetFixtureOptions) {
	return defineComponentFixture({
		labels: { kind: 'animated' },
		virtualTime: { enabled: false },
		enableAnimationsByDefault: true,
		disableAnimationsWithCss: false,
		render: context => renderChatPet(context, options),
	});
}

async function renderChatPet(context: ComponentFixtureContext, options: ChatPetFixtureOptions): Promise<void> {
	const { animationsEnabled, container, disposableStore } = context;
	container.style.width = '480px';
	container.style.height = '240px';
	container.style.position = 'relative';
	container.style.backgroundColor = 'var(--vscode-sideBar-background, var(--vscode-editor-background))';

	const host = dom.append(container, dom.$('.chat-pet-fixture-host'));
	host.style.position = 'absolute';
	host.style.left = 'var(--vscode-spacing-size400)';
	host.style.right = 'var(--vscode-spacing-size400)';
	host.style.bottom = 'calc(var(--vscode-spacing-size400) + var(--vscode-spacing-size320))';
	host.style.height = '48px';
	host.style.backgroundColor = 'var(--vscode-input-background)';
	host.style.border = 'var(--vscode-strokeThickness) solid var(--vscode-input-border, transparent)';
	host.style.borderRadius = 'var(--vscode-cornerRadius-small)';

	const timelineControls = dom.append(container, dom.$('.chat-pet-fixture-timeline'));
	timelineControls.style.position = 'absolute';
	timelineControls.style.left = 'var(--vscode-spacing-size400)';
	timelineControls.style.right = 'var(--vscode-spacing-size400)';
	timelineControls.style.bottom = 'var(--vscode-spacing-size120)';
	timelineControls.style.display = 'grid';
	timelineControls.style.gridTemplateColumns = 'auto 1fr auto';
	timelineControls.style.alignItems = 'center';
	timelineControls.style.gap = 'var(--vscode-spacing-size80)';

	const animationTimeLabel = localize('chatPet.fixture.animationTime', "Animation time");
	const timelineLabel = dom.append(timelineControls, dom.$('span'));
	timelineLabel.textContent = animationTimeLabel;
	const timelineSlider = dom.append(timelineControls, dom.$('input')) as HTMLInputElement;
	timelineSlider.type = 'range';
	timelineSlider.min = '0';
	timelineSlider.step = '10';
	timelineSlider.setAttribute('aria-label', animationTimeLabel);
	const timelineValue = dom.append(timelineControls, dom.$('output'));
	timelineValue.style.fontVariantNumeric = 'tabular-nums';
	timelineValue.style.textAlign = 'right';

	const timeline = disposableStore.add(new ChatPetFixtureTimeline());
	const animationTime = observableValue<number | undefined>('chatPetFixtureAnimationTime', 0);
	const view = disposableStore.add(new ChatPetView(host, host, {
		ariaLabel: localize('chatPet.interact', "Interact with the VS Code pet. Use the context menu to put it on the run."),
		animationTime,
		loopAnimations: true,
		resourceBaseUrl: '/out',
		trackDocumentCursor: false,
	}));
	view.renderState(options.state, options.variant ?? 'stable', false, true);
	view.show(true);

	switch (options.presentation) {
		case 'entering':
			view.show(false);
			break;
		case 'exiting':
			view.hide(false);
			break;
		case 'dragging':
			view.setDragging(true);
			view.setResisting(true);
			break;
	}
	if (options.position === 'left') {
		view.setHorizontalPosition(0);
	}

	await view.whenReady();
	if (doesChatPetStateTrackCursor(options.state)) {
		disposableStore.add(new ChatPetFixtureGazeTarget(container, view));
	}
	const duration = view.getAnimationDuration(options.durationSource ?? 'sprite');
	if (duration <= 0) {
		throw new Error(`Chat pet fixture state '${options.state}' has no ${options.durationSource ?? 'sprite'} animation`);
	}
	timeline.configure(duration, options.defaultProgress);
	timelineControls.style.gridTemplateColumns = `auto minmax(0, 1fr) ${formatAnimationTime(duration, duration).length}ch`;

	disposableStore.add(dom.addDisposableListener(timelineSlider, dom.EventType.INPUT, () => {
		timeline.setTime(timelineSlider.valueAsNumber);
	}));
	disposableStore.add(autorun(reader => {
		const enabled = animationsEnabled.read(reader);
		timelineControls.style.display = enabled ? 'none' : 'grid';
		animationTime.set(enabled ? undefined : timeline.time.read(reader), undefined);
	}));
	disposableStore.add(autorun(reader => {
		const time = timeline.time.read(reader);
		const duration = timeline.duration.read(reader);
		timelineSlider.max = String(duration);
		timelineSlider.value = String(time);
		timelineValue.textContent = formatAnimationTime(time, duration);
	}));
}

export default defineThemedFixtureGroup({ path: 'chat/pet/' }, {
	Idle: defineChatPetFixture({ state: 'idle', defaultProgress: 0.25 }),
	Sleeping: defineChatPetFixture({ state: 'sleep', defaultProgress: 0.5 }),
	Waking: defineChatPetFixture({ state: 'waking', defaultProgress: 0.5 }),
	Typing: defineChatPetFixture({ state: 'typing', defaultProgress: 0.5 }),
	Rendering: defineChatPetFixture({ state: 'rendering', defaultProgress: 0.5 }),
	Complete: defineChatPetFixture({ state: 'complete', defaultProgress: 0.5, durationSource: 'css' }),
	Love: defineChatPetFixture({ state: 'love', defaultProgress: 0.4 }),
	Clapping: defineChatPetFixture({ state: 'clapping', defaultProgress: 0.5 }),
	Jump: defineChatPetFixture({ state: 'jump', defaultProgress: 0.5, durationSource: 'css' }),
	Cool: defineChatPetFixture({ state: 'cool', defaultProgress: 0.6 }),
	YappingFall: defineChatPetFixture({ state: 'yapping', defaultProgress: 0.75, durationSource: 'css' }),
	YappingMouthOpen: defineChatPetFixture({ state: 'yappingMouthOpen', defaultProgress: 0.5 }),
	Searching: defineChatPetFixture({ state: 'searching', defaultProgress: 0.5 }),
	SearchingDown: defineChatPetFixture({ state: 'searchingDown', defaultProgress: 0.5, durationSource: 'css' }),
	Entering: defineChatPetFixture({ state: 'idle', defaultProgress: 0.65, durationSource: 'css', presentation: 'entering' }),
	Exiting: defineChatPetFixture({ state: 'idle', defaultProgress: 0.65, durationSource: 'css', presentation: 'exiting' }),
	DraggingResistance: defineChatPetFixture({ state: 'idle', defaultProgress: 0.5, durationSource: 'css', presentation: 'dragging' }),
	InsidersColors: defineChatPetFixture({ state: 'idle', defaultProgress: 0.25, variant: 'insiders' }),
	RenderingSpeechBubbleLeft: defineChatPetFixture({ state: 'rendering', defaultProgress: 0.5, position: 'left' }),
});
