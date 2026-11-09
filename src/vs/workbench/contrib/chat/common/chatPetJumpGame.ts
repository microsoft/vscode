/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { clamp } from '../../../../base/common/numbers.js';
import { Mutable } from '../../../../base/common/types.js';

export type ChatPetJumpDirection = -1 | 0 | 1;

export interface IChatPetJumpPlatform {
	readonly id: number;
	readonly left: number;
	readonly width: number;
	readonly height: number;
	readonly kind: 'static' | 'moving' | 'crumbling';
	readonly collapseProgress: number;
	readonly fallDistance: number;
}

interface IChatPetJumpPlatformState extends Mutable<IChatPetJumpPlatform> {
	originLeft: number;
	approachDirection: ChatPetJumpDirection;
	movement?: { amplitude: number; speed: number; delta: number };
	collapseStep?: number;
	collapseDelay: number;
}

export interface IChatPetJumpWall {
	readonly id: number;
	readonly left: number;
	readonly width: number;
	readonly bottom: number;
	readonly top: number;
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
	private readonly _platforms: IChatPetJumpPlatformState[];
	private readonly _walls: IChatPetJumpWall[] = [];
	private readonly _player: IChatPetJumpPlayer;
	private readonly scale: number;
	private _width: number;
	private accumulator = 0;
	private chargeHeld = false;
	private chargeSteps = 0;
	private _direction: ChatPetJumpDirection = 0;
	private _bestHeight = 0;
	private steps = 0;
	private highestPlatform = 0;
	private _hops = 0;

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
		const left = clamp(x - platformWidth / 2, 0, width - platformWidth);
		this._platforms = [{ id: 0, left, originLeft: left, width: platformWidth, height: 0, kind: 'static', approachDirection: 0, collapseProgress: 0, fallDistance: 0, collapseDelay: 0 }];
	}

	get width(): number { return this._width; }
	get platforms(): readonly IChatPetJumpPlatform[] { return this._platforms; }
	get walls(): readonly IChatPetJumpWall[] { return this._walls; }
	get player(): Readonly<IChatPetJumpPlayer> { return this._player; }
	get charge(): number { return Math.min(1, this.chargeSteps * STEP * 1000 / CHARGE_DURATION); }
	get direction(): ChatPetJumpDirection { return this._direction; }
	get bestHeight(): number { return this._bestHeight; }
	get hops(): number { return this._hops; }
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
			const id = previous.id + 1;
			const difficulty = Math.min(4, Math.floor(id / 8));
			const bank = id >= 12 && id % 8 === 4 ? this.createBankShot(previous, id) : undefined;
			if (bank) {
				this._walls.push(bank.wall);
				previous = bank.platform;
				this._platforms.push(previous);
				continue;
			}
			const rise = (1.25 + this.random() + difficulty * 0.1) * this.petSize;
			const charge = 0.72 + difficulty * 0.03 + this.random() * (0.25 - difficulty * 0.03);
			const speed = this.jumpSpeed(charge);
			const gravity = GRAVITY * this.scale;
			const landingTime = (speed + Math.sqrt(speed * speed - 2 * gravity * rise)) / gravity;
			const center = previous.originLeft + previous.width / 2;
			const direction = center < this._width / 4 ? 1 : center > this._width * 3 / 4 ? -1 : this.random() < 0.5 ? -1 : 1;
			// Place the next platform on a real charged-jump trajectory, including wall rebounds.
			const projectedX = center + direction * this.horizontalSpeed(charge) * landingTime;
			const landingX = this.reflectX(projectedX);
			const range = this._width - this.petSize;
			const reflectedOffset = ((projectedX - this.petSize / 2) % (range * 2) + range * 2) % (range * 2);
			const width = Math.min(Math.max(1.1, 1.5 + this.random() * 0.75 - difficulty * 0.12) * this.petSize, this._width);
			const kind = id >= 9 && id % 8 === 1 ? 'crumbling' : id >= 5 && id % 8 === 5 ? 'moving' : 'static';
			const amplitude = Math.min(this.petSize * (0.45 + difficulty * 0.08), (this._width - width) / 2);
			const left = clamp(landingX - width / 2, kind === 'moving' ? amplitude : 0, this._width - width - (kind === 'moving' ? amplitude : 0));
			previous = {
				id, left, originLeft: left, width, height: previous.height + rise, kind,
				approachDirection: reflectedOffset <= range ? direction : direction === 1 ? -1 : 1,
				movement: kind === 'moving' ? { amplitude, speed: 1.2 + difficulty * 0.25, delta: 0 } : undefined,
				collapseProgress: 0, fallDistance: 0, collapseDelay: Math.round((1.6 - difficulty * 0.09) / STEP),
			};
			if (previous.movement) {
				previous.left += Math.sin(this.steps * STEP * previous.movement.speed) * previous.movement.amplitude;
			}
			this._platforms.push(previous);
		}
	}

	private createBankShot(previous: IChatPetJumpPlatformState, id: number): { platform: IChatPetJumpPlatformState; wall: IChatPetJumpWall } | undefined {
		const center = previous.originLeft + previous.width / 2;
		const rise = this.petSize * 3.1;
		const speed = this.jumpSpeed(1);
		const time = (speed + Math.sqrt(speed * speed - 2 * GRAVITY * this.scale * rise)) / (GRAVITY * this.scale);
		const offset = this.petSize * 1.25;
		const distance = (this.horizontalSpeed(1) * time - offset) / 2;
		const width = this.petSize * 0.8;
		const wallWidth = this.petSize / 6;
		// Keep the wall beyond the incoming jump, rather than blocking access to its launch ledge.
		const direction = previous.approachDirection || (center < this._width / 2 ? 1 : -1);
		const landingX = center - direction * offset;
		const wallLeft = center + direction * (distance + this.petSize / 2) - (direction < 0 ? wallWidth : 0);
		if (landingX - width / 2 < this.petSize / 2 || landingX + width / 2 > this._width - this.petSize / 2 ||
			wallLeft < this.petSize / 2 || wallLeft + wallWidth > this._width - this.petSize / 2) {
			return undefined;
		}
		const height = previous.height + rise;
		const left = landingX - width / 2;
		// A full-charge bank reaches this ledge; a direct jump at this rise overshoots it.
		return {
			platform: { id, left, originLeft: left, width, height, kind: 'static', approachDirection: direction === 1 ? -1 : 1, collapseProgress: 0, fallDistance: 0, collapseDelay: 0 },
			wall: { id, left: wallLeft, width: wallWidth, bottom: previous.height + this.petSize * 0.35, top: previous.height + speed * speed / (2 * GRAVITY * this.scale) + this.petSize * 0.25 },
		};
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
			const amplitude = Math.min(platform.movement?.amplitude ?? 0, (width - platformWidth) / 2);
			platform.width = platformWidth;
			platform.originLeft = clamp(platform.originLeft + shift, amplitude, width - platformWidth - amplitude);
			if (platform.movement) {
				platform.movement.amplitude = amplitude;
				platform.movement.delta = 0;
			}
			platform.left = platform.originLeft + (platform.movement ? Math.sin(this.steps * STEP * platform.movement.speed) * amplitude : 0);
		}
		for (let i = this._walls.length - 1; i >= 0; i--) {
			const wall = this._walls[i];
			const left = wall.left + shift;
			if (left < this.petSize / 2 || left + wall.width > width - this.petSize / 2) {
				this._walls.splice(i, 1);
			} else {
				this._walls[i] = { ...wall, left };
			}
		}
		const platform = this._platforms.find(platform => platform.id === this._player.platform);
		if (platform) {
			this._player.x = clamp(this._player.x, Math.max(this.petSize / 2, platform.left), Math.min(width - this.petSize / 2, platform.left + platform.width));
		} else if (this._player.platform !== undefined) {
			const wall = this._walls.find(wall => -wall.id === this._player.platform);
			if (wall) {
				this._player.x = clamp(this._player.x, wall.left - this.petSize / 2, wall.left + wall.width + this.petSize / 2);
			} else {
				this._player.platform = undefined;
				this.cancelCharge();
			}
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
		this.steps++;
		for (const platform of this._platforms) {
			if (platform.movement) {
				const previousLeft = platform.left;
				platform.left = platform.originLeft + Math.sin(this.steps * STEP * platform.movement.speed) * platform.movement.amplitude;
				platform.movement.delta = platform.left - previousLeft;
				if (player.platform === platform.id) {
					player.x = clamp(player.x + platform.left - previousLeft, this.petSize / 2, this._width - this.petSize / 2);
				}
			}
			if (platform.collapseStep !== undefined) {
				const elapsed = this.steps - platform.collapseStep;
				platform.collapseProgress = Math.min(1, elapsed / platform.collapseDelay);
				const fallTime = Math.max(0, elapsed - platform.collapseDelay) * STEP;
				platform.fallDistance = GRAVITY * this.scale * fallTime * fallTime / 2;
				if (platform.collapseProgress === 1 && player.platform === platform.id) {
					player.platform = undefined;
					this.cancelCharge();
				}
			}
		}
		if (player.platform !== undefined) {
			if (this.chargeHeld) {
				if (this.charge < 1) {
					this.chargeSteps++;
				}
			}
			return;
		}

		const gravity = GRAVITY * this.scale;
		let remaining = STEP;
		while (remaining > 1e-9) {
			let collisionTime = remaining;
			let collision: 'horizontal' | 'vertical' | IChatPetJumpPlatformState | undefined;
			let wallLanding: IChatPetJumpWall | undefined;
			const heightAt = (time: number) => player.height + player.velocityY * time - gravity * time * time / 2;
			const crossingTime = (height: number, rising: boolean) => {
				const discriminant = player.velocityY * player.velocityY + 2 * gravity * (player.height - height);
				return discriminant < 0 ? Infinity : (player.velocityY + (rising ? -1 : 1) * Math.sqrt(discriminant)) / gravity;
			};
			const hitSide = (x: number, bottom = -Infinity, top = Infinity) => {
				const time = (x - player.x) / player.velocityX;
				if (time >= 0 && time <= collisionTime && heightAt(time) > bottom - this.petSize && heightAt(time) < top) {
					collisionTime = time;
					collision = 'horizontal';
					wallLanding = undefined;
				}
			};
			if (player.velocityX > 0) {
				hitSide(this._width - this.petSize / 2);
			} else if (player.velocityX < 0) {
				hitSide(this.petSize / 2);
			}
			for (const wall of this._walls) {
				const left = wall.left - this.petSize / 2;
				const right = wall.left + wall.width + this.petSize / 2;
				if (player.velocityX > 0 && player.x <= left) {
					hitSide(left, wall.bottom, wall.top);
				} else if (player.velocityX < 0 && player.x >= right) {
					hitSide(right, wall.bottom, wall.top);
				}
				for (const rising of [false, true]) {
					const surface = rising ? wall.bottom - this.petSize : wall.top;
					if (rising ? player.height > surface || player.velocityY <= 0 : player.height < surface) {
						continue;
					}
					const time = crossingTime(surface, rising);
					const x = player.x + player.velocityX * time;
					if (time >= 0 && time <= collisionTime && x > left && x < right) {
						collisionTime = time;
						collision = 'vertical';
						wallLanding = rising ? undefined : wall;
					}
				}
			}
			for (const platform of this._platforms) {
				if (platform.collapseProgress === 1) {
					continue;
				}
				const time = crossingTime(platform.height, false);
				if (time < 0 || time > collisionTime || player.velocityY - gravity * time >= 0) {
					continue;
				}
				const x = player.x + player.velocityX * time;
				const left = platform.left - (platform.movement?.delta ?? 0) * (remaining - time) / STEP;
				if (x >= left && x <= left + platform.width) {
					collisionTime = time;
					collision = platform;
					wallLanding = undefined;
				}
			}
			const peakTime = clamp(player.velocityY / gravity, 0, collisionTime);
			this._bestHeight = Math.max(this._bestHeight, heightAt(peakTime));
			player.x += player.velocityX * collisionTime;
			player.height = heightAt(collisionTime);
			player.velocityY = Math.max(-1400 * this.scale, player.velocityY - gravity * collisionTime);
			remaining -= collisionTime;
			if (collision === 'horizontal') {
				player.velocityX *= -1;
			} else if (wallLanding) {
				player.height = wallLanding.top;
				player.velocityX = 0;
				player.velocityY = 0;
				player.platform = -wallLanding.id;
				return;
			} else if (collision === 'vertical') {
				player.velocityY *= -1;
			} else if (collision) {
				player.x = clamp(player.x + (collision.movement?.delta ?? 0) * remaining / STEP, this.petSize / 2, this._width - this.petSize / 2);
				player.height = collision.height;
				player.velocityX = 0;
				player.velocityY = 0;
				player.platform = collision.id;
				if (collision.kind === 'crumbling') {
					collision.collapseStep ??= this.steps;
				}
				if (collision.id > this.highestPlatform) {
					this.highestPlatform = collision.id;
					this._hops++;
				}
				return;
			}
		}
	}
}
