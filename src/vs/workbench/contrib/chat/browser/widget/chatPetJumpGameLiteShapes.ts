/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isChatPetJumpPlatformVisible } from './chatPetJumpGameRenderUtils.js';
import type { IChatPetJumpGameRenderState } from './chatPetJumpGameRenderer.js';

export type ChatPetJumpGameLiteSpriteCallback = (x: number, y: number, width: number, height: number, angle: number, frame: number) => void;
export type ChatPetJumpGameLiteColor = readonly [number, number, number, number];
export type ChatPetJumpGameLiteDrawCallback = (x: number, y: number, width: number, height: number, color: ChatPetJumpGameLiteColor, angle: number, frame: number) => void;

export interface IChatPetJumpGameLiteColors {
	readonly foreground: ChatPetJumpGameLiteColor;
	readonly integrityForeground: ChatPetJumpGameLiteColor;
	readonly border: ChatPetJumpGameLiteColor | undefined;
}

export interface IChatPetJumpGameLiteRenderInfo {
	readonly hash: number;
	readonly renderedObjects: number;
	readonly left: number;
	readonly right: number;
}

export interface IChatPetJumpGameLiteAtlasFrame {
	readonly uvMin: readonly [number, number];
	readonly uvMax: readonly [number, number];
}

export function insetChatPetJumpGameLiteAtlasFrames<T extends IChatPetJumpGameLiteAtlasFrame>(frames: readonly T[], textureSize: readonly [number, number]): T[] {
	const insetX = 0.5 / textureSize[0];
	const insetY = 0.5 / textureSize[1];
	return frames.map(frame => ({
		...frame,
		uvMin: [frame.uvMin[0] + insetX, frame.uvMin[1] + insetY],
		uvMax: [frame.uvMax[0] - insetX, frame.uvMax[1] - insetY],
	}));
}

export function addChatPetJumpGameLiteCapsule(addSprite: ChatPetJumpGameLiteSpriteCallback, x: number, y: number, width: number, height: number, vertical = false): void {
	if (width <= 0 || height <= 0) {
		return;
	}
	if (vertical || height > width) {
		const diameter = Math.min(width, height);
		const centerHeight = height - diameter;
		if (centerHeight > 0) {
			addSprite(x, y, width, centerHeight, 0, 0);
			addSprite(x, y - centerHeight / 2, diameter, diameter, Math.PI / 2, 1);
			addSprite(x, y + centerHeight / 2, diameter, diameter, -Math.PI / 2, 1);
		} else {
			addSprite(x, y, width, height, 0, 1);
			addSprite(x, y, width, height, Math.PI, 1);
		}
		return;
	}
	const diameter = Math.min(width, height);
	const centerWidth = width - diameter;
	if (centerWidth > 0) {
		addSprite(x, y, centerWidth, height, 0, 0);
		addSprite(x - centerWidth / 2, y, diameter, diameter, 0, 1);
		addSprite(x + centerWidth / 2, y, diameter, diameter, Math.PI, 1);
	} else {
		addSprite(x, y, width, height, 0, 1);
		addSprite(x, y, width, height, Math.PI, 1);
	}
}

export function createChatPetJumpGameLiteShapeAtlas(): Uint8Array {
	const pixels = new Uint8Array(32 * 16 * 4);
	for (let y = 0; y < 16; y++) {
		for (let x = 0; x < 32; x++) {
			const pixel = (y * 32 + x) * 4;
			const localX = x % 16;
			const distance = Math.hypot(localX - 7.5, y - 7.5);
			const circleAlpha = Math.max(0, Math.min(1, 8 - distance));
			const halfDiscAlpha = localX <= 7.5 ? circleAlpha : 0;
			const alpha = x < 16 ? 255 : Math.round(halfDiscAlpha * 255);
			pixels[pixel] = 255;
			pixels[pixel + 1] = 255;
			pixels[pixel + 2] = 255;
			pixels[pixel + 3] = alpha;
		}
	}
	return pixels;
}

