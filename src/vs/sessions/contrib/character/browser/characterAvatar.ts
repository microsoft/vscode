/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as PixiNS from 'pixi.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { CharacterAccessory, CharacterBodyShape, CharacterEyes, CharacterHat, ICharacterCustomization } from '../common/characterCustomization.js';
import { loadPixi } from './pixiLoader.js';

/**
 * The animation poses the character can hold. Each pose drives a different
 * routine in the per-frame ticker (see {@link CharacterAvatar.tick}).
 */
export const enum CharacterPose {
	Idle = 'idle',
	Walk = 'walk',
	Think = 'think',
	Type = 'type',
	Jump = 'jump',
	Celebrate = 'celebrate',
}

/** The character is rendered into a fixed-size pixi canvas. */
const CANVAS_SIZE = 64;
/** Logical drawing space inside the canvas. */
const VIEW = 100;
/** Scale factor between logical units and canvas pixels. */
const PX = CANVAS_SIZE / VIEW;

const SHADOW_COLOR = 0x000000;
const ACCENT_COLOR = 0x1a1a1a;

/**
 * A single character avatar rendered via pixi.js. Owns its own
 * {@link PixiNS.Application} (one tiny WebGL/Canvas-backed renderer per
 * character).
 *
 * The pixi canvas is appended into a wrapper {@link HTMLDivElement} so the
 * stage's behavior loop can position the avatar with CSS transforms (cheap)
 * while pixi drives all internal sprite animation on its ticker.
 *
 * The constructor finishes synchronously, but pixi is loaded and initialized
 * asynchronously. Until pixi is ready the wrapper element is sized correctly
 * but the canvas is not yet attached. Use {@link ready} if you need to await
 * full setup. Public mutators (`applyPose`, `applyCustomization`,
 * `setPosition`) are safe to call before `ready` resolves: they record the
 * latest state and apply it as soon as the renderer is up.
 */
export class CharacterAvatar extends Disposable {

	readonly element: HTMLDivElement;
	/** Resolves once the pixi {@link PixiNS.Application} is initialized and attached. */
	readonly ready: Promise<void>;

	private readonly targetDocument: Document;
	private readonly nameLabel: HTMLDivElement | undefined;

	private pixi: typeof PixiNS | undefined;
	private app: PixiNS.Application | undefined;

	private root: PixiNS.Container | undefined;
	private innerRoot: PixiNS.Container | undefined;
	private bodyContainer: PixiNS.Container | undefined;
	private accessoryContainer: PixiNS.Container | undefined;
	private eyesContainer: PixiNS.Container | undefined;
	private hatContainer: PixiNS.Container | undefined;
	private thoughtContainer: PixiNS.Container | undefined;
	private keyboardContainer: PixiNS.Container | undefined;
	private sparkleContainer: PixiNS.Container | undefined;
	private leftFoot: PixiNS.Graphics | undefined;
	private rightFoot: PixiNS.Graphics | undefined;
	private leftArm: PixiNS.Graphics | undefined;
	private rightArm: PixiNS.Graphics | undefined;
	private sparkles: PixiNS.Graphics[] = [];

	private currentPose: CharacterPose = CharacterPose.Idle;
	private animationTime = 0;
	private poseChangedAt = 0;
	private isReady = false;
	private isDisposed = false;

	private currentCustomization: ICharacterCustomization;
	private pendingPosition: { x: number; y: number; facing: number } | undefined;

	constructor(targetDocument: Document, customization: ICharacterCustomization, showName: boolean) {
		super();
		this.targetDocument = targetDocument;
		this.currentCustomization = customization;

		this.element = targetDocument.createElement('div');
		this.element.className = 'agents-character';
		this.element.setAttribute('aria-hidden', 'true');
		this.element.style.width = `${CANVAS_SIZE}px`;
		this.element.style.height = `${CANVAS_SIZE}px`;

		// Optional name label (DOM, sits below the canvas).
		if (showName) {
			this.nameLabel = targetDocument.createElement('div');
			this.nameLabel.className = 'agents-character-name';
			this.nameLabel.textContent = customization.name;
			this.element.appendChild(this.nameLabel);
		}

		this.ready = this.init();
	}

