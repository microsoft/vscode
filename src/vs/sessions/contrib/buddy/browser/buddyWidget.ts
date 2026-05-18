/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType, getWindow } from '../../../../base/browser/dom.js';
import { EventType as TouchEventType, Gesture } from '../../../../base/browser/touch.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IChatWidget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatToolInvocation } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatResponseViewModel, isResponseVM } from '../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { SESSIONS_BUDDY_TIPS_SETTING } from './buddySettings.js';

type BuddyState = 'idle' | 'thinking' | 'typing' | 'alert';

const TIPS: string[] = [
	localize('buddy.tip.attach', "Tip: type # to attach files or context."),
	localize('buddy.tip.slash', "Tip: try / to discover slash commands."),
	localize('buddy.tip.history', "Tip: open the Sessions list to revisit past chats."),
	localize('buddy.tip.tools', "Tip: enable extra tools from the agent picker."),
	localize('buddy.tip.confirm', "Tip: confirmations pause your agent — review and approve."),
];

const IDLE_TIP_MIN_MS = 30_000;
const IDLE_TIP_MAX_MS = 90_000;
const TIP_DURATION_MS = 4_000;
const STATE_DEBOUNCE_MS = 150;
const IDLE_ANIM_MIN_MS = 4_000;
const IDLE_ANIM_MAX_MS = 10_000;
const ONESHOT_FALLBACK_MS = 1_500;

type OneShot = 'wave' | 'jump';

/**
 * Decorative "buddy" mounted inside the chat bar during an existing session.
 * Mirrors the focused chat widget's response state and emits occasional idle
 * animations and tips. Activation is gated by {@link BuddyContribution}.
 */
export class BuddyWidget extends Disposable {

	private readonly root: HTMLDivElement;
	private readonly sprite: HTMLDivElement;
	private readonly bubble: HTMLDivElement;

	private currentState: BuddyState = 'idle';
	private pendingStateTimer: number | undefined;
	private bubbleTimer: number | undefined;
	private idleTimer: number | undefined;
	private idleAnimTimer: number | undefined;
	private oneShotCleanupTimer: number | undefined;
	private clampRafHandle: number | undefined;
	private activeOneShot: OneShot | undefined;
	private disposed = false;

	private readonly widgetSubscriptions = this._register(new MutableDisposable<DisposableStore>());
	private readonly targetWindow: Window & typeof globalThis;
	private readonly reducedMotionQuery: MediaQueryList | undefined;
	private host!: HTMLElement;

	constructor(
		host: HTMLElement,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this.targetWindow = getWindow(host) as Window & typeof globalThis;
		this.reducedMotionQuery = this.targetWindow.matchMedia?.('(prefers-reduced-motion: reduce)');

		const doc = host.ownerDocument;
		this.root = doc.createElement('div');
		this.root.className = 'agents-buddy';
		this.root.setAttribute('aria-hidden', 'true');
		this.root.style.setProperty('--buddy-x', '50%');

		this.bubble = doc.createElement('div');
		this.bubble.className = 'agents-buddy-bubble';
		this.root.appendChild(this.bubble);

		this.sprite = doc.createElement('div');
		this.sprite.className = 'agents-buddy-sprite state-idle';
		this.root.appendChild(this.sprite);

		host.appendChild(this.root);
		this._register(toDisposable(() => this.root.remove()));

		this._register(addDisposableListener(this.sprite, EventType.CLICK, e => {
			e.preventDefault();
			e.stopPropagation();
			this.onUserPoke();
		}));
		this._register(Gesture.addTarget(this.sprite));
		this._register(addDisposableListener(this.sprite, TouchEventType.Tap, e => {
			e.preventDefault();
			e.stopPropagation();
			this.onUserPoke();
		}));

		this.attachToWidget(this.chatWidgetService.lastFocusedWidget);
		this._register(this.chatWidgetService.onDidChangeFocusedWidget(w => this.attachToWidget(w)));
		this._register(this.chatWidgetService.onDidChangeFocusedSession(() => this.attachToWidget(this.chatWidgetService.lastFocusedWidget)));

		this.host = host;

		this.scheduleIdleTip();
		this.scheduleIdleAnim();
	}

	override dispose(): void {
		this.disposed = true;
		this.clearTimer('pendingStateTimer');
		this.clearTimer('bubbleTimer');
		this.clearTimer('idleTimer');
		this.clearTimer('idleAnimTimer');
		this.clearTimer('oneShotCleanupTimer');
		this.stopClampLoop();
		super.dispose();
	}

	private attachToWidget(widget: IChatWidget | undefined): void {
		const store = new DisposableStore();
		this.widgetSubscriptions.value = store;

		if (!widget) {
			this.requestState('idle');
			return;
		}

		// Re-bind to whatever viewModel the widget currently owns.
		const vmHolder = store.add(new MutableDisposable<DisposableStore>());
		const rebindViewModel = () => {
			vmHolder.value = this.subscribeViewModel(widget);
		};
		rebindViewModel();
		store.add(widget.onDidChangeViewModel(() => rebindViewModel()));
	}

