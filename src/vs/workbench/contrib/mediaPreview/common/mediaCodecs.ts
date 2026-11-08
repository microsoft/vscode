/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readUInt16LE, streamToBuffer, VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { FileSystemProviderCapabilities, IFileService } from '../../../../platform/files/common/files.js';

/**
 * Container formats whose tracks can be read.
 */
export type MediaContainer = 'mp4' | 'webm' | 'ogg' | 'wav';

/**
 * A track of a media file.
 */
export interface IMediaTrack {
	readonly kind: 'audio' | 'video';

	/**
	 * Codec as used in the `codecs` parameter of a MIME type, for example `mp4a.40.2`.
	 */
	readonly codec: string;

	/**
	 * Display name of the codec, for example `AAC`. Undefined if the codec has no well-known name.
	 */
	readonly name: string | undefined;
}

/**
 * Container and tracks of a media file.
 */
export interface IMediaInfo {
	readonly container: MediaContainer;

	/**
	 * Tracks whose codec browsers can be asked about with `canPlayType` or
	 * `MediaSource.isTypeSupported`. Video tracks are only read from WebM files, since playing them
	 * through Media Source Extensions requires the codecs of all tracks.
	 */
	readonly tracks: readonly IMediaTrack[];
}

const chunkSize = 64 * 1024;
// Bounds the bytes read to find the codecs
const maxChunks = 32;
const defaultMaxWholeFileSize = 64 * 1024 * 1024;
// Bounds the number of structures visited on each level of a file
const maxEntries = 64;

/**
 * Reads the container and the codecs of the tracks of an MP4, WebM, Ogg or WAV file. Browsers
 * silently drop audio tracks they can't decode and don't expose the codecs of a file, so this is
 * needed to tell a video whose audio can't be played from one without audio.
 *
 * File systems that can't read part of a file are read completely, if the file is no larger than
 * `maxWholeFileSize`. Returns undefined if the file can't be read or isn't a supported container.
 */
export async function readMediaInfo(fileService: IFileService, resource: URI, maxWholeFileSize = defaultMaxWholeFileSize): Promise<IMediaInfo | undefined> {
	try {
		const reader = await createReader(fileService, resource, maxWholeFileSize);
		if (!reader) {
			return undefined;
		}

		const header = await reader.read(0, 12);
		if (header.byteLength < 12) {
			return undefined;
		}
		if (isoBaseMediaBoxTypes.has(ascii(header, 4, 8))) {
			return { container: 'mp4', tracks: await readMp4Tracks(reader) };
		}
		if (header.readUInt32BE(0) === ebmlHeaderId) {
			return { container: 'webm', tracks: await readWebmTracks(reader) };
		}
		if (ascii(header, 0, 4) === 'OggS') {
			return { container: 'ogg', tracks: await readOggTracks(reader) };
		}
		if (ascii(header, 0, 4) === 'RIFF' && ascii(header, 8, 12) === 'WAVE') {
			return { container: 'wav', tracks: await readWavTracks(reader) };
		}
		return undefined;
	} catch {
		return undefined;
	}
}

async function createReader(fileService: IFileService, resource: URI, maxWholeFileSize: number): Promise<ChunkedReader | undefined> {
	const { size } = await fileService.stat(resource);

	// `readFile` reads whole files whenever the provider can, so read ranges as streams
	if (fileService.hasCapability(resource, FileSystemProviderCapabilities.FileReadStream) || fileService.hasCapability(resource, FileSystemProviderCapabilities.FileOpenReadWriteClose)) {
		return new ChunkedReader(size, async (position, length) => streamToBuffer((await fileService.readFileStream(resource, { position, length })).value));
	}

	// Without streams, the file service reads the whole file to serve a range, so read it only once
	if (size > maxWholeFileSize) {
		return undefined;
	}
	let content: Promise<VSBuffer> | undefined;
	return new ChunkedReader(size, async (position, length) => {
		content ??= fileService.readFile(resource).then(file => file.value);
		return (await content).slice(position, position + length);
	});
}