	private async init(): Promise<void> {
		const pixi = await loadPixi();
		if (this.isDisposed) {
			return;
		}
		this.pixi = pixi;

		// Build the pixi scene tree.
		this.root = new pixi.Container();
		this.innerRoot = new pixi.Container();
		this.innerRoot.position.set(VIEW / 2 * PX, VIEW / 2 * PX);
		this.innerRoot.pivot.set(VIEW / 2 * PX, VIEW / 2 * PX);
		this.root.addChild(this.innerRoot);

		// Shadow on the floor.
		const shadow = new pixi.Graphics();
		shadow.ellipse(VIEW / 2 * PX, 92 * PX, 24 * PX, 4 * PX);
		shadow.fill({ color: SHADOW_COLOR, alpha: 0.18 });
		this.root.addChildAt(shadow, 0);

		// Containers in z-order: body -> accessory -> eyes -> hat.
		this.bodyContainer = new pixi.Container();
		this.accessoryContainer = new pixi.Container();
		this.eyesContainer = new pixi.Container();
		this.hatContainer = new pixi.Container();
		this.innerRoot.addChild(this.bodyContainer);
		this.innerRoot.addChild(this.accessoryContainer);
		this.innerRoot.addChild(this.eyesContainer);
		this.innerRoot.addChild(this.hatContainer);

		// Feet are siblings of the body so they can be animated independently
		// during the walk cycle without rebuilding the body.
		this.leftFoot = new pixi.Graphics();
		this.rightFoot = new pixi.Graphics();
		this.leftFoot.ellipse(0, 0, 6 * PX, 3 * PX).fill({ color: SHADOW_COLOR, alpha: 0.55 });
		this.rightFoot.ellipse(0, 0, 6 * PX, 3 * PX).fill({ color: SHADOW_COLOR, alpha: 0.55 });
		this.leftFoot.position.set(40 * PX, 90 * PX);
		this.rightFoot.position.set(60 * PX, 90 * PX);
		this.innerRoot.addChild(this.leftFoot);
		this.innerRoot.addChild(this.rightFoot);

		// Arms (hidden unless typing).
		this.leftArm = this.makeArm(20);
		this.rightArm = this.makeArm(68);
		this.leftArm.visible = false;
		this.rightArm.visible = false;
		this.innerRoot.addChild(this.leftArm);
		this.innerRoot.addChild(this.rightArm);

		// Overlay containers (thought bubble, keyboard, sparkles).
		this.thoughtContainer = this.makeThoughtBubble();
		this.thoughtContainer.position.set(72 * PX, 16 * PX);
		this.thoughtContainer.visible = false;
		this.root.addChild(this.thoughtContainer);

		this.keyboardContainer = this.makeKeyboard();
		this.keyboardContainer.position.set(VIEW / 2 * PX, 96 * PX);
		this.keyboardContainer.visible = false;
		this.root.addChild(this.keyboardContainer);

		this.sparkleContainer = new pixi.Container();
		this.sparkleContainer.visible = false;
		for (let i = 0; i < 6; i++) {
			const sparkle = new pixi.Graphics();
			sparkle.star(0, 0, 5, 2.4 * PX, 1.0 * PX);
			sparkle.fill({ color: 0xffd23f });
			this.sparkles.push(sparkle);
			this.sparkleContainer.addChild(sparkle);
		}
		this.root.addChild(this.sparkleContainer);

		// Initialize pixi renderer.
		this.app = new pixi.Application();
		try {
			await this.app.init({
				width: CANVAS_SIZE,
				height: CANVAS_SIZE,
				backgroundAlpha: 0,
				antialias: true,
				autoStart: false,
				preference: 'webgl',
				resolution: this.targetDocument.defaultView?.devicePixelRatio ?? 1,
				autoDensity: true,
			});
		} catch (err) {
			// Renderer init can fail in headless / WebGL-disabled environments.
			// In that case the wrapper stays empty and the character is invisible
			// but everything else (behavior, customization panel) keeps working.
			console.warn('[CharacterAvatar] pixi init failed', err);
			return;
		}
		if (this.isDisposed) {
			this.app.destroy(true, { children: true, texture: true });
			return;
		}
		const canvas = this.app.canvas as HTMLCanvasElement;
		canvas.classList.add('agents-character-canvas');
		canvas.style.width = `${CANVAS_SIZE}px`;
		canvas.style.height = `${CANVAS_SIZE}px`;
		canvas.style.display = 'block';
		if (this.nameLabel) {
			this.element.insertBefore(canvas, this.nameLabel);
		} else {
			this.element.appendChild(canvas);
		}
		this.app.stage.addChild(this.root);
		this.applyCustomization(this.currentCustomization);
		this.applyPoseInternal(this.currentPose);
		if (this.pendingPosition) {
			this.applyFacing(this.pendingPosition.facing);
		}
		this.app.ticker.add(this.tick, this);
		this.app.ticker.start();
		this.isReady = true;
	}

