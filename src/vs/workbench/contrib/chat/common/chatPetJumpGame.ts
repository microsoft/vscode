/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { clamp } from '../../../../base/common/numbers.js';

export type ChatPetJumpDirection = -1 | 0 | 1;

export interface IChatPetJumpPlatform {
	readonly id: number;
	readonly left: number;
	readonly width: number;
	readonly height: number;
}

interface IChatPetJumpPlayer {
	x: number;
	height: number;
	velocityX: number;
	velocityY: number;
	platform: number | undefined;
}

const STEP = 1 / 120;
const CHARGE_DURATION = 900;
const GRAVITY = 1800;
const MIN_JUMP_SPEED = 260;
const MAX_JUMP_SPEED = 820;

/** A disposable-free world with upward-positive heights, independent of the workbench and camera. */
export class ChatPetJumpGameModel {
	private readonly _platforms: IChatPetJumpPlatform[];
	private readonly _player: IChatPetJumpPlayer;
	private readonly scale: number;
	private _width: number;
	private accumulator = 0;
	private chargeHeld = false;
	private chargeSteps = 0;
	private _direction: ChatPetJumpDirection = 0;
	private _bestHeight = 0;

	constructor(
		width: number,
		readonly petSize: number,
		startX: number,
		private readonly random: () => number = Math.random,
	) {
		if (!Number.isFinite(width) || !Number.isFinite(petSize) || !Number.isFinite(startX) || petSize <= 0 || width < petSize * 2) {
			throw new RangeError('The jump game needs a finite playfield at least twice the pet width.');
		}
		this._width = width;
		this.scale = petSize / 48;
		const x = clamp(startX, petSize / 2, width - petSize / 2);
		this._player = { x, height: 0, velocityX: 0, velocityY: 0, platform: 0 };
		const platformWidth = Math.min(petSize * 3, width);
		this._platforms = [{ id: 0, left: clamp(x - platformWidth / 2, 0, width - platformWidth), width: platformWidth, height: 0 }];
	}

	get width(): number { return this._width; }
	get platforms(): readonly IChatPetJumpPlatform[] { return this._platforms; }
	get player(): Readonly<IChatPetJumpPlayer> { return this._player; }
	get charge(): number { return Math.min(1, this.chargeSteps * STEP * 1000 / CHARGE_DURATION); }
	get direction(): ChatPetJumpDirection { return this._direction; }
	get bestHeight(): number { return this._bestHeight; }
	get charging(): boolean { return this.chargeHeld && this._player.platform !== undefined; }
	get hasFallen(): boolean { return this._player.height < 0; }

	setChargeHeld(held: boolean): void {
		if (held === this.chargeHeld) {
			return;
		}
		const launch = !held && this.charging;
		this.chargeHeld = held;
		if (launch) {
			this.jump(this.charge);
		}
	}

	cancelCharge(): void {
		this.chargeHeld = false;
		this.chargeSteps = 0;
	}

	hop(direction: ChatPetJumpDirection): void {
		this._direction = direction;
		if (!this.chargeHeld && this._player.platform !== undefined) {
			this.jump(0);
		}
	}

	private jump(charge: number): void {
		this._player.velocityX = this._direction * this.horizontalSpeed(charge);
		this._player.velocityY = this.jumpSpeed(charge);
		this._player.platform = undefined;
		this.chargeSteps = 0;
	}

	private jumpSpeed(charge: number): number {
		return (MIN_JUMP_SPEED + (MAX_JUMP_SPEED - MIN_JUMP_SPEED) * charge) * this.scale;
	}

	private horizontalSpeed(charge: number): number {
		return (120 + 160 * charge) * this.scale;
	}

	private reflectX(x: number): number {
		const minimum = this.petSize / 2;
		const range = this._width - this.petSize;
		const offset = ((x - minimum) % (range * 2) + range * 2) % (range * 2);
		return minimum + (offset <= range ? offset : range * 2 - offset);
	}

