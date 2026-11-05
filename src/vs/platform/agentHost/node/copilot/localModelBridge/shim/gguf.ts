/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';

/* Minimal, bounded GGUF header reader: reads only the metadata the memory estimate needs, with hard caps against hostile or corrupt files. */

/** Random-access bytes of a GGUF file. */
export interface IGgufByteSource {
	readonly size: number;
	/** Reads up to `length` bytes at `offset`; may return fewer at end of file. */
	read(offset: number, length: number): Promise<Uint8Array>;
}

/** Architecture facts used for the memory estimate. */
export interface IGgufModelMetadata {
	readonly architecture: string;
	readonly blockCount: number;
	readonly embeddingLength: number;
	readonly headCount: number;
	/** Scalar, or one value per layer. */
	readonly headCountKv: number | readonly number[];
	readonly keyLength: number;
	readonly valueLength: number;
	/** Training context length, when present. */
	readonly contextLength?: number;
	/** `attention.sliding_window`: the window of the sliding-window-attention (SWA) layers. */
	readonly slidingWindow?: number;
	/**
	 * Per layer, whether it uses sliding-window attention (from `attention.sliding_window_pattern`); absent when no SWA
	 * layer is known, so every attention layer counts as full attention.
	 */
	readonly slidingWindowLayers?: readonly boolean[];
	/** `attention.key_length_swa` / `attention.value_length_swa`, when the SWA layers differ. */
	readonly keyLengthSwa?: number;
	readonly valueLengthSwa?: number;
	/** `full_attention_interval`: hybrid models where only every `n`-th layer has attention; the others are recurrent. */
	readonly fullAttentionInterval?: number;
	/** Recurrent (SSM / gated delta net) state sizes, from `ssm.*`. */
	readonly ssm?: IGgufRecurrentState;
	/** Number of tokens in the vocabulary (`tokenizer.ggml.tokens`). */
	readonly vocabSize?: number;
	/** `tokenizer.chat_template`, when present and at most {@link CHAT_TEMPLATE_MAX_LENGTH}. Never executed. */
	readonly chatTemplate?: string;
}

/** `ssm.*` sizes of a recurrent layer. */
export interface IGgufRecurrentState {
	readonly convKernel: number;
	readonly stateSize: number;
	readonly groupCount: number;
	readonly innerSize: number;
}

/** Longest `tokenizer.chat_template` kept, in characters. */
export const CHAT_TEMPLATE_MAX_LENGTH = 1024 * 1024;

export class GgufFormatError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'GgufFormatError';
	}
}

/** The bytes ended before the value being read: more of the file (a longer prefix) may complete it. */
export class GgufTruncatedError extends GgufFormatError {
	constructor() {
		super('Unexpected end of GGUF file');
		this.name = 'GgufTruncatedError';
	}
}

/** Caps applied while reading a header. */
export const GGUF_LIMITS = {
	maxHeaderBytes: 64 * 1024 * 1024,
	maxKeyValueCount: 65_536,
	maxKeyBytes: 1024,
	maxStringBytes: 4 * 1024 * 1024,
	maxArrayLength: 16 * 1024 * 1024,
	readChunkBytes: 1024 * 1024,
} as const;

const GGUF_MAGIC = 0x46554747; // 'GGUF' little endian

const enum GgufType {
	Uint8 = 0,
	Int8 = 1,
	Uint16 = 2,
	Int16 = 3,
	Uint32 = 4,
	Int32 = 5,
	Float32 = 6,
	Bool = 7,
	String = 8,
	Array = 9,
	Uint64 = 10,
	Int64 = 11,
	Float64 = 12,
}

const FIXED_SIZES: Readonly<Record<number, number>> = {
	[GgufType.Uint8]: 1, [GgufType.Int8]: 1, [GgufType.Bool]: 1,
	[GgufType.Uint16]: 2, [GgufType.Int16]: 2,
	[GgufType.Uint32]: 4, [GgufType.Int32]: 4, [GgufType.Float32]: 4,
	[GgufType.Uint64]: 8, [GgufType.Int64]: 8, [GgufType.Float64]: 8,
};

class BoundedReader {
	private _buffer: Uint8Array = new Uint8Array(0);
	private _bufferStart = 0;
	position = 0;

	constructor(private readonly _source: IGgufByteSource) { }

	private async _ensure(length: number): Promise<void> {
		const end = this.position + length;
		if (end > GGUF_LIMITS.maxHeaderBytes) {
			throw new GgufFormatError('GGUF header exceeds the size cap');
		}
		if (end > this._source.size) {
			throw new GgufTruncatedError();
		}
		if (this.position >= this._bufferStart && end <= this._bufferStart + this._buffer.byteLength) {
			return;
		}
		const readLength = Math.max(length, GGUF_LIMITS.readChunkBytes);
		const bytes = await this._source.read(this.position, Math.min(readLength, this._source.size - this.position));
		if (bytes.byteLength < length) {
			throw new GgufTruncatedError();
		}
		this._buffer = bytes;
		this._bufferStart = this.position;
	}

	private async _view(length: number): Promise<DataView> {
		await this._ensure(length);
		const offset = this.position - this._bufferStart;
		this.position += length;
		return new DataView(this._buffer.buffer, this._buffer.byteOffset + offset, length);
	}

	async u32(): Promise<number> {
		return (await this._view(4)).getUint32(0, true);
	}

	async u64(): Promise<number> {
		const value = (await this._view(8)).getBigUint64(0, true);
		if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
			throw new GgufFormatError('GGUF integer out of range');
		}
		return Number(value);
	}

	async scalar(type: number): Promise<number | boolean> {
		const size = FIXED_SIZES[type];
		const view = await this._view(size);
		switch (type) {
			case GgufType.Uint8: return view.getUint8(0);
			case GgufType.Int8: return view.getInt8(0);
			case GgufType.Bool: return view.getUint8(0) !== 0;
			case GgufType.Uint16: return view.getUint16(0, true);
			case GgufType.Int16: return view.getInt16(0, true);
			case GgufType.Uint32: return view.getUint32(0, true);
			case GgufType.Int32: return view.getInt32(0, true);
			case GgufType.Float32: return view.getFloat32(0, true);
			case GgufType.Float64: return view.getFloat64(0, true);
			case GgufType.Uint64:
			case GgufType.Int64: {
				const value = type === GgufType.Uint64 ? view.getBigUint64(0, true) : view.getBigInt64(0, true);
				if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
					throw new GgufFormatError('GGUF integer out of range');
				}
				return Number(value);
			}
		}
		throw new GgufFormatError(`Unknown GGUF scalar type ${type}`);
	}

	async string(maxBytes: number): Promise<string> {
		const length = await this.u64();
		if (length > maxBytes) {
			throw new GgufFormatError('GGUF string exceeds the size cap');
		}
		await this._ensure(length);
		const offset = this.position - this._bufferStart;
		this.position += length;
		return new TextDecoder('utf-8', { fatal: false }).decode(this._buffer.subarray(offset, offset + length));
	}

	async skipString(): Promise<void> {
		const length = await this.u64();
		if (length > GGUF_LIMITS.maxStringBytes) {
			throw new GgufFormatError('GGUF string exceeds the size cap');
		}
		this.skip(length);
	}

	skip(length: number): void {
		if (this.position + length > GGUF_LIMITS.maxHeaderBytes) {
			throw new GgufFormatError('GGUF header exceeds the size cap');
		}
		if (this.position + length > this._source.size) {
			throw new GgufTruncatedError();
		}
		this.position += length;
	}
}

/** A kept string array: only its length (its strings are skipped, never materialized). */
class GgufStringArray {
	constructor(readonly length: number) { }
}

type GgufValue = number | boolean | string | readonly number[] | GgufStringArray | undefined;

/** A llama.cpp architecture name; may contain hyphens (`gpt-oss`, `command-r`, `maion-coder`). */
const ARCHITECTURE_NAME = '[a-z0-9][a-z0-9_-]{0,63}';
const WANTED_ARCHITECTURE_KEY = new RegExp(`^${ARCHITECTURE_NAME}\\.(block_count|embedding_length|context_length|full_attention_interval|attention\\.(head_count|head_count_kv|key_length|value_length|key_length_swa|value_length_swa|sliding_window|sliding_window_pattern)|ssm\\.(conv_kernel|state_size|group_count|inner_size))$`);
const TOKENS_KEY = 'tokenizer.ggml.tokens';
const CHAT_TEMPLATE_KEY = 'tokenizer.chat_template';

function isWantedKey(key: string): boolean {
	return key === 'general.architecture' || key === TOKENS_KEY || key === CHAT_TEMPLATE_KEY || WANTED_ARCHITECTURE_KEY.test(key);
}

async function readValue(reader: BoundedReader, type: number, keep: boolean): Promise<GgufValue> {
	if (type === GgufType.String) {
		if (keep) {
			return reader.string(GGUF_LIMITS.maxStringBytes);
		}
		await reader.skipString();
		return undefined;
	}
	if (type === GgufType.Array) {
		const elementType = await reader.u32();
		const count = await reader.u64();
		if (count > GGUF_LIMITS.maxArrayLength) {
			throw new GgufFormatError('GGUF array exceeds the length cap');
		}
		if (elementType === GgufType.String) {
			for (let i = 0; i < count; i++) {
				await reader.skipString();
			}
			return keep ? new GgufStringArray(count) : undefined;
		}
		const size = FIXED_SIZES[elementType];
		if (size === undefined) {
			throw new GgufFormatError('Unsupported GGUF array element type');
		}
		if (!keep || count > 4096) {
			reader.skip(size * count);
			return undefined;
		}
		const values: number[] = [];
		for (let i = 0; i < count; i++) {
			const value = await reader.scalar(elementType);
			values.push(typeof value === 'boolean' ? Number(value) : value);
		}
		return values;
	}
	if (FIXED_SIZES[type] === undefined) {
		throw new GgufFormatError(`Unknown GGUF value type ${type}`);
	}
	const value = await reader.scalar(type);
	return keep ? value : undefined;
}

function positiveInteger(value: GgufValue): number | undefined {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/** Magic, version (2 or 3) and tensor count; returns the metadata key/value count. */
async function readPreamble(reader: BoundedReader): Promise<number> {
	if (await reader.u32() !== GGUF_MAGIC) {
		throw new GgufFormatError('Not a GGUF file');
	}
	const version = await reader.u32();
	if (version !== 2 && version !== 3) {
		throw new GgufFormatError(`Unsupported GGUF version ${version}`);
	}
	await reader.u64(); // tensor count
	const kvCount = await reader.u64();
	if (kvCount > GGUF_LIMITS.maxKeyValueCount) {
		throw new GgufFormatError('GGUF metadata count exceeds the cap');
	}
	return kvCount;
}

/** Reads the KV-cache-relevant metadata from a GGUF header (v2 or v3); throws {@link GgufFormatError} for malformed, oversized or incomplete headers. */
export async function readGgufModelMetadata(source: IGgufByteSource): Promise<IGgufModelMetadata> {
	const reader = new BoundedReader(source);
	const kvCount = await readPreamble(reader);
	const values = new Map<string, GgufValue>();
	for (let i = 0; i < kvCount; i++) {
		const key = await reader.string(GGUF_LIMITS.maxKeyBytes);
		const type = await reader.u32();
		const keep = isWantedKey(key);
		const value = await readValue(reader, type, keep);
		if (keep) {
			values.set(key, value);
		}
	}

	const architecture = values.get('general.architecture');
	if (typeof architecture !== 'string' || !new RegExp(`^${ARCHITECTURE_NAME}$`).test(architecture)) {
		throw new GgufFormatError('GGUF header has no valid general.architecture');
	}
	const get = (suffix: string) => values.get(`${architecture}.${suffix}`);
	const blockCount = positiveInteger(get('block_count'));
	const embeddingLength = positiveInteger(get('embedding_length'));
	const headCount = positiveInteger(get('attention.head_count'));
	if (!blockCount || !embeddingLength || !headCount) {
		throw new GgufFormatError('GGUF header is missing block_count, embedding_length or attention.head_count');
	}
	const rawHeadCountKv = get('attention.head_count_kv');
	let headCountKv: number | readonly number[] = headCount;
	if (Array.isArray(rawHeadCountKv)) {
		if (rawHeadCountKv.some(value => !Number.isSafeInteger(value) || value < 0)) {
			throw new GgufFormatError('GGUF head_count_kv array is invalid');
		}
		headCountKv = rawHeadCountKv;
	} else if (rawHeadCountKv !== undefined) {
		const scalar = positiveInteger(rawHeadCountKv);
		if (!scalar) {
			throw new GgufFormatError('GGUF head_count_kv is invalid');
		}
		headCountKv = scalar;
	}
	const defaultHeadLength = Math.floor(embeddingLength / headCount);
	const contextLength = positiveInteger(get('context_length'));
	const slidingWindow = positiveInteger(get('attention.sliding_window'));
	const slidingWindowLayers = slidingWindow ? readSlidingWindowLayers(get('attention.sliding_window_pattern'), blockCount) : undefined;
	const keyLengthSwa = positiveInteger(get('attention.key_length_swa'));
	const valueLengthSwa = positiveInteger(get('attention.value_length_swa'));
	const fullAttentionInterval = positiveInteger(get('full_attention_interval'));
	const convKernel = positiveInteger(get('ssm.conv_kernel'));
	const stateSize = positiveInteger(get('ssm.state_size'));
	const innerSize = positiveInteger(get('ssm.inner_size'));
	const groupCount = positiveInteger(get('ssm.group_count')) ?? 0;
	const tokens = values.get(TOKENS_KEY);
	const vocabSize = tokens instanceof GgufStringArray ? positiveInteger(tokens.length) : undefined;
	const chatTemplate = values.get(CHAT_TEMPLATE_KEY);
	return {
		architecture,
		blockCount,
		embeddingLength,
		headCount,
		headCountKv,
		keyLength: positiveInteger(get('attention.key_length')) ?? defaultHeadLength,
		valueLength: positiveInteger(get('attention.value_length')) ?? defaultHeadLength,
		...(contextLength ? { contextLength } : {}),
		...(slidingWindow && slidingWindowLayers ? { slidingWindow, slidingWindowLayers } : {}),
		...(keyLengthSwa ? { keyLengthSwa } : {}),
		...(valueLengthSwa ? { valueLengthSwa } : {}),
		...(fullAttentionInterval ? { fullAttentionInterval } : {}),
		...(convKernel && stateSize && innerSize ? { ssm: { convKernel, stateSize, groupCount, innerSize } } : {}),
		...(vocabSize ? { vocabSize } : {}),
		...(typeof chatTemplate === 'string' && chatTemplate.length <= CHAT_TEMPLATE_MAX_LENGTH ? { chatTemplate } : {}),
	};
}

/**
 * Which layers use sliding-window attention: a per-layer bool array (`true`
 * is SWA; layers past its end are full attention), or llama.cpp's period `n`
 * (`set_swa_pattern`: layer `il` is SWA when `il % n < n - 1`, so every `n`-th
 * layer is full). Anything else is unknown (`undefined`). Pure.
 */
function readSlidingWindowLayers(pattern: GgufValue, blockCount: number): readonly boolean[] | undefined {
	if (Array.isArray(pattern)) {
		return Array.from({ length: blockCount }, (_, layer) => layer < pattern.length && pattern[layer] !== 0);
	}
	const period = positiveInteger(pattern);
	return period ? Array.from({ length: blockCount }, (_, layer) => layer % period < period - 1) : undefined;
}

// #region Architecture only

/** Why `general.architecture` could not be read: the bytes ended (`truncated`) or the read cap was reached (`overCap`) first, the header is `invalid`, or reading failed. */
export type GgufArchitectureUnknownReason = 'truncated' | 'overCap' | 'invalid' | 'unreadable' | 'network' | 'http' | 'urlPolicy' | 'accessExpired';

/** `general.architecture` of a GGUF, or why it is unknown (an unknown architecture never blocks anything). */
export type GgufArchitectureRead =
	| { readonly kind: 'found'; readonly architecture: string }
	| { readonly kind: 'unknown'; readonly reason: GgufArchitectureUnknownReason };

/** Longest `general.architecture` value read, in bytes. */
const ARCHITECTURE_VALUE_MAX_BYTES = 256;

/**
 * Reads only `general.architecture`, skipping other values without materializing them. Safe on a file prefix: throws
 * {@link GgufTruncatedError} when `source` ends first and {@link GgufFormatError} for a malformed or missing value.
 * Callers validate the returned value.
 */
export async function readGgufArchitecture(source: IGgufByteSource): Promise<string> {
	const reader = new BoundedReader(source);
	const kvCount = await readPreamble(reader);
	for (let i = 0; i < kvCount; i++) {
		const key = await reader.string(GGUF_LIMITS.maxKeyBytes);
		const type = await reader.u32();
		if (key === 'general.architecture') {
			if (type !== GgufType.String) {
				throw new GgufFormatError('GGUF general.architecture is not a string');
			}
			return reader.string(ARCHITECTURE_VALUE_MAX_BYTES);
		}
		await readValue(reader, type, false);
	}
	throw new GgufFormatError('GGUF header has no general.architecture');
}

/** {@link readGgufArchitecture} over a prefix of a `fileSize`-byte file: `needMore` when the prefix ends before the value and the file is longer. Pure. */
export async function readGgufArchitectureFromPrefix(prefix: Uint8Array, fileSize: number): Promise<GgufArchitectureRead | { readonly kind: 'needMore' }> {
	try {
		const architecture = await readGgufArchitecture({ size: prefix.byteLength, read: async (offset, length) => prefix.subarray(offset, offset + length) });
		return { kind: 'found', architecture };
	} catch (error) {
		if (error instanceof GgufTruncatedError && prefix.byteLength < fileSize) {
			return { kind: 'needMore' };
		}
		return { kind: 'unknown', reason: error instanceof GgufTruncatedError ? 'truncated' : 'invalid' };
	}
}

/** Default `general.alignment` of a GGUF file. */
const GGUF_DEFAULT_ALIGNMENT = 32;

/** A tensor-less GGUF v3 file holding only string metadata, padded to the default alignment; the architecture probe uses one instead of a real model. Pure. */
export function buildSyntheticGguf(metadata: Readonly<Record<string, string>>): Uint8Array {
	const encoder = new TextEncoder();
	const entries = Object.entries(metadata).map(([key, value]) => [encoder.encode(key), encoder.encode(value)] as const);
	// Magic, version, tensor count and key/value count; then per entry: key, type, value.
	const size = 24 + entries.reduce((sum, [key, value]) => sum + 8 + key.byteLength + 4 + 8 + value.byteLength, 0);
	const bytes = new Uint8Array(Math.ceil(size / GGUF_DEFAULT_ALIGNMENT) * GGUF_DEFAULT_ALIGNMENT);
	const view = new DataView(bytes.buffer);
	let offset = 0;
	const u32 = (value: number) => {
		view.setUint32(offset, value, true);
		offset += 4;
	};
	const u64 = (value: number) => {
		view.setBigUint64(offset, BigInt(value), true);
		offset += 8;
	};
	const string = (value: Uint8Array) => {
		u64(value.byteLength);
		bytes.set(value, offset);
		offset += value.byteLength;
	};
	u32(GGUF_MAGIC);
	u32(3);
	u64(0);
	u64(entries.length);
	for (const [key, value] of entries) {
		string(key);
		u32(GgufType.String);
		string(value);
	}
	return bytes;
}

// #endregion

// #region Memory estimate

/** How a layer's cache behaves: grows with the context, is bounded by the window, is a fixed recurrent state, or is absent. */
type GgufLayerKind = 'full' | 'swa' | 'recurrent' | 'none';

/** llama.cpp pads KV cache sizes to 256 cells. */
const KV_CELL_PADDING = 256;
/** llama.cpp's default `--ubatch-size`. */
export const LLAMA_DEFAULT_UBATCH = 512;
/** llama.cpp's default `--batch-size`. */
export const LLAMA_DEFAULT_BATCH = 2048;
/** Vocabulary assumed when the header has none (conservative: larger than common vocabularies). */
const DEFAULT_VOCAB_SIZE = 262_144;
/** Activation rows per ubatch token in the compute-buffer estimate, in units of `embedding_length` f32 values. */
const COMPUTE_ACTIVATION_ROWS = 8;
const F32_BYTES = 4;

function padCells(cells: number): number {
	return Math.ceil(cells / KV_CELL_PADDING) * KV_CELL_PADDING;
}

function headsPerLayer(metadata: IGgufModelMetadata): readonly number[] {
	const heads = metadata.headCountKv;
	if (typeof heads === 'number') {
		return new Array<number>(metadata.blockCount).fill(heads);
	}
	return heads.length === metadata.blockCount ? heads : new Array<number>(metadata.blockCount).fill(Math.max(0, ...heads));
}

/**
 * Classifies every layer like llama.cpp: with `full_attention_interval` n,
 * layer `il` has attention when `(il + 1) % n == 0` and is recurrent
 * otherwise; a layer without KV heads is recurrent when the model has
 * `ssm.*` state and has no cache otherwise; an attention layer is SWA when
 * the pattern says so. Pure.
 */
function layerKinds(metadata: IGgufModelMetadata): GgufLayerKind[] {
	const heads = headsPerLayer(metadata);
	return heads.map((count, layer): GgufLayerKind => {
		const recurrent = metadata.fullAttentionInterval
			? (layer + 1) % metadata.fullAttentionInterval !== 0
			: count === 0 && !!metadata.ssm;
		if (recurrent) {
			return metadata.ssm ? 'recurrent' : 'none';
		}
		if (count === 0) {
			return 'none';
		}
		return metadata.slidingWindow && metadata.slidingWindowLayers?.[layer] ? 'swa' : 'full';
	});
}

/** Options of the memory estimate, from the launch arguments. */
export interface IGgufMemoryOptions {
	/** Effective `--ubatch-size` (llama.cpp: at most `--batch-size`). Defaults to {@link LLAMA_DEFAULT_UBATCH}. */
	readonly ubatchTokens?: number;
	/** `--parallel` sequences (separate KV streams). Defaults to 1. */
	readonly parallel?: number;
	/** Bytes per K/V element: 2 for the default f16 cache. */
	readonly bytesPerElement?: number;
}

/** The context-dependent and fixed buffers of a served model, besides its weights. */
export interface IGgufMemoryEstimate {
	/** Full-attention KV cache: grows with the context. */
	readonly kvBytes: number;
	/** Sliding-window KV cache: `min(ctx, window + ubatch)` cells per sequence, padded to 256. */
	readonly swaBytes: number;
	/** Recurrent state (f32), fixed per sequence. */
	readonly recurrentBytes: number;
	/** Compute buffers: the logits of one ubatch plus activations. */
	readonly computeBytes: number;
}

/** Whether the model has recurrent layers, whose fixed state can't be rolled back: llama.cpp reuses their cache across turns only from a checkpoint. Pure. */
export function hasRecurrentLayers(metadata: IGgufModelMetadata): boolean {
	return layerKinds(metadata).includes('recurrent');
}

/**
 * The memory llama.cpp allocates besides the weights for `ctxTokens` of total
 * context (`--ctx-size` is the shared pool split across `--parallel` slots),
 * matching its sizing:
 * - full-attention layers: `pad256(ctx)` cells;
 * - SWA layers (`llama_kv_cache_iswa`): `pad256(min(ctx / parallel, window + ubatch))`
 *   cells per sequence;
 * - recurrent layers: `(conv_kernel - 1) * (inner + 2 * groups * state) + state * inner`
 *   f32 values per sequence, and no per-token cache;
 * - compute: the f32 logits of one ubatch (`vocab * ubatch`) plus
 *   {@link COMPUTE_ACTIVATION_ROWS} activation rows of `embedding_length` per ubatch token.
 * Pure.
 */
export function estimateContextMemory(metadata: IGgufModelMetadata, ctxTokens: number, options: IGgufMemoryOptions = {}): IGgufMemoryEstimate {
	const bytesPerElement = options.bytesPerElement ?? 2;
	const ubatch = Math.max(1, options.ubatchTokens ?? LLAMA_DEFAULT_UBATCH);
	const streams = Math.max(1, options.parallel ?? 1);
	const heads = headsPerLayer(metadata);
	const kinds = layerKinds(metadata);
	const fullCells = padCells(ctxTokens);
	const swaCells = metadata.slidingWindow ? padCells(Math.min(Math.ceil(ctxTokens / streams), metadata.slidingWindow + ubatch)) * streams : 0;
	const ssm = metadata.ssm;
	const recurrentValues = ssm ? (ssm.convKernel - 1) * (ssm.innerSize + 2 * ssm.groupCount * ssm.stateSize) + ssm.stateSize * ssm.innerSize : 0;
	let kvBytes = 0;
	let swaBytes = 0;
	let recurrentBytes = 0;
	kinds.forEach((kind, layer) => {
		switch (kind) {
			case 'full':
				kvBytes += heads[layer] * (metadata.keyLength + metadata.valueLength) * bytesPerElement * fullCells;
				break;
			case 'swa':
				swaBytes += heads[layer] * ((metadata.keyLengthSwa ?? metadata.keyLength) + (metadata.valueLengthSwa ?? metadata.valueLength)) * bytesPerElement * swaCells;
				break;
			case 'recurrent':
				recurrentBytes += recurrentValues * F32_BYTES * streams;
				break;
		}
	});
	const computeBytes = ((metadata.vocabSize ?? DEFAULT_VOCAB_SIZE) + COMPUTE_ACTIVATION_ROWS * metadata.embeddingLength) * ubatch * F32_BYTES;
	return { kvBytes, swaBytes, recurrentBytes, computeBytes };
}

/** Everything {@link estimateContextMemory} counts, in bytes. Pure. */
export function estimateContextMemoryBytes(metadata: IGgufModelMetadata, ctxTokens: number, options: IGgufMemoryOptions = {}): number {
	const estimate = estimateContextMemory(metadata, ctxTokens, options);
	return estimate.kvBytes + estimate.swaBytes + estimate.recurrentBytes + estimate.computeBytes;
}

// #endregion

/** Opens `filePath` as an {@link IGgufByteSource}; the caller closes it. */
export async function openGgufFile(filePath: string): Promise<IGgufByteSource & { close(): Promise<void> }> {
	const handle = await fs.promises.open(filePath, 'r');
	try {
		const { size } = await handle.stat();
		return {
			size,
			read: async (offset, length) => {
				const buffer = new Uint8Array(length);
				const { bytesRead } = await handle.read(buffer, 0, length, offset);
				return buffer.subarray(0, bytesRead);
			},
			close: () => handle.close(),
		};
	} catch (error) {
		await handle.close();
		throw error;
	}
}

/** Reads the metadata from a local GGUF file. */
export async function readGgufModelMetadataFromFile(filePath: string): Promise<IGgufModelMetadata> {
	const source = await openGgufFile(filePath);
	try {
		return await readGgufModelMetadata(source);
	} finally {
		await source.close();
	}
}

/** Reads `general.architecture` from a local GGUF (or the prefix a partial download wrote), looking at most at its first `maxBytes`; never throws. */
export async function readGgufArchitectureFromFile(filePath: string, maxBytes: number): Promise<GgufArchitectureRead> {
	let source: IGgufByteSource & { close(): Promise<void> };
	try {
		source = await openGgufFile(filePath);
	} catch {
		return { kind: 'unknown', reason: 'unreadable' };
	}
	try {
		const limit = Math.min(source.size, maxBytes);
		const architecture = await readGgufArchitecture({ size: limit, read: (offset, length) => source.read(offset, Math.min(length, limit - offset)) });
		return { kind: 'found', architecture };
	} catch (error) {
		if (error instanceof GgufTruncatedError) {
			return { kind: 'unknown', reason: source.size > maxBytes ? 'overCap' : 'truncated' };
		}
		return { kind: 'unknown', reason: error instanceof GgufFormatError ? 'invalid' : 'unreadable' };
	} finally {
		await source.close().catch(() => undefined);
	}
}