	/** Replace all visual parts based on the new customization. */
	applyCustomization(customization: ICharacterCustomization): void {
		this.currentCustomization = customization;
		this.element.dataset.shape = customization.bodyShape;
		if (this.nameLabel) {
			this.nameLabel.textContent = customization.name;
		}
		if (!this.pixi || !this.bodyContainer || !this.eyesContainer || !this.hatContainer || !this.accessoryContainer || !this.leftArm || !this.rightArm) {
			return;
		}
		const colorNumber = parseColor(customization.bodyColor);

		this.bodyContainer.removeChildren();
		for (const child of this.buildBody(customization.bodyShape, colorNumber)) {
			this.bodyContainer.addChild(child);
		}

		this.eyesContainer.removeChildren();
		for (const child of this.buildEyes(customization.eyes)) {
			this.eyesContainer.addChild(child);
		}

		this.hatContainer.removeChildren();
		for (const child of this.buildHat(customization.hat)) {
			this.hatContainer.addChild(child);
		}

		this.accessoryContainer.removeChildren();
		for (const child of this.buildAccessory(customization.accessory)) {
			this.accessoryContainer.addChild(child);
		}

		// Re-color arms via tint to match the body color.
		this.leftArm.tint = colorNumber;
		this.rightArm.tint = colorNumber;
	}

	/** Switch to a new pose (idempotent). */
	applyPose(pose: CharacterPose): void {
		if (pose === this.currentPose) {
			return;
		}
		this.currentPose = pose;
		this.poseChangedAt = this.animationTime;
		this.applyPoseInternal(pose);
	}

	private applyPoseInternal(pose: CharacterPose): void {
		if (!this.thoughtContainer || !this.keyboardContainer || !this.leftArm || !this.rightArm || !this.sparkleContainer) {
			return;
		}
		const isType = pose === CharacterPose.Type;
		const isThink = pose === CharacterPose.Think;
		const isCelebrate = pose === CharacterPose.Celebrate;

		this.thoughtContainer.visible = isThink;
		this.keyboardContainer.visible = isType;
		this.leftArm.visible = isType;
		this.rightArm.visible = isType;
		this.sparkleContainer.visible = isCelebrate;
	}

	/** Set the character's stage coordinates and facing. Eased by the caller. */
	setPosition(x: number, y: number, facing: number): void {
		this.pendingPosition = { x, y, facing };
		this.element.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
		this.applyFacing(facing);
	}

	private applyFacing(facing: number): void {
		if (!this.innerRoot) {
			return;
		}
		// Apply facing inside pixi (innerRoot scale.x). Keep a small floor to
		// avoid a fully-collapsed sprite during the cross-zero of a turn.
		const scaleX = Math.sign(facing) * Math.max(Math.abs(facing), 0.05);
		this.innerRoot.scale.x = scaleX;
	}

