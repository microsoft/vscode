/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Builders of minimal media files, as byte arrays, for testing how their codecs are read.
 */

export const text = (value: string) => Array.from(value, character => character.charCodeAt(0));
export const zeros = (length: number) => new Array<number>(length).fill(0);
export const uint16LE = (value: number) => [value & 0xFF, (value >>> 8) & 0xFF];
export const uint32LE = (value: number) => [...uint16LE(value), ...uint16LE(value >>> 16)];
const uint32BE = (value: number) => [(value >>> 24) & 0xFF, (value >>> 16) & 0xFF, (value >>> 8) & 0xFF, value & 0xFF];

export function box(type: string, ...content: number[][]): number[] {
	const body = content.flat();
	return [...uint32BE(8 + body.length), ...text(type), ...body];
}

export function mp4Track(handlerType: string, sampleEntry: number[]): number[] {
	return box('trak',
		box('tkhd', zeros(84)),
		box('mdia',
			box('mdhd', zeros(24)),
			box('hdlr', zeros(8), text(handlerType), zeros(13)),
			box('minf',
				box('stbl',
					box('stsd', zeros(4), uint32BE(1), sampleEntry),
					box('stsz', zeros(1024))))));
}

/**
 * An MPEG-4 elementary stream descriptor of MPEG-4 Audio with the given AudioSpecificConfig, which
 * is AAC-LC by default.
 */
export function mpeg4AudioEsds(audioSpecificConfig = [0x12, 0x10]): number[] {
	const decoderSpecificInfo = [0x05, audioSpecificConfig.length, ...audioSpecificConfig];
	const decoderConfig = [0x04, 13 + decoderSpecificInfo.length, 0x40, 0x15, ...zeros(11), ...decoderSpecificInfo];
	return box('esds', zeros(4), [0x03, 3 + decoderConfig.length, 0, 1, 0, ...decoderConfig]);
}

function ebml(id: number[], ...content: number[][]): number[] {
	const body = content.flat();
	return [...id, 0x40 | (body.length >> 8), body.length & 0xFF, ...body];
}

/**
 * A WebM file with tracks of the given track types and codec IDs, in a segment of unknown size as
 * written by live recordings.
 */
export function webm(...tracks: [type: number, codecId: string][]): number[] {
	return [
		...ebml([0x1A, 0x45, 0xDF, 0xA3], ebml([0x42, 0x82], text('webm'))),
		0x18, 0x53, 0x80, 0x67, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
		...ebml([0x15, 0x49, 0xA9, 0x66], ebml([0x2A, 0xD7, 0xB1], [0x0F, 0x42, 0x40])),
		...ebml([0x16, 0x54, 0xAE, 0x6B], ...tracks.map(([type, codecId], index) => ebml([0xAE], ebml([0xD7], [index + 1]), ebml([0x83], [type]), ebml([0x86], text(codecId))))),
		...ebml([0x1F, 0x43, 0xB6, 0x75], zeros(16)),
	];
}

export function oggBeginningOfStreamPage(packet: number[]): number[] {
	return [...text('OggS'), 0, 0x02, ...zeros(20), 1, packet.length, ...packet];
}

export function wav(format: number[]): number[] {
	// An odd sized chunk before the format checks that chunks are padded to an even size
	return [...text('RIFF'), ...zeros(4), ...text('WAVE'), ...text('LIST'), ...uint32LE(3), ...zeros(4), ...text('fmt '), ...uint32LE(format.length), ...format, ...text('data'), ...zeros(4)];
}