	ensurePlatforms(height: number): void {
		if (!Number.isFinite(height)) {
			throw new RangeError('The jump game generation height must be finite.');
		}
		let previous = this._platforms[this._platforms.length - 1];
		while (previous.height < height) {
			const rise = (1.25 + this.random()) * this.petSize;
			const charge = 0.72 + this.random() * 0.25;
			const speed = this.jumpSpeed(charge);
			const gravity = GRAVITY * this.scale;
			const landingTime = (speed + Math.sqrt(speed * speed - 2 * gravity * rise)) / gravity;
			const center = previous.left + previous.width / 2;
			const direction = center < this._width / 4 ? 1 : center > this._width * 3 / 4 ? -1 : this.random() < 0.5 ? -1 : 1;
			// Place the next platform on a real charged-jump trajectory, including wall rebounds.
			const landingX = this.reflectX(center + direction * this.horizontalSpeed(charge) * landingTime);
			const width = Math.min((1.5 + this.random() * 0.75) * this.petSize, this._width);
			previous = { id: previous.id + 1, left: clamp(landingX - width / 2, 0, this._width - width), width, height: previous.height + rise };
			this._platforms.push(previous);
		}
	}

	resize(width: number): void {
		if (!Number.isFinite(width) || width < this.petSize * 2) {
			throw new RangeError('The jump game playfield is too narrow.');
		}
		const shift = (width - this._width) / 2;
		this._width = width;
		this._player.x = clamp(this._player.x + shift, this.petSize / 2, width - this.petSize / 2);
		for (let i = 0; i < this._platforms.length; i++) {
			const platform = this._platforms[i];
			const platformWidth = Math.min(platform.width, width);
			this._platforms[i] = { ...platform, width: platformWidth, left: clamp(platform.left + shift, 0, width - platformWidth) };
		}
	}

	advance(milliseconds: number): void {
		if (!Number.isFinite(milliseconds) || milliseconds < 0) {
			throw new RangeError('The jump game frame duration must be finite and nonnegative.');
		}
		this.accumulator += Math.min(milliseconds, 100) / 1000;
		while (this.accumulator + 1e-9 >= STEP && !this.hasFallen) {
			this.accumulator -= STEP;
			this.step();
		}
	}

	private step(): void {
		const player = this._player;
		if (player.platform !== undefined) {
			if (this.chargeHeld) {
				if (this.charge < 1) {
					this.chargeSteps++;
				}
			}
			return;
		}

		const gravity = GRAVITY * this.scale;
		const previousX = player.x;
		const previousHeight = player.height;
		const projectedX = player.x + player.velocityX * STEP;
		player.x = this.reflectX(projectedX);
		if (projectedX < this.petSize / 2 || projectedX > this._width - this.petSize / 2) {
			player.velocityX *= -1;
		}
		player.height += player.velocityY * STEP - gravity * STEP * STEP / 2;
		const nextVelocityY = Math.max(-1400 * this.scale, player.velocityY - gravity * STEP);
		const peak = player.velocityY > 0 && nextVelocityY <= 0
			? previousHeight + player.velocityY * player.velocityY / (2 * gravity)
			: player.height;
		this._bestHeight = Math.max(this._bestHeight, peak);
		player.velocityY = nextVelocityY;

		if (player.height < previousHeight) {
			for (let i = this._platforms.length - 1; i >= 0; i--) {
				const platform = this._platforms[i];
				if (platform.height > previousHeight) {
					continue;
				}
				if (platform.height < player.height) {
					break;
				}
				const crossing = (previousHeight - platform.height) / (previousHeight - player.height);
				const landingX = previousX + (player.x - previousX) * crossing;
				if (landingX >= platform.left && landingX <= platform.left + platform.width) {
					player.x = landingX;
					player.height = platform.height;
					player.velocityX = 0;
					player.velocityY = 0;
					player.platform = platform.id;
					return;
				}
			}
		}
	}
}