	override dispose(): void {
		this.isDisposed = true;
		if (this.isReady && this.app) {
			this.app.ticker.remove(this.tick, this);
			this.app.destroy(true, { children: true, texture: true });
		}
		this.element.remove();
		super.dispose();
	}

	/** pixi ticker callback. Cheap; only the active pose's branch runs. */
	private tick(ticker: PixiNS.Ticker): void {
		if (!this.innerRoot || !this.leftFoot || !this.rightFoot || !this.leftArm || !this.rightArm || !this.thoughtContainer || !this.keyboardContainer) {
			return;
		}
		this.animationTime += ticker.deltaMS;
		const sincePose = this.animationTime - this.poseChangedAt;

		// Reset per-frame baselines so each pose only writes the deltas it cares about.
		this.innerRoot.scale.y = 1;
		this.innerRoot.position.y = VIEW / 2 * PX;
		this.leftFoot.y = 90 * PX;
		this.rightFoot.y = 90 * PX;
		this.leftArm.y = 0;
		this.rightArm.y = 0;
		this.innerRoot.rotation = 0;

		switch (this.currentPose) {
			case CharacterPose.Idle: {
				const breath = Math.sin(this.animationTime / 800) * 0.04;
				this.innerRoot.scale.y = 1 + breath;
				break;
			}
			case CharacterPose.Walk: {
				const t = this.animationTime / 180;
				this.leftFoot.y = 90 * PX - Math.max(0, Math.sin(t)) * 3 * PX;
				this.rightFoot.y = 90 * PX - Math.max(0, Math.sin(t + Math.PI)) * 3 * PX;
				this.innerRoot.position.y = VIEW / 2 * PX - Math.abs(Math.sin(t)) * 1.5 * PX;
				break;
			}
			case CharacterPose.Think: {
				const t = this.animationTime / 800;
				const bob = Math.sin(t) * 1 * PX;
				this.thoughtContainer.position.y = 16 * PX + bob;
				break;
			}
			case CharacterPose.Type: {
				const t = this.animationTime / 160;
				this.leftArm.y = -Math.max(0, Math.sin(t)) * 2 * PX;
				this.rightArm.y = -Math.max(0, Math.sin(t + Math.PI)) * 2 * PX;
				this.keyboardContainer.position.y = 96 * PX - Math.abs(Math.sin(t)) * 1 * PX;
				break;
			}
			case CharacterPose.Jump: {
				// Loop a ~700ms jump arc with a brief pause between hops.
				const period = 1000;
				const k = (sincePose % period) / period;
				const arc = k < 0.7 ? Math.sin((k / 0.7) * Math.PI) : 0;
				this.innerRoot.position.y = VIEW / 2 * PX - arc * 12 * PX;
				break;
			}
			case CharacterPose.Celebrate: {
				const k = Math.min(sincePose / 1500, 1);
				const arc = Math.sin(k * Math.PI * 2);
				this.innerRoot.position.y = VIEW / 2 * PX - Math.abs(arc) * 8 * PX;
				this.innerRoot.rotation = arc * 0.1;
				// Sparkles fan out as the celebrate progresses.
				for (let i = 0; i < this.sparkles.length; i++) {
					const local = (k - i * 0.06);
					const localK = Math.max(0, Math.min(1, local));
					const angle = -Math.PI / 2 + (i - this.sparkles.length / 2) * 0.4;
					const dist = localK * 22 * PX;
					this.sparkles[i].position.set(
						VIEW / 2 * PX + Math.cos(angle) * dist,
						VIEW / 2 * PX + Math.sin(angle) * dist,
					);
					this.sparkles[i].alpha = localK > 0 ? 1 - localK : 0;
					this.sparkles[i].scale.set(0.4 + localK * 0.6);
				}
				break;
			}
		}
	}

