/**
 * Derived from https://github.com/zikaari/onigasm/blob/master/src/OnigScanner.ts
 */
declare const onigasmH: {
    _malloc(n: number): number;
    HEAPU8: Buffer;
    HEAPU32: Buffer;
    HEAP32: Buffer;
    _compilePattern(pattern: number, patternLength: number, isMultiline?: boolean, isCaseInsensitive?: boolean): number;
    _findBestMatch(pattern: number, patternLength: number, start: number, end: number, n?: number, k?: number): number;
    _disposeCompiledPatterns(n: number, k: number): number;
    _free(n: number): void;
    _getLastError(): number;
}

type UintArray = Uint8Array | Uint16Array | Uint32Array

class OnigString {
    private source: string
    private _utf8Bytes: Uint8Array | null

    /**
     * utf16-offset where the mapping table starts. Before that index: utf16-index === utf8-index
     */
    private _mappingTableStartOffset: number
    /**
     * utf-16 to utf-8 mapping table for all uft-8 indexes starting at `_mappingTableStartOffset`. utf8-index are always starting at 0.
     * `null` if there are no multibyte characters in the utf8 string and all utf-8 indexes are matching the utf-16 indexes.
     * Example: _mappingTableStartOffset === 10, _utf16OffsetToUtf8 = [0, 3, 6] -> _utf8Indexes[10] = 10, _utf8Indexes[11] = 13
     */
    private _utf8Indexes: UintArray | null

    constructor(content: string) {
        if (typeof content !== 'string') {
            throw new TypeError('Argument must be a string')
        }
        this.source = content
        this._utf8Bytes = null
        this._utf8Indexes = null
        this._mappingTableStartOffset = Number.MAX_VALUE;
    }

    public get utf8Bytes(): Uint8Array {
        if (!this._utf8Bytes) {
            this.encode()
        }
        return this._utf8Bytes!;
    }

    /**
     * Returns `null` if all utf8 offsets match utf-16 offset (content has no multi byte characters)
     */
    private get utf8Indexes(): UintArray {
        if (!this._utf8Bytes) {
            this.encode()
        }
        return this._utf8Indexes!;
    }

    public get content(): string {
        return this.source
    }

    public get length(): number {
        return this.source.length
    }

    public get hasMultiByteCharacters() {
        return this.utf8Indexes !== null
    }

    public convertUtf8OffsetToUtf16(utf8Offset: number): number {
        if (utf8Offset < 0) {
            return 0
        }
        const utf8Array = this.utf8Bytes;
        if (utf8Offset >= utf8Array.length - 1) {
            return this.source.length
        }

        const utf8OffsetMap = this.utf8Indexes
        if (utf8OffsetMap && utf8Offset >= this._mappingTableStartOffset) {
            return findFirstInSorted(utf8OffsetMap, utf8Offset - this._mappingTableStartOffset) + this._mappingTableStartOffset
        }
        return utf8Offset
    }

    public convertUtf16OffsetToUtf8(utf16Offset: number): number {
        if (utf16Offset < 0) {
            return 0
        }
        const utf8Array = this.utf8Bytes
        if (utf16Offset >= this.source.length) {
            return utf8Array.length - 1
        }

        const utf8OffsetMap = this.utf8Indexes
        if (utf8OffsetMap && utf16Offset >= this._mappingTableStartOffset) {
            return utf8OffsetMap[utf16Offset - this._mappingTableStartOffset] + this._mappingTableStartOffset
        }
        return utf16Offset
    }

    private encode(): void {
        const str = this.source
        const n = str.length
        let utf16OffsetToUtf8: UintArray | undefined
        let utf8Offset = 0
        let mappingTableStartOffset = 0
        function createOffsetTable(startOffset: number) {
            const maxUtf8Len = (n - startOffset) * 3
            if (maxUtf8Len <= 0xff) {
                utf16OffsetToUtf8 = new Uint8Array(n - startOffset)
            } else if (maxUtf8Len <= 0xffff) {
                utf16OffsetToUtf8 = new Uint16Array(n - startOffset)
            } else {
                utf16OffsetToUtf8 = new Uint32Array(n - startOffset)
            }
            mappingTableStartOffset = startOffset
            utf16OffsetToUtf8[utf8Offset++] = 0
        }

        const u8view = new Uint8Array((n * 3) /* alloc max now, trim later*/ + 1 /** null termination character */)

        let ptrHead = 0
        let i = 0
        // for some reason, v8 is faster with str.length than using a variable (might be illusion)
        while (i < str.length) {
            let codepoint
            const c = str.charCodeAt(i)

            if (utf16OffsetToUtf8) {
                utf16OffsetToUtf8[utf8Offset++] = ptrHead - mappingTableStartOffset
            }

            if (c < 0xD800 || c > 0xDFFF) {
                codepoint = c
            }

            else if (c >= 0xDC00) {
                codepoint = 0xFFFD
            }

            else {
                if (i === n - 1) {
                    codepoint = 0xFFFD
                }
                else {
                    const d = str.charCodeAt(i + 1)

                    if (0xDC00 <= d && d <= 0xDFFF) {
                        if (!utf16OffsetToUtf8) {
                            createOffsetTable(i)
                        }

                        const a = c & 0x3FF

                        const b = d & 0x3FF

                        codepoint = 0x10000 + (a << 10) + b
                        i += 1

                        utf16OffsetToUtf8![utf8Offset++] = ptrHead - mappingTableStartOffset
                    }

                    else {
                        codepoint = 0xFFFD
                    }
                }
            }

            let bytesRequiredToEncode: number
            let offset: number

            if (codepoint <= 0x7F) {
                bytesRequiredToEncode = 1
                offset = 0
            } else if (codepoint <= 0x07FF) {
                bytesRequiredToEncode = 2
                offset = 0xC0
            } else if (codepoint <= 0xFFFF) {
                bytesRequiredToEncode = 3
                offset = 0xE0
            } else {
                bytesRequiredToEncode = 4
                offset = 0xF0
            }

            if (bytesRequiredToEncode === 1) {
                u8view[ptrHead++] = codepoint
            }
            else {
                if (!utf16OffsetToUtf8) {
                    createOffsetTable(ptrHead)
                }
                u8view[ptrHead++] = (codepoint >> (6 * (--bytesRequiredToEncode))) + offset

                while (bytesRequiredToEncode > 0) {

                    const temp = codepoint >> (6 * (bytesRequiredToEncode - 1))

                    u8view[ptrHead++] = (0x80 | (temp & 0x3F))

                    bytesRequiredToEncode -= 1
                }
            }

            i += 1
        }

        const utf8 = u8view.slice(0, ptrHead + 1)
        utf8[ptrHead] = 0x00

        this._utf8Bytes = utf8
        if (utf16OffsetToUtf8) { // set if UTF-16 surrogate chars or multi-byte characters found
            this._utf8Indexes = utf16OffsetToUtf8
            this._mappingTableStartOffset = mappingTableStartOffset
        }
    }
}

function findFirstInSorted<T>(array: UintArray, i: number): number {
    let low = 0
    let high = array.length

    if (high === 0) {
        return 0 // no children
    }
    while (low < high) {
        const mid = Math.floor((low + high) / 2)
        if (array[mid] >= i) {
            high = mid
        } else {
            low = mid + 1
        }
    }

    // low is on the index of the first value >= i or array.length. Decrement low until we find array[low] <= i
    while (low > 0 && (low >= array.length || array[low] > i)) {
        low--
    }
    // check whether we are on the second index of a utf-16 surrogate char. If so, go to the first index.
    if (low > 0 && array[low] === array[low - 1]) {
        low--
    }

    return low

}


/**
 * Every instance of OnigScanner internally calls native libonig API
 * Since (at the moment) transferring complex objects between C runtime and JS runtime is not easy,
 * pointers are used to tap into their runtimes to read values (for example result of regex match)
 */
interface INativeOnigHInfo {
    /**
     * regex_t* is used by libonig to match string against an expression
     * this is the output of compiling raw string pattern to libonig's internal representation
     */
    regexTPtrs: Uint8Array;
}

export interface IOnigCaptureIndex {
    index: number
    start: number
    end: number
    length: number
}

export interface IOnigMatch {
    index: number
    captureIndices: IOnigCaptureIndex[]
    scanner: OnigScanner
}

class LRUCache<T, U> {
    private cache: Map<T, U>;

    constructor(private capacity: number, private onDispose: (key: T, value: U) => void) {
        this.cache = new Map();
    }

    get(key: T) {
        const value = this.cache.get(key);
        if (!value) {
            return undefined;
        }
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key: T, value: U) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.capacity) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
            this.onDispose(key, oldestKey);
        }
        this.cache.set(key, value);
    }
}

/**
 * Allocates space on the heap and copies the string bytes on to it
 * @param str
 * @returns pointer to the first byte's address on heap
 */
function mallocAndWriteString(str: OnigString): number {
    const ptr = onigasmH._malloc(str.utf8Bytes.length)
    onigasmH.HEAPU8.set(str.utf8Bytes, ptr)
    return ptr
}

function convertUTF8BytesFromPtrToString(ptr: number): string {
    const chars = []
    let i = 0
    while (onigasmH.HEAPU8[ptr] !== 0x00) {
        chars[i++] = onigasmH.HEAPU8[ptr++]
    }
    return chars.join()
}

const onDispose = (scanner: OnigScanner, info: INativeOnigHInfo) => {
    const regexTPtrsPtr = onigasmH._malloc(info.regexTPtrs.length)
    onigasmH.HEAPU8.set(info.regexTPtrs, regexTPtrsPtr)
    const status = onigasmH._disposeCompiledPatterns(regexTPtrsPtr, scanner.patterns.length)
    if (status !== 0) {
        const errMessage = convertUTF8BytesFromPtrToString(onigasmH._getLastError())
        throw new Error(errMessage)
    }
    onigasmH._free(regexTPtrsPtr)
}

const cache = new LRUCache<OnigScanner, INativeOnigHInfo>(100, onDispose);

export class OnigScanner {
    private sources: string[]
    /**
     * Create a new scanner with the given patterns
     * @param patterns  An array of string patterns
     */
    constructor(patterns: string[]) {
        if (onigasmH === null) {
            throw new Error(`Onigasm has not been initialized, call loadWASM from 'onigasm' exports before using any other API`)
        }
        for (let i = 0; i < patterns.length; i++) {
            const pattern = patterns[i]
            if (typeof pattern !== 'string') {
                throw new TypeError(`First parameter to OnigScanner constructor must be array of (pattern) strings`)
            }
        }
        this.sources = patterns.slice()
    }

    public get patterns() {
        return this.sources.slice()
    }

    /**
     * Find the next match from a given position
     * @param string The string to search
     * @param startPosition The optional position to start at, defaults to 0
     * @param callback The (error, match) function to call when done, match will null when there is no match
     */
    public findNextMatch(string: string | OnigString, startPosition: number, callback: (err: any, match?: IOnigMatch) => void) {
        if (startPosition == null) { startPosition = 0 }
        if (typeof startPosition === 'function') {
            callback = startPosition
            startPosition = 0
        }

        try {
            const match = this.findNextMatchSync(string, startPosition)
            callback(null, match ?? undefined)
        } catch (error) {
            callback(error)
        }
    }

    /**
     * Find the next match from a given position
     * @param string The string to search
     * @param startPosition The optional position to start at, defaults to 0
     */
    public findNextMatchSync(string: string | OnigString, startPosition: number): IOnigMatch | null {
        if (startPosition == null) { startPosition = 0 }
        startPosition = this.convertToNumber(startPosition)

        let onigNativeInfo = cache.get(this)
        let status = 0
        if (!onigNativeInfo) {
            const regexTAddrRecieverPtr = onigasmH._malloc(4)
            const regexTPtrs = []
            for (let i = 0; i < this.sources.length; i++) {
                const pattern = this.sources[i]
                const patternStrPtr = mallocAndWriteString(new OnigString(pattern))
                status = onigasmH._compilePattern(patternStrPtr, regexTAddrRecieverPtr)
                if (status !== 0) {
                    const errMessage = convertUTF8BytesFromPtrToString(onigasmH._getLastError())
                    throw new Error(errMessage)
                }
                const regexTAddress = onigasmH.HEAP32[regexTAddrRecieverPtr / 4]
                regexTPtrs.push(regexTAddress)
                onigasmH._free(patternStrPtr)
            }
            onigNativeInfo = {
                regexTPtrs: new Uint8Array(Uint32Array.from(regexTPtrs).buffer),
            } as Required<INativeOnigHInfo>
            onigasmH._free(regexTAddrRecieverPtr)
            cache.set(this, onigNativeInfo)
        }

        const onigString = string instanceof OnigString ? string : new OnigString(this.convertToString(string))
        const strPtr = mallocAndWriteString(onigString)
        const resultInfoReceiverPtr = onigasmH._malloc(8)
        const regexTPtrsPtr = onigasmH._malloc(onigNativeInfo.regexTPtrs.length)
        onigasmH.HEAPU8.set(onigNativeInfo.regexTPtrs, regexTPtrsPtr)

        status = onigasmH._findBestMatch(
            // regex_t **patterns
            regexTPtrsPtr,
            // int patternCount
            this.sources.length,
            // UChar *utf8String
            strPtr,
            // int strLen
            onigString.utf8Bytes.length - 1,
            // int startOffset
            onigString.convertUtf16OffsetToUtf8(startPosition),
            // int *resultInfo
            resultInfoReceiverPtr,
        )

        if (status !== 0) {
            const errMessage = convertUTF8BytesFromPtrToString(onigasmH._getLastError())
            throw new Error(errMessage)
        }
        const [
            // The index of pattern which matched the string at least offset from 0 (start)
            bestPatternIdx,

            // Begin address of capture info encoded as pairs
            // like [start, end, start, end, start, end, ...]
            //  - first start-end pair is entire match (index 0 and 1)
            //  - subsequent pairs are capture groups (2, 3 = first capture group, 4, 5 = second capture group and so on)
            encodedResultBeginAddress,

            // Length of the [start, end, ...] sequence so we know how much memory to read (will always be 0 or multiple of 2)
            encodedResultLength,
        ] = new Uint32Array(onigasmH.HEAPU32.buffer, resultInfoReceiverPtr, 3);

        onigasmH._free(strPtr)
        onigasmH._free(resultInfoReceiverPtr)
        onigasmH._free(regexTPtrsPtr)

        if (encodedResultLength > 0) {
            const encodedResult = new Uint32Array(onigasmH.HEAPU32.buffer, encodedResultBeginAddress, encodedResultLength)
            const captureIndices = []
            let i = 0
            let captureIdx = 0
            while (i < encodedResultLength) {
                const index = captureIdx++
                let start = encodedResult[i++]
                let end = encodedResult[i++]
                if (onigString.hasMultiByteCharacters) {
                    start = onigString.convertUtf8OffsetToUtf16(start)
                    end = onigString.convertUtf8OffsetToUtf16(end)
                }
                captureIndices.push({
                    end,
                    index,
                    length: end - start,
                    start,
                })
            }
            onigasmH._free(encodedResultBeginAddress)
            return {
                captureIndices,
                index: bestPatternIdx,
                scanner: this,
            }
        }
        return null
    }

    public convertToString(value: any) {
        if (value === undefined) { return 'undefined' }
        if (value === null) { return 'null' }
        if (value instanceof OnigString) { return value.content }
        return value.toString()
    }

    public convertToNumber(value: any) {
        value = parseInt(value, 10)
        if (!isFinite(value)) { value = 0 }
        value = Math.max(value, 0)
        return value
    }
}

export default OnigScanner

