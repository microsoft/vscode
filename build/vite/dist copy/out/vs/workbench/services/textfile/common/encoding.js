/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { newWriteableStream, listenStream } from '../../../../base/common/stream.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { importAMDNodeModule } from '../../../../amdX.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { coalesce } from '../../../../base/common/arrays.js';
export const UTF8 = 'utf8';
export const UTF8_with_bom = 'utf8bom';
export const UTF16be = 'utf16be';
export const UTF16le = 'utf16le';
export function isUTFEncoding(encoding) {
    return [UTF8, UTF8_with_bom, UTF16be, UTF16le].some(utfEncoding => utfEncoding === encoding);
}
export const UTF16be_BOM = [0xFE, 0xFF];
export const UTF16le_BOM = [0xFF, 0xFE];
export const UTF8_BOM = [0xEF, 0xBB, 0xBF];
const ZERO_BYTE_DETECTION_BUFFER_MAX_LEN = 512; // number of bytes to look at to decide about a file being binary or not
const NO_ENCODING_GUESS_MIN_BYTES = 512; // when not auto guessing the encoding, small number of bytes are enough
const AUTO_ENCODING_GUESS_MIN_BYTES = 512 * 8; // with auto guessing we want a lot more content to be read for guessing
const AUTO_ENCODING_GUESS_MAX_BYTES = 512 * 128; // set an upper limit for the number of bytes we pass on to jschardet
export var DecodeStreamErrorKind;
(function (DecodeStreamErrorKind) {
    /**
     * Error indicating that the stream is binary even
     * though `acceptTextOnly` was specified.
     */
    DecodeStreamErrorKind[DecodeStreamErrorKind["STREAM_IS_BINARY"] = 1] = "STREAM_IS_BINARY";
})(DecodeStreamErrorKind || (DecodeStreamErrorKind = {}));
export class DecodeStreamError extends Error {
    constructor(message, decodeStreamErrorKind) {
        super(message);
        this.decodeStreamErrorKind = decodeStreamErrorKind;
    }
}
class DecoderStream {
    /**
     * This stream will only load iconv-lite lazily if the encoding
     * is not UTF-8. This ensures that for most common cases we do
     * not pay the price of loading the module from disk.
     *
     * We still need to be careful when converting UTF-8 to a string
     * though because we read the file in chunks of Buffer and thus
     * need to decode it via TextDecoder helper that is available
     * in browser and node.js environments.
     */
    static async create(encoding) {
        let decoder = undefined;
        if (encoding !== UTF8) {
            const iconv = await importAMDNodeModule('@vscode/iconv-lite-umd', 'lib/iconv-lite-umd.js');
            decoder = iconv.getDecoder(toNodeEncoding(encoding));
        }
        else {
            const utf8TextDecoder = new TextDecoder();
            decoder = {
                write(buffer) {
                    return utf8TextDecoder.decode(buffer, {
                        // Signal to TextDecoder that potentially more data is coming
                        // and that we are calling `decode` in the end to consume any
                        // remainders
                        stream: true
                    });
                },
                end() {
                    return utf8TextDecoder.decode();
                }
            };
        }
        return new DecoderStream(decoder);
    }
    constructor(iconvLiteDecoder) {
        this.iconvLiteDecoder = iconvLiteDecoder;
    }
    write(buffer) {
        return this.iconvLiteDecoder.write(buffer);
    }
    end() {
        return this.iconvLiteDecoder.end();
    }
}
export function toDecodeStream(source, options) {
    const minBytesRequiredForDetection = options.minBytesRequiredForDetection ?? (options.guessEncoding ? AUTO_ENCODING_GUESS_MIN_BYTES : NO_ENCODING_GUESS_MIN_BYTES);
    return new Promise((resolve, reject) => {
        const target = newWriteableStream(strings => strings.join(''));
        const bufferedChunks = [];
        let bytesBuffered = 0;
        let decoder = undefined;
        const cts = new CancellationTokenSource();
        const createDecoder = async () => {
            try {
                // detect encoding from buffer
                const detected = await detectEncodingFromBuffer({
                    buffer: VSBuffer.concat(bufferedChunks),
                    bytesRead: bytesBuffered
                }, options.guessEncoding, options.candidateGuessEncodings);
                // throw early if the source seems binary and
                // we are instructed to only accept text
                if (detected.seemsBinary && options.acceptTextOnly) {
                    throw new DecodeStreamError('Stream is binary but only text is accepted for decoding', 1 /* DecodeStreamErrorKind.STREAM_IS_BINARY */);
                }
                // ensure to respect overwrite of encoding
                detected.encoding = await options.overwriteEncoding(detected.encoding);
                // decode and write buffered content
                decoder = await DecoderStream.create(detected.encoding);
                const decoded = decoder.write(VSBuffer.concat(bufferedChunks).buffer);
                target.write(decoded);
                bufferedChunks.length = 0;
                bytesBuffered = 0;
                // signal to the outside our detected encoding and final decoder stream
                resolve({
                    stream: target,
                    detected
                });
            }
            catch (error) {
                // Stop handling anything from the source and target
                cts.cancel();
                target.destroy();
                reject(error);
            }
        };
        listenStream(source, {
            onData: async (chunk) => {
                // if the decoder is ready, we just write directly
                if (decoder) {
                    target.write(decoder.write(chunk.buffer));
                }
                // otherwise we need to buffer the data until the stream is ready
                else {
                    bufferedChunks.push(chunk);
                    bytesBuffered += chunk.byteLength;
                    // buffered enough data for encoding detection, create stream
                    if (bytesBuffered >= minBytesRequiredForDetection) {
                        // pause stream here until the decoder is ready
                        source.pause();
                        await createDecoder();
                        // resume stream now that decoder is ready but
                        // outside of this stack to reduce recursion
                        setTimeout(() => source.resume());
                    }
                }
            },
            onError: error => target.error(error), // simply forward to target
            onEnd: async () => {
                // we were still waiting for data to do the encoding
                // detection. thus, wrap up starting the stream even
                // without all the data to get things going
                if (!decoder) {
                    await createDecoder();
                }
                // end the target with the remainders of the decoder
                target.end(decoder?.end());
            }
        }, cts.token);
    });
}
export async function toEncodeReadable(readable, encoding, options) {
    const iconv = await importAMDNodeModule('@vscode/iconv-lite-umd', 'lib/iconv-lite-umd.js');
    const encoder = iconv.getEncoder(toNodeEncoding(encoding), options);
    let bytesWritten = false;
    let done = false;
    return {
        read() {
            if (done) {
                return null;
            }
            const chunk = readable.read();
            if (typeof chunk !== 'string') {
                done = true;
                // If we are instructed to add a BOM but we detect that no
                // bytes have been written, we must ensure to return the BOM
                // ourselves so that we comply with the contract.
                if (!bytesWritten && options?.addBOM) {
                    switch (encoding) {
                        case UTF8:
                        case UTF8_with_bom:
                            return VSBuffer.wrap(Uint8Array.from(UTF8_BOM));
                        case UTF16be:
                            return VSBuffer.wrap(Uint8Array.from(UTF16be_BOM));
                        case UTF16le:
                            return VSBuffer.wrap(Uint8Array.from(UTF16le_BOM));
                    }
                }
                const leftovers = encoder.end();
                if (leftovers && leftovers.length > 0) {
                    bytesWritten = true;
                    return VSBuffer.wrap(leftovers);
                }
                return null;
            }
            bytesWritten = true;
            return VSBuffer.wrap(encoder.write(chunk));
        }
    };
}
export async function encodingExists(encoding) {
    const iconv = await importAMDNodeModule('@vscode/iconv-lite-umd', 'lib/iconv-lite-umd.js');
    return iconv.encodingExists(toNodeEncoding(encoding));
}
export function toNodeEncoding(enc) {
    if (enc === UTF8_with_bom || enc === null) {
        return UTF8; // iconv does not distinguish UTF 8 with or without BOM, so we need to help it
    }
    return enc;
}
export function detectEncodingByBOMFromBuffer(buffer, bytesRead) {
    if (!buffer || bytesRead < UTF16be_BOM.length) {
        return null;
    }
    const b0 = buffer.readUInt8(0);
    const b1 = buffer.readUInt8(1);
    // UTF-16 BE
    if (b0 === UTF16be_BOM[0] && b1 === UTF16be_BOM[1]) {
        return UTF16be;
    }
    // UTF-16 LE
    if (b0 === UTF16le_BOM[0] && b1 === UTF16le_BOM[1]) {
        return UTF16le;
    }
    if (bytesRead < UTF8_BOM.length) {
        return null;
    }
    const b2 = buffer.readUInt8(2);
    // UTF-8
    if (b0 === UTF8_BOM[0] && b1 === UTF8_BOM[1] && b2 === UTF8_BOM[2]) {
        return UTF8_with_bom;
    }
    return null;
}
// we explicitly ignore a specific set of encodings from auto guessing
// - ASCII: we never want this encoding (most UTF-8 files would happily detect as
//          ASCII files and then you could not type non-ASCII characters anymore)
// - UTF-16: we have our own detection logic for UTF-16
// - UTF-32: we do not support this encoding in VSCode
const IGNORE_ENCODINGS = ['ascii', 'utf-16', 'utf-32'];
/**
 * Guesses the encoding from buffer.
 */
