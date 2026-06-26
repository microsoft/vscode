import * as assert from 'assert';
import {
	filterByRequiredTopics,
	partitionByKind,
	summarizeModelPipeline,
} from '../deploymentFilter';
import { inferDeploymentKind, normalizeDeployment } from '../deploymentMetadata';
import { extractDeploymentArray } from '../embeddingsResponse';
import { type DialDeployment } from '../types';
import { type JsonValue } from '../runtimeGuards';

function model(partial: Partial<DialDeployment> & Pick<DialDeployment, 'id'>): DialDeployment {
	return {
		name: partial.id,
		...partial,
	};
}

suite('deploymentFilter', () => {
	test('filterByRequiredTopics passes all when required list is empty', () => {
		const models = [
			model({ id: 'a', topics: ['copilot'] }),
			model({ id: 'b' }),
		];
		assert.strictEqual(filterByRequiredTopics(models, []).length, 2);
	});

	test('filterByRequiredTopics matches any required topic (OR)', () => {
		const models = [
			model({ id: 'a', topics: ['vscode'] }),
			model({ id: 'b', topics: ['copilot'] }),
			model({ id: 'c', topics: ['other'] }),
		];
		const filtered = filterByRequiredTopics(models, ['copilot', 'missing']);
		assert.deepStrictEqual(filtered.map((m) => m.id), ['b']);
	});

	test('filterByRequiredTopics is case-insensitive', () => {
		const models = [model({ id: 'a', topics: ['Copilot'] })];
		const filtered = filterByRequiredTopics(models, ['copilot']);
		assert.strictEqual(filtered.length, 1);
	});

	test('filterByRequiredTopics hides models without matching topics', () => {
		const models = [model({ id: 'a', topics: ['alpha'] })];
		assert.strictEqual(filterByRequiredTopics(models, ['beta']).length, 0);
	});

	test('partitionByKind splits chat and embedding', () => {
		const partition = partitionByKind([
			model({ id: 'chat-1', kind: 'chat' }),
			model({ id: 'embed-1', kind: 'embedding' }),
			model({ id: 'unknown' }),
		]);
		assert.deepStrictEqual(partition.chat.map((m) => m.id), ['chat-1']);
		assert.deepStrictEqual(partition.embedding.map((m) => m.id), ['embed-1']);
	});

	test('summarizeModelPipeline formats pipeline counts', () => {
		const summary = summarizeModelPipeline(10, 4, {
			chat: [model({ id: 'c', kind: 'chat' })],
			embedding: [model({ id: 'e', kind: 'embedding' })],
		});
		assert.match(summary, /Loaded 10 model\(s\) → 4 after topic filter → chat=1, embedding=1/);
	});
});

suite('deploymentListing', () => {
	test('normalizeDeployment infers chat kind from capabilities', () => {
		const deployment = normalizeDeployment({
			id: 'gpt-4o',
			display_name: 'GPT-4o',
			capabilities: { chat_completion: true },
		} as unknown as JsonValue);
		assert.strictEqual(deployment.kind, 'chat');
		assert.strictEqual(deployment.id, 'gpt-4o');
	});

	test('normalizeDeployment infers embedding kind from capabilities', () => {
		const deployment = normalizeDeployment({
			id: 'text-embed',
			display_name: 'Embed',
			capabilities: { embeddings: true },
		} as unknown as JsonValue);
		assert.strictEqual(deployment.kind, 'embedding');
	});

	test('normalizeDeployment infers kind from type fallback', () => {
		const deployment = normalizeDeployment({
			id: 'legacy-embed',
			type: 'embedding',
		} as unknown as JsonValue);
		assert.strictEqual(deployment.kind, 'embedding');
	});

	test('normalizeDeployment parses description_keywords as topics', () => {
		const deployment = normalizeDeployment({
			id: 'tagged',
			description_keywords: [' copilot ', 'vscode'],
		} as unknown as JsonValue);
		assert.deepStrictEqual(deployment.topics, ['copilot', 'vscode']);
	});

	test('normalizeDeployment merges topics alias with description_keywords', () => {
		const deployment = normalizeDeployment({
			id: 'tagged',
			description_keywords: ['alpha'],
			topics: ['beta'],
		} as unknown as JsonValue);
		assert.deepStrictEqual(deployment.topics, ['alpha', 'beta']);
	});

	test('normalizeDeployment parses descriptionKeywords camelCase as topics', () => {
		const deployment = normalizeDeployment({
			id: 'tagged',
			descriptionKeywords: ['copilot'],
		} as unknown as JsonValue);
		assert.deepStrictEqual(deployment.topics, ['copilot']);
	});

	test('normalizeDeployment infers chat kind from completion capability', () => {
		const deployment = normalizeDeployment({
			id: 'legacy-completion',
			capabilities: { completion: true },
		} as unknown as JsonValue);
		assert.strictEqual(deployment.kind, 'chat');
	});

	test('normalizeDeployment infers chat kind from completion type', () => {
		const deployment = normalizeDeployment({
			id: 'legacy-completion',
			type: 'completion',
		} as unknown as JsonValue);
		assert.strictEqual(deployment.kind, 'chat');
	});

	test('normalizeDeployment records explicit kind override', () => {
		const deployment = normalizeDeployment(
			{ id: 'gpt-4o', capabilities: { embeddings: true } } as unknown as JsonValue,
			'chat',
		);
		assert.strictEqual(deployment.kind, 'chat');
	});

	test('inferDeploymentKind prefers chat_completion over type', () => {
		assert.strictEqual(
			inferDeploymentKind({
				type: 'embedding',
				capabilities: { chat_completion: true },
			} as unknown as JsonValue),
			'chat',
		);
	});

	test('extractDeploymentArray reads data[] wrapper', () => {
		const list = extractDeploymentArray({
			data: [{ id: 'a' }, { id: 'b' }],
		} as unknown as JsonValue);
		assert.ok(list);
		assert.strictEqual(list.length, 2);
		assert.strictEqual(list[0]!.id, 'a');
	});
});