/**
 * Reads a file in cached chunks, so that parsing many small structures doesn't read the same part
 * of the file repeatedly.
 */
class ChunkedReader {

	private readonly _chunks = new Map<number, Promise<VSBuffer>>();

	/**
	 * @param _readRange Reads a range of the file. Ranges never extend past the end of the file,
	 * since streamed reads that end before their length can lose bytes.
	 */
	constructor(
		private readonly _size: number,
		private readonly _readRange: (position: number, length: number) => Promise<VSBuffer>,
	) { }

	/**
	 * Reads `length` bytes, or fewer at the end of the file.
	 */
	async read(position: number, length: number): Promise<VSBuffer> {
		const parts: VSBuffer[] = [];
		const end = Math.min(position + length, this._size);
		for (let offset = position; offset < end;) {
			const index = Math.floor(offset / chunkSize);
			const chunk = await this._getChunk(index);
			const part = chunk.slice(offset - index * chunkSize, end - index * chunkSize);
			// The file may have become shorter since its size was read
			if (!part.byteLength) {
				break;
			}
			parts.push(part);
			offset += part.byteLength;
		}
		return VSBuffer.concat(parts);
	}

	private _getChunk(index: number): Promise<VSBuffer> {
		let chunk = this._chunks.get(index);
		if (!chunk) {
			if (this._chunks.size >= maxChunks) {
				throw new Error('Codecs not found within the read limit');
			}
			const start = index * chunkSize;
			chunk = this._readRange(start, Math.min(chunkSize, this._size - start));
			this._chunks.set(index, chunk);
		}
		return chunk;
	}
}

function ascii(buffer: VSBuffer, start: number, end: number): string {
	return String.fromCharCode(...buffer.buffer.subarray(start, end));
}

// --- MP4 (ISO base media file format)

const isoBaseMediaBoxTypes = new Set(['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide']);

interface IBox {
	readonly type: string;
	readonly contentStart: number;
	readonly end: number;
}

async function* readBoxes(reader: ChunkedReader, start: number, end: number): AsyncIterable<IBox> {
	let position = start;
	for (let i = 0; i < maxEntries && position + 8 <= end; i++) {
		const header = await reader.read(position, 16);
		if (header.byteLength < 8) {
			return;
		}

		let size = header.readUInt32BE(0);
		let contentStart = position + 8;
		if (size === 1) {
			if (header.byteLength < 16) {
				return;
			}
			size = header.readUInt32BE(8) * 2 ** 32 + header.readUInt32BE(12);
			contentStart += 8;
		} else if (size === 0) {
			// The box extends to the end of the file
			yield { type: ascii(header, 4, 8), contentStart, end };
			return;
		}
		if (position + size < contentStart) {
			return;
		}

		yield { type: ascii(header, 4, 8), contentStart, end: Math.min(position + size, end) };
		position += size;
	}
}

async function findBox(reader: ChunkedReader, start: number, end: number, ...path: string[]): Promise<IBox | undefined> {
	let box: IBox | undefined;
	for (const type of path) {
		const parent: IBox | undefined = box;
		box = undefined;
		for await (const child of readBoxes(reader, parent?.contentStart ?? start, parent?.end ?? end)) {
			if (child.type === type) {
				box = child;
				break;
			}
		}
		if (!box) {
			return undefined;
		}
	}
	return box;
}

const mp4AudioSampleEntries = new Map<string, { readonly codec: string; readonly name: string }>([
	['Opus', { codec: 'opus', name: 'Opus' }],
	['fLaC', { codec: 'flac', name: 'FLAC' }],
	['ac-3', { codec: 'ac-3', name: 'AC-3' }],
	['ec-3', { codec: 'ec-3', name: 'E-AC-3' }],
	['ac-4', { codec: 'ac-4', name: 'AC-4' }],
	['alac', { codec: 'alac', name: 'ALAC' }],
	['samr', { codec: 'samr', name: 'AMR' }],
	['sawb', { codec: 'sawb', name: 'AMR-WB' }],
	['dtsc', { codec: 'dtsc', name: 'DTS' }],
	['dtse', { codec: 'dtse', name: 'DTS' }],
	['dtsh', { codec: 'dtsh', name: 'DTS' }],
	['dtsl', { codec: 'dtsl', name: 'DTS' }],
	['dtsx', { codec: 'dtsx', name: 'DTS' }],
	['mha1', { codec: 'mha1', name: 'MPEG-H 3D Audio' }],
	['mhm1', { codec: 'mhm1', name: 'MPEG-H 3D Audio' }],
]);