export function getChatPetJumpGameLiteRenderInfo(state: IChatPetJumpGameRenderState, width: number): IChatPetJumpGameLiteRenderInfo {
	let hash = hashRenderValue(0, state.width);
	hash = hashRenderValue(hash, state.height);
	hash = hashRenderValue(hash, state.anchor);
	hash = hashRenderValue(hash, state.cameraHeight);
	hash = hashRenderValue(hash, state.petSize);
	let renderedObjects = 0;
	let left = width;
	let right = 0;
	for (const platform of state.platforms) {
		if (!isChatPetJumpPlatformVisible(platform, state)) {
			continue;
		}
		hash = hashRenderValue(hash, platform.id);
		hash = hashRenderValue(hash, platform.left);
		hash = hashRenderValue(hash, platform.width);
		hash = hashRenderValue(hash, platform.height);
		hash = hashRenderValue(hash, platform.fallDistance);
		hash = hashRenderValue(hash, platform.collapseProgress);
		hash = hashRenderValue(hash, platform.kind.charCodeAt(0));
		left = Math.min(left, platform.left - 5);
		right = Math.max(right, platform.left + platform.width + 5);
		renderedObjects++;
	}
	for (const wall of state.walls) {
		const top = state.anchor + state.cameraHeight - wall.top;
		const wallHeight = wall.top - wall.bottom;
		if (top + wallHeight < 0 || top > state.height) {
			continue;
		}
		hash = hashRenderValue(hash, wall.id);
		hash = hashRenderValue(hash, wall.left);
		hash = hashRenderValue(hash, wall.width);
		hash = hashRenderValue(hash, wall.top);
		hash = hashRenderValue(hash, wall.bottom);
		left = Math.min(left, wall.left);
		right = Math.max(right, wall.left + wall.width);
		renderedObjects++;
	}
	return { hash, renderedObjects, left, right };
}