	// --- Body builders ---

	private buildBody(shape: CharacterBodyShape, color: number): PixiNS.Graphics[] {
		const body = new this.pixi!.Graphics();
		switch (shape) {
			case CharacterBodyShape.Tall:
				body.roundRect(30 * PX, 20 * PX, 40 * PX, 68 * PX, 20 * PX);
				break;
			case CharacterBodyShape.Short:
				body.roundRect(22 * PX, 40 * PX, 56 * PX, 48 * PX, 24 * PX);
				break;
			case CharacterBodyShape.Round:
			default:
				body.roundRect(24 * PX, 28 * PX, 52 * PX, 60 * PX, 26 * PX);
				break;
		}
		body.fill({ color });
		body.stroke({ color: SHADOW_COLOR, alpha: 0.18, width: 1.5 });
		return [body];
	}

	private makeArm(x: number): PixiNS.Graphics {
		const arm = new this.pixi!.Graphics();
		arm.roundRect(x * PX, 58 * PX, 12 * PX, 6 * PX, 3 * PX);
		// White fill is recolored via the `tint` property in applyCustomization.
		arm.fill({ color: 0xffffff });
		arm.stroke({ color: SHADOW_COLOR, alpha: 0.18, width: 1 });
		return arm;
	}

	// --- Eyes ---

	private buildEyes(eyes: CharacterEyes): PixiNS.Container[] {
		const out: PixiNS.Container[] = [];
		const leftCx = 41;
		const rightCx = 59;
		const cy = 50;

		switch (eyes) {
			case CharacterEyes.Sleepy:
				out.push(this.makeArc(leftCx, cy));
				out.push(this.makeArc(rightCx, cy));
				break;
			case CharacterEyes.Star:
				out.push(this.makeStar(leftCx, cy));
				out.push(this.makeStar(rightCx, cy));
				break;
			case CharacterEyes.Heart:
				out.push(this.makeHeart(leftCx, cy));
				out.push(this.makeHeart(rightCx, cy));
				break;
			case CharacterEyes.Wink:
				out.push(this.makeRoundEye(leftCx, cy));
				out.push(this.makeArc(rightCx, cy + 1));
				break;
			case CharacterEyes.Round:
			default:
				out.push(this.makeRoundEye(leftCx, cy));
				out.push(this.makeRoundEye(rightCx, cy));
				break;
		}
		return out;
	}

	private makeRoundEye(cx: number, cy: number): PixiNS.Container {
		const c = new this.pixi!.Container();
		const eye = new this.pixi!.Graphics();
		eye.circle(cx * PX, cy * PX, 3.5 * PX).fill({ color: ACCENT_COLOR });
		const sparkle = new this.pixi!.Graphics();
		sparkle.circle((cx + 1) * PX, (cy - 1) * PX, 1 * PX).fill({ color: 0xffffff });
		c.addChild(eye);
		c.addChild(sparkle);
		return c;
	}

	private makeArc(cx: number, cy: number): PixiNS.Graphics {
		const arc = new this.pixi!.Graphics();
		arc.moveTo((cx - 4) * PX, cy * PX);
		arc.quadraticCurveTo(cx * PX, (cy - 3) * PX, (cx + 4) * PX, cy * PX);
		arc.stroke({ color: ACCENT_COLOR, width: 2, cap: 'round' });
		return arc;
	}

	private makeStar(cx: number, cy: number): PixiNS.Graphics {
		const g = new this.pixi!.Graphics();
		g.star(cx * PX, cy * PX, 5, 3.5 * PX, 1.6 * PX);
		g.fill({ color: 0xffd23f });
		g.stroke({ color: 0x5b4a00, width: 0.6 });
		return g;
	}

	private makeHeart(cx: number, cy: number): PixiNS.Graphics {
		const g = new this.pixi!.Graphics();
		const s = 4 * PX;
		const x = cx * PX;
		const y = cy * PX;
		g.moveTo(x, y + s * 0.7);
		g.bezierCurveTo(x - s, y, x - s, y - s * 0.6, x, y - s * 0.2);
		g.bezierCurveTo(x + s, y - s * 0.6, x + s, y, x, y + s * 0.7);
		g.fill({ color: 0xe0457b });
		return g;
	}

	// --- Hats ---

	private buildHat(hat: CharacterHat): PixiNS.Graphics[] {
		const G = this.pixi!.Graphics;
		switch (hat) {
			case CharacterHat.Top: {
				const brim = new G().roundRect(32 * PX, 24 * PX, 36 * PX, 4 * PX, 2 * PX).fill({ color: ACCENT_COLOR });
				const top = new G().roundRect(40 * PX, 8 * PX, 20 * PX, 18 * PX, 2 * PX).fill({ color: ACCENT_COLOR });
				const band = new G().rect(40 * PX, 20 * PX, 20 * PX, 3 * PX).fill({ color: 0xa83c3c });
				return [brim, top, band];
			}
			case CharacterHat.Cap: {
				const dome = new G();
				dome.moveTo(32 * PX, 26 * PX);
				dome.quadraticCurveTo(50 * PX, 6 * PX, 68 * PX, 26 * PX);
				dome.closePath();
				dome.fill({ color: 0x2a6dd0 });
				const visor = new G().roundRect(24 * PX, 25 * PX, 28 * PX, 4 * PX, 2 * PX).fill({ color: ACCENT_COLOR });
				return [dome, visor];
			}
			case CharacterHat.Beanie: {
				const dome = new G();
				dome.moveTo(30 * PX, 28 * PX);
				dome.quadraticCurveTo(50 * PX, 4 * PX, 70 * PX, 28 * PX);
				dome.closePath();
				dome.fill({ color: 0xcc4f4f });
				const cuff = new G().roundRect(30 * PX, 24 * PX, 40 * PX, 6 * PX, 2 * PX).fill({ color: 0x9a3535 });
				const pom = new G().circle(50 * PX, 6 * PX, 4 * PX).fill({ color: 0xffffff });
				return [dome, cuff, pom];
			}
			case CharacterHat.Crown: {
				const crown = new G();
				crown.moveTo(32 * PX, 28 * PX);
				crown.lineTo(36 * PX, 14 * PX);
				crown.lineTo(42 * PX, 22 * PX);
				crown.lineTo(50 * PX, 10 * PX);
				crown.lineTo(58 * PX, 22 * PX);
				crown.lineTo(64 * PX, 14 * PX);
				crown.lineTo(68 * PX, 28 * PX);
				crown.closePath();
				crown.fill({ color: 0xf3c64a });
				crown.stroke({ color: 0x7d5b00, width: 1 });
				const gem = new G().circle(50 * PX, 20 * PX, 2.4 * PX).fill({ color: 0xd63b6e });
				return [crown, gem];
			}
			case CharacterHat.Bow: {
				const bowL = new G();
				bowL.moveTo(50 * PX, 24 * PX);
				bowL.lineTo(36 * PX, 18 * PX);
				bowL.lineTo(36 * PX, 30 * PX);
				bowL.closePath();
				bowL.fill({ color: 0xd6457c });
				const bowR = new G();
				bowR.moveTo(50 * PX, 24 * PX);
				bowR.lineTo(64 * PX, 18 * PX);
				bowR.lineTo(64 * PX, 30 * PX);
				bowR.closePath();
				bowR.fill({ color: 0xd6457c });
				const knot = new G().roundRect(47 * PX, 21 * PX, 6 * PX, 6 * PX, 1 * PX).fill({ color: 0xa8285d });
				return [bowL, bowR, knot];
			}
			case CharacterHat.None:
			default:
				return [];
		}
	}

	// --- Accessories ---