// Names of the object types in an MPEG-4 elementary stream descriptor, other than MPEG-4 Audio
const mp4AudioObjectTypes = new Map<number, string>([
	[0x66, 'AAC'],
	[0x67, 'AAC'],
	[0x68, 'AAC'],
	[0x69, 'MP3'],
	[0x6B, 'MP3'],
	[0xA5, 'AC-3'],
	[0xA6, 'E-AC-3'],
	[0xA9, 'DTS'],
	[0xAA, 'DTS'],
	[0xAB, 'DTS'],
	[0xAC, 'DTS'],
]);

const mpeg4AudioObjectType = 0x40;

// Names of the audio object types of MPEG-4 Audio. Others, such as lossless ALS, are left unnamed.
const mpeg4AudioObjectTypes = new Map<number, string>([
	[1, 'AAC'], // Main
	[2, 'AAC'], // LC
	[3, 'AAC'], // SSR
	[4, 'AAC'], // LTP
	[5, 'AAC'], // HE-AAC
	[6, 'AAC'], // Scalable
	[17, 'AAC'], // ER LC
	[19, 'AAC'], // ER LTP
	[20, 'AAC'], // ER Scalable
	[23, 'AAC'], // ER LD
	[29, 'AAC'], // HE-AAC v2
	[32, 'MPEG Audio'], // Layer 1
	[33, 'MPEG Audio'], // Layer 2
	[34, 'MP3'],
	[39, 'AAC'], // ER ELD
]);

async function readMp4Tracks(reader: ChunkedReader): Promise<IMediaTrack[]> {
	const moov = await findBox(reader, 0, Infinity, 'moov');
	if (!moov) {
		return [];
	}

	const tracks: IMediaTrack[] = [];
	for await (const trak of readBoxes(reader, moov.contentStart, moov.end)) {
		if (trak.type !== 'trak') {
			continue;
		}

		const mdia = await findBox(reader, trak.contentStart, trak.end, 'mdia');
		const hdlr = mdia && await findBox(reader, mdia.contentStart, mdia.end, 'hdlr');
		// The handler type follows the version, flags and a reserved field
		if (!mdia || !hdlr || ascii(await reader.read(hdlr.contentStart + 8, 4), 0, 4) !== 'soun') {
			continue;
		}

		const stsd = await findBox(reader, mdia.contentStart, mdia.end, 'minf', 'stbl', 'stsd');
		if (!stsd) {
			continue;
		}
		// The sample entries follow the version, flags and entry count
		for await (const entry of readBoxes(reader, stsd.contentStart + 8, stsd.end)) {
			const track = await readMp4AudioSampleEntry(reader, entry);
			if (track) {
				tracks.push(track);
			}
			break;
		}
	}
	return tracks;
}

