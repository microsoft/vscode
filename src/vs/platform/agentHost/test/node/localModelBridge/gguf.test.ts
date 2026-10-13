/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildSyntheticGguf, estimateContextMemory, estimateContextMemoryBytes, GGUF_LIMITS, hasRecurrentLayers, readGgufArchitecture, readGgufArchitectureFromFile, readGgufArchitectureFromPrefix, readGgufModelMetadata, type IGgufByteSource, type IGgufModelMetadata } from '../../../node/copilot/localModelBridge/shim/gguf.js';
import { computeFootprintBytes } from '../../../node/copilot/localModelBridge/shim/servingProfile.js';

type GgufTestValue =
	| { readonly type: 'u32'; readonly value: number }
	| { readonly type: 'u64'; readonly value: number }
	| { readonly type: 'f32'; readonly value: number }
	| { readonly type: 'bool'; readonly value: boolean }
	| { readonly type: 'string'; readonly value: string }
	| { readonly type: 'stringArray'; readonly value: readonly string[] }
	| { readonly type: 'i32Array'; readonly value: readonly number[] }
	| { readonly type: 'f32Array'; readonly value: readonly number[] }
	| { readonly type: 'boolArray'; readonly value: readonly boolean[] };

/** Builds a synthetic GGUF v3 header. */
function buildGguf(entries: readonly (readonly [string, GgufTestValue])[], options: { readonly magic?: number; readonly version?: number; readonly kvCount?: number } = {}): Uint8Array {
	const parts: Buffer[] = [];
	const u32 = (value: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(value); parts.push(b); };
	const u64 = (value: number) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(value)); parts.push(b); };
	const str = (value: string) => { const bytes = Buffer.from(value, 'utf8'); u64(bytes.length); parts.push(bytes); };
	u32(options.magic ?? 0x46554747);
	u32(options.version ?? 3);
	u64(1);
	u64(options.kvCount ?? entries.length);
	for (const [key, value] of entries) {
		str(key);
		switch (value.type) {
			case 'u32': u32(4); u32(value.value); break;
			case 'u64': u32(10); u64(value.value); break;
			case 'f32': { u32(6); const b = Buffer.alloc(4); b.writeFloatLE(value.value); parts.push(b); break; }
			case 'bool': u32(7); parts.push(Buffer.from([value.value ? 1 : 0])); break;
			case 'string': u32(8); str(value.value); break;
			case 'stringArray': u32(9); u32(8); u64(value.value.length); value.value.forEach(str); break;
			case 'i32Array': { u32(9); u32(5); u64(value.value.length); for (const v of value.value) { const b = Buffer.alloc(4); b.writeInt32LE(v); parts.push(b); } break; }
			case 'f32Array': { u32(9); u32(6); u64(value.value.length); for (const v of value.value) { const b = Buffer.alloc(4); b.writeFloatLE(v); parts.push(b); } break; }
			case 'boolArray': u32(9); u32(7); u64(value.value.length); parts.push(Buffer.from(value.value.map(v => v ? 1 : 0))); break;
		}
	}
	return new Uint8Array(Buffer.concat(parts));
}

function source(bytes: Uint8Array): IGgufByteSource & { readonly reads: number[] } {
	const reads: number[] = [];
	return {
		size: bytes.byteLength,
		reads,
		read: async (offset, length) => {
			reads.push(length);
			return bytes.subarray(offset, offset + length);
		},
	};
}

