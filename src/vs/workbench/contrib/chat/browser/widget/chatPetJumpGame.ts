/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatPetJumpGame.css';
import * as dom from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { clamp } from '../../../../../base/common/numbers.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ChatPetJumpDirection, ChatPetJumpGameModel } from '../../common/chatPetJumpGame.js';

export const ChatPetJumpGameFocusedContext = new RawContextKey<boolean>('chatPetJumpGameFocused', false, localize('chatPet.jump.focused', "Whether Blobby's jump game is focused"));

interface IChatPetJumpGameOptions {
	readonly bounds: HTMLElement;
	readonly platform: HTMLElement;
	readonly motionReduced: boolean;
	readonly onRender: (airborne: boolean, direction: ChatPetJumpDirection) => void;
	readonly onExit: (reason: 'escape' | 'fall' | 'blur' | 'cancel') => void;
}

const FADE_DURATION = 160;

export class ChatPetJumpGame extends Disposable {
	private readonly model: ChatPetJumpGameModel;
	private readonly effects: HTMLElement;
	private readonly backdrop: HTMLElement;
	private readonly stage: HTMLElement;
	private readonly gauge: HTMLElement;
	private readonly cells: HTMLElement[];
	private readonly platforms = new Map<number, HTMLElement>();
	private readonly frame = this._register(new MutableDisposable());
	private readonly originalParent: HTMLElement;
	private readonly originalStyle: Pick<CSSStyleDeclaration, 'left' | 'right' | 'top' | 'bottom'>;
	private readonly originalAriaLabel: string | null;
	private readonly originalFacing: string | undefined;
	private readonly fadeIn: Animation | undefined;
	private effectsReleased = false;
	private bounds: DOMRect;
	private anchor = 0;
	private lastFrameTime: number | undefined;
	private paused = false;
	private disposed = false;

	constructor(
		private readonly overlay: HTMLElement,
		private readonly pet: HTMLElement,
		private readonly options: IChatPetJumpGameOptions,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super();
		this.originalParent = overlay.parentElement!;
		this.originalStyle = { left: pet.style.left, right: pet.style.right, top: pet.style.top, bottom: pet.style.bottom };
		this.originalAriaLabel = pet.getAttribute('aria-label');
		this.originalFacing = pet.dataset.facing;
		const petBounds = pet.getBoundingClientRect();
		this.bounds = options.bounds.getBoundingClientRect();
		this.model = new ChatPetJumpGameModel(this.bounds.width, petBounds.width, petBounds.left + petBounds.width / 2 - this.bounds.left);
		const root = this.originalParent.closest<HTMLElement>('.monaco-workbench') ?? dom.getWindow(pet).document.body;
		this.effects = dom.append(root, dom.$('.chat-pet-jump-effects', { 'aria-hidden': 'true' }));
		this.backdrop = dom.append(this.effects, dom.$('.chat-pet-jump-backdrop'));
		this.stage = dom.append(this.effects, dom.$('.chat-pet-jump-stage'));
		this.gauge = dom.append(this.stage, dom.$('.chat-pet-jump-charge'));
		const track = dom.append(this.gauge, dom.$('.chat-pet-jump-charge-track'));
		this.cells = Array.from({ length: 8 }, () => dom.append(track, dom.$('.chat-pet-jump-charge-cell')));
		dom.append(this.stage, dom.$('.chat-pet-jump-hint')).textContent = localize('chatPet.jump.controls', "Hold Space to charge, release to jump. Left / Right to hop or aim. Esc to exit.");

		root.appendChild(overlay);
		overlay.classList.add('chat-pet-jump-game');
		if (!options.motionReduced) {
			this.fadeIn = this.effects.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_DURATION, easing: 'ease-out' });
			this._register(toDisposable(() => this.fadeIn?.cancel()));
		}
		const scopedContext = this._register(contextKeyService.createScoped(overlay));
		ChatPetJumpGameFocusedContext.bindTo(scopedContext).set(true);
		let label = localize('chatPet.jump.label', "Blobby's jump game. Hold Space to charge and release to jump. Use Left and Right Arrow to hop or aim. Press Escape to exit.");
		if (configurationService.getValue<boolean>(AccessibilityVerbositySettingId.ChatPetJumpGame)) {
			const helpKeybinding = keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
			if (helpKeybinding) {
				label = localize('chatPet.jump.helpHint', "{0} Press {1} for accessibility help.", label, helpKeybinding);
			}
		}
		pet.setAttribute('aria-label', label);

		const targetWindow = dom.getWindow(pet);
		this._register(dom.addDisposableListener(overlay, dom.EventType.KEY_DOWN, (event: KeyboardEvent) => this.onKeyDown(event), true));
		this._register(dom.addDisposableListener(overlay, dom.EventType.KEY_UP, (event: KeyboardEvent) => {
			if (new StandardKeyboardEvent(event).keyCode === KeyCode.Space) {
				event.preventDefault();
				event.stopImmediatePropagation();
				this.model.setChargeHeld(false);
				this.render();
			}
		}, true));
		this._register(dom.addDisposableListener(pet, dom.EventType.BLUR, () => {
			if (!this.paused) {
				options.onExit('blur');
			}
		}));
		this._register(dom.addDisposableListener(targetWindow, dom.EventType.BLUR, () => {
			if (!this.paused) {
				options.onExit('cancel');
			}
		}));
		this._register(dom.addDisposableListener(targetWindow.document, 'visibilitychange', () => {
			if (targetWindow.document.hidden) {
				options.onExit('cancel');
			}
		}));
		this._register(dom.addDisposableListener(targetWindow.document, dom.EventType.POINTER_DOWN, (event: PointerEvent) => {
			if (!this.paused && !event.composedPath().includes(pet)) {
				options.onExit('blur');
			}
		}, true));
		this.layout();
		pet.focus({ preventScroll: true });
		this.effects.classList.toggle('keyboard-focused', pet.matches(':focus-visible'));
		status(label);
		this.scheduleFrame();
	}

	isFocused(): boolean {
		return !this.disposed && dom.getActiveElement() === this.pet;
	}

	layout(): void {
		const bounds = this.options.bounds.getBoundingClientRect();
		const platform = this.options.platform.getBoundingClientRect();
		if (bounds.width < this.model.petSize * 2 || bounds.height <= 0 || platform.width <= 0 || !this.options.platform.checkVisibility({ checkVisibilityCSS: true })) {
			this.options.onExit('cancel');
			return;
		}
		this.bounds = bounds;
		this.model.resize(bounds.width);
		this.anchor = clamp(platform.top - bounds.top, this.model.petSize + 48, bounds.height - 32);
		const effectsBounds = this.effects.getBoundingClientRect();
		this.backdrop.style.left = `${bounds.left - effectsBounds.left}px`;
		this.backdrop.style.top = `${bounds.top - effectsBounds.top}px`;
		this.backdrop.style.width = `${bounds.width}px`;
		this.backdrop.style.height = `${bounds.height}px`;
		this.stage.style.left = `${bounds.left - effectsBounds.left}px`;
		this.stage.style.top = `${bounds.top - effectsBounds.top}px`;
		this.stage.style.width = `${bounds.width}px`;
		this.stage.style.height = `${bounds.height}px`;
		this.render();
	}

	private onKeyDown(event: KeyboardEvent): void {
		const keyboardEvent = new StandardKeyboardEvent(event);
		if (keyboardEvent.keyCode === KeyCode.Tab || keyboardEvent.equals(KeyCode.Escape)) {
			if (keyboardEvent.equals(KeyCode.Escape)) {
				event.preventDefault();
				event.stopImmediatePropagation();
			}
			this.options.onExit(keyboardEvent.equals(KeyCode.Escape) ? 'escape' : 'blur');
			return;
		}
		if (keyboardEvent.ctrlKey || keyboardEvent.altKey || keyboardEvent.metaKey || keyboardEvent.shiftKey) {
			return;
		}
		if (![KeyCode.Space, KeyCode.LeftArrow, KeyCode.RightArrow, KeyCode.Enter].includes(keyboardEvent.keyCode)) {
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		this.effects.classList.add('keyboard-focused');
		if (keyboardEvent.equals(KeyCode.Space)) {
			this.model.setChargeHeld(true);
		} else if (keyboardEvent.equals(KeyCode.LeftArrow) || keyboardEvent.equals(KeyCode.RightArrow)) {
			this.model.hop(keyboardEvent.equals(KeyCode.LeftArrow) ? -1 : 1);
		}
		this.render();
	}

	private scheduleFrame(): void {
		if (this.disposed || this.paused) {
			return;
		}
		this.frame.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(this.pet), () => {
			this.frame.clear();
			if (!this.options.bounds.isConnected || !this.options.platform.isConnected) {
				this.options.onExit('cancel');
				return;
			}
			if (!this.isFocused()) {
				this.options.onExit('blur');
				return;
			}
			const now = dom.getWindow(this.pet).performance.now();
			const previousPlatform = this.model.player.platform;
			const previousCharge = this.model.charge;
			this.model.advance(this.lastFrameTime === undefined ? 0 : now - this.lastFrameTime);
			this.lastFrameTime = now;
			if (this.model.hasFallen) {
				this.render();
				this.options.onExit('fall');
				return;
			}
			if (previousCharge < 1 && this.model.charge === 1) {
				status(localize('chatPet.jump.fullCharge', "Full jump charge"));
			}
			if (previousPlatform === undefined && this.model.player.platform !== undefined) {
				status(this.model.player.platform === 0
					? localize('chatPet.jump.startingPlatform', "Blobby is back on the starting platform")
					: localize('chatPet.jump.landed', "Blobby landed on platform {0}", this.model.player.platform));
			}
			this.render();
			this.scheduleFrame();
		});
	}

	private render(): void {
		const player = this.model.player;
		const cameraHeight = Math.max(0, player.height);
		this.model.ensurePlatforms(player.height + this.anchor + this.model.petSize * 4);
		const visible = new Set<number>();
		for (const platform of this.model.platforms) {
			const top = this.anchor + cameraHeight - platform.height;
			if (top < -16 || top > this.bounds.height) {
				continue;
			}
			visible.add(platform.id);
			let element = this.platforms.get(platform.id);
			if (!element) {
				element = dom.prepend(this.stage, dom.$('.chat-pet-jump-platform'));
				this.platforms.set(platform.id, element);
			}
			element.style.left = `${platform.left + platform.width / 2}px`;
			element.style.top = `${top}px`;
			element.style.width = `${platform.width}px`;
		}
		for (const [id, element] of this.platforms) {
			if (!visible.has(id)) {
				element.remove();
				this.platforms.delete(id);
			}
		}
		const overlayBounds = this.overlay.getBoundingClientRect();
		this.pet.style.left = `${this.bounds.left - overlayBounds.left + player.x - this.model.petSize / 2}px`;
		this.pet.style.top = `${this.bounds.top - overlayBounds.top + this.anchor + cameraHeight - player.height - this.model.petSize}px`;
		this.pet.style.right = 'auto';
		this.pet.style.bottom = 'auto';
		this.gauge.style.left = `${Math.round(clamp(player.x - 38, 0, this.bounds.width - 76))}px`;
		this.gauge.style.top = `${Math.round(this.anchor - this.model.petSize - 28)}px`;
		this.gauge.classList.toggle('full', this.model.charge === 1);
		for (let i = 0; i < this.cells.length; i++) {
			this.cells[i].classList.toggle('filled', i < Math.ceil(this.model.charge * this.cells.length));
		}
		const direction = player.velocityX < 0 ? -1 : player.velocityX > 0 ? 1 : this.model.direction;
		this.options.onRender(player.platform === undefined, direction);
	}

	pause(): void {
		this.paused = true;
		this.frame.clear();
		this.lastFrameTime = undefined;
		this.model.cancelCharge();
		this.render();
	}

	resume(restoreFocus = true): void {
		if (this.disposed) {
			return;
		}
		this.paused = false;
		if (restoreFocus) {
			this.pet.focus({ preventScroll: true });
		}
		this.scheduleFrame();
	}

	finishFadeIn(): void {
		this.fadeIn?.finish();
	}

	fadeOut(motionReduced: boolean): IDisposable {
		const store = new DisposableStore();
		this.effectsReleased = true;
		const opacity = this.fadeIn?.effect?.getComputedTiming().progress ?? 1;
		this.fadeIn?.cancel();
		store.add(toDisposable(() => this.effects.remove()));
		if (motionReduced || !this.effects.isConnected || dom.getWindow(this.effects).document.hidden) {
			store.dispose();
			return store;
		}
		this.effects.classList.add('exiting');
		const animation = this.effects.animate([{ opacity }, { opacity: 0 }], { duration: FADE_DURATION, easing: 'ease-in', fill: 'forwards' });
		store.add(toDisposable(() => animation.cancel()));
		store.add(dom.addDisposableListener(animation, 'finish', () => store.dispose()));
		store.add(dom.addDisposableListener(animation, 'cancel', () => store.dispose()));
		return store;
	}

	getHelp(): string {
		return [
			localize('chatPet.jump.help.overview', "Blobby's jump game starts when you activate the pet while it is sitting on the new-session welcome text. The randomly generated platforms belong only to the game. Your session, draft, and workspace are not changed."),
			localize('chatPet.jump.help.controls', "Hold Space to charge a jump, then release it to launch. A longer charge jumps higher and farther. Left and Right Arrow make short hops; while holding Space, they choose the jump direction. The direction is locked during flight. Walls bounce Blobby back. Missing a platform can drop Blobby onto a lower one. Falling past the starting platform ends the game and lets Blobby fall onto the input box or another surface. If no surface catches Blobby, the normal respawn plays."),
			localize('chatPet.jump.help.camera', "The camera follows Blobby up and down. The platforms scroll, but the workbench does not. Landings and a full charge are announced."),
			localize('chatPet.jump.help.view', "Inspect your height, charge, and nearby platforms with <keybinding:editor.action.accessibleView>. The game pauses while accessibility help or the accessible view is open."),
			localize('chatPet.jump.help.exit', "Press Escape to leave the game and restore Blobby to its perch. Tab away, click into the input, or start typing to fade the platforms away and let Blobby fall straight down onto the surfaces below. The new-session content fades out visually while playing and returns on exit; its layout and draft are unchanged. No game progress is saved."),
		].join('\n\n');
	}

	getAccessibleContent(): string {
		const player = this.model.player;
		const nearby = this.model.platforms.filter(platform => platform.height > player.height).slice(0, 4);
		return [
			localize('chatPet.jump.view.status', "Height: {0} pixels. Best height: {1} pixels. Charge: {2} percent.", Math.round(player.height), Math.round(this.model.bestHeight), Math.round(this.model.charge * 100)),
			player.platform !== undefined
				? localize('chatPet.jump.view.grounded', "On platform {0}.", player.platform)
				: player.velocityY > 0 ? localize('chatPet.jump.view.rising', "Rising.") : localize('chatPet.jump.view.falling', "Falling."),
			...nearby.map(platform => localize('chatPet.jump.view.platform', "Platform {0}: {1} pixels above, {2} pixels {3}, width {4} pixels.",
				platform.id, Math.round(platform.height - player.height), Math.round(Math.abs(platform.left + platform.width / 2 - player.x)),
				platform.left + platform.width / 2 < player.x ? localize('chatPet.jump.left', "left") : localize('chatPet.jump.right', "right"), Math.round(platform.width))),
		].join('\n');
	}

	override dispose(): void {
		this.disposed = true;
		super.dispose();
		if (!this.effectsReleased) {
			this.effects.remove();
		}
		this.platforms.clear();
		this.overlay.classList.remove('chat-pet-jump-game');
		this.originalParent.prepend(this.overlay);
		Object.assign(this.pet.style, this.originalStyle);
		if (this.originalAriaLabel === null) {
			this.pet.removeAttribute('aria-label');
		} else {
			this.pet.setAttribute('aria-label', this.originalAriaLabel);
		}
		if (this.originalFacing === undefined) {
			delete this.pet.dataset.facing;
		} else {
			this.pet.dataset.facing = this.originalFacing;
		}
	}
}