async function readMp4AudioSampleEntry(reader: ChunkedReader, entry: IBox): Promise<IMediaTrack | undefined> {
	const known = mp4AudioSampleEntries.get(entry.type);
	if (known) {
		return { kind: 'audio', ...known };
	}
	if (entry.type !== 'mp4a') {
		return undefined;
	}

	// The child boxes follow 28 bytes of audio sample entry fields. Versions 1 and 2 of the
	// QuickTime sound sample description add 16 and 36 bytes, while version 1 of the ISO audio
	// sample entry adds none.
	const fields = await reader.read(entry.contentStart, 28);
	if (fields.byteLength < 28) {
		return undefined;
	}
	const version = (fields.readUInt8(8) << 8) | fields.readUInt8(9);
	const extraFieldsSize = version === 1 ? 16 : version === 2 ? 36 : 0;
	let esds: IBox | undefined;
	for (const childrenStart of new Set([entry.contentStart + 28 + extraFieldsSize, entry.contentStart + 28])) {
		esds = await findBox(reader, childrenStart, entry.end, 'esds') ?? await findBox(reader, childrenStart, entry.end, 'wave', 'esds');
		if (esds) {
			break;
		}
	}
	if (!esds) {
		return undefined;
	}

	const descriptor = parseEsds(await reader.read(esds.contentStart, Math.min(esds.end - esds.contentStart, 256)));
	if (!descriptor) {
		return undefined;
	}
	if (descriptor.objectType === mpeg4AudioObjectType) {
		const { audioObjectType } = descriptor;
		return audioObjectType === undefined
			? { kind: 'audio', codec: 'mp4a.40', name: undefined }
			: { kind: 'audio', codec: `mp4a.40.${audioObjectType}`, name: mpeg4AudioObjectTypes.get(audioObjectType) };
	}
	const name = mp4AudioObjectTypes.get(descriptor.objectType);
	if (!name) {
		return undefined;
	}
	return { kind: 'audio', codec: `mp4a.${descriptor.objectType.toString(16).toUpperCase()}`, name };
}

/**
 * Parses the object type of an elementary stream descriptor box and, for MPEG-4 Audio, the audio
 * object type of its decoder specific info.
 */
function parseEsds(content: VSBuffer): { objectType: number; audioObjectType: number | undefined } | undefined {
	const bytes = content.buffer;
	// Skip the version and flags
	let offset = 4;
	const readDescriptor = (tag: number): number | undefined => {
		if (bytes[offset] !== tag) {
			return undefined;
		}
		offset++;
		let size = 0;
		for (let i = 0; i < 4 && offset < bytes.length; i++) {
			const byte = bytes[offset++];
			size = (size << 7) | (byte & 0x7F);
			if (!(byte & 0x80)) {
				break;
			}
		}
		return size;
	};

	// ES_Descriptor
	if (readDescriptor(0x03) === undefined) {
		return undefined;
	}
	const flags = bytes[offset + 2];
	offset += 3;
	if (flags & 0x80) {
		offset += 2;
	}
	if (flags & 0x40) {
		offset += 1 + bytes[offset];
	}
	if (flags & 0x20) {
		offset += 2;
	}

	// DecoderConfigDescriptor
	const decoderConfigSize = readDescriptor(0x04);
	if (decoderConfigSize === undefined || offset >= bytes.length) {
		return undefined;
	}
	const objectType = bytes[offset];
	offset += 13;

	// DecoderSpecificInfo, which starts with the AudioSpecificConfig for MPEG-4 Audio
	let audioObjectType: number | undefined;
	if (objectType === mpeg4AudioObjectType && readDescriptor(0x05) !== undefined && offset < bytes.length) {
		audioObjectType = bytes[offset] >> 3;
		if (audioObjectType === 31 && offset + 1 < bytes.length) {
			audioObjectType = 32 + (((bytes[offset] & 0x07) << 3) | (bytes[offset + 1] >> 5));
		}
	}
	return { objectType, audioObjectType };
}

// --- WebM (Matroska)

const ebmlHeaderId = 0x1A45DFA3;
const segmentId = 0x18538067;
const tracksId = 0x1654AE6B;
const clusterId = 0x1F43B675;
const trackEntryId = 0xAE;
const trackTypeId = 0x83;
const codecIdId = 0x86;
const videoTrackType = 1;
const audioTrackType = 2;