async function guessEncodingByBuffer(buffer, candidateGuessEncodings) {
    const jschardet = await importAMDNodeModule('jschardet', 'dist/jschardet.min.js');
    // ensure to limit buffer for guessing due to https://github.com/aadsm/jschardet/issues/53
    const limitedBuffer = buffer.slice(0, AUTO_ENCODING_GUESS_MAX_BYTES);
    // before guessing jschardet calls toString('binary') on input if it is a Buffer,
    // since we are using it inside browser environment as well we do conversion ourselves
    // https://github.com/aadsm/jschardet/blob/v2.1.1/src/index.js#L36-L40
    const binaryString = encodeLatin1(limitedBuffer.buffer);
    // ensure to convert candidate encodings to jschardet encoding names if provided
    if (candidateGuessEncodings) {
        candidateGuessEncodings = coalesce(candidateGuessEncodings.map(e => toJschardetEncoding(e)));
        if (candidateGuessEncodings.length === 0) {
            candidateGuessEncodings = undefined;
        }
    }
    let guessed;
    try {
        guessed = jschardet.detect(binaryString, candidateGuessEncodings ? { detectEncodings: candidateGuessEncodings } : undefined);
    }
    catch (error) {
        return null; // jschardet throws for unknown encodings (https://github.com/microsoft/vscode/issues/239928)
    }
    if (!guessed?.encoding) {
        return null;
    }
    const enc = guessed.encoding.toLowerCase();
    if (0 <= IGNORE_ENCODINGS.indexOf(enc)) {
        return null; // see comment above why we ignore some encodings
    }
    return toIconvLiteEncoding(guessed.encoding);
}
const JSCHARDET_TO_ICONV_ENCODINGS = {
    'ibm866': 'cp866',
    'big5': 'cp950'
};
function normalizeEncoding(encodingName) {
    return encodingName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}
