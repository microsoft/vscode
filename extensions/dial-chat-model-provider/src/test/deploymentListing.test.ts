import * as assert from 'assert';
import { parseEmbeddingsResponse } from '../embeddingsResponse';
import { type JsonValue } from '../runtimeGuards';

suite('embeddingsResponse', () => {
	test('parseEmbeddingsResponse maps OpenAI-compatible body', () => {
		const results = parseEmbeddingsResponse(
			{
				object: 'list',
				data: [
					{ object: 'embedding', index: 1, embedding: [0.1, 0.2] },
					{ object: 'embedding', index: 0, embedding: [1, 2, 3] },
				],
			} as unknown as JsonValue,
			2,
		);
		assert.strictEqual(results.length, 2);
		assert.deepStrictEqual(results[0]!.values, [1, 2, 3]);
		assert.deepStrictEqual(results[1]!.values, [0.1, 0.2]);
	});

	test('parseEmbeddingsResponse rejects count mismatch', () => {
		assert.throws(() =>
			parseEmbeddingsResponse(
				{ data: [{ index: 0, embedding: [1] }] } as unknown as JsonValue,
				2,
			),
		);
	});
});
