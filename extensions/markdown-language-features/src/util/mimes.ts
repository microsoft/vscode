/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const Mime = {
	textUriList: 'text/uri-list',
	textPlain: 'text/plain',
} as const;

export const rootMediaMimesTypes = Object.freeze({
	image: 'image',
	audio: 'audio',
	video: 'video',
});

export enum MediaKind {
	Image = 1,
	Video,
	Audio
}

export function getMediaKindForMime(mime: string): MediaKind | undefined {
	const root = mime.toLowerCase().split('/').at(0);
	switch (root) {
		case 'image': return MediaKind.Image;
		case 'video': return MediaKind.Video;
		case 'audio': return MediaKind.Audio;
		default: return undefined;
	}
}

export const mediaFileExtensions = new Map<string, MediaKind>([
	// Images
	['avif', MediaKind.Image],
	['bmp', MediaKind.Image],
	['gif', MediaKind.Image],
	['ico', MediaKind.Image],
	['jpe', MediaKind.Image],
	['jpeg', MediaKind.Image],
	['jpg', MediaKind.Image],
	['png', MediaKind.Image],
	['psd', MediaKind.Image],
	['svg', MediaKind.Image],
	['tga', MediaKind.Image],
	['tif', MediaKind.Image],
	['tiff', MediaKind.Image],
	['webp', MediaKind.Image],

	// Videos
	['ogg', MediaKind.Video],
	['mp4', MediaKind.Video],
	['mov', MediaKind.Video],

	// Audio Files
	['mp3', MediaKind.Audio],
	['aac', MediaKind.Audio],
	['wav', MediaKind.Audio],
]);
