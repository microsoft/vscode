import * as assert from 'assert';
import { buildCopilotModelDefaults, toVendorModelPath } from '../copilotDefaults';
import { toEmbeddingModelId } from '../dialEmbeddingsService';
import { type DialDeployment } from '../types';

function chat(id: string): DialDeployment {
	return { id, kind: 'chat', name: id };
}

function embed(id: string): DialDeployment {
	return { id, kind: 'embedding', name: id };
}

suite('copilotDefaults', () => {
	test('buildCopilotModelDefaults maps chat and embedding deployments', () => {
		const defaults = buildCopilotModelDefaults(
			[chat('qwen-chat'), chat('backup')],
			[embed('text-embed')],
		);
		assert.strictEqual(defaults.embeddingModel, toEmbeddingModelId('text-embed'));
		assert.strictEqual(defaults.utilityModel, toVendorModelPath('qwen-chat'));
		assert.strictEqual(defaults.utilitySmallModel, toVendorModelPath('qwen-chat'));
		assert.strictEqual(defaults.riskAssessmentModel, toVendorModelPath('qwen-chat'));
	});

	test('toEmbeddingModelId uses dial. prefix', () => {
		assert.strictEqual(toEmbeddingModelId('my-embed'), 'dial.my-embed');
	});
});
