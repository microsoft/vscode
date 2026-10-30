/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatPetJumpGameModel } from '../../common/chatPetJumpGame.js';

suite('ChatPetJumpGame', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function advance(model: ChatPetJumpGameModel, milliseconds: number, frame = 1000 / 60): void {
		for (let elapsed = 0; elapsed < milliseconds - 1e-6; elapsed += frame) {
			model.advance(Math.min(frame, milliseconds - elapsed));
		}
	}

	function chargeJump(model: ChatPetJumpGameModel, milliseconds: number, direction: -1 | 0 | 1): void {
		model.setChargeHeld(true);
		model.hop(direction);
		advance(model, milliseconds);
		model.setChargeHeld(false);
	}

	function climbTo(platformId: number, size = 48): ChatPetJumpGameModel {
		const model = new ChatPetJumpGameModel(size * 12.5, size, size * 6.25, () => 0.5);
		model.ensurePlatforms(size * 50);
		const centers = model.platforms.map(platform => platform.left + platform.width / 2);
		for (let id = 1; id <= platformId; id++) {
			const wall = model.walls.find(wall => wall.id === id);
			const center = centers[id - 1];
			const direction = wall ? wall.left > model.player.x ? 1 : -1
				: center < model.width / 4 ? 1 : center > model.width * 3 / 4 ? -1 : 1;
			chargeJump(model, wall ? 900 : Math.round((0.845 + Math.min(4, Math.floor(id / 8)) * 0.015) * 108) * 1000 / 120, direction);
			for (let step = 0; step < 240 && model.player.platform === undefined && !model.hasFallen; step++) {
				model.advance(1000 / 120);
			}
			assert.strictEqual(model.player.platform, id, `The pre-generated route must remain playable at platform ${id}, pet size ${size}`);
		}
		return model;
	}

	test('charges for exactly 900ms, caps at full power, and launches only on release', () => {
		const model = new ChatPetJumpGameModel(600, 48, 300);
		model.setChargeHeld(true);
		advance(model, 450);
		const half = { charge: model.charge, height: model.player.height, platform: model.player.platform };
		advance(model, 450);
		const full = model.charge;
		advance(model, 2000);
		const capped = model.charge;
		model.setChargeHeld(false);
		assert.deepStrictEqual({ half, full, capped, player: model.player, charge: model.charge }, {
			half: { charge: 0.5, height: 0, platform: 0 },
			full: 1,
			capped: 1,
			player: { x: 300, height: 0, velocityX: 0, velocityY: 820, platform: undefined },
			charge: 0,
		});
	});

	test('longer charges jump measurably higher and farther in either direction', () => {
		const trajectories = [0, 450, 900].map(duration => {
			const right = new ChatPetJumpGameModel(2000, 48, 1000);
			const left = new ChatPetJumpGameModel(2000, 48, 1000);
			chargeJump(right, duration, 1);
			chargeJump(left, duration, -1);
			advance(right, 250);
			advance(left, 250);
			return {
				peak: right.bestHeight,
				distance: Math.round(right.player.x - 1000),
				symmetric: Math.abs(left.player.x + right.player.x - 2000) < 1e-6 && left.player.height === right.player.height,
			};
		});
		assert.deepStrictEqual({
			distances: trajectories.map(trajectory => trajectory.distance),
			increasingHeight: trajectories[0].peak < trajectories[1].peak && trajectories[1].peak < trajectories[2].peak,
			symmetric: trajectories.every(trajectory => trajectory.symmetric),
		}, { distances: [30, 50, 70], increasingHeight: true, symmetric: true });
	});

	test('arrows make short hops but do not steer or double jump in flight', () => {
		const model = new ChatPetJumpGameModel(600, 48, 300);
		model.hop(-1);
		advance(model, 50);
		const velocity = model.player.velocityY;
		model.hop(1);
		model.setChargeHeld(true);
		model.setChargeHeld(false);
		assert.deepStrictEqual({
			x: Math.round(model.player.x),
			velocityX: model.player.velocityX,
			sameVerticalVelocity: model.player.velocityY === velocity,
			grounded: model.player.platform,
			charge: model.charge,
		}, { x: 294, velocityX: -120, sameVerticalVelocity: true, grounded: undefined, charge: 0 });
	});

	test('repeated keydown does not reset a charge and cancellation never launches', () => {
		const model = new ChatPetJumpGameModel(600, 48, 300);
		model.setChargeHeld(true);
		advance(model, 450);
		model.setChargeHeld(true);
		advance(model, 450);
		const charge = model.charge;
		model.cancelCharge();
		model.setChargeHeld(false);
		assert.deepStrictEqual({ charge, after: model.charge, player: model.player }, {
			charge: 1, after: 0,
			player: { x: 300, height: 0, velocityX: 0, velocityY: 0, platform: 0 },
		});
	});

	test('fixed steps give the same flight at different display refresh rates', () => {
		const results = [30, 60, 120].map(fps => {
			const model = new ChatPetJumpGameModel(600, 48, 300);
			chargeJump(model, 900, 1);
			advance(model, 500, 1000 / fps);
			return model.player;
		});
		assert.deepStrictEqual(results, [results[0], results[0], results[0]]);
	});

	test('a delayed frame is bounded instead of tunneling through the world', () => {
		const delayed = new ChatPetJumpGameModel(600, 48, 300);
		const regular = new ChatPetJumpGameModel(600, 48, 300);
		chargeJump(delayed, 900, 1);
		chargeJump(regular, 900, 1);
		delayed.advance(10_000);
		regular.advance(100);
		assert.deepStrictEqual(delayed.player, regular.player);
	});

	test('wall collisions reverse horizontal velocity and keep the pet inside the playfield', () => {
		const model = new ChatPetJumpGameModel(240, 48, 208);
		chargeJump(model, 900, 1);
		advance(model, 100);
		assert.deepStrictEqual({
			inside: model.player.x >= 24 && model.player.x <= 216,
			velocityX: model.player.velocityX,
			rising: model.player.velocityY > 0,
		}, { inside: true, velocityX: -280, rising: true });
	});

	test('landings stop on the top of a platform, but ascending jumps pass through', () => {
		const model = new ChatPetJumpGameModel(144, 48, 72, () => 0.5);
		model.ensurePlatforms(100);
		chargeJump(model, 900, 0);
		advance(model, 200);
		const ascending = { airborne: model.player.platform === undefined, above: model.player.height > model.platforms[1].height };
		advance(model, 1000);
		assert.deepStrictEqual({
			ascending,
			platform: model.player.platform,
			height: model.player.height,
			velocity: [model.player.velocityX, model.player.velocityY],
		}, { ascending: { airborne: true, above: true }, platform: 2, height: 168, velocity: [0, 0] });
	});

	test('missing the starting ledge preserves the fall position for the normal pet physics', () => {
		const model = new ChatPetJumpGameModel(1000, 48, 500);
		chargeJump(model, 900, 1);
		advance(model, 2000);
		const fallenPlayer = { ...model.player };
		advance(model, 2000);
		assert.deepStrictEqual({
			hasFallen: model.hasFallen,
			leftStartingPlatform: model.player.x > 572,
			belowStart: model.player.height < 0,
			descending: model.player.velocityY < 0,
			platform: model.player.platform,
			fallPreserved: model.player.x === fallenPlayer.x && model.player.height === fallenPlayer.height,
			bestHeight: Math.round(model.bestHeight),
			platforms: model.platforms.map(({ id, left, width, height }) => ({ id, left, width, height })),
		}, {
			hasFallen: true, leftStartingPlatform: true, belowStart: true, descending: true, platform: undefined, fallPreserved: true,
			bestHeight: 187,
			platforms: [{ id: 0, left: 428, width: 144, height: 0 }],
		});
	});

	test('generated platforms stay in bounds with a reachable charged-jump path across sizes', () => {
		for (const size of [24, 48, 96]) {
			for (const width of [size * 2, size * 5, size * 20]) {
				let seed = 42;
				const model = new ChatPetJumpGameModel(width, size, width / 2, () => {
					seed = (seed * 1664525 + 1013904223) >>> 0;
					return seed / 0x100000000;
				});
				model.ensurePlatforms(size * 200);
				const platforms = model.platforms;
				for (let i = 1; i < platforms.length; i++) {
					const previous = platforms[i - 1];
					const next = platforms[i];
					const rise = next.height - previous.height;
					const scale = size / 48;
					const wall = model.walls.find(wall => wall.id === next.id);
					let reachable = false;
					for (let step = 1; step <= 108 && !reachable; step++) {
						const charge = step / 108;
						const speed = (260 + 560 * charge) * scale;
						const discriminant = speed * speed - 2 * 1800 * scale * rise;
						if (discriminant < 0) {
							continue;
						}
						const time = (speed + Math.sqrt(discriminant)) / (1800 * scale);
						for (const direction of [-1, 0, 1]) {
							const center = previous.left + previous.width / 2;
							const velocityX = direction * (120 + 160 * charge) * scale;
							let projected = center + velocityX * time;
							if (wall && direction !== 0) {
								const contact = direction > 0 ? wall.left - size / 2 : wall.left + wall.width + size / 2;
								const collisionTime = (contact - center) / velocityX;
								const collisionHeight = previous.height + speed * collisionTime - 1800 * scale * collisionTime * collisionTime / 2;
								if (collisionTime >= 0 && collisionTime <= time && collisionHeight < wall.top && collisionHeight + size > wall.bottom) {
									projected = 2 * contact - projected;
								}
							}
							const range = width - size;
							const offset = ((projected - size / 2) % (2 * range) + 2 * range) % (2 * range);
							const x = size / 2 + (offset <= range ? offset : 2 * range - offset);
							reachable ||= x >= next.left && x <= next.left + next.width;
						}
					}
					assert.deepStrictEqual({
						inside: next.left >= 0 && next.left + next.width <= width,
						riseInRange: wall ? Math.abs(rise - size * 3.1) < 1e-6 : rise >= size * 1.25 - 1e-6 && rise <= size * (2.25 + Math.min(4, Math.floor(i / 8)) * 0.1) + 1e-6,
						reachable,
					}, { inside: true, riseInRange: true, reachable: true }, `size=${size}, width=${width}, platform=${i}`);
				}
			}
		}
	});

	test('introduces hazards gradually and keeps a complete route playable across pet sizes', () => {
		const results = [24, 48, 96].map(size => {
			const model = climbTo(16, size);
			return {
				hops: model.hops,
				firstLedges: model.platforms.slice(1, 5).map(platform => platform.kind),
				moving: model.platforms[5].kind,
				crumbling: model.platforms[9].kind,
				firstWall: model.walls[0].id,
				narrower: model.platforms[16].width < model.platforms[1].width,
			};
		});
		assert.deepStrictEqual(results, Array(3).fill({
			hops: 16, firstLedges: ['static', 'static', 'static', 'static'],
			moving: 'moving', crumbling: 'crumbling', firstWall: 12, narrower: true,
		}));
	});

	test('a moving ledge carries a landed pet while charging without awarding extra hops', () => {
		const model = climbTo(5);
		const platform = model.platforms[5];
		const offset = model.player.x - platform.left;
		const left = platform.left;
		model.setChargeHeld(true);
		advance(model, 450);
		assert.deepStrictEqual({
			moving: Math.abs(platform.left - left) > 1,
			carried: Math.abs(model.player.x - platform.left - offset) < 1e-6,
			grounded: model.player.platform,
			charge: model.charge,
			hops: model.hops,
		}, { moving: true, carried: true, grounded: 5, charge: 0.5, hops: 5 });
	});

	test('crumbling ledges allow a full charge, then fall and release the pet without a phantom jump', () => {
		const model = climbTo(9);
		model.setChargeHeld(true);
		advance(model, 900);
		const before = { platform: model.player.platform, charge: model.charge, crumbling: model.platforms[9].collapseProgress > 0 };
		advance(model, 700);
		model.setChargeHeld(false);
		assert.deepStrictEqual({
			before,
			collapsed: model.platforms[9].collapseProgress,
			ledgeFalling: model.platforms[9].fallDistance > 0,
			petFalling: model.player.height < model.platforms[9].height && model.player.velocityY < 0,
			platform: model.player.platform, charge: model.charge, hops: model.hops,
		}, {
			before: { platform: 9, charge: 1, crumbling: true },
			collapsed: 1, ledgeFalling: true, petFalling: true, platform: undefined, charge: 0, hops: 9,
		});
	});

	test('bank shots reflect horizontal speed without an extra vertical kick and land on the narrow ledge', () => {
		const model = climbTo(11);
		const wall = model.walls.find(wall => wall.id === 12)!;
		const direction = wall.left > model.player.x ? 1 : -1;
		chargeJump(model, 900, direction);
		let steps = 0;
		while (steps < 120 && model.player.velocityX === direction * 280) {
			model.advance(1000 / 120);
			steps++;
		}
		const bounce = {
			horizontalSpeed: model.player.velocityX,
			verticalSpeed: Math.round(model.player.velocityY),
			expectedVerticalSpeed: 820 - 15 * steps,
			airborne: model.player.platform === undefined,
		};
		advance(model, 500);
		assert.deepStrictEqual({
			bounce, platform: model.player.platform, hops: model.hops, width: model.platforms[12].width,
		}, {
			bounce: { horizontalSpeed: -direction * 280, verticalSpeed: 820 - 15 * steps, expectedVerticalSpeed: 820 - 15 * steps, airborne: true },
			platform: 12, hops: 12, width: 48 * 0.8,
		});
	});

	test('moving and crumbling physics are independent of display refresh rate', () => {
		for (const id of [5, 9]) {
			const results = [30, 60, 120].map(fps => {
				const model = climbTo(id);
				advance(model, 1600, 1000 / fps);
				return { player: { ...model.player }, platforms: model.platforms, hops: model.hops };
			});
			assert.deepStrictEqual(results, [results[0], results[0], results[0]]);
		}
	});

	test('resting on the top of a wall settles without a zero-time collision loop or score', () => {
		const model = new ChatPetJumpGameModel(600, 48, 300, () => 0.5);
		model.ensurePlatforms(1500);
		const wall = model.walls[0];
		Object.assign(model.player, { x: wall.left + wall.width / 2, height: wall.top, platform: undefined });
		advance(model, 100);
		const landed = { platform: model.player.platform, height: model.player.height, hops: model.hops };
		model.hop(-1);
		advance(model, 100);
		assert.deepStrictEqual({ landed, canJump: model.player.height > wall.top && model.player.platform === undefined }, {
			landed: { platform: -wall.id, height: wall.top, hops: 0 }, canJump: true,
		});
	});

	test('hopping on a reached platform or falling back never increases the score', () => {
		const model = climbTo(3);
		model.hop(0);
		advance(model, 400);
		const repeat = { hops: model.hops, platform: model.player.platform };
		chargeJump(model, 0, -1);
		advance(model, 2000);
		assert.deepStrictEqual({ repeat, hops: model.hops, noProgress: (model.player.platform ?? 0) <= 3 }, {
			repeat: { hops: 3, platform: 3 }, hops: 3, noProgress: true,
		});
	});

	test('generates only on demand and keeps existing platforms when extending the route', () => {
		const model = new ChatPetJumpGameModel(600, 48, 300, () => 0.5);
		model.ensurePlatforms(500);
		const existing = [...model.platforms];
		model.ensurePlatforms(100);
		const sameCount = model.platforms.length === existing.length;
		model.ensurePlatforms(1000);
		assert.deepStrictEqual({ sameCount, existing: model.platforms.slice(0, existing.length), extended: model.platforms.at(-1)!.height >= 1000 }, {
			sameCount: true, existing, extended: true,
		});
	});

	test('resizing retains heights and keeps every surface and the pet in bounds', () => {
		const model = new ChatPetJumpGameModel(800, 48, 700, () => 0.5);
		model.ensurePlatforms(1000);
		const heights = model.platforms.map(platform => platform.height);
		model.resize(120);
		assert.deepStrictEqual({
			heights: model.platforms.map(platform => platform.height),
			platformsInside: model.platforms.every(platform => platform.left >= 0 && platform.left + platform.width <= 120),
			petInside: model.player.x >= 24 && model.player.x <= 96,
		}, { heights, platformsInside: true, petInside: true });
	});
});
