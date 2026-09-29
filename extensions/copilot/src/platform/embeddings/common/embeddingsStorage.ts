/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Embedding, EmbeddingType, getWellKnownEmbeddingTypeInfo } from './embeddingsComputer';

/**
 * Packs the embedding into a binary value for efficient storage.
 */
export function packEmbedding(embedding: Embedding): Uint8Array {
	const embeddingMetadata = getWellKnownEmbeddingTypeInfo(embedding.type);
	if (embeddingMetadata?.quantization.document === 'binary') {
		// Generate packed binary
		if (embedding.value.length % 8 !== 0) {
			throw new Error(`Embedding value length must be a multiple of 8 for ${embedding.type.id}, got ${embedding.value.length}`);
		}

		const data = new Uint8Array(embedding.value.length / 8);
		for (let i = 0; i < embedding.value.length; i += 8) {
			let value = 0;
			for (let j = 0; j < 8; j++) {
				value |= (embedding.value[i + j] >= 0 ? 1 : 0) << j;
			}
			data[i / 8] = value;
		}
		return data;
	}

	// All other formats default to float32 for now
	const data = Float32Array.from(embedding.value);
	return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * Unpacks an embedding from a binary value packed with {@link packEmbedding}.
 */
export function unpackEmbedding(type: EmbeddingType, data: Uint8Array): Embedding {
	const embeddingMetadata = getWellKnownEmbeddingTypeInfo(type);
	if (embeddingMetadata?.quantization.document === 'binary') {
		// Old metis versions may have stored the values as a float32
		if (!(type.equals(EmbeddingType.metis_1024_I16_Binary) && data.length >= 1024)) {
			const values = new Array(data.length * 8);
			for (let i = 0; i < data.length; i++) {
				const byte = data[i];
				for (let j = 0; j < 8; j++) {
					values[i * 8 + j] = (byte & (1 << j)) > 0 ? 0.03125 : -0.03125;
				}
			}
			return { type, value: values };
		}
	}

	const float32Array = new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4);
	return { type, value: Array.from(float32Array) };
}
