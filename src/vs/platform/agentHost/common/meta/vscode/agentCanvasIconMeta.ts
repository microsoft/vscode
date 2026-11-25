/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CanvasState } from '../../state/protocol/channels-canvas/state.js';
import type { Icon } from '../../state/protocol/common/state.js';

/**
 * The icons of a canvas, as {@link Icon}s, which VS Code hosts add to canvas state until the protocol gives canvases icons.
 * Clients and hosts without it show and send none.
 */
export const AgentCanvasIconsMetaKey = 'vscode.canvasIcons';

const pngDataUriPrefix = 'data:image/png;base64,';
/** The Base64 encoding of the PNG signature and the length of the IHDR chunk that must follow it. */
const pngSignatureBase64 = 'iVBORw0KGgoAAAANSUhEUg';
/** The longest canvas icon a host sends and a client accepts, as GitHub's app accepts for plugin icons. */
export const MAX_CANVAS_ICON_DATA_URI_LENGTH = 350_000;
/** The largest PNG file that encodes to a data URI within {@link MAX_CANVAS_ICON_DATA_URI_LENGTH}. */
export const MAX_CANVAS_ICON_BYTES = Math.floor((MAX_CANVAS_ICON_DATA_URI_LENGTH - pngDataUriPrefix.length) / 4) * 3;
/** The most pixels a canvas icon may declare, so that no image decoder expands a small, highly compressed one into a huge bitmap. */
export const MAX_CANVAS_ICON_PIXELS = 4 * 1024 * 1024;
/** The Base64 length of the PNG signature and IHDR chunk header that end with the image's width and height. */
const pngHeaderBase64Length = 32;

/** Canvas state with the metadata VS Code hosts add; the protocol's canvas state declares none. */
export type CanvasStateWithMeta = CanvasState & { readonly _meta?: Readonly<Record<string, unknown>> };

/** Encodes PNG bytes as a canvas icon. */
export function toCanvasIconDataUri(png: Uint8Array): string {
	let binary = '';
	for (let index = 0; index < png.length; index += 0x8000) {
		binary += String.fromCharCode(...png.subarray(index, index + 0x8000));
	}
	return `${pngDataUriPrefix}${btoa(binary)}`;
}

/**
 * Whether `value` is a canvas icon: a bounded Base64 data URI of a PNG image, which renders no active content, whose
 * header declares a non-empty image of at most {@link MAX_CANVAS_ICON_PIXELS}. Any host can send one, so clients check it.
 */
export function isCanvasIconDataUri(value: unknown): value is string {
	if (typeof value !== 'string'
		|| value.length > MAX_CANVAS_ICON_DATA_URI_LENGTH
		|| !value.startsWith(pngDataUriPrefix + pngSignatureBase64)) {
		return false;
	}
	const payload = value.slice(pngDataUriPrefix.length);
	// Padding may only end the payload, so a longer payload starts with whole, unpadded groups that always decode.
	if (payload.length <= pngHeaderBase64Length || payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) {
		return false;
	}
	const header = atob(payload.slice(0, pngHeaderBase64Length));
	return isBoundedPngSize(readUint32(header, 16), readUint32(header, 20));
}

/** Whether a PNG image of `width` by `height` pixels is one a canvas icon may be. */
export function isBoundedPngSize(width: number, height: number): boolean {
	return width > 0 && height > 0 && width * height <= MAX_CANVAS_ICON_PIXELS;
}

function readUint32(bytes: string, offset: number): number {
	return ((bytes.charCodeAt(offset) << 24) >>> 0) + (bytes.charCodeAt(offset + 1) << 16) + (bytes.charCodeAt(offset + 2) << 8) + bytes.charCodeAt(offset + 3);
}

/** Returns `state` showing `icon`, a canvas icon data URI, or showing none, and keeps its other metadata. */
export function withCanvasIcon(state: CanvasStateWithMeta, icon: string | undefined): CanvasStateWithMeta {
	const { _meta, ...rest } = state;
	const { [AgentCanvasIconsMetaKey]: _previous, ...otherMeta } = _meta ?? {};
	const meta = icon ? { ...otherMeta, [AgentCanvasIconsMetaKey]: [{ src: icon, contentType: 'image/png' } satisfies Icon] } : otherMeta;
	return Object.keys(meta).length > 0 ? { ...rest, _meta: meta } : rest;
}

/** The icon `state` shows, when its metadata carries a valid canvas icon. */
export function readCanvasIcon(state: CanvasState | undefined): string | undefined {
	const icons = (state as CanvasStateWithMeta | undefined)?._meta?.[AgentCanvasIconsMetaKey];
	if (!Array.isArray(icons)) {
		return undefined;
	}
	for (const icon of icons) {
		if (icon && typeof icon === 'object' && (icon.contentType === undefined || icon.contentType === 'image/png') && isCanvasIconDataUri(icon.src)) {
			return icon.src;
		}
	}
	return undefined;
}
