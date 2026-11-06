/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { readMediaInfo } from '../../common/mediaCodecs.js';
import { box, mp4Track, mpeg4AudioEsds, oggBeginningOfStreamPage, text, uint16LE, uint32LE, wav, webm, zeros } from './mediaTestFiles.js';

class WholeFileReadCountingProvider extends InMemoryFileSystemProvider {
	wholeFileReads = 0;

	override async readFile(resource: URI): Promise<Uint8Array> {
		this.wholeFileReads++;
		return super.readFile(resource);
	}
}

suite('Media Preview - readMediaInfo', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reads the container and track codecs', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		const rangeProvider = store.add(new WholeFileReadCountingProvider());
		store.add(fileService.registerProvider(Schemas.file, rangeProvider));
		// A provider that can only read whole files rather than ranges
		const wholeFileProvider = store.add(new WholeFileReadCountingProvider());
		store.add(fileService.registerProvider('whole-file', wholeFileProvider));

		// The media data precedes the track descriptions, which therefore start beyond the first
		// chunk and end before the end of the second one
		const aacVideo = [
			...box('ftyp', text('isom'), zeros(4)),
			...box('mdat', zeros(100_000)),
			...box('moov',
				box('mvhd', zeros(100)),
				mp4Track('vide', box('avc1', zeros(78))),
				mp4Track('soun', box('mp4a', zeros(28), mpeg4AudioEsds()))),
		];
		const files: Record<string, number[]> = {
			'/aac.mp4': aacVideo,
			'/ac3.mp4': [...box('ftyp', text('isom'), zeros(4)), ...box('moov', mp4Track('soun', box('ac-3', zeros(28))))],
			// MPEG-4 Audio that isn't AAC: lossless ALS, whose object type 36 is escaped
			'/als.mp4': [...box('ftyp', text('isom'), zeros(4)), ...box('moov', mp4Track('soun', box('mp4a', zeros(28), mpeg4AudioEsds([0xF8, 0x80]))))],
			'/silent.mp4': [...box('ftyp', text('isom'), zeros(4)), ...box('moov', mp4Track('vide', box('avc1', zeros(78))))],
			// The codec ID of a subtitle track that matches a video codec is ignored
			'/vp9.webm': webm([1, 'V_VP9'], [2, 'A_OPUS'], [2, 'A_AAC/MPEG4/LC'], [17, 'V_VP8']),
			'/speex.ogg': [...oggBeginningOfStreamPage([...text('Speex   '), ...zeros(72)]), ...text('OggS'), ...zeros(23)],
			'/adpcm.wav': wav([...uint16LE(0x0011), ...uint16LE(1), ...uint32LE(8000), ...uint32LE(4055), ...uint16LE(256), ...uint16LE(4), ...uint16LE(2), ...uint16LE(505)]),
			// The extensible format with an IEEE float sub format, which browsers decode
			'/float.wav': wav([...uint16LE(0xFFFE), ...uint16LE(2), ...uint32LE(48000), ...uint32LE(384000), ...uint16LE(8), ...uint16LE(32), ...uint16LE(22), ...uint16LE(32), ...uint32LE(3), ...uint16LE(0x0003), ...zeros(14)]),
			'/text.mp4': text('not a media file'),
		};

		for (const [path, content] of Object.entries(files)) {
			await fileService.writeFile(URI.file(path), VSBuffer.fromByteArray(content));
		}
		const wholeFileResource = URI.from({ scheme: 'whole-file', path: '/aac.mp4' });
		await fileService.writeFile(wholeFileResource, VSBuffer.fromByteArray(aacVideo));
		wholeFileProvider.setReadOnly(true);

		const result: Record<string, unknown> = {};
		for (const path of [...Object.keys(files), '/missing.mp4']) {
			result[path] = await readMediaInfo(fileService, URI.file(path));
		}
		result['whole file'] = await readMediaInfo(fileService, wholeFileResource);
		result['whole file over limit'] = await readMediaInfo(fileService, wholeFileResource, 1024);
		// Providers that can read ranges never read whole files, and others read them only once
		result['whole file reads'] = { rangeProvider: rangeProvider.wholeFileReads, wholeFileProvider: wholeFileProvider.wholeFileReads };

		const aac = { container: 'mp4', tracks: [{ kind: 'audio', codec: 'mp4a.40.2', name: 'AAC' }] };
		assert.deepStrictEqual(result, {
			'/aac.mp4': aac,
			'/ac3.mp4': { container: 'mp4', tracks: [{ kind: 'audio', codec: 'ac-3', name: 'AC-3' }] },
			'/als.mp4': { container: 'mp4', tracks: [{ kind: 'audio', codec: 'mp4a.40.36', name: undefined }] },
			'/silent.mp4': { container: 'mp4', tracks: [] },
			'/vp9.webm': {
				container: 'webm', tracks: [
					{ kind: 'video', codec: 'vp9', name: 'VP9' },
					{ kind: 'audio', codec: 'opus', name: 'Opus' },
					{ kind: 'audio', codec: 'mp4a.40.2', name: 'AAC' },
				]
			},
			'/speex.ogg': { container: 'ogg', tracks: [{ kind: 'audio', codec: 'speex', name: 'Speex' }] },
			'/adpcm.wav': { container: 'wav', tracks: [{ kind: 'audio', codec: '17', name: 'IMA ADPCM' }] },
			'/float.wav': { container: 'wav', tracks: [] },
			'/text.mp4': undefined,
			'/missing.mp4': undefined,
			'whole file': aac,
			'whole file over limit': undefined,
			'whole file reads': { rangeProvider: 0, wholeFileProvider: 1 },
		});
	});
});