function toIconvLiteEncoding(encodingName) {
    const normalizedEncodingName = normalizeEncoding(encodingName);
    const mapped = JSCHARDET_TO_ICONV_ENCODINGS[normalizedEncodingName];
    return mapped || normalizedEncodingName;
}
function toJschardetEncoding(encodingName) {
    const normalizedEncodingName = normalizeEncoding(encodingName);
    const mapped = GUESSABLE_ENCODINGS[normalizedEncodingName];
    return mapped ? mapped.guessableName : undefined;
}
function encodeLatin1(buffer) {
    let result = '';
    for (let i = 0; i < buffer.length; i++) {
        result += String.fromCharCode(buffer[i]);
    }
    return result;
}
/**
 * The encodings that are allowed in a settings file don't match the canonical encoding labels specified by WHATWG.
 * See https://encoding.spec.whatwg.org/#names-and-labels
 * Iconv-lite strips all non-alphanumeric characters, but ripgrep doesn't. For backcompat, allow these labels.
 */
export function toCanonicalName(enc) {
    switch (enc) {
        case 'shiftjis':
            return 'shift-jis';
        case 'utf16le':
            return 'utf-16le';
        case 'utf16be':
            return 'utf-16be';
        case 'big5hkscs':
            return 'big5-hkscs';
        case 'eucjp':
            return 'euc-jp';
        case 'euckr':
            return 'euc-kr';
        case 'koi8r':
            return 'koi8-r';
        case 'koi8u':
            return 'koi8-u';
        case 'macroman':
            return 'x-mac-roman';
        case 'utf8bom':
            return 'utf8';
        default: {
            const m = enc.match(/windows(\d+)/);
            if (m) {
                return 'windows-' + m[1];
            }
            return enc;
        }
    }
}
export function detectEncodingFromBuffer({ buffer, bytesRead }, autoGuessEncoding, candidateGuessEncodings) {
    // Always first check for BOM to find out about encoding
    let encoding = detectEncodingByBOMFromBuffer(buffer, bytesRead);
    // Detect 0 bytes to see if file is binary or UTF-16 LE/BE
    // unless we already know that this file has a UTF-16 encoding
    let seemsBinary = false;
    if (encoding !== UTF16be && encoding !== UTF16le && buffer) {
        let couldBeUTF16LE = true; // e.g. 0xAA 0x00
        let couldBeUTF16BE = true; // e.g. 0x00 0xAA
        let containsZeroByte = false;
        // This is a simplified guess to detect UTF-16 BE or LE by just checking if
        // the first 512 bytes have the 0-byte at a specific location. For UTF-16 LE
        // this would be the odd byte index and for UTF-16 BE the even one.
        // Note: this can produce false positives (a binary file that uses a 2-byte
        // encoding of the same format as UTF-16) and false negatives (a UTF-16 file
        // that is using 4 bytes to encode a character).
        for (let i = 0; i < bytesRead && i < ZERO_BYTE_DETECTION_BUFFER_MAX_LEN; i++) {
            const isEndian = (i % 2 === 1); // assume 2-byte sequences typical for UTF-16
            const isZeroByte = (buffer.readUInt8(i) === 0);
            if (isZeroByte) {
                containsZeroByte = true;
            }
            // UTF-16 LE: expect e.g. 0xAA 0x00
            if (couldBeUTF16LE && (isEndian && !isZeroByte || !isEndian && isZeroByte)) {
                couldBeUTF16LE = false;
            }
            // UTF-16 BE: expect e.g. 0x00 0xAA
            if (couldBeUTF16BE && (isEndian && isZeroByte || !isEndian && !isZeroByte)) {
                couldBeUTF16BE = false;
            }
            // Return if this is neither UTF16-LE nor UTF16-BE and thus treat as binary
            if (isZeroByte && !couldBeUTF16LE && !couldBeUTF16BE) {
                break;
            }
        }
        // Handle case of 0-byte included
        if (containsZeroByte) {
            if (couldBeUTF16LE) {
                encoding = UTF16le;
            }
            else if (couldBeUTF16BE) {
                encoding = UTF16be;
            }
            else {
                seemsBinary = true;
            }
        }
    }
    // Auto guess encoding if configured
    if (autoGuessEncoding && !seemsBinary && !encoding && buffer) {
        return guessEncodingByBuffer(buffer.slice(0, bytesRead), candidateGuessEncodings).then(guessedEncoding => {
            return {
                seemsBinary: false,
                encoding: guessedEncoding
            };
        });
    }
    return { seemsBinary, encoding };
}
export const SUPPORTED_ENCODINGS = {
    utf8: {
        labelLong: 'UTF-8',
        labelShort: 'UTF-8',
        order: 1,
        alias: 'utf8bom',
        guessableName: 'UTF-8'
    },
    utf8bom: {
        labelLong: 'UTF-8 with BOM',
        labelShort: 'UTF-8 with BOM',
        encodeOnly: true,
        order: 2,
        alias: 'utf8'
    },
    utf16le: {
        labelLong: 'UTF-16 LE',
        labelShort: 'UTF-16 LE',
        order: 3,
        guessableName: 'UTF-16LE'
    },
    utf16be: {
        labelLong: 'UTF-16 BE',
        labelShort: 'UTF-16 BE',
        order: 4,
        guessableName: 'UTF-16BE'
    },
    windows1252: {
        labelLong: 'Western (Windows 1252)',
        labelShort: 'Windows 1252',
        order: 5,
        guessableName: 'windows-1252'
    },
    iso88591: {
        labelLong: 'Western (ISO 8859-1)',
        labelShort: 'ISO 8859-1',
        order: 6
    },
    iso88593: {
        labelLong: 'Western (ISO 8859-3)',
        labelShort: 'ISO 8859-3',
        order: 7
    },
    iso885915: {
        labelLong: 'Western (ISO 8859-15)',
        labelShort: 'ISO 8859-15',
        order: 8
    },
    macroman: {
        labelLong: 'Western (Mac Roman)',
        labelShort: 'Mac Roman',
        order: 9
    },
    cp437: {
        labelLong: 'DOS (CP 437)',
        labelShort: 'CP437',
        order: 10
    },
    windows1256: {
        labelLong: 'Arabic (Windows 1256)',
        labelShort: 'Windows 1256',
        order: 11
    },
    iso88596: {
        labelLong: 'Arabic (ISO 8859-6)',
        labelShort: 'ISO 8859-6',
        order: 12
    },
    windows1257: {
        labelLong: 'Baltic (Windows 1257)',
        labelShort: 'Windows 1257',
        order: 13
    },
    iso88594: {
        labelLong: 'Baltic (ISO 8859-4)',
        labelShort: 'ISO 8859-4',
        order: 14
    },
    iso885914: {
        labelLong: 'Celtic (ISO 8859-14)',
        labelShort: 'ISO 8859-14',
        order: 15
    },
    windows1250: {
        labelLong: 'Central European (Windows 1250)',
        labelShort: 'Windows 1250',
        order: 16,
        guessableName: 'windows-1250'
    },
    iso88592: {
        labelLong: 'Central European (ISO 8859-2)',
        labelShort: 'ISO 8859-2',
        order: 17,
        guessableName: 'ISO-8859-2'
    },
    cp852: {
        labelLong: 'Central European (CP 852)',
        labelShort: 'CP 852',
        order: 18
    },
    windows1251: {
        labelLong: 'Cyrillic (Windows 1251)',
        labelShort: 'Windows 1251',
        order: 19,
        guessableName: 'windows-1251'
    },
    cp866: {
        labelLong: 'Cyrillic (CP 866)',
        labelShort: 'CP 866',
        order: 20,
        guessableName: 'IBM866'
    },
    cp1125: {
        labelLong: 'Cyrillic (CP 1125)',
        labelShort: 'CP 1125',
        order: 21,
        guessableName: 'IBM1125'
    },
    iso88595: {
        labelLong: 'Cyrillic (ISO 8859-5)',
        labelShort: 'ISO 8859-5',
        order: 22,
        guessableName: 'ISO-8859-5'
    },
    koi8r: {
        labelLong: 'Cyrillic (KOI8-R)',
        labelShort: 'KOI8-R',
        order: 23,
        guessableName: 'KOI8-R'
    },
    koi8u: {
        labelLong: 'Cyrillic (KOI8-U)',
        labelShort: 'KOI8-U',
        order: 24
    },
    iso885913: {
        labelLong: 'Estonian (ISO 8859-13)',
        labelShort: 'ISO 8859-13',
        order: 25
    },
    windows1253: {
        labelLong: 'Greek (Windows 1253)',
        labelShort: 'Windows 1253',
        order: 26,
        guessableName: 'windows-1253'
    },
    iso88597: {
        labelLong: 'Greek (ISO 8859-7)',
        labelShort: 'ISO 8859-7',
        order: 27,
        guessableName: 'ISO-8859-7'
    },
    windows1255: {
        labelLong: 'Hebrew (Windows 1255)',
        labelShort: 'Windows 1255',
        order: 28,
        guessableName: 'windows-1255'
    },
    iso88598: {
        labelLong: 'Hebrew (ISO 8859-8)',
        labelShort: 'ISO 8859-8',
        order: 29,
        guessableName: 'ISO-8859-8'
    },
    iso885910: {
        labelLong: 'Nordic (ISO 8859-10)',
        labelShort: 'ISO 8859-10',
        order: 30
    },
    iso885916: {
        labelLong: 'Romanian (ISO 8859-16)',
        labelShort: 'ISO 8859-16',
        order: 31
    },
    windows1254: {
        labelLong: 'Turkish (Windows 1254)',
        labelShort: 'Windows 1254',
        order: 32
    },
    iso88599: {
        labelLong: 'Turkish (ISO 8859-9)',
        labelShort: 'ISO 8859-9',
        order: 33
    },
    windows1258: {
        labelLong: 'Vietnamese (Windows 1258)',
        labelShort: 'Windows 1258',
        order: 34
    },
    gbk: {
        labelLong: 'Simplified Chinese (GBK)',
        labelShort: 'GBK',
        order: 35
    },
    gb18030: {
        labelLong: 'Simplified Chinese (GB18030)',
        labelShort: 'GB18030',
        order: 36
    },
    cp950: {
        labelLong: 'Traditional Chinese (Big5)',
        labelShort: 'Big5',
        order: 37,
        guessableName: 'Big5'
    },
    big5hkscs: {
        labelLong: 'Traditional Chinese (Big5-HKSCS)',
        labelShort: 'Big5-HKSCS',
        order: 38
    },
    shiftjis: {
        labelLong: 'Japanese (Shift JIS)',
        labelShort: 'Shift JIS',
        order: 39,
        guessableName: 'SHIFT_JIS'
    },
    eucjp: {
        labelLong: 'Japanese (EUC-JP)',
        labelShort: 'EUC-JP',
        order: 40,
        guessableName: 'EUC-JP'
    },
    euckr: {
        labelLong: 'Korean (EUC-KR)',
        labelShort: 'EUC-KR',
        order: 41,
        guessableName: 'EUC-KR'
    },
    windows874: {
        labelLong: 'Thai (Windows 874)',
        labelShort: 'Windows 874',
        order: 42
    },
    iso885911: {
        labelLong: 'Latin/Thai (ISO 8859-11)',
        labelShort: 'ISO 8859-11',
        order: 43
    },
    koi8ru: {
        labelLong: 'Cyrillic (KOI8-RU)',
        labelShort: 'KOI8-RU',
        order: 44
    },
    koi8t: {
        labelLong: 'Tajik (KOI8-T)',
        labelShort: 'KOI8-T',
        order: 45
    },
    gb2312: {
        labelLong: 'Simplified Chinese (GB 2312)',
        labelShort: 'GB 2312',
        order: 46,
        guessableName: 'GB2312'
    },
    cp865: {
        labelLong: 'Nordic DOS (CP 865)',
        labelShort: 'CP 865',
        order: 47
    },
    cp850: {
        labelLong: 'Western European DOS (CP 850)',
        labelShort: 'CP 850',
        order: 48
    }
};
export const GUESSABLE_ENCODINGS = (() => {
    const guessableEncodings = {};
    for (const encoding in SUPPORTED_ENCODINGS) {
        if (SUPPORTED_ENCODINGS[encoding].guessableName) {
            guessableEncodings[encoding] = SUPPORTED_ENCODINGS[encoding];
        }
    }
    return guessableEncodings;
})();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5jb2RpbmcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL2VuY29kaW5nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBNEIsa0JBQWtCLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0csT0FBTyxFQUFFLFFBQVEsRUFBNEMsTUFBTSxtQ0FBbUMsQ0FBQztBQUN2RyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNsRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFN0QsTUFBTSxDQUFDLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQztBQUMzQixNQUFNLENBQUMsTUFBTSxhQUFhLEdBQUcsU0FBUyxDQUFDO0FBQ3ZDLE1BQU0sQ0FBQyxNQUFNLE9BQU8sR0FBRyxTQUFTLENBQUM7QUFDakMsTUFBTSxDQUFDLE1BQU0sT0FBTyxHQUFHLFNBQVMsQ0FBQztBQUlqQyxNQUFNLFVBQVUsYUFBYSxDQUFDLFFBQWdCO0lBQzdDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxXQUFXLEtBQUssUUFBUSxDQUFDLENBQUM7QUFDOUYsQ0FBQztBQUVELE1BQU0sQ0FBQyxNQUFNLFdBQVcsR0FBRyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztBQUN4QyxNQUFNLENBQUMsTUFBTSxXQUFXLEdBQUcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDeEMsTUFBTSxDQUFDLE1BQU0sUUFBUSxHQUFHLENB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