/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { Color, RGBA } from '../../../../base/common/color.js';
import { LinkedMap, Touch } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';

export const CHAT_PET_CHANGE_COLOR_COMMAND_ID = 'chat.pet.changeColor';
export const CHAT_PET_BLOBBY_COMMAND_ID = 'chat.pet.blobby';

export type ChatPetVariant = 'stable' | 'insiders';
export type ChatPetColor = ChatPetVariant | `#${string}`;

export const chatPetColorPresets: readonly { readonly color: ChatPetColor; readonly label: string }[] = [
	{ color: 'stable', label: localize('chatPet.color.stable', "Stable") },
	{ color: 'insiders', label: localize('chatPet.color.insiders', "Insiders") },
	{ color: '#ff8c00', label: localize('chatPet.color.exploration', "Exploration") },
	{ color: '#e6536f', label: localize('chatPet.color.red', "Red") },
	{ color: '#e6c94d', label: localize('chatPet.color.yellow', "Yellow") },
	{ color: '#55b85a', label: localize('chatPet.color.green', "Green") },
	{ color: '#a277e6', label: localize('chatPet.color.purple', "Purple") },
	{ color: '#ed83b5', label: localize('chatPet.color.pink', "Pink") },
	{ color: '#ffffff', label: localize('chatPet.color.white', "White") },
	{ color: '#000000', label: localize('chatPet.color.black', "Black") },
];

export function parseChatPetColor(value: string): ChatPetColor | undefined {
	if (value === 'stable' || value === 'insiders') {
		return value;
	}
	const hex = value.trim();
	if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex)) {
		return undefined;
	}
	const digits = hex.slice(1).toLowerCase();
	return `#${digits.length === 3 ? [...digits].map(digit => digit + digit).join('') : digits}`;
}

export function getChatPetColorVariant(color: ChatPetColor): ChatPetVariant {
	return color === 'insiders' ? 'insiders' : 'stable';
}

export function isDefaultChatPetColor(color: ChatPetColor): color is ChatPetVariant {
	return color === 'stable' || color === 'insiders';
}

export function getChatPetBodyColor(color: ChatPetColor): string {
	return color === 'stable' ? '#23a8f2' : color === 'insiders' ? '#24bfa5' : color;
}

export function getChatPetEyeColor(color: ChatPetColor): string {
	return color !== 'stable' && color !== 'insiders' && Color.fromHex(color).getContrastRatio(Color.fromHex('#212324')) < 3
		? '#f5f5f5'
		: '#191a1b';
}

const coloredSprites = new WeakMap<HTMLImageElement, { readonly source: string | null; readonly color: ChatPetColor; readonly canvas: HTMLCanvasElement }>();
const coloredSpriteSources = new LinkedMap<string, HTMLCanvasElement>();
const MAX_CACHED_SPRITE_PIXELS = 2 * 1024 * 1024;
let cachedSpritePixels = 0;

export function setChatPetImageSource(image: HTMLImageElement, source: string): void {
	const scheme = URI.parse(source).scheme;
	image.removeAttribute('src');
	image.crossOrigin = scheme === Schemas.http || scheme === Schemas.https ? 'anonymous' : null;
	image.src = source;
}

/** Reuses recolored sheets across sprite buffers, with at most 8 MiB of source pixels held strongly. */
export function getChatPetColoredSprite(image: HTMLImageElement, color: ChatPetColor): HTMLImageElement | HTMLCanvasElement {
	if (color === 'stable' || color === 'insiders') {
		return image;
	}
	const source = image.getAttribute('src');
	const cached = coloredSprites.get(image);
	if (cached?.source === source && cached.color === color) {
		return cached.canvas;
	}
	const sourceKey = source ? `${source}:${image.naturalWidth}x${image.naturalHeight}:${color}` : undefined;
	const sourceCanvas = sourceKey ? coloredSpriteSources.get(sourceKey, Touch.AsNew) : undefined;
	if (sourceCanvas) {
		coloredSprites.set(image, { source, color, canvas: sourceCanvas });
		return sourceCanvas;
	}
	const canvas = DOM.$<HTMLCanvasElement>('canvas');
	canvas.width = image.naturalWidth;
	canvas.height = image.naturalHeight;
	const context = canvas.getContext('2d');
	if (!context) {
		throw new Error('Unable to create the Blobby color canvas');
	}
	context.imageSmoothingEnabled = false;
	context.drawImage(image, 0, 0);
	const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
	const body = Color.fromHex(color);
	const shade = body.darken(0.25).rgba;
	const shadow = body.darken(0.5).rgba;
	const palette = new Map<number, RGBA>([
		[0x23a8f2, body.rgba],
		[0x24bfa5, body.rgba],
		[0x0077b8, shade],
		[0x009a7c, shade],
		[0x004e7c, shadow],
		[0x004538, shadow],
		[0x006451, shadow],
		[0x006652, shadow],
	]);
	const eyeColor = getChatPetEyeColor(color);
	if (eyeColor !== '#191a1b') {
		const eyes = Color.fromHex(eyeColor).rgba;
		palette.set(0x191a1b, eyes);
		palette.set(0x212324, eyes);
	}
	for (let i = 0; i < pixels.data.length; i += 4) {
		if (pixels.data[i + 3] === 0) {
			continue;
		}
		const replacement = palette.get((pixels.data[i] << 16) | (pixels.data[i + 1] << 8) | pixels.data[i + 2]);
		if (replacement) {
			pixels.data[i] = replacement.r;
			pixels.data[i + 1] = replacement.g;
			pixels.data[i + 2] = replacement.b;
		}
	}
	context.putImageData(pixels, 0, 0);
	coloredSprites.set(image, { source, color, canvas });
	const pixelCount = canvas.width * canvas.height;
	if (sourceKey && pixelCount <= MAX_CACHED_SPRITE_PIXELS) {
		coloredSpriteSources.set(sourceKey, canvas, Touch.AsNew);
		cachedSpritePixels += pixelCount;
		while (cachedSpritePixels > MAX_CACHED_SPRITE_PIXELS) {
			const oldest = coloredSpriteSources.shift();
			if (oldest) {
				cachedSpritePixels -= oldest.width * oldest.height;
			}
		}
	}
	return canvas;
}
