import * as assert from 'assert';
import { normalizeDeployment } from '../deploymentMetadata';
import {
	buildModelConfigurationSchema,
	resolveReasoningEffortLevels,
} from '../modelConfigurationSchema';
import { type JsonValue } from '../runtimeGuards';

suite('modelConfigurationSchema', () => {
	test('returns undefined when reasoning_efforts is absent', () => {
		const deployment = normalizeDeployment({
			id: 'gpt-4o',
			features: { tools_supported: true },
		} as unknown as JsonValue);
		assert.strictEqual(buildModelConfigurationSchema(deployment), undefined);
	});

	test('returns undefined when reasoning_efforts is empty', () => {
		const deployment = normalizeDeployment({
			id: 'gpt-4o',
			features: { reasoning_efforts: [] },
		} as unknown as JsonValue);
		assert.strictEqual(buildModelConfigurationSchema(deployment), undefined);
	});

	test('builds reasoningEffort schema from features.reasoning_efforts', () => {
		const deployment = normalizeDeployment({
			id: 'qwen3.6-27b-awq',
			features: { reasoning_efforts: ['low', 'medium', 'high'] },
			defaults: { reasoning_effort: 'medium' },
		} as unknown as JsonValue);
		const schema = buildModelConfigurationSchema(deployment);
		assert.ok(schema?.properties?.reasoningEffort);
		const prop = schema!.properties!.reasoningEffort;
		assert.deepStrictEqual(prop.enum, ['low', 'medium', 'high']);
		assert.strictEqual(prop.default, 'medium');
		assert.strictEqual(prop.group, 'navigation');
	});

	test('resolveReasoningEffortLevels returns features.reasoning_efforts', () => {
		const deployment = normalizeDeployment({
			id: 'custom',
			features: { reasoning_efforts: ['low', 'high'] },
		} as unknown as JsonValue);
		assert.deepStrictEqual(resolveReasoningEffortLevels(deployment), ['low', 'high']);
	});

	test('normalizeDeployment lowercases reasoning_efforts from listing', () => {
		const deployment = normalizeDeployment({
			id: 'custom',
			features: { reasoning_efforts: ['Low', 'HIGH'] },
		} as unknown as JsonValue);
		assert.deepStrictEqual(deployment.features?.reasoning_efforts, ['low', 'high']);
	});
});
