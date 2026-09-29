/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { Embedding, EmbeddingType } from '../../../embeddings/common/embeddingsComputer';
import { packEmbedding, unpackEmbedding } from '../../common/embeddingsStorage';

suite('Pack Embedding', () => {
	test('Text3small should pack and unpack to same values', () => {
		const embedding: Embedding = {
			type: EmbeddingType.text3small_512,
			// Start with float32 array so that we don't check for the very small rounding
			// that can happen when going from js number -> float32
			value: Array.from(Float32Array.from({ length: 512 }, () => Math.random())),
		};

		const serialized = packEmbedding(embedding);
		const deserialized = unpackEmbedding(EmbeddingType.text3small_512, serialized);
		assert.deepStrictEqual(deserialized.value.length, embedding.value.length);
		assert.deepStrictEqual(deserialized.value, embedding.value);
	});

	test('Metis should use binary storage', () => {
		const embedding: Embedding = {
			type: EmbeddingType.metis_1024_I16_Binary,
			value: Array.from({ length: 1024 }, () => Math.random() < 0.5 ? 0.03125 : -0.03125)
		};

		const serialized = packEmbedding(embedding);
		assert.strictEqual(serialized.length, 1024 / 8);

		const deserialized = unpackEmbedding(EmbeddingType.metis_1024_I16_Binary, serialized);
		assert.deepStrictEqual(deserialized.value.length, embedding.value.length);
		assert.deepStrictEqual(deserialized.value, embedding.value);
	});

	test('Unpack should work with buffer offsets', () => {
		const embedding: Embedding = {
			type: EmbeddingType.metis_1024_I16_Binary,
			value: Array.from({ length: 1024 }, () => Math.random() < 0.5 ? 0.03125 : -0.03125)
		};

		const serialized = packEmbedding(embedding);

		// Now create a new buffer and write the serialized data to it at an offset
		const prefixAndSuffixSize = 512;
		const buffer = new Uint8Array(serialized.length + prefixAndSuffixSize * 2);
		for (let i = 0; i < serialized.length; i++) {
			buffer[i + prefixAndSuffixSize] = serialized[i];
		}

		const serializedCopy = new Uint8Array(buffer.buffer, prefixAndSuffixSize, serialized.length);

		const deserialized = unpackEmbedding(EmbeddingType.metis_1024_I16_Binary, serializedCopy);
		assert.deepStrictEqual(deserialized.value.length, embedding.value.length);
		assert.deepStrictEqual(deserialized.value, embedding.value);
	});

	test('Unpack should work with old style metis data', () => {
		const embedding: Embedding = {
			type: EmbeddingType.metis_1024_I16_Binary,
			value: Array.from({ length: 1024 }, () => Math.random() < 0.5 ? 0.03125 : -0.03125)
		};

		// Don't use pack
		const float32Buf = Float32Array.from(embedding.value);
		const serialized = new Uint8Array(float32Buf.buffer, float32Buf.byteOffset, float32Buf.byteLength);

		const deserialized = unpackEmbedding(EmbeddingType.metis_1024_I16_Binary, serialized);
		assert.deepStrictEqual(deserialized.value.length, embedding.value.length);
		assert.deepStrictEqual(deserialized.value, embedding.value);
	});
});