async function readError(bytes: Uint8Array): Promise<string> {
	try {
		await readGgufModelMetadata(source(bytes));
		return 'no error';
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

const QWEN_LIKE: readonly (readonly [string, GgufTestValue])[] = [
	['general.architecture', { type: 'string', value: 'qwen3' }],
	['general.name', { type: 'string', value: 'Synthetic' }],
	['tokenizer.ggml.tokens', { type: 'stringArray', value: ['<s>', '</s>', 'hello', 'world'] }],
	['tokenizer.ggml.scores', { type: 'f32Array', value: [0, 0, -1.5, -2] }],
	['tokenizer.chat_template', { type: 'string', value: '{% for m in messages %}{{ m.content }}{% endfor %}' }],
	['qwen3.block_count', { type: 'u32', value: 48 }],
	['qwen3.context_length', { type: 'u32', value: 262144 }],
	['qwen3.embedding_length', { type: 'u32', value: 4096 }],
	['qwen3.attention.head_count', { type: 'u32', value: 32 }],
	['qwen3.attention.head_count_kv', { type: 'u32', value: 4 }],
	['qwen3.attention.key_length', { type: 'u32', value: 128 }],
	['qwen3.attention.value_length', { type: 'u32', value: 128 }],
	['general.quantized', { type: 'bool', value: true }],
];

suite('localModel gguf', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads the KV-cache metadata from a synthetic header and skips everything else', async () => {
		const metadata = await readGgufModelMetadata(source(buildGguf(QWEN_LIKE)));
		assert.deepStrictEqual({
			metadata,
			kvAt262k: estimateContextMemory(metadata, 262_144).kvBytes,
			kvAt64k: estimateContextMemory(metadata, 65_536).kvBytes,
		}, {
			metadata: { architecture: 'qwen3', blockCount: 48, embeddingLength: 4096, headCount: 32, headCountKv: 4, keyLength: 128, valueLength: 128, contextLength: 262144, vocabSize: 4, chatTemplate: '{% for m in messages %}{{ m.content }}{% endfor %}' },
			// 48 layers × 4 KV heads × (128 + 128) × 2 bytes per token
			kvAt262k: 25_769_803_776,
			kvAt64k: 6_442_450_944,
		});
	});

	test('defaults key/value lengths, and supports per-layer KV head arrays', async () => {
		const metadata = await readGgufModelMetadata(source(buildGguf([
			['general.architecture', { type: 'string', value: 'llama' }],
			['llama.block_count', { type: 'u64', value: 2 }],
			['llama.embedding_length', { type: 'u32', value: 2048 }],
			['llama.attention.head_count', { type: 'u32', value: 16 }],
			['llama.attention.head_count_kv', { type: 'i32Array', value: [8, 0] }],
		])));
		assert.deepStrictEqual({ metadata, kvAt256: estimateContextMemory(metadata, 256).kvBytes }, {
			metadata: { architecture: 'llama', blockCount: 2, embeddingLength: 2048, headCount: 16, headCountKv: [8, 0], keyLength: 128, valueLength: 128 },
			kvAt256: 8 * 256 * 2 * 256,
		});
	});

	test('reads sliding-window patterns (bool array and period), hybrid intervals, recurrent state and the chat template', async () => {
		const header = async (architecture: string, extra: readonly (readonly [string, GgufTestValue])[]) => {
			const { slidingWindow, slidingWindowLayers, keyLengthSwa, valueLengthSwa, fullAttentionInterval, ssm, vocabSize, chatTemplate } = await readGgufModelMetadata(source(buildGguf([
				['general.architecture', { type: 'string', value: architecture }],
				[`${architecture}.block_count`, { type: 'u32', value: 6 }],
				[`${architecture}.embedding_length`, { type: 'u32', value: 1024 }],
				[`${architecture}.attention.head_count`, { type: 'u32', value: 8 }],
				[`${architecture}.attention.head_count_kv`, { type: 'u32', value: 2 }],
				...extra,
			])));
			// Only the fields added for the memory estimate and the thinking detection.
			return JSON.parse(JSON.stringify({ slidingWindow, slidingWindowLayers, keyLengthSwa, valueLengthSwa, fullAttentionInterval, ssm, vocabSize, chatTemplate }));
		};
		const boolPattern = await header('maion-coder', [
			['maion-coder.attention.sliding_window', { type: 'u32', value: 512 }],
			['maion-coder.attention.sliding_window_pattern', { type: 'boolArray', value: [true, true, false, true] }],
			['tokenizer.ggml.tokens', { type: 'stringArray', value: ['a', 'b', 'c'] }],
			['tokenizer.chat_template', { type: 'string', value: '{{ "Reasoning: " + reasoning_effort }}' }],
		]);
		const periodPattern = await header('gemma3', [
			['gemma3.attention.sliding_window', { type: 'u32', value: 1024 }],
			['gemma3.attention.sliding_window_pattern', { type: 'u32', value: 3 }],
			['gemma3.attention.key_length_swa', { type: 'u32', value: 64 }],
		]);
		const hybrid = await header('qwen35', [
			['qwen35.full_attention_interval', { type: 'u32', value: 4 }],
			['qwen35.ssm.conv_kernel', { type: 'u32', value: 4 }],
			['qwen35.ssm.state_size', { type: 'u32', value: 128 }],
			['qwen35.ssm.group_count', { type: 'u32', value: 16 }],
			['qwen35.ssm.inner_size', { type: 'u32', value: 4096 }],
		]);
		const windowWithoutPattern = await header('mistral', [
			['mistral.attention.sliding_window', { type: 'u32', value: 4096 }],
		]);
		assert.deepStrictEqual({ boolPattern, periodPattern, hybrid, windowWithoutPattern }, {
			// Layers past the end of the array are full attention.
			boolPattern: { slidingWindow: 512, slidingWindowLayers: [true, true, false, true, false, false], vocabSize: 3, chatTemplate: '{{ "Reasoning: " + reasoning_effort }}' },
			// llama.cpp `set_swa_pattern(3)`: every third layer is full attention.
			periodPattern: { slidingWindow: 1024, slidingWindowLayers: [true, true, false, true, true, false], keyLengthSwa: 64 },
			hybrid: { fullAttentionInterval: 4, ssm: { convKernel: 4, stateSize: 128, groupCount: 16, innerSize: 4096 } },
			// A window without a known pattern: every layer counts as full attention (conservative).
			windowWithoutPattern: {},
		});
	});

	test('reproduces the measured llama.cpp memory of Example Flash and Qwen3.5 4B within 10%, never below', () => {
		const MiB = 1024 * 1024;
		// `llama-fit-params -c <ctx> -fa on -ngl 999 -ub 2048 -b 2048` on an N1X: projected device memory (MiB).
		const models: { readonly name: string; readonly weights: number; readonly metadata: IGgufModelMetadata; readonly measured: readonly number[] }[] = [{
			name: 'exampleFlash',
			weights: 56_307_620_832,
			measured: [56_346, 57_242, 59_034, 62_618],
			metadata: {
				architecture: 'maion-coder', blockCount: 42, embeddingLength: 3584, headCount: 48, headCountKv: 8, keyLength: 128, valueLength: 128, contextLength: 262_145,
				// 35 SWA layers; every sixth layer is full attention.
				slidingWindow: 512, slidingWindowLayers: Array.from({ length: 42 }, (_, layer) => layer % 6 !== 5), vocabSize: 201_088,
			},
		}, {
			name: 'qwen35',
			weights: 2_740_937_888,
			measured: [5_805, 6_917, 8_729, 12_825],
			metadata: {
				architecture: 'qwen35', blockCount: 32, embeddingLength: 2560, headCount: 16, headCountKv: 4, keyLength: 256, valueLength: 256, contextLength: 262_144,
				fullAttentionInterval: 4, ssm: { convKernel: 4, stateSize: 128, groupCount: 16, innerSize: 4096 }, vocabSize: 248_320,
			},
		}];
		const contexts = [32_768, 65_536, 131_072, 262_144];
		const table = Object.fromEntries(models.map(model => [model.name, contexts.map((ctx, index) => {
			const estimate = estimateContextMemory(model.metadata, ctx, { ubatchTokens: 2048 });
			const footprint = computeFootprintBytes({ primaryBytes: model.weights, draftBytes: 0, contextBytes: estimateContextMemoryBytes(model.metadata, ctx, { ubatchTokens: 2048 }) });
			const ratio = footprint / MiB / model.measured[index];
			return { ctx, kvMiB: estimate.kvBytes / MiB, swaMiB: estimate.swaBytes / MiB, recurrentMiB: estimate.recurrentBytes / MiB, totalMiB: Math.round(footprint / MiB), measuredMiB: model.measured[index], conservativeWithin10Percent: ratio >= 1 && ratio <= 1.1 };
		})]));
		const row = (ctx: number, kvMiB: number, swaMiB: number, recurrentMiB: number, totalMiB: number, measuredMiB: number) => ({ ctx, kvMiB, swaMiB, recurrentMiB, totalMiB, measuredMiB, conservativeWithin10Percent: true });
		assert.deepStrictEqual({
			table,
			// The SWA cache follows the ubatch: 1024 cells at llama.cpp's default 512.
			exampleFlashSwaAtDefaultUbatchMiB: estimateContextMemory(models[0].metadata, 131_072).swaBytes / MiB,
		}, {
			table: {
				exampleFlash: [row(32_768, 896, 350, 0, 58_131, 56_346), row(65_536, 1_792, 350, 0, 59_045, 57_242), row(131_072, 3_584, 350, 0, 60_873, 59_034), row(262_144, 7_168, 350, 0, 64_528, 62_618)],
				qwen35: [row(32_768, 1_024, 0, 50.25, 6_160, 5_805), row(65_536, 2_048, 0, 50.25, 7_204, 6_917), row(131_072, 4_096, 0, 50.25, 9_293, 8_729), row(262_144, 8_192, 0, 50.25, 13_471, 12_825)],
			},
			exampleFlashSwaAtDefaultUbatchMiB: 140,
		});
		// Only Qwen3.5's recurrent layers need a context checkpoint to reuse the cache across turns.
		assert.deepStrictEqual(models.map(model => hasRecurrentLayers(model.metadata)), [false, true]);
	});

	test('reads architectures whose llama.cpp name has a hyphen (MAI maion-coder, gpt-oss); rejects invalid names', async () => {
		const header = (architecture: string) => buildGguf([
			['general.architecture', { type: 'string', value: architecture }],
			[`${architecture}.block_count`, { type: 'u32', value: 42 }],
			[`${architecture}.embedding_length`, { type: 'u32', value: 3584 }],
			[`${architecture}.attention.head_count`, { type: 'u32', value: 48 }],
			[`${architecture}.attention.head_count_kv`, { type: 'u32', value: 8 }],
		]);
		const architectureOf = async (architecture: string) => {
			try {
				return (await readGgufModelMetadata(source(header(architecture)))).architecture;
			} catch (error) {
				return error instanceof Error ? error.message : String(error);
			}
		};
		assert.deepStrictEqual({
			mai: await architectureOf('maion-coder'),
			gptOss: await architectureOf('gpt-oss'),
			upperCase: await architectureOf('Maion-Coder'),
			leadingHyphen: await architectureOf('-coder'),
			dotted: await architectureOf('a.b'),
		}, {
			mai: 'maion-coder',
			gptOss: 'gpt-oss',
			upperCase: 'GGUF header has no valid general.architecture',
			leadingHyphen: 'GGUF header has no valid general.architecture',
			dotted: 'GGUF header has no valid general.architecture',
		});
	});

	test('rejects malformed, truncated and oversized headers', async () => {
		const valid = buildGguf(QWEN_LIKE);
		assert.deepStrictEqual({
			magic: await readError(buildGguf(QWEN_LIKE, { magic: 0x12345678 })),
			version: await readError(buildGguf(QWEN_LIKE, { version: 1 })),
			truncated: await readError(valid.subarray(0, valid.byteLength - 10)),
			tooManyKeys: await readError(buildGguf([], { kvCount: GGUF_LIMITS.maxKeyValueCount + 1 })),
			hugeString: await readError(buildGguf([['general.architecture', { type: 'string', value: 'x'.repeat(GGUF_LIMITS.maxStringBytes + 1) }]])),
			missingArchitecture: await readError(buildGguf(QWEN_LIKE.filter(([key]) => key !== 'general.architecture'))),
			missingBlockCount: await readError(buildGguf(QWEN_LIKE.filter(([key]) => key !== 'qwen3.block_count'))),
		}, {
			magic: 'Not a GGUF file',
			version: 'Unsupported GGUF version 1',
			truncated: 'Unexpected end of GGUF file',
			tooManyKeys: 'GGUF metadata count exceeds the cap',
			hugeString: 'GGUF string exceeds the size cap',
			missingArchitecture: 'GGUF header has no valid general.architecture',
			missingBlockCount: 'GGUF header is missing block_count, embedding_length or attention.head_count',
		});
	});

	test('reads in bounded chunks', async () => {
		const src = source(buildGguf(QWEN_LIKE));
		await readGgufModelMetadata(src);
		assert.ok(src.reads.every(length => length <= GGUF_LIMITS.readChunkBytes));
	});

	test('the synthetic GGUF writer round-trips through the architecture reader: a tensor-less, aligned v3 header', async () => {
		const bytes = buildSyntheticGguf({ 'general.architecture': 'maion-coder' });
		const header = Buffer.from(bytes);
		// 24-byte preamble + key (8 + 20) + type (4) + value (8 + 11) = 75 bytes, padded to 96.
		const prefix = (length: number) => readGgufArchitectureFromPrefix(bytes.subarray(0, length), bytes.byteLength);
		assert.deepStrictEqual({
			length: bytes.byteLength,
			preamble: { magic: header.toString('latin1', 0, 4), version: header.readUInt32LE(4), tensors: Number(header.readBigUInt64LE(8)), keys: Number(header.readBigUInt64LE(16)) },
			padding: [...bytes.subarray(75)].every(byte => byte === 0),
			architecture: await readGgufArchitecture(source(bytes)),
			prefixes: { preamble: await prefix(24), shortValue: await prefix(74), exact: await prefix(75) },
			twoKeys: await readGgufArchitecture(source(buildSyntheticGguf({ 'general.name': 'Probe', 'general.architecture': 'qwen3' }))),
		}, {
			length: 96,
			preamble: { magic: 'GGUF', version: 3, tensors: 0, keys: 1 },
			padding: true,
			architecture: 'maion-coder',
			prefixes: { preamble: { kind: 'needMore' }, shortValue: { kind: 'needMore' }, exact: { kind: 'found', architecture: 'maion-coder' } },
			twoKeys: 'qwen3',
		});
	});

	test('the architecture reader stops at general.architecture, asks for more of a prefix, and rejects malformed headers', async () => {
		const tokens = Array.from({ length: 5000 }, (_, i) => `token-${i}`);
		const late = buildGguf([['tokenizer.ggml.tokens', { type: 'stringArray', value: tokens }], ['general.architecture', { type: 'string', value: 'qwen3' }]]);
		const first = buildGguf(QWEN_LIKE);
		const prefixOf = (bytes: Uint8Array, length: number) => readGgufArchitectureFromPrefix(bytes.subarray(0, length), bytes.byteLength);
		const errorOf = async (bytes: Uint8Array) => readGgufArchitecture(source(bytes)).catch((error: Error) => `${error.name}: ${error.message}`);
		assert.deepStrictEqual({
			firstKey: await prefixOf(first, 69),
			lateShort: await prefixOf(late, 4096),
			lateFull: await prefixOf(late, late.byteLength),
			truncatedFile: await readGgufArchitectureFromPrefix(late.subarray(0, 4096), 4096),
			missing: await errorOf(buildGguf(QWEN_LIKE.filter(([key]) => key !== 'general.architecture'))),
			notString: await errorOf(buildGguf([['general.architecture', { type: 'u32', value: 7 }]])),
			notGguf: await prefixOf(new TextEncoder().encode('not a gguf file at all, just text'), 33),
			truncated: await errorOf(first.subarray(0, 40)),
		}, {
			firstKey: { kind: 'found', architecture: 'qwen3' },
			lateShort: { kind: 'needMore' },
			lateFull: { kind: 'found', architecture: 'qwen3' },
			truncatedFile: { kind: 'unknown', reason: 'truncated' },
			missing: 'GgufFormatError: GGUF header has no general.architecture',
			notString: 'GgufFormatError: GGUF general.architecture is not a string',
			notGguf: { kind: 'unknown', reason: 'invalid' },
			truncated: 'GgufTruncatedError: Unexpected end of GGUF file',
		});
	});

	test('reads the architecture of local files within a byte cap: complete, partial, beyond the cap, missing', async () => {
		const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-local-model-gguf-'));
		try {
			const late = buildGguf([['tokenizer.ggml.tokens', { type: 'stringArray', value: Array.from({ length: 5000 }, (_, i) => `token-${i}`) }], ['general.architecture', { type: 'string', value: 'qwen3' }]]);
			const write = async (name: string, bytes: Uint8Array) => {
				const file = path.join(dir, name);
				await fs.promises.writeFile(file, bytes);
				return file;
			};
			const complete = await write('model.gguf', buildSyntheticGguf({ 'general.architecture': 'maion-coder' }));
			const partial = await write('late.gguf.vscode.partial', late.subarray(0, 1024));
			const large = await write('late.gguf', late);
			assert.deepStrictEqual({
				complete: await readGgufArchitectureFromFile(complete, 8 * 1024 * 1024),
				partial: await readGgufArchitectureFromFile(partial, 8 * 1024 * 1024),
				beyondCap: await readGgufArchitectureFromFile(large, 4096),
				withinCap: await readGgufArchitectureFromFile(large, 8 * 1024 * 1024),
				missing: await readGgufArchitectureFromFile(path.join(dir, 'missing.gguf'), 4096),
			}, {
				complete: { kind: 'found', architecture: 'maion-coder' },
				partial: { kind: 'unknown', reason: 'truncated' },
				beyondCap: { kind: 'unknown', reason: 'overCap' },
				withinCap: { kind: 'found', architecture: 'qwen3' },
				missing: { kind: 'unknown', reason: 'unreadable' },
			});
		} finally {
			await fs.promises.rm(dir, { recursive: true, force: true });
		}
	});
});
