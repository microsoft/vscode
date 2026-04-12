/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as fs from 'fs';
import * as encoding from '../../../common/encoding.js';
import * as streams from '../../../../../../base/common/stream.js';
import { newWriteableBufferStream, VSBuffer, streamToBufferReadableStream } from '../../../../../../base/common/buffer.js';
import { splitLines } from '../../../../../../base/common/strings.js';
import { FileAccess } from '../../../../../../base/common/network.js';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
export async function detectEncodingByBOM(file) {
    try {
        const { buffer, bytesRead } = await readExactlyByFile(file, 3);
        return encoding.detectEncodingByBOMFromBuffer(buffer, bytesRead);
    }
    catch (error) {
        return null; // ignore errors (like file not found)
    }
}
function readExactlyByFile(file, totalBytes) {
    return new Promise((resolve, reject) => {
        fs.open(file, 'r', null, (err, fd) => {
            if (err) {
                return reject(err);
            }
            function end(err, resultBuffer, bytesRead) {
                fs.close(fd, closeError => {
                    if (closeError) {
                        return reject(closeError);
                    }
                    // eslint-disable-next-line local/code-no-any-casts
                    if (err && err.code === 'EISDIR') {
                        return reject(err); // we want to bubble this error up (file is actually a folder)
                    }
                    return resolve({ buffer: resultBuffer ? VSBuffer.wrap(resultBuffer) : null, bytesRead });
                });
            }
            const buffer = Buffer.allocUnsafe(totalBytes);
            let offset = 0;
            function readChunk() {
                fs.read(fd, buffer, offset, totalBytes - offset, null, (err, bytesRead) => {
                    if (err) {
                        return end(err, null, 0);
                    }
                    if (bytesRead === 0) {
                        return end(null, buffer, offset);
                    }
                    offset += bytesRead;
                    if (offset === totalBytes) {
                        return end(null, buffer, offset);
                    }
                    return readChunk();
                });
            }
            readChunk();
        });
    });
}
suite('Encoding', () => {
    test('detectBOM does not return error for non existing file', async () => {
        const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/not-exist.css').fsPath;
        const detectedEncoding = await detectEncodingByBOM(file);
        assert.strictEqual(detectedEncoding, null);
    });
    test('detectBOM UTF-8', async () => {
        const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some_utf8.css').fsPath;
        const detectedEncoding = await detectEncodingByBOM(file);
        assert.strictEqual(detectedEncoding, 'utf8bom');
    });
    test('detectBOM UTF-16 LE', async () => {
        const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some_utf16le.css').fsPath;
        const detectedEncoding = await detectEncodingByBOM(file);
        assert.strictEqual(detectedEncoding, 'utf16le');
    });
    test('detectBOM UTF-16 BE', async () => {
        const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some_utf16be.css').fsPath;
        const detectedEncoding = await detectEncodingByBOM(file);
        assert.strictEqual(detectedEncoding, 'utf16be');
    });
    test('detectBOM ANSI', async function () {
        const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some_ansi.css').fsPath;
        const detectedEncoding = await detectEncodingByBOM(file);
        assert.strictEqual(detectedEncoding, null);
    });
    test('detectBOM ANSI (2)', async function () {
        const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/empty.txt').fsPath;
        const detectedEncoding = await detectEncodingByBOM(file);
        assert.strictEqual(detectedEncoding, null);
    });
    test('detectEncodingFromBuffer (JSON saved as PNG)', async function () {
        const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some.json.png').fsPath;
        const buffer = await readExactlyByFile(file, 512);
        const mimes = encoding.detectEncodingFromBuffer(buffer);
        assert.strictEqual(mimes.seemsBinary, false);
    });
    test('detectEncodingFromBuffer (PNG saved as TXT)', async function () {
        const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some.png.txt').fsPath;
        const buffer = await readExactlyByFile(file, 512);
        const mimes = encoding.detectEncodingFromBuffer(buffer);
        assert.strictEqual(mimes.seemsBinary, true);
    });
    test('detectEncodingFromBuffer (XML saved as PNG)', async function () {
        const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some.xml.png').fsPath;
        const buffer = await readExactlyByFile(file, 512);
        const mimes = encoding.detectEncodingFromBuffer(buffer);
        assert.strictEqual(mimes.seemsBinary, false);
    });
    test('detectEncodingFromBuffer (QWOFF saved as TXT)', async function () {
        const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some.qwoff.txt').fsPath;
        const buffer = await readExactlyByFile(file, 512);
        const mimes = encoding.detectEncodingFromBuffer(buffer);
        assert.strictEqual(mimes.seemsBinary, true);
    });
    test('detectEncodingFromBuffer (CSS saved as QWOFF)', async function () {
        const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some.css.qwoff').fsPath;
        const buffer = await readExactlyByFile(file, 512);
        const mimes = encoding.detectEncodingFromBuffer(buffer);
        assert.strictEqual(mimes.seemsBinary, false);
    });
    test('detectEncodingFromBuffer (PDF)', async function () {
        const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some.pdf').fsPath;
        const buffer = await readExactlyByFile(file, 512);
        const mimes = encoding.detectEncodingFromBuffer(buffer);
        assert.strictEqual(mimes.seemsBinary, true);
    });
    test('detectEncodingFromBuffer (guess UTF-16 LE from content without BOM)', async function () {
        const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/utf16_le_nobom.txt').fsPath;
        const buffer = await readExactlyByFile(file, 512);
        const mimes = encoding.detectEncodingFromBuffer(buffer);
        assert.strictEqual(mimes.encoding, encoding.UTF16le);
        assert.strictEqual(mimes.seemsBinary, false);
    });
    test('detectEncodingFromBuffer (guess UTF-16 BE from content without BOM)', async function () {
        const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/utf16_be_nobom.txt').fsPath;
        const buffer = await readExactlyByFile(file, 512);
        const mimes = encoding.detectEncodingFromBuffer(buffer);
        assert.strictEqual(mimes.encoding, encoding.UTF16be);
        assert.strictEqual(mimes.seemsBinary, false);
    });
    test('autoGuessEncoding (UTF8)', async function () {
        const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some_file.css').fsPath;
        const buffer = await readExactlyByFile(file, 512 * 8);
        const mimes = await encoding.detectEncodingFromBuffer(buffer, true);
        assert.strictEqual(mimes.encoding, 'utf8');
    });
    test('autoGuessEncoding (ASCII)', async function () {
        const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some_ansi.css').fsPath;
        const buffer = await readExactlyByFile(file, 512 * 8);
        const mimes = await encoding.detectEncodingFromBuffer(buffer, true);
        assert.strictEqual(mimes.encoding, null);
    });
    test('autoGuessEncoding (ShiftJIS)', async function () {
        const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some.shiftjis.txt').fsPath;
        const buffer = await readExactlyByFile(file, 512 * 8);
        const mimes = await encoding.detectEncodingFromBuffer(buffer, true);
        assert.strictEqual(mimes.encoding, 'shiftjis');
    });
    test('autoGuessEncoding (CP1252)', async function () {
        const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some.cp1252.txt').fsPath;
        const buffer = await readExactlyByFile(file, 512 * 8);
        const mimes = await encoding.detectEncodingFromBuffer(buffer, true);
        assert.strictEqual(mimes.encoding, 'windows1252');
    });
    test('autoGuessEncoding (candidateGuessEncodings - ShiftJIS)', async function () {
        // This file is determined to be windows1252 unless candidateDetectEncoding is set.
        const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some.shiftjis.1.txt').fsPath;
        const buffer = await readExactlyByFile(file, 512 * 8);
        const mimes = await encoding.detectEncodingFromBuffer(buffer, true, ['utf8', 'shiftjis', 'eucjp']);
        assert.strictEqual(mimes.encoding, 'shiftjis');
    });
    async function readAndDecodeFromDisk(path, fileEncoding) {
        return new Promise((resolve, reject) => {
            fs.readFile(path, (err, data) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(importAMDNodeModule('@vscode/iconv-lite-umd', 'lib/iconv-lite-umd.js').then(iconv => iconv.decode(data, encoding.toNodeEncoding(fileEncoding))));
                }
            });
        });
    }
    function newTestReadableStream(buffers) {
        const stream = newWriteableBufferStream();
        buffers
            .map(VSBuffer.wrap)
            .forEach(buffer => {
            setTimeout(() => {
                stream.write(buffer);
            });
        });
        setTimeout(() => {
            stream.end();
        });
        return stream;
    }
    async function readAllAsString(stream) {
        return streams.consumeStream(stream, strings => strings.join(''));
    }
    test('toDecodeStream - some stream', async function () {
        const source = newTestReadableStream([
            Buffer.from([65, 66, 67]),
            Buffer.from([65, 66, 67]),
            Buffer.from([65, 66, 67]),
        ]);
        const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 4, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected) => detected || encoding.UTF8 });
        assert.ok(detected);
        assert.ok(stream);
        const content = await readAllAsString(stream);
        assert.strictEqual(content, 'ABCABCABC');
    });
    test('toDecodeStream - some stream, expect too much data', async function () {
        const source = newTestReadableStream([
            Buffer.from([65, 66, 67]),
            Buffer.from([65, 66, 67]),
            Buffer.from([65, 66, 67]),
        ]);
        const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 64, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected) => detected || encoding.UTF8 });
        assert.ok(detected);
        assert.ok(stream);
        const content = await readAllAsString(stream);
        assert.strictEqual(content, 'ABCABCABC');
    });
    test('toDecodeStream - some stream, no data', async function () {
        const source = newWriteableBufferStream();
        source.end();
        const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 512, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected) => detected || encoding.UTF8 });
        assert.ok(detected);
        assert.ok(stream);
        const content = await readAllAsString(stream);
        assert.strictEqual(content, '');
    });
    test('toDecodeStream - encoding, utf16be', async function () {
        const path = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some_utf16be.css').fsPath;
        const source = streamToBufferReadableStream(fs.createReadStream(path));
        const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 64, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected) => detected || encoding.UTF8 });
        assert.strictEqual(detected.encoding, 'utf16be');
        assert.strictEqual(detected.seemsBinary, false);
        const expected = await readAndDecodeFromDisk(path, detected.encoding);
        const actual = await readAllAsString(stream);
        assert.strictEqual(actual, expected);
    });
    test('toDecodeStream - empty file', async function () {
        const path = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/empty.txt').fsPath;
        const source = streamToBufferReadableStream(fs.createReadStream(path));
        const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected) => detected || encoding.UTF8 });
        const expected = await readAndDecodeFromDisk(path, detected.encoding);
        const actual = await readAllAsString(stream);
        assert.strictEqual(actual, expected);
    });
    test('toDecodeStream - decodes buffer entirely', async function () {
        const emojis = Buffer.from('🖥️💻💾');
        const incompleteEmojis = emojis.slice(0, emojis.length - 1);
        const buffers = [];
        for (let i = 0; i < incompleteEmojis.length; i++) {
            buffers.push(incompleteEmojis.slice(i, i + 1));
        }
        const source = newTestReadableStream(buffers);
        const { stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 4, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected) => detected || encoding.UTF8 });
        const expected = new TextDecoder().decode(incompleteEmojis);
        const actual = await readAllAsString(stream);
        assert.strictEqual(actual, expected);
    });
    test('toDecodeStream - some stream (GBK issue #101856)', async function () {
        const path = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some_gbk.txt').fsPath;
        const source = streamToBufferReadableStream(fs.createReadStream(path));
        const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 4, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async () => 'gbk' });
        assert.ok(detected);
        assert.ok(stream);
        const content = await readAllAsString(stream);
        assert.strictEqual(content.length, 65537);
    });
    test('toDecodeStream - some stream (UTF-8 issue #102202)', async function () {
        const path = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/issue_102202.txt').fsPath;
        const source = streamToBufferReadableStream(fs.createReadStream(path));
        const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 4, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async () => 'utf-8' });
        assert.ok(detected);
        assert.ok(stream);
        const content = await readAllAsString(stream);
        const lines = splitLines(content);
        assert.strictEqual(lines[981].toString(), '啊啊啊啊啊啊aaa啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊，啊啊啊啊啊啊啊啊啊啊啊。');
    });
    test('toDecodeStream - binary', async function () {
        const source = () => {
            return newTestReadableStream([
                Buffer.from([0, 0, 0]),
                Buffer.from('Hello World'),
                Buffer.from([0])
            ]);
        };
        // acceptTextOnly: true
        let error = undefined;
        try {
            await encoding.toDecodeStream(source(), { acceptTextOnly: true, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected) => detected || encoding.UTF8 });
        }
        catch (e) {
            error = e;
        }
        assert.ok(error instanceof encoding.DecodeStreamError);
        assert.strictEqual(error.decodeStreamErrorKind, 1 /* encoding.DecodeStreamErrorKind.STREAM_IS_BINARY */);
        // acceptTextOnly: false
        const { detected, stream } = await encoding.toDecodeStream(source(), { acceptTextOnly: false, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async (detected) => detected || encoding.UTF8 });
        assert.ok(detected);
        assert.strictEqual(detected.seemsBinary, true);
        assert.ok(stream);
    });
    test('toEncodeReadable - encoding, utf16be', async function () {
        const path = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some_utf16be.css').fsPath;
        const source = await readAndDecodeFromDisk(path, encoding.UTF16be);
        const iconv = await importAMDNodeModule('@vscode/iconv-lite-umd', 'lib/iconv-lite-umd.js');
        const expected = VSBuffer.wrap(iconv.encode(source, encoding.toNodeEncoding(encoding.UTF16be))).toString();
        const actual = streams.consumeReadable(await encoding.toEncodeReadable(streams.toReadable(source), encoding.UTF16be), VSBuffer.concat).toString();
        assert.strictEqual(actual, expected);
    });
    test('toEncodeReadable - empty readable to utf8', async function () {
        const source = {
            read() {
                return null;
            }
        };
        const actual = streams.consumeReadable(await encoding.toEncodeReadable(source, encoding.UTF8), VSBuffer.concat).toString();
        assert.strictEqual(actual, '');
    });
    [{
            utfEncoding: encoding.UTF8,
            relatedBom: encoding.UTF8_BOM
        }, {
            utfEncoding: encoding.UTF8_with_bom,
            relatedBom: encoding.UTF8_BOM
        }, {
            utfEncoding: encoding.UTF16be,
            relatedBom: encoding.UTF16be_BOM,
        }, {
            utfEncoding: encoding.UTF16le,
            relatedBom: encoding.UTF16le_BOM
        }].forEach(({ utfEncoding, relatedBom }) => {
        test(`toEncodeReadable - empty readable to ${utfEncoding} with BOM`, async function () {
            const source = {
                read() {
                    return null;
                }
            };
            const encodedReadable = encoding.toEncodeReadable(source, utfEncoding, { addBOM: true });
            const expected = VSBuffer.wrap(Buffer.from(relatedBom)).toString();
            const actual = streams.consumeReadable(await encodedReadable, VSBuffer.concat).toString();
            assert.strictEqual(actual, expected);
        });
    });
    test('encodingExists', async function () {
        for (const enc in encoding.SUPPORTED_ENCODINGS) {
            if (enc === encoding.UTF8_with_bom) {
                continue; // skip over encodings from us
            }
            const iconv = await importAMDNodeModule('@vscode/iconv-lite-umd', 'lib/iconv-lite-umd.js');
            assert.strictEqual(iconv.encodingExists(enc), true, enc);
        }
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5jb2RpbmcudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS90ZXN0L25vZGUvZW5jb2RpbmcvZW5jb2RpbmcudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDekIsT0FBTyxLQUFLLFFBQVEsTUFBTSw2QkFBNkIsQ0FBQztBQUN4RCxPQUFPLEtBQUssT0FBTyxNQUFNLHlDQUF5QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxRQUFRLEVBQTBCLDRCQUE0QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbkosT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNoRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUV0RyxNQUFNLENBQUMsS0FBSyxVQUFVLG1CQUFtQixDQUFDLElBQVk7SUFDckQsSUFBSSxDQUFDO1FBQ0osTUFBTSxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxNQUFNLGlCQUFpQixDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUUvRCxPQUFPLFFBQVEsQ0FBQyw2QkFBNkIsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDbEUsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDaEIsT0FBTyxJQUFJLENBQUMsQ0FBQyxzQ0FBc0M7SUFDcEQsQ0FBQztBQUNGLENBQUM7QUFPRCxTQUFTLGlC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QUMsQ0FBQztRQUNsRCxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsd0JBQXdCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDeEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzlDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLCtDQUErQyxFQUFFLEtBQUs7UUFDMUQsTUFBTSxJQUFJLEdBQUcsVUFBVSxDQUFDLFNBQVMsQ0FBQywyRUFBMkUsQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUN0SCxNQUFNLE1BQU0sR0FBRyxNQUFNLGlCQUFpQixDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNsRCxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsd0JBQXdCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDeEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzdDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLCtDQUErQyxFQUFFLEtBQUs7UUFDMUQsTUFBTSxJQUFJLEdBQUcsVUFBVSxDQUFDLFNBQVMsQ0FBQywyRUFBMkUsQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUN0SCxNQUFNLE1BQU0sR0FBRyxNQUFNLGlCQUFpQixDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNsRCxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsd0JBQXdCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDeEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzlDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGdDQUFnQyxFQUFFLEtBQUs7UUFDM0MsTUFBTSxJQUFJLEdBQUcsVUFBVSxDQUFDLFNBQVMsQ0FBQyxxRUFBcUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUNoSCxNQUFNLE1BQU0sR0FBRyxNQUFNLGlCQUFpQixDQUFDLElBQUksRUFB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