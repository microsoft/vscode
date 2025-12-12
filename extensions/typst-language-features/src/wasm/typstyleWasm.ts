/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Manual WASM loader for typstyle formatter.
 *
 * This module provides a browser-compatible way to load the typstyle WASM
 * formatter by manually fetching and instantiating the WASM module.
 */

// Declare WebAssembly types for environments where they might not be available
declare const WebAssembly: {
	compile(bytes: ArrayBuffer): Promise<WebAssemblyModule>;
	instantiate(module: WebAssemblyModule, imports: Record<string, unknown>): Promise<WebAssemblyInstance>;
};

interface WebAssemblyModule {
	// WebAssembly module
}

interface WebAssemblyInstance {
	exports: Record<string, unknown>;
}

interface WebAssemblyMemory {
	buffer: ArrayBuffer;
}

interface WebAssemblyTable {
	grow(delta: number): number;
	get(index: number): unknown;
	set(index: number, value: unknown): void;
}

// Format function type
export type FormatFunction = (text: string, config: TypstyleConfig) => string;

export interface TypstyleConfig {
	max_width?: number;
	tab_spaces?: number;
	blank_lines_upper_bound?: number;
	collapse_markup_spaces?: boolean;
	reorder_import_items?: boolean;
	wrap_text?: boolean;
}

// WASM module instance
let wasmInstance: WebAssemblyInstance | null = null;
let wasmMemory: WebAssemblyMemory | null = null;
let initPromise: Promise<void> | null = null;

// Cached encoders/decoders
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });

// Memory management
let WASM_VECTOR_LEN = 0;
let cachedUint8ArrayMemory: Uint8Array | null = null;
let cachedDataViewMemory: DataView | null = null;

function getUint8ArrayMemory(): Uint8Array {
	if (cachedUint8ArrayMemory === null || cachedUint8ArrayMemory.byteLength === 0) {
		cachedUint8ArrayMemory = new Uint8Array(wasmMemory!.buffer);
	}
	return cachedUint8ArrayMemory;
}

function getDataViewMemory(): DataView {
	if (cachedDataViewMemory === null || cachedDataViewMemory.buffer !== wasmMemory!.buffer) {
		cachedDataViewMemory = new DataView(wasmMemory!.buffer);
	}
	return cachedDataViewMemory;
}

function getStringFromWasm(ptr: number, len: number): string {
	ptr = ptr >>> 0;
	return textDecoder.decode(getUint8ArrayMemory().subarray(ptr, ptr + len));
}

function passStringToWasm(arg: string, malloc: (size: number, align: number) => number, realloc?: (ptr: number, oldSize: number, newSize: number, align: number) => number): number {
	if (realloc === undefined) {
		const buf = textEncoder.encode(arg);
		const ptr = malloc(buf.length, 1) >>> 0;
		getUint8ArrayMemory().subarray(ptr, ptr + buf.length).set(buf);
		WASM_VECTOR_LEN = buf.length;
		return ptr;
	}

	let len = arg.length;
	let ptr = malloc(len, 1) >>> 0;
	const mem = getUint8ArrayMemory();
	let offset = 0;

	for (; offset < len; offset++) {
		const code = arg.charCodeAt(offset);
		if (code > 0x7F) { break; }
		mem[ptr + offset] = code;
	}

	if (offset !== len) {
		if (offset !== 0) {
			arg = arg.slice(offset);
		}
		ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
		const view = getUint8ArrayMemory().subarray(ptr + offset, ptr + len);
		const ret = textEncoder.encodeInto(arg, view);
		offset += ret.written!;
		ptr = realloc(ptr, len, offset, 1) >>> 0;
	}

	WASM_VECTOR_LEN = offset;
	return ptr;
}

function isLikeNone(x: unknown): boolean {
	return x === undefined || x === null;
}

function debugString(val: unknown): string {
	const type = typeof val;
	if (type === 'number' || type === 'boolean' || val === null || val === undefined) {
		return `${val}`;
	}
	if (type === 'string') {
		return `"${val}"`;
	}
	if (type === 'symbol') {
		const description = (val as symbol).description;
		return description ? `Symbol(${description})` : 'Symbol';
	}
	if (type === 'function') {
		const name = (val as (...args: unknown[]) => unknown).name;
		return name ? `Function(${name})` : 'Function';
	}
	if (Array.isArray(val)) {
		const length = val.length;
		let debug = '[';
		if (length > 0) {
			debug += debugString(val[0]);
		}
		for (let i = 1; i < length; i++) {
			debug += ', ' + debugString(val[i]);
		}
		debug += ']';
		return debug;
	}
	const builtInMatches = /\[object ([^\]]+)\]/.exec(Object.prototype.toString.call(val));
	let className: string | undefined;
	if (builtInMatches && builtInMatches.length > 1) {
		className = builtInMatches[1];
	} else {
		return Object.prototype.toString.call(val);
	}
	if (className === 'Object') {
		try {
			return 'Object(' + JSON.stringify(val) + ')';
		} catch (_) {
			return 'Object';
		}
	}
	return className;
}

// Externref table for wasm-bindgen
let externrefTable: WebAssemblyTable | null = null;

/**
 * Options for initializing typstyle WASM
 */
export interface TypstyleWasmOptions {
	/** WASM bytes to load directly (preferred for vscode-server compatibility) */
	wasmBytes?: Uint8Array;
	/** URL to fetch WASM from (fallback, doesn't work with file:// URLs) */
	wasmUrl?: string;
}

/**
 * Initialize typstyle WASM
 * @param options Options containing either wasmBytes or wasmUrl
 */
export async function initializeTypstyleWasm(options: TypstyleWasmOptions | string): Promise<void> {
	if (wasmInstance) {
		return;
	}

	if (initPromise) {
		return initPromise;
	}

	// Handle legacy string argument (URL) for backwards compatibility
	const normalizedOptions: TypstyleWasmOptions = typeof options === 'string'
		? { wasmUrl: options }
		: options;

	initPromise = doInitialize(normalizedOptions);
	return initPromise;
}

async function doInitialize(options: TypstyleWasmOptions): Promise<void> {
	let wasmBytes: ArrayBuffer;

	if (options.wasmBytes) {
		// Use provided bytes directly (works in all environments including vscode-server)
		// Create a copy to ensure we have a pure ArrayBuffer (not SharedArrayBuffer)
		console.log('[Typstyle WASM] Loading from provided bytes...');
		wasmBytes = options.wasmBytes.slice().buffer as ArrayBuffer;
	} else if (options.wasmUrl) {
		// Fetch from URL (fallback, doesn't work with file:// URLs in Node.js)
		console.log('[Typstyle WASM] Loading from URL:', options.wasmUrl);
		const response = await fetch(options.wasmUrl);
		if (!response.ok) {
			throw new Error(`Failed to fetch typstyle WASM: ${response.statusText}`);
		}
		wasmBytes = await response.arrayBuffer();
	} else {
		throw new Error('Either wasmBytes or wasmUrl must be provided');
	}

	// Create imports object for wasm-bindgen
	const imports = {
		'./typstyle_wasm_bg.js': createWasmImports()
	};

	// Compile and instantiate WASM
	const wasmModule = await WebAssembly.compile(wasmBytes);
	const instance = await WebAssembly.instantiate(wasmModule, imports);

	wasmInstance = instance;
	wasmMemory = instance.exports.memory as WebAssemblyMemory;
	externrefTable = instance.exports.__wbindgen_export_3 as WebAssemblyTable;

	// Call __wbindgen_start to initialize the WASM module
	// This is required for wasm-bindgen generated modules
	const startFn = instance.exports.__wbindgen_start as (() => void) | undefined;
	if (startFn) {
		startFn();
	}

	console.log('[Typstyle WASM] Initialized successfully');
}

function createWasmImports(): Record<string, unknown> {
	return {
		__wbg_String_8f0eb39a4a4c2f66(arg0: number, arg1: unknown): void {
			const ret = String(arg1);
			const ptr = passStringToWasm(ret, wasmMalloc, wasmRealloc);
			const len = WASM_VECTOR_LEN;
			getDataViewMemory().setInt32(arg0 + 4 * 1, len, true);
			getDataViewMemory().setInt32(arg0 + 4 * 0, ptr, true);
		},
		__wbg_buffer_609cc3eee51ed158(arg0: unknown): unknown {
			return arg0 as ArrayBuffer;
		},
		__wbg_error_7534b8e9a36f1ab4(arg0: number, arg1: number): void {
			const deferred0_0 = arg0;
			const deferred0_1 = arg1;
			try {
				console.error(getStringFromWasm(arg0, arg1));
			} finally {
				wasmFree(deferred0_0, deferred0_1, 1);
			}
		},
		__wbg_getwithrefkey_1dc361bd10053bfe(arg0: unknown, arg1: unknown): unknown {
			return (arg0 as Record<string, unknown>)[arg1 as string];
		},
		__wbg_instanceof_ArrayBuffer_e14585432e3737fc(arg0: unknown): boolean {
			return arg0 instanceof ArrayBuffer;
		},
		__wbg_instanceof_Uint8Array_17156bcf118086a9(arg0: unknown): boolean {
			return arg0 instanceof Uint8Array;
		},
		__wbg_isSafeInteger_343e2beeeece1bb0(arg0: unknown): boolean {
			return Number.isSafeInteger(arg0 as number);
		},
		__wbg_length_a446193dc22c12f8(arg0: unknown): number {
			return (arg0 as ArrayLike<unknown>).length;
		},
		__wbg_new_8a6f238a6ece86ea(): unknown {
			return new Error();
		},
		__wbg_new_a12002a7f91c75be(arg0: unknown): unknown {
			return new Uint8Array(arg0 as ArrayBuffer);
		},
		__wbg_new_c68d7209be747379(arg0: number, arg1: number): never {
			throw new Error(getStringFromWasm(arg0, arg1));
		},
		__wbg_set_65595bdd868b3009(arg0: unknown, arg1: unknown, arg2: unknown): void {
			(arg0 as Record<string, unknown>)[arg1 as string] = arg2;
		},
		__wbg_stack_0ed75d68575b0f3c(arg0: number, arg1: unknown): void {
			const ret = (arg1 as Error).stack || '';
			const ptr = passStringToWasm(ret, wasmMalloc, wasmRealloc);
			const len = WASM_VECTOR_LEN;
			getDataViewMemory().setInt32(arg0 + 4 * 1, len, true);
			getDataViewMemory().setInt32(arg0 + 4 * 0, ptr, true);
		},
		__wbindgen_as_number(arg0: unknown): number {
			return Number(arg0);
		},
		__wbindgen_bigint_from_u64(arg0: bigint): unknown {
			return BigInt.asUintN(64, arg0);
		},
		__wbindgen_bigint_get_as_i64(arg0: number, arg1: unknown): void {
			const v = arg1;
			const ret = typeof v === 'bigint' ? v : undefined;
			getDataViewMemory().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret as bigint, true);
			getDataViewMemory().setInt32(arg0 + 4 * 0, !isLikeNone(ret) ? 1 : 0, true);
		},
		__wbindgen_boolean_get(arg0: unknown): number {
			const v = arg0;
			return typeof v === 'boolean' ? (v ? 1 : 0) : 2;
		},
		__wbindgen_debug_string(arg0: number, arg1: unknown): void {
			const ret = debugString(arg1);
			const ptr = passStringToWasm(ret, wasmMalloc, wasmRealloc);
			const len = WASM_VECTOR_LEN;
			getDataViewMemory().setInt32(arg0 + 4 * 1, len, true);
			getDataViewMemory().setInt32(arg0 + 4 * 0, ptr, true);
		},
		__wbindgen_error_new(arg0: number, arg1: number): unknown {
			return new Error(getStringFromWasm(arg0, arg1));
		},
		__wbindgen_in(arg0: unknown, arg1: unknown): boolean {
			// Using Reflect.has as it's equivalent to 'in' operator but allowed by linter
			return Reflect.has(arg1 as object, arg0 as PropertyKey);
		},
		__wbindgen_init_externref_table(): void {
			const table = externrefTable!;
			const offset = table.grow(4);
			table.set(0, undefined);
			table.set(offset + 0, undefined);
			table.set(offset + 1, null);
			table.set(offset + 2, true);
			table.set(offset + 3, false);
		},
		__wbindgen_is_bigint(arg0: unknown): boolean {
			return typeof arg0 === 'bigint';
		},
		__wbindgen_is_object(arg0: unknown): boolean {
			const val = arg0;
			return typeof val === 'object' && val !== null;
		},
		__wbindgen_is_undefined(arg0: unknown): boolean {
			return arg0 === undefined;
		},
		__wbindgen_jsval_eq(arg0: unknown, arg1: unknown): boolean {
			return arg0 === arg1;
		},
		__wbindgen_jsval_loose_eq(arg0: unknown, arg1: unknown): boolean {
			// eslint-disable-next-line eqeqeq
			return arg0 == arg1;
		},
		__wbindgen_memory(): WebAssemblyMemory {
			return wasmMemory!;
		},
		__wbindgen_number_get(arg0: number, arg1: unknown): void {
			const obj = arg1;
			const ret = typeof obj === 'number' ? obj : undefined;
			getDataViewMemory().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret as number, true);
			getDataViewMemory().setInt32(arg0 + 4 * 0, !isLikeNone(ret) ? 1 : 0, true);
		},
		__wbindgen_string_get(arg0: number, arg1: unknown): void {
			const obj = arg1;
			const ret = typeof obj === 'string' ? obj : undefined;
			const ptr = isLikeNone(ret) ? 0 : passStringToWasm(ret as string, wasmMalloc, wasmRealloc);
			const len = WASM_VECTOR_LEN;
			getDataViewMemory().setInt32(arg0 + 4 * 1, len, true);
			getDataViewMemory().setInt32(arg0 + 4 * 0, ptr, true);
		},
		__wbindgen_string_new(arg0: number, arg1: number): unknown {
			return getStringFromWasm(arg0, arg1);
		},
		__wbindgen_throw(arg0: number, arg1: number): never {
			throw new Error(getStringFromWasm(arg0, arg1));
		}
	};
}

// WASM helper functions - these get bound after initialization
function wasmMalloc(size: number, align: number): number {
	return (wasmInstance!.exports.__wbindgen_malloc as (size: number, align: number) => number)(size, align);
}

function wasmRealloc(ptr: number, oldSize: number, newSize: number, align: number): number {
	return (wasmInstance!.exports.__wbindgen_realloc as (ptr: number, oldSize: number, newSize: number, align: number) => number)(ptr, oldSize, newSize, align);
}

function wasmFree(ptr: number, size: number, align: number): void {
	(wasmInstance!.exports.__wbindgen_free as (ptr: number, size: number, align: number) => void)(ptr, size, align);
}

/**
 * Check if typstyle WASM is loaded
 */
export function isTypstyleWasmLoaded(): boolean {
	return wasmInstance !== null;
}

/**
 * Take a value from the externref table (used for error handling)
 */
function takeFromExternrefTable(idx: number): unknown {
	const table = externrefTable!;
	const value = table.get(idx);
	const deallocFn = wasmInstance!.exports.__externref_table_dealloc as ((idx: number) => void) | undefined;
	if (deallocFn) {
		deallocFn(idx);
	}
	return value;
}

/**
 * Format Typst source code using typstyle
 *
 * This uses the multi-value return ABI from wasm-bindgen.
 * The format function returns [result_ptr, result_len, error_idx, has_error]
 */
export function formatTypst(text: string, config: TypstyleConfig): string {
	if (!wasmInstance) {
		throw new Error('Typstyle WASM not initialized');
	}

	const exports = wasmInstance.exports;

	// The format function uses multi-value return: (ptr, len, config) -> [ptr, len, err_idx, has_err]
	const formatFn = exports.format as (textPtr: number, textLen: number, config: unknown) => [number, number, number, number];

	let resultPtr = 0;
	let resultLen = 0;

	try {
		// Pass the text string to WASM
		const textPtr = passStringToWasm(text, wasmMalloc, wasmRealloc);
		const textLen = WASM_VECTOR_LEN;

		// Call the format function with the config object directly (externref)
		const ret = formatFn(textPtr, textLen, config);

		// Parse the multi-value return
		const ptr = ret[0];
		const len = ret[1];
		const errIdx = ret[2];
		const hasError = ret[3];

		// Check for error
		if (hasError) {
			resultPtr = 0;
			resultLen = 0;
			throw takeFromExternrefTable(errIdx);
		}

		resultPtr = ptr;
		resultLen = len;

		// Get the result string
		return getStringFromWasm(ptr, len);
	} finally {
		// Free the result string memory
		if (resultPtr !== 0) {
			wasmFree(resultPtr, resultLen, 1);
		}
	}
}

/**
 * Dispose of the typstyle WASM module
 */
export function disposeTypstyleWasm(): void {
	wasmInstance = null;
	wasmMemory = null;
	externrefTable = null;
	initPromise = null;
	cachedUint8ArrayMemory = null;
	cachedDataViewMemory = null;
}
