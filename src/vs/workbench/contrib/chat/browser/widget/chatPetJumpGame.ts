/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatPetJumpGame.css';
import * as dom from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { KeybindingLabel } from '../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { KeyCodeChord } from '../../../../../base/common/keybindings.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { clamp } from '../../../../../base/common/numbers.js';
import { OS } from '../../../../../base/common/platform.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { defaultKeybindingLabelStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
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
const HIGH_SCORE_STORAGE_KEY = 'chat.vscodePet.jumpGame.highScore';

export class ChatPetJumpGame extends Disposable {
	private readonly model: ChatPetJumpGameModel;
	private readonly effects: HTMLElement;
	private readonly backdrop: HTMLElement;
	private readonly stage: HTMLElement;
	private readonly gauge: HTMLElement;
	private readonly cells: HTMLElement[];
	private readonly hopsLabel: HTMLElement;
	private readonly highScoreLabel: HTMLElement;
	private readonly platforms = new Map<number, { element: HTMLElement; integrity: HTMLElement | undefined }>();
	private readonly walls = new Map<number, HTMLElement>();
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
	private highScore = 0;
	private displayedHops = -1;

	constructor(
		private readonly overlay: HTMLElement,
		private readonly pet: HTMLElement,
		private readonly options: IChatPetJumpGameOptions,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
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
		const hint = dom.append(this.stage, dom.$('.chat-pet-jump-hint'));
		const hintKeys = new Map([
			['{0}', KeyCode.Space],
			['{1}', KeyCode.LeftArrow],
			['{2}', KeyCode.RightArrow],
			['{3}', KeyCode.Escape],
		]);
		const controls = localize({
			key: 'chatPet.jump.controlsWithKeybindings',
			comment: ['{0}, {1}, {2}, and {3} are keybinding labels for Space, Left Arrow, Right Arrow, and Escape.'],
		}, "Hold {0} to charge, release to jump. {1} / {2} to hop or aim. {3} to exit.");
		for (const part of controls.split(/(\{\d+\})/g)) {
			const keyCode = hintKeys.get(part);
			if (keyCode !== undefined) {
				const keybindingLabel = this._register(new KeybindingLabel(hint, OS, { ...defaultKeybindingLabelStyles, disableTitle: true }));
				keybindingLabel.set(keybindingService.resolveKeybinding(new KeyCodeChord(false, false, false, false, keyCode).toKeybinding())[0]);
			} else {
				hint.append(part);
			}
		}
		const score = dom.append(this.stage, dom.$('.chat-pet-jump-score'));
		this.hopsLabel = dom.append(score, dom.$('.chat-pet-jump-hops'));
		this.highScoreLabel = dom.append(score, dom.$('.chat-pet-jump-high-score'));
		this._register(storageService.onDidChangeValue(StorageScope.APPLICATION, HIGH_SCORE_STORAGE_KEY, this._store)(() => this.updateScore()));
		this.updateScore();

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
		if (bounds.width < this.model.petSize * 2 || bounds.height < this.model.petSize + 80 || platform.width <= 0 || !this.options.platform.checkVisibility({ checkVisibilityCSS: true })) {
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
				const platform = this.model.platforms.find(platform => platform.id === this.model.player.platform);
				status(platform?.kind === 'crumbling'
					? localize('chatPet.jump.landedCrumbling', "Crumbling platform. Charge your next jump before it falls. Hops: {0}.", this.model.hops)
					: platform?.kind === 'moving'
						? localize('chatPet.jump.landedMoving', "Moving platform. Blobby moves with it while charging. Hops: {0}.", this.model.hops)
						: this.model.player.platform < 0
							? localize('chatPet.jump.landedWall', "Blobby landed on a wall. Hops: {0}.", this.model.hops)
							: this.model.player.platform === 0
								? localize('chatPet.jump.startingPlatform', "Blobby is back on the starting platform")
								: localize('chatPet.jump.landed', "Blobby landed on platform {0}. Hops: {1}.", this.model.player.platform, this.model.hops));
			}
			this.render();
			this.scheduleFrame();
		});
	}

	private render(): void {
		const player = this.model.player;
		if (this.displayedHops !== this.model.hops) {
			this.updateScore();
		}
		const cameraHeight = Math.max(0, player.height);
		this.model.ensurePlatforms(player.height + this.anchor + this.model.petSize * 4);
		const visible = new Set<number>();
		for (const platform of this.model.platforms) {
			const top = this.anchor + cameraHeight - platform.height + platform.fallDistance;
			if (top < -16 || top > this.bounds.height || platform.fallDistance >= this.model.petSize * 4) {
				continue;
			}
			visible.add(platform.id);
			let rendered = this.platforms.get(platform.id);
			if (!rendered) {
				const element = dom.prepend(this.stage, dom.$('.chat-pet-jump-platform'));
				element.classList.add(platform.kind);
				const integrity = platform.kind === 'crumbling' ? dom.append(element, dom.$('.chat-pet-jump-platform-integrity')) : undefined;
				rendered = { element, integrity };
				this.platforms.set(platform.id, rendered);
			}
			const { element, integrity } = rendered;
			element.style.left = `${platform.left + platform.width / 2}px`;
			element.style.top = `${top}px`;
			element.style.width = `${platform.width}px`;
			element.classList.toggle('crumbling-active', platform.collapseProgress > 0);
			if (integrity) {
				integrity.style.transform = `scaleX(${1 - platform.collapseProgress})`;
				element.style.opacity = String(1 - platform.fallDistance / (this.model.petSize * 4));
			}
		}
		const visibleWalls = new Set<number>();
		for (const wall of this.model.walls) {
			const top = this.anchor + cameraHeight - wall.top;
			const height = wall.top - wall.bottom;
			if (top + height < 0 || top > this.bounds.height) {
				continue;
			}
			visibleWalls.add(wall.id);
			let element = this.walls.get(wall.id);
			if (!element) {
				element = dom.prepend(this.stage, dom.$('.chat-pet-jump-wall'));
				this.walls.set(wall.id, element);
			}
			element.style.left = `${wall.left}px`;
			element.style.top = `${top}px`;
			element.style.width = `${wall.width}px`;
			element.style.height = `${height}px`;
		}
		for (const [id, element] of this.walls) {
			if (!visibleWalls.has(id)) {
				element.remove();
				this.walls.delete(id);
			}
		}
		for (const [id, { element }] of this.platforms) {
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

	private updateScore(): void {
		const stored = this.storageService.getNumber(HIGH_SCORE_STORAGE_KEY, StorageScope.APPLICATION, 0);
		const valid = Number.isSafeInteger(stored) && stored >= 0;
		if (!valid) {
			this.logService.warn('[ChatPetJumpGame] Ignoring an invalid saved high score.');
		}
		this.highScore = Math.max(this.highScore, valid ? stored : 0, this.model.hops);
		this.displayedHops = this.model.hops;
		this.hopsLabel.textContent = localize('chatPet.jump.hops', "Hops: {0}", this.displayedHops);
		this.highScoreLabel.textContent = localize('chatPet.jump.highScore', "High score: {0}", this.highScore);
		if (!valid || this.highScore > stored) {
			this.storageService.store(HIGH_SCORE_STORAGE_KEY, this.highScore, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
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
			localize('chatPet.jump.help.overview', "Blobby's jump game starts when you activate the pet while it is sitting on the new-session welcome text. You can also choose Play Jump Game from the pet's context menu to move to that perch and start, including with reduced motion enabled. The randomly generated platforms belong only to the game. Your session, draft, and workspace are not changed."),
			localize('chatPet.jump.help.controls', "Hold Space to charge a jump, then release it to launch. A longer charge jumps higher and farther. Left and Right Arrow make short hops; while holding Space, they choose the jump direction. The direction is locked during flight. Walls bounce Blobby back. Missing a platform can drop Blobby onto a lower one. Falling past the starting platform ends the game and lets Blobby fall onto the input box or another surface. If no surface catches Blobby, the normal respawn plays."),
			localize('chatPet.jump.help.camera', "The camera follows Blobby up and down. The platforms scroll, but the workbench does not. Landings and a full charge are announced."),
			localize('chatPet.jump.help.difficulty', "As you climb, ledges become narrower. Moving ledges have arrow markings and carry Blobby while charging. Broken-line ledges crumble shortly after landing, then fall away; charge and leave before their remaining solid line disappears. Later sections add solid walls. Aim toward a wall to reflect your jump onto a nearby narrow ledge; hitting a side reverses horizontal travel without changing the vertical speed. The platforms and crumble timers pause with accessibility help and the accessible view."),
			localize('chatPet.jump.help.score', "The top-right counter shows Hops, with High score underneath. Landing on a platform higher than any you have reached in this run adds one hop. Returning to old platforms or hopping in place does not add points. Only the high score is saved on this device; every run starts at zero."),
			localize('chatPet.jump.help.view', "Inspect your height, charge, and nearby platforms with <keybinding:editor.action.accessibleView>. The game pauses while accessibility help or the accessible view is open."),
			localize('chatPet.jump.help.exit', "Press Escape to leave the game and restore Blobby to its perch. Tab away, click into the input, or start typing to fade the platforms away and let Blobby fall straight down onto the surfaces below. The new-session content fades out visually while playing and returns on exit; its layout and draft are unchanged."),
		].join('\n\n');
	}

	getAccessibleContent(): string {
		const player = this.model.player;
		const nearby = this.model.platforms.filter(platform => platform.height > player.height && platform.collapseProgress < 1).slice(0, 4);
		const current = this.model.platforms.find(platform => platform.id === player.platform);
		return [
			localize('chatPet.jump.view.score', "Hops: {0}. High score: {1}.", this.model.hops, this.highScore),
			localize('chatPet.jump.view.status', "Height: {0} pixels. Best height: {1} pixels. Charge: {2} percent.", Math.round(player.height), Math.round(this.model.bestHeight), Math.round(this.model.charge * 100)),
			player.platform !== undefined
				? player.platform < 0 ? localize('chatPet.jump.view.onWall', "On top of wall {0}.", -player.platform) : localize('chatPet.jump.view.grounded', "On platform {0}.", player.platform)
				: player.velocityY > 0 ? localize('chatPet.jump.view.rising', "Rising.") : localize('chatPet.jump.view.falling', "Falling."),
			...(current?.kind === 'crumbling' ? [localize('chatPet.jump.view.crumbling', "This platform is crumbling: {0} percent remaining. Charge your next jump before it falls.", Math.round((1 - current.collapseProgress) * 100))] : []),
			...nearby.map(platform => localize('chatPet.jump.view.platform', "Platform {0}: {1} pixels above, {2} pixels {3}, width {4} pixels. {5}",
				platform.id, Math.round(platform.height - player.height), Math.round(Math.abs(platform.left + platform.width / 2 - player.x)),
				platform.left + platform.width / 2 < player.x ? localize('chatPet.jump.left', "left") : localize('chatPet.jump.right', "right"), Math.round(platform.width),
				platform.kind === 'moving' ? localize('chatPet.jump.view.moving', "Moving horizontally.")
					: platform.kind === 'crumbling' ? localize('chatPet.jump.view.crumblingLedge', "Crumbles after landing.")
						: localize('chatPet.jump.view.stable', "Stable."))),
			...this.model.walls.filter(wall => wall.top >= player.height && wall.bottom < player.height + this.anchor).slice(0, 3).map(wall =>
				localize('chatPet.jump.view.wall', "Wall beside platform {0}: {1} pixels {2}. Aim toward it to bank your jump.",
					wall.id, Math.round(Math.abs(wall.left + wall.width / 2 - player.x)),
					wall.left + wall.width / 2 < player.x ? localize('chatPet.jump.left', "left") : localize('chatPet.jump.right', "right"))),
		].join('\n');
	}

	override dispose(): void {
		this.disposed = true;
		super.dispose();
		if (!this.effectsReleased) {
			this.effects.remove();
		}
		this.platforms.clear();
		this.walls.clear();
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