	private subscribeViewModel(widget: IChatWidget): DisposableStore {
		const store = new DisposableStore();
		const vm = widget.viewModel;
		if (!vm) {
			this.requestState('idle');
			return store;
		}

		const toolSubs = store.add(new DisposableStore());
		const refresh = () => this.computeStateFromWidget(widget);

		const rebindToolStates = () => {
			toolSubs.clear();
			const items = vm.getItems();
			for (let i = items.length - 1; i >= 0; i--) {
				const item = items[i];
				if (!isResponseVM(item)) {
					continue;
				}
				if (item.isComplete) {
					break;
				}
				for (const part of item.response.value) {
					if (part.kind === 'toolInvocation') {
						// Re-runs whenever the tool's state observable fires so we catch
						// Streaming → Executing → Completed transitions inside a single response.
						toolSubs.add(autorun(reader => {
							part.state.read(reader);
							refresh();
						}));
					}
				}
				// Only the latest in-progress response matters.
				break;
			}
		};

		store.add(vm.onDidChange(() => {
			rebindToolStates();
			refresh();
		}));
		rebindToolStates();
		refresh();
		return store;
	}

	private computeStateFromWidget(widget: IChatWidget): void {
		if (this.disposed) {
			return;
		}
		const vm = widget.viewModel;
		if (!vm) {
			this.requestState('idle');
			return;
		}
		const items = vm.getItems();
		let next: BuddyState = 'idle';
		for (let i = items.length - 1; i >= 0; i--) {
			const item = items[i];
			if (!isResponseVM(item)) {
				continue;
			}
			if (item.isComplete) {
				break;
			}
			next = this.deriveStateForResponse(item);
			break;
		}
		this.requestState(next);
	}

	private deriveStateForResponse(item: IChatResponseViewModel): BuddyState {
		let hasTyping = false;
		let hasThinking = false;
		for (const part of item.response.value) {
			if (part.kind === 'confirmation' && !part.isUsed) {
				return 'alert';
			}
			if (part.kind === 'toolInvocation') {
				const state = part.state.get();
				switch (state.type) {
					case IChatToolInvocation.StateKind.WaitingForConfirmation:
					case IChatToolInvocation.StateKind.WaitingForPostApproval:
						return 'alert';
					case IChatToolInvocation.StateKind.Streaming:
					case IChatToolInvocation.StateKind.Executing:
						hasTyping = true;
						break;
				}
			} else if (part.kind === 'thinking') {
				hasThinking = true;
			}
		}
		if (hasTyping) {
			return 'typing';
		}
		if (hasThinking) {
			return 'thinking';
		}
		return 'idle';
	}

	private requestState(state: BuddyState): void {
		this.clearTimer('pendingStateTimer');
		if (state === this.currentState) {
			return;
		}
		this.pendingStateTimer = this.targetWindow.setTimeout(() => {
			this.pendingStateTimer = undefined;
			this.applyState(state);
		}, STATE_DEBOUNCE_MS);
	}

	private applyState(state: BuddyState): void {
		if (state === this.currentState) {
			return;
		}
		this.sprite.classList.remove(`state-${this.currentState}`);
		this.sprite.classList.add(`state-${state}`);
		this.currentState = state;

		switch (state) {
			case 'thinking':
				this.showBubble('…');
				break;
			case 'typing':
				this.showBubble(localize('buddy.bubble.typing', "typing"));
				break;
			case 'alert':
				this.showBubble('!');
				this.jump();
				break;
			default:
				this.hideBubble();
				break;
		}
	}

	private showBubble(text: string, durationMs?: number): void {
		this.clearTimer('bubbleTimer');
		this.bubble.textContent = text;
		this.bubble.classList.add('visible');
		// Continuously re-clamp while the bubble is visible so it tracks the
		// buddy's `left` transition, dock resizes, and idle jumps.
		this.startClampLoop();
		if (durationMs !== undefined) {
			this.bubbleTimer = this.targetWindow.setTimeout(() => {
				this.bubbleTimer = undefined;
				this.hideBubble();
			}, durationMs);
		}
	}

	private startClampLoop(): void {
		if (this.clampRafHandle !== undefined) {
			return;
		}
		const tick = () => {
			this.clampRafHandle = undefined;
			if (this.disposed || !this.bubble.classList.contains('visible')) {
				return;
			}
			this.clampBubble();
			this.clampRafHandle = this.targetWindow.requestAnimationFrame(tick);
		};
		this.clampRafHandle = this.targetWindow.requestAnimationFrame(tick);
	}

	private stopClampLoop(): void {
		if (this.clampRafHandle !== undefined) {
			this.targetWindow.cancelAnimationFrame(this.clampRafHandle);
			this.clampRafHandle = undefined;
		}
	}