const webmCodecs = new Map<string, IMediaTrack>([
	['V_VP8', { kind: 'video', codec: 'vp8', name: 'VP8' }],
	['V_VP9', { kind: 'video', codec: 'vp9', name: 'VP9' }],
	// Media Source Extensions require a profile, level and bit depth for AV1, so assume the common
	// main profile, level 4.0 and 8 bits
	['V_AV1', { kind: 'video', codec: 'av01.0.08M.08', name: 'AV1' }],
	['A_OPUS', { kind: 'audio', codec: 'opus', name: 'Opus' }],
	['A_VORBIS', { kind: 'audio', codec: 'vorbis', name: 'Vorbis' }],
	['A_FLAC', { kind: 'audio', codec: 'flac', name: 'FLAC' }],
	['A_AAC', { kind: 'audio', codec: 'mp4a.40.2', name: 'AAC' }],
	['A_MPEG/L3', { kind: 'audio', codec: 'mp3', name: 'MP3' }],
	['A_AC3', { kind: 'audio', codec: 'ac-3', name: 'AC-3' }],
	['A_EAC3', { kind: 'audio', codec: 'ec-3', name: 'E-AC-3' }],
	['A_DTS', { kind: 'audio', codec: 'dtsc', name: 'DTS' }],
	['A_TRUEHD', { kind: 'audio', codec: 'mlpa', name: 'Dolby TrueHD' }],
	['A_ALAC', { kind: 'audio', codec: 'alac', name: 'ALAC' }],
]);

interface IEbmlElement {
	readonly id: number;
	readonly contentStart: number;
	readonly end: number;
}

/**
 * Reads a variable length integer. IDs keep their length marker, while sizes don't and use all ones
 * for an unknown size.
 */
function readVint(buffer: VSBuffer, offset: number, isId: boolean): { value: number; length: number } | undefined {
	if (offset >= buffer.byteLength) {
		return undefined;
	}
	const first = buffer.readUInt8(offset);
	let length = 1;
	let marker = 0x80;
	while (marker && !(first & marker)) {
		marker >>= 1;
		length++;
	}
	if (!marker || offset + length > buffer.byteLength) {
		return undefined;
	}

	let value = isId ? first : first & (marker - 1);
	let isAllOnes = value === marker - 1;
	for (let i = 1; i < length; i++) {
		const byte = buffer.readUInt8(offset + i);
		value = value * 256 + byte;
		isAllOnes &&= byte === 0xFF;
	}
	return { value: !isId && isAllOnes ? Infinity : value, length };
}

async function* readEbmlElements(reader: ChunkedReader, start: number, end: number): AsyncIterable<IEbmlElement> {
	let position = start;
	for (let i = 0; i < maxEntries && position < end; i++) {
		const header = await reader.read(position, 12);
		const id = readVint(header, 0, true);
		const size = id && readVint(header, id.length, false);
		if (!id || !size) {
			return;
		}

		const contentStart = position + id.length + size.length;
		const elementEnd = Math.min(contentStart + size.value, end);
		yield { id: id.value, contentStart, end: elementEnd };
		position = elementEnd;
	}
}

async function readWebmTracks(reader: ChunkedReader): Promise<IMediaTrack[]> {
	let segment: IEbmlElement | undefined;
	for await (const element of readEbmlElements(reader, 0, Infinity)) {
		if (element.id === segmentId) {
			segment = element;
			break;
		}
	}
	if (!segment) {
		return [];
	}

	let tracksElement: IEbmlElement | undefined;
	for await (const element of readEbmlElements(reader, segment.contentStart, segment.end)) {
		if (element.id === tracksId) {
			tracksElement = element;
			break;
		}
		// The tracks are described before the first cluster of media data
		if (element.id === clusterId) {
			break;
		}
	}
	if (!tracksElement) {
		return [];
	}

	const tracks: IMediaTrack[] = [];
	for await (const trackEntry of readEbmlElements(reader, tracksElement.contentStart, tracksElement.end)) {
		if (trackEntry.id !== trackEntryId) {
			continue;
		}

		let trackType: number | undefined;
		let codecId: string | undefined;
		for await (const element of readEbmlElements(reader, trackEntry.contentStart, trackEntry.end)) {
			if (element.id === trackTypeId) {
				const value = await reader.read(element.contentStart, Math.min(element.end - element.contentStart, 8));
				trackType = value.buffer.reduce((result, byte) => result * 256 + byte, 0);
			} else if (element.id === codecIdId) {
				const value = await reader.read(element.contentStart, Math.min(element.end - element.contentStart, 64));
				codecId = ascii(value, 0, value.byteLength).replace(/\0+$/, '');
			}
		}

		// Codec IDs such as `A_AAC/MPEG4/LC` describe the profile after the codec
		const track = codecId ? webmCodecs.get(codecId.startsWith('A_AAC/') ? 'A_AAC' : codecId) : undefined;
		const kind = trackType === videoTrackType ? 'video' : trackType === audioTrackType ? 'audio' : undefined;
		if (track && track.kind === kind) {
			tracks.push(track);
		}
	}
	return tracks;
}