export function renderChatPetJumpGameLiteShapes(state: IChatPetJumpGameRenderState, colors: IChatPetJumpGameLiteColors, addSprite: ChatPetJumpGameLiteDrawCallback): void {
	const addCapsule = (x: number, y: number, width: number, height: number, color: ChatPetJumpGameLiteColor, vertical = false) => {
		addChatPetJumpGameLiteCapsule((spriteX, spriteY, spriteWidth, spriteHeight, angle, frame) => {
			addSprite(spriteX, spriteY, spriteWidth, spriteHeight, color, angle, frame);
		}, x, y, width, height, vertical);
	};
	const addHalfCapsuleBorder = (x: number, y: number, diameter: number, directionX: number, directionY: number, color: ChatPetJumpGameLiteColor) => {
		// Non-overlapping strips keep translucent borders uniformly one pixel thick without filling the capsule interior.
		const radius = diameter / 2;
		const innerRadius = Math.max(0, radius - 1);
		const stripThickness = 0.125;
		for (let crossStart = -radius; crossStart < radius; crossStart += stripThickness) {
			const crossEnd = Math.min(radius, crossStart + stripThickness);
			const cross = (crossStart + crossEnd) / 2;
			const outerExtent = Math.sqrt(Math.max(0, radius * radius - cross * cross));
			const innerExtent = Math.sqrt(Math.max(0, innerRadius * innerRadius - cross * cross));
			const length = outerExtent - innerExtent;
			const outwardOffset = innerExtent + length / 2;
			const thickness = crossEnd - crossStart;
			if (directionX) {
				addSprite(x + directionX * outwardOffset, y + cross, length, thickness, color, 0, 0);
			} else {
				addSprite(x + cross, y + directionY * outwardOffset, thickness, length, color, 0, 0);
			}
		}
	};
	const addCapsuleBorder = (x: number, y: number, width: number, height: number, color: ChatPetJumpGameLiteColor, vertical = false) => {
		const diameter = Math.min(width, height);
		if (vertical || height > width) {
			const edgeHeight = Math.max(0, height - diameter);
			if (edgeHeight > 0) {
				addSprite(x - width / 2 + 0.5, y, 1, edgeHeight, color, 0, 0);
				addSprite(x + width / 2 - 0.5, y, 1, edgeHeight, color, 0, 0);
			}
			addHalfCapsuleBorder(x, y - edgeHeight / 2, diameter, 0, -1, color);
			addHalfCapsuleBorder(x, y + edgeHeight / 2, diameter, 0, 1, color);
		} else {
			const edgeWidth = Math.max(0, width - diameter);
			if (edgeWidth > 0) {
				addSprite(x, y - height / 2 + 0.5, edgeWidth, 1, color, 0, 0);
				addSprite(x, y + height / 2 - 0.5, edgeWidth, 1, color, 0, 0);
			}
			addHalfCapsuleBorder(x - edgeWidth / 2, y, diameter, -1, 0, color);
			addHalfCapsuleBorder(x + edgeWidth / 2, y, diameter, 1, 0, color);
		}
	};
	for (const platform of state.platforms) {
		if (!isChatPetJumpPlatformVisible(platform, state)) {
			continue;
		}
		const top = state.anchor + state.cameraHeight - platform.height + platform.fallDistance;
		const opacity = 1 - platform.fallDistance / (state.petSize * 4);
		const foreground = withOpacity(colors.foreground, opacity);
		const border = colors.border ? withOpacity(colors.border, opacity) : undefined;
		const width = platform.width + 10;
		const height = 6;
		const centerX = platform.left + platform.width / 2;
		if (border) {
			addCapsuleBorder(centerX, top, width, height, border);
		}
		if (platform.kind === 'crumbling') {
			const contentWidth = border ? width - 2 : width;
			const contentHeight = Math.min(4, border ? height - 2 : height);
			const left = centerX - contentWidth / 2;
			for (let offset = 0; offset < contentWidth; offset += 12) {
				const segmentWidth = Math.min(8, contentWidth - offset);
				if (segmentWidth > 0) {
					addCapsule(left + offset + segmentWidth / 2, top, segmentWidth, contentHeight, foreground);
				}
			}
			if (platform.collapseProgress > 0) {
				const integrityWidth = platform.width * (1 - platform.collapseProgress);
				addSprite(platform.left + integrityWidth / 2, top + 6, integrityWidth, 2, withOpacity(colors.integrityForeground, opacity), 0, 0);
			}
		} else {
			addCapsule(centerX, top, border ? width - 2 : width, border ? height - 2 : height, foreground);
		}
		if (platform.kind === 'moving') {
			for (const direction of [-1, 1]) {
				const x = centerX + direction * 5;
				addSprite(x - direction, top + 9, 1, 5, foreground, direction * -Math.PI / 4, 0);
				addSprite(x - direction, top + 11, 1, 5, foreground, direction * Math.PI / 4, 0);
			}
		}
	}
	for (const wall of state.walls) {
		const top = state.anchor + state.cameraHeight - wall.top;
		const height = wall.top - wall.bottom;
		if (top + height < 0 || top > state.height) {
			continue;
		}
		const x = wall.left + wall.width / 2;
		const y = top + height / 2;
		if (colors.border) {
			addCapsuleBorder(x, y, wall.width, height, colors.border, true);
			addCapsule(x, y, Math.max(0, wall.width - 2), Math.max(0, height - 2), colors.foreground, true);
		} else {
			addCapsule(x, y, wall.width, height, colors.foreground, true);
		}
	}
}

function withOpacity(color: ChatPetJumpGameLiteColor, opacity: number): ChatPetJumpGameLiteColor {
	return [color[0], color[1], color[2], color[3] * opacity];
}

function hashRenderValue(hash: number, value: number): number {
	return (Math.imul(hash, 31) + Math.round(value * 1000)) | 0;
}
