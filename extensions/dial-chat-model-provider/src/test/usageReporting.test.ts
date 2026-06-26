import * as assert from 'assert';
import { applyDeploymentConstraints } from '../chatRequestBuilder';
import { isEmptyModelStream, parseOpenAIStreamUsage } from '../usageReporting';

suite('usageReporting', () => {
	test('parseOpenAIStreamUsage reads final streaming chunk usage', () => {
		const usage = parseOpenAIStreamUsage({
			id: 'chatcmpl-test',
			object: 'chat.completion.chunk',
			choices: [],
			usage: {
				prompt_tokens: 29072,
				completion_tokens: 12,
				total_tokens: 29084,
			},
		});
		assert.ok(usage);
		assert.strictEqual(usage.prompt_tokens, 29072);
		assert.strictEqual(usage.completion_tokens, 12);
		assert.strictEqual(usage.total_tokens, 29084);
	});

	test('parseOpenAIStreamUsage returns undefined when usage missing', () => {
		assert.strictEqual(parseOpenAIStreamUsage({ choices: [] }), undefined);
	});

	test('isEmptyModelStream ignores usage-only SSE (final include_usage chunk)', () => {
		assert.strictEqual(isEmptyModelStream({ text: 0, tools: 0 }, true), false);
		assert.strictEqual(isEmptyModelStream({ text: 0, tools: 0 }, false), true);
		assert.strictEqual(isEmptyModelStream({ text: 1, tools: 0 }, false), false);
	});

	test('applyDeploymentConstraints adds stream_options when streaming', () => {
		const body = applyDeploymentConstraints(
			{ messages: [{ role: 'user', content: 'hi' }], stream: true },
			{ id: 'dep-1', model: 'm' },
		);
		assert.deepStrictEqual(body.stream_options, { include_usage: true });
	});
});