	private clampBubble(): void {
		if (this.disposed || !this.bubble.classList.contains('visible')) {
			return;
		}
		// Compute the bubble's natural (unscaled) width via `offsetWidth` and
		// the buddy's current anchor via the root's live position, so we keep
		// the bubble inside the dock even while it animates left/right.
		const hostRect = this.host.getBoundingClientRect();
		const rootRect = this.root.getBoundingClientRect();
		const bubbleWidth = this.bubble.offsetWidth;
		const anchorX = rootRect.left;
		const margin = 6;
		const minLeft = hostRect.left + margin;
		const maxRight = hostRect.right - margin;
		const targetLeft = anchorX - bubbleWidth / 2;
		let shift = 0;
		if (targetLeft < minLeft) {
			shift = minLeft - targetLeft;
		} else if (targetLeft + bubbleWidth > maxRight) {
			shift = maxRight - (targetLeft + bubbleWidth);
		}
		this.bubble.style.setProperty('--bubble-shift', `${shift}px`);
	}

	private hideBubble(): void {
		this.clearTimer('bubbleTimer');
		this.stopClampLoop();
		this.bubble.classList.remove('visible');
	}

	private jump(): void {
		if (this.prefersReducedMotion()) {
			return;
		}
		// Toggle the jump on the root container (transform) so it doesn't
		// override the sprite's frame-step animation.
		this.root.classList.remove('jumping');
		void this.root.offsetWidth;
		this.root.classList.add('jumping');
		const x = 10 + Math.random() * 80;
		this.root.style.setProperty('--buddy-x', `${x}%`);
	}

	private scheduleIdleTip(): void {
		this.clearTimer('idleTimer');
		const delay = IDLE_TIP_MIN_MS + Math.random() * (IDLE_TIP_MAX_MS - IDLE_TIP_MIN_MS);
		this.idleTimer = this.targetWindow.setTimeout(() => {
			this.idleTimer = undefined;
			if (this.currentState === 'idle' && this.tipsEnabled()) {
				this.showBubble(this.pickTip(), TIP_DURATION_MS);
			}
			this.scheduleIdleTip();
		}, delay);
	}

	private scheduleIdleAnim(): void {
		this.clearTimer('idleAnimTimer');
		const delay = IDLE_ANIM_MIN_MS + Math.random() * (IDLE_ANIM_MAX_MS - IDLE_ANIM_MIN_MS);
		this.idleAnimTimer = this.targetWindow.setTimeout(() => {
			this.idleAnimTimer = undefined;
			if (this.currentState === 'idle') {
				this.playOneShot(Math.random() < 0.5 ? 'wave' : 'jump');
			}
			this.scheduleIdleAnim();
		}, delay);
	}

	private playOneShot(kind: OneShot): void {
		if (this.prefersReducedMotion() || this.activeOneShot) {
			return;
		}
		this.activeOneShot = kind;
		const cls = `oneshot-${kind}`;
		this.sprite.classList.add(cls);
		if (kind === 'jump') {
			// Keep the existing root-level bounce transform in sync with the
			// jump sprite swap so the buddy actually leaves the floor.
			this.jump();
		}
		const cleanup = () => {
			this.clearTimer('oneShotCleanupTimer');
			if (this.activeOneShot !== kind) {
				return;
			}
			this.sprite.classList.remove(cls);
			this.sprite.removeEventListener('animationend', onEnd);
			this.activeOneShot = undefined;
		};
		const onEnd = (e: AnimationEvent) => {
			// `agents-buddy-frames-4` runs for the persistent state too — only
			// react to the one-shot's iteration ending.
			if (e.target === this.sprite) {
				cleanup();
			}
		};
		this.sprite.addEventListener('animationend', onEnd);
		this.oneShotCleanupTimer = this.targetWindow.setTimeout(cleanup, ONESHOT_FALLBACK_MS);
	}

	private onUserPoke(): void {
		if (this.currentState === 'idle') {
			this.playOneShot('wave');
		} else {
			this.jump();
		}
		if (this.tipsEnabled()) {
			this.showBubble(this.pickTip(), TIP_DURATION_MS);
		}
	}

	private pickTip(): string {
		return TIPS[Math.floor(Math.random() * TIPS.length)];
	}

	private tipsEnabled(): boolean {
		return this.configurationService.getValue<boolean>(SESSIONS_BUDDY_TIPS_SETTING) !== false;
	}

	private prefersReducedMotion(): boolean {
		return this.reducedMotionQuery?.matches === true;
	}

	private clearTimer(name: 'pendingStateTimer' | 'bubbleTimer' | 'idleTimer' | 'idleAnimTimer' | 'oneShotCleanupTimer'): void {
		const id = this[name];
		if (id !== undefined) {
			this.targetWindow.clearTimeout(id);
			this[name] = undefined;
		}
	}
}
