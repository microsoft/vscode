/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatPetJumpGameRenderState } from './chatPetJumpGameRenderer.js';

export type ChatPetJumpGameLiteSpriteCallback = (x: number, y: number, width: number, height: number, circle: boolean) => void;
export type ChatPetJumpGameLiteColor = readonly [number, number, number, number];
export type ChatPetJumpGameLiteDrawCallback = (x: number, y: number, width: number, height: number, color: ChatPetJumpGameLiteColor, angle: number, circle: boolean) => void;

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

export function addChatPetJumpGameLiteCapsule(addSprite: ChatPetJumpGameLiteSpriteCallback, x: number, y: number, width: number, height: number, vertical = false): void {
	if (width <= 0 || height <= 0) {
		return;
	}
	if (vertical || height > width) {
		const diameter = Math.min(width, height);
		const centerHeight = height - diameter;
		if (centerHeight > 0) {
			addSprite(x, y, width, centerHeight, false);
			addSprite(x, y - centerHeight / 2, diameter, diameter, true);
			addSprite(x, y + centerHeight / 2, diameter, diameter, true);
		} else {
			addSprite(x, y, width, height, true);
		}
		return;
	}
	const diameter = Math.min(width, height);
	const centerWidth = width - diameter;
	if (centerWidth > 0) {
		addSprite(x, y, centerWidth, height, false);
		addSprite(x - centerWidth / 2, y, diameter, diameter, true);
		addSprite(x + centerWidth / 2, y, diameter, diameter, true);
	} else {
		addSprite(x, y, width, height, true);
	}
}

export function createChatPetJumpGameLiteShapeAtlas(): Uint8Array {
	const pixels = new Uint8Array(32 * 16 * 4);
	for (let y = 0; y < 16; y++) {
		for (let x = 0; x < 32; x++) {
			const pixel = (y * 32 + x) * 4;
			const localX = x % 16;
			const distance = Math.hypot(localX - 7.5, y - 7.5);
			const alpha = x < 16 ? 255 : Math.round(Math.max(0, Math.min(1, 8 - distance)) * 255);
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
		hash = hashRenderValue(hash, platform.id);
		hash = hashRenderValue(hash, platform.left);
		hash = hashRenderValue(hash, platform.width);
		hash = hashRenderValue(hash, platform.height);
		hash = hashRenderValue(hash, platform.fallDistance);
		hash = hashRenderValue(hash, platform.collapseProgress);
		hash = hashRenderValue(hash, platform.kind.charCodeAt(0));
		const top = state.anchor + state.cameraHeight - platform.height + platform.fallDistance;
		if (top < -16 || top > state.height || platform.fallDistance >= state.petSize * 4) {
			continue;
		}
		left = Math.min(left, platform.left - 5);
		right = Math.max(right, platform.left + platform.width + 5);
		renderedObjects++;
	}
	for (const wall of state.walls) {
		hash = hashRenderValue(hash, wall.id);
		hash = hashRenderValue(hash, wall.left);
		hash = hashRenderValue(hash, wall.width);
		hash = hashRenderValue(hash, wall.top);
		hash = hashRenderValue(hash, wall.bottom);
		const top = state.anchor + state.cameraHeight - wall.top;
		const wallHeight = wall.top - wall.bottom;
		if (top + wallHeight < 0 || top > state.height) {
			continue;
		}
		left = Math.min(left, wall.left);
		right = Math.max(right, wall.left + wall.width);
		renderedObjects++;
	}
	return { hash, renderedObjects, left, right };
}

export function renderChatPetJumpGameLiteShapes(state: IChatPetJumpGameRenderState, colors: IChatPetJumpGameLiteColors, addSprite: ChatPetJumpGameLiteDrawCallback): void {
	const addCapsule = (x: number, y: number, width: number, height: number, color: ChatPetJumpGameLiteColor, vertical = false) => {
		addChatPetJumpGameLiteCapsule((spriteX, spriteY, spriteWidth, spriteHeight, circle) => {
			addSprite(spriteX, spriteY, spriteWidth, spriteHeight, color, 0, circle);
		}, x, y, width, height, vertical);
	};
	for (const platform of state.platforms) {
		const top = state.anchor + state.cameraHeight - platform.height + platform.fallDistance;
		if (top < -16 || top > state.height || platform.fallDistance >= state.petSize * 4) {
			continue;
		}
		const opacity = 1 - platform.fallDistance / (state.petSize * 4);
		const foreground = withOpacity(colors.foreground, opacity);
		const border = colors.border ? withOpacity(colors.border, opacity) : undefined;
		const width = platform.width + 10;
		const height = 6;
		const centerX = platform.left + platform.width / 2;
		if (border) {
			addCapsule(centerX, top, width, height, border);
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
				addSprite(platform.left + integrityWidth / 2, top + 6, integrityWidth, 2, withOpacity(colors.integrityForeground, opacity), 0, false);
			}
		} else {
			addCapsule(centerX, top, border ? width - 2 : width, border ? height - 2 : height, foreground);
		}
		if (platform.kind === 'moving') {
			for (const direction of [-1, 1]) {
				const x = centerX + direction * 5;
				addSprite(x - direction, top + 9, 1, 5, foreground, direction * -Math.PI / 4, false);
				addSprite(x - direction, top + 11, 1, 5, foreground, direction * Math.PI / 4, false);
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
			addCapsule(x, y, wall.width, height, colors.border, true);
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
