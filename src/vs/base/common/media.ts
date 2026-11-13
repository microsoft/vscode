/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Approved video codec/container candidates, ordered by recording preference.
 * Consumers must still query recording and playback support in the current runtime.
 */
export const supportedVideoFormats = [
	{ mimeType: 'video/mp4;codecs=avc1.42001E', label: 'MP4', extension: 'mp4' },
	{ mimeType: 'video/webm;codecs=vp8', label: 'WebM', extension: 'webm' },
] as const;

/** Approved audio codec/container candidates; availability must be checked at runtime. */
export const supportedAudioFormats = [
	{ mimeType: 'audio/ogg;codecs=vorbis', label: 'Ogg', extension: 'ogg' },
	{ mimeType: 'audio/webm;codecs=vorbis', label: 'WebM', extension: 'webm' },
	{ mimeType: 'audio/flac', label: 'FLAC', extension: 'flac' },
	{ mimeType: 'audio/mpeg', label: 'MP3', extension: 'mp3' },
	{ mimeType: 'audio/wav;codecs=1', label: 'WAV', extension: 'wav' },
] as const;
