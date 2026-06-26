import { isRecord, type JsonObject, type JsonValue } from './runtimeGuards';
import { type DialEmbeddingResult } from './types';

/** Parse OpenAI-compatible embeddings API response body. */
export function parseEmbeddingsResponse(
	body: JsonValue,
	expectedCount: number,
): readonly DialEmbeddingResult[] {
	if (!isRecord(body)) {
		throw new Error('Embeddings response is not a JSON object');
	}
	const data = body.data;
	if (!Array.isArray(data)) {
		throw new Error('Embeddings response missing data[] array');
	}

	const entries = data
		.filter(isRecord)
		.map((item, fallbackIndex) => ({
			index: typeof item.index === 'number' ? item.index : fallbackIndex,
			embedding: item.embedding,
		}))
		.sort((a, b) => a.index - b.index);

	if (entries.length !== expectedCount) {
		throw new Error(
			`Embeddings response count mismatch: expected ${expectedCount}, got ${entries.length}`,
		);
	}

	return entries.map((entry) => {
		if (!Array.isArray(entry.embedding)) {
			throw new Error('Embeddings response entry missing embedding vector');
		}
		const values = entry.embedding.filter((v): v is number => typeof v === 'number');
		if (values.length === 0) {
			throw new Error('Embeddings response entry has empty embedding vector');
		}
		return { values };
	});
}

/** @internal Test helper for v1 listing response shape. */
export function extractDeploymentArray(body: JsonValue): readonly JsonObject[] | undefined {
	if (Array.isArray(body)) {
		return body.filter(isRecord);
	}
	if (!isRecord(body)) {
		return undefined;
	}
	const data = body.data;
	if (Array.isArray(data)) {
		return data.filter(isRecord);
	}
	return undefined;
}