	private buildAccessory(accessory: CharacterAccessory): PixiNS.Graphics[] {
		const G = this.pixi!.Graphics;
		switch (accessory) {
			case CharacterAccessory.Glasses: {
				const left = new G().circle(41 * PX, 50 * PX, 6 * PX).stroke({ color: ACCENT_COLOR, width: 1.4 });
				const right = new G().circle(59 * PX, 50 * PX, 6 * PX).stroke({ color: ACCENT_COLOR, width: 1.4 });
				const bridge = new G();
				bridge.moveTo(47 * PX, 50 * PX).lineTo(53 * PX, 50 * PX);
				bridge.stroke({ color: ACCENT_COLOR, width: 1.4 });
				return [left, right, bridge];
			}
			case CharacterAccessory.Monocle: {
				const ring = new G().circle(59 * PX, 50 * PX, 7 * PX).stroke({ color: 0x9c8645, width: 1.5 });
				const chain = new G();
				chain.moveTo(66 * PX, 52 * PX);
				chain.quadraticCurveTo(72 * PX, 60 * PX, 70 * PX, 70 * PX);
				chain.stroke({ color: 0x9c8645, width: 1 });
				return [ring, chain];
			}
			case CharacterAccessory.Scarf: {
				const scarf = new G();
				scarf.moveTo(26 * PX, 60 * PX);
				scarf.lineTo(74 * PX, 60 * PX);
				scarf.lineTo(74 * PX, 66 * PX);
				scarf.quadraticCurveTo(50 * PX, 72 * PX, 26 * PX, 66 * PX);
				scarf.closePath();
				scarf.fill({ color: 0x3aaf8e });
				const tail = new G();
				tail.moveTo(60 * PX, 64 * PX);
				tail.lineTo(70 * PX, 84 * PX);
				tail.lineTo(64 * PX, 84 * PX);
				tail.lineTo(56 * PX, 66 * PX);
				tail.closePath();
				tail.fill({ color: 0x2e8a6f });
				return [scarf, tail];
			}
			case CharacterAccessory.None:
			default:
				return [];
		}
	}

	// --- Overlay graphics ---

	private makeThoughtBubble(): PixiNS.Container {
		const c = new this.pixi!.Container();
		const bubble = new this.pixi!.Graphics();
		bubble.roundRect(0, 0, 22 * PX, 12 * PX, 6 * PX);
		bubble.fill({ color: 0x252526 });
		bubble.stroke({ color: 0x454545, width: 1 });
		c.addChild(bubble);
		// Three little pip dots, animated by the ticker via alpha pulses.
		for (let i = 0; i < 3; i++) {
			const dot = new this.pixi!.Graphics();
			dot.circle((4 + i * 6) * PX, 6 * PX, 1.4 * PX);
			dot.fill({ color: 0xcccccc });
			c.addChild(dot);
		}
		// Tail (small circle linking back to the head).
		const tail = new this.pixi!.Graphics();
		tail.circle(2 * PX, 14 * PX, 2 * PX);
		tail.fill({ color: 0x252526 });
		tail.stroke({ color: 0x454545, width: 1 });
		c.addChild(tail);
		return c;
	}

	private makeKeyboard(): PixiNS.Container {
		const c = new this.pixi!.Container();
		const board = new this.pixi!.Graphics();
		board.roundRect(-18 * PX, -3 * PX, 36 * PX, 6 * PX, 2 * PX);
		board.fill({ color: 0x2f2f2f });
		board.stroke({ color: 0x111111, width: 0.6 });
		c.addChild(board);
		// Tiny key dots.
		for (let i = -3; i <= 3; i++) {
			const key = new this.pixi!.Graphics();
			key.circle(i * 4 * PX, 0, 0.7 * PX);
			key.fill({ color: 0xaaaaaa });
			c.addChild(key);
		}
		return c;
	}
}

/** Convert a `#rrggbb` string into a numeric color usable by pixi. */
function parseColor(css: string): number {
	if (css.length === 7 && css[0] === '#') {
		return parseInt(css.slice(1), 16);
	}
	return 0x7bd389;
}