// --- Ogg

const oggBeginningOfStream = 0x02;

async function readOggTracks(reader: ChunkedReader): Promise<IMediaTrack[]> {
	const tracks: IMediaTrack[] = [];
	let position = 0;
	// Each logical stream starts with a page that identifies its codec, and these pages precede all others
	for (let i = 0; i < maxEntries; i++) {
		const header = await reader.read(position, 27);
		if (header.byteLength < 27 || ascii(header, 0, 4) !== 'OggS' || !(header.readUInt8(5) & oggBeginningOfStream)) {
			break;
		}

		const segmentCount = header.readUInt8(26);
		const segments = await reader.read(position + 27, segmentCount);
		const dataStart = position + 27 + segmentCount;
		const codec = getOggCodec(await reader.read(dataStart, 8));
		if (codec) {
			tracks.push({ kind: 'audio', ...codec });
		}
		position = dataStart + segments.buffer.reduce((total, size) => total + size, 0);
	}
	return tracks;
}

function getOggCodec(packet: VSBuffer): { codec: string; name: string } | undefined {
	const signature = ascii(packet, 0, 8);
	if (signature === 'OpusHead') {
		return { codec: 'opus', name: 'Opus' };
	}
	if (signature.startsWith('\x01vorbis')) {
		return { codec: 'vorbis', name: 'Vorbis' };
	}
	if (signature.startsWith('\x7FFLAC')) {
		return { codec: 'flac', name: 'FLAC' };
	}
	if (signature === 'Speex   ') {
		return { codec: 'speex', name: 'Speex' };
	}
	return undefined;
}

// --- WAV

const wavExtensibleFormat = 0xFFFE;

// Browsers decode these formats although `canPlayType` only recognizes PCM in WAV files
const decodableWavFormats = new Set([
	0x0001, // PCM
	0x0003, // IEEE float
	0x0006, // A-law
	0x0007, // mu-law
	0x0055, // MP3
]);

const wavFormatNames = new Map<number, string>([
	[0x0002, 'Microsoft ADPCM'],
	[0x0011, 'IMA ADPCM'],
	[0x0031, 'GSM 6.10'],
	[0x0050, 'MPEG Audio'],
	[0x00FF, 'AAC'],
	[0x0160, 'Windows Media Audio'],
	[0x0161, 'Windows Media Audio'],
	[0x0162, 'Windows Media Audio'],
	[0x0163, 'Windows Media Audio'],
	[0x1610, 'AAC'],
	[0x2000, 'AC-3'],
	[0x2001, 'DTS'],
]);

async function readWavTracks(reader: ChunkedReader): Promise<IMediaTrack[]> {
	// Chunks follow the RIFF header and are padded to an even size
	let position = 12;
	for (let i = 0; i < maxEntries; i++) {
		const header = await reader.read(position, 8);
		if (header.byteLength < 8) {
			return [];
		}

		const size = header.readUInt32LE(4);
		if (ascii(header, 0, 4) === 'fmt ') {
			const format = await reader.read(position + 8, Math.min(size, 26));
			if (format.byteLength < 2) {
				return [];
			}
			let formatTag = readUInt16LE(format.buffer, 0);
			// The extensible format stores the actual format at the start of its sub format GUID
			if (formatTag === wavExtensibleFormat && format.byteLength >= 26) {
				formatTag = readUInt16LE(format.buffer, 24);
			}
			if (decodableWavFormats.has(formatTag)) {
				return [];
			}
			return [{ kind: 'audio', codec: String(formatTag), name: wavFormatNames.get(formatTag) }];
		}
		position += 8 + size + (size % 2);
	}
	return [];
}
