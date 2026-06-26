import * as assert from 'assert';
import {
	applyDeploymentConstraints,
	clampOutputTokenLimit,
	computeClampedOutputTokens,
	contextClampSlack,
	dropOutputTokenLimit,
	dropTemperature,
	forceMaxCompletionTokens,
	forceMaxTokens,
	isContextLengthExceededError,
	isUnsupportedMaxCompletionTokensError,
	isUnsupportedMaxTokensError,
	isUnsupportedTemperatureError,
	parseContextLengthError,
	selectOutputTokenLimitField,
	toApiRequestBody,
} from '../chatRequestBuilder';
import { normalizeDeployment } from '../deploymentMetadata';
import { type JsonValue } from '../runtimeGuards';
import { type DialChatRequest, type DialDeployment } from '../types';

const BASE_REQUEST: DialChatRequest = {
	messages: [{ role: 'user', content: 'hi' }],
};

function dep(
	features: Record<string, unknown> = {},
	extras: Record<string, unknown> = {},
): DialDeployment {
	return normalizeDeployment({
		id: 'm',
		name: 'm',
		features,
		...extras,
	} as unknown as JsonValue);
}

suite('chatRequestBuilder — feature-flag defaults', () => {
	test('absent features object → DIAL Core defaults (max_tokens + temperature)', () => {
		const out = applyDeploymentConstraints(BASE_REQUEST, dep());
		assert.strictEqual(out.max_tokens, 8192);
		assert.strictEqual(out.max_completion_tokens, undefined);
		assert.strictEqual(out.temperature, 0.7);
	});

	test('completely missing deployment → DIAL Core defaults', () => {
		const out = applyDeploymentConstraints(BASE_REQUEST, undefined);
		assert.strictEqual(out.max_tokens, 8192);
		assert.strictEqual(out.max_completion_tokens, undefined);
		assert.strictEqual(out.temperature, 0.7);
	});

	test('only max_completion_tokens_supported=true → uses max_completion_tokens', () => {
		const out = applyDeploymentConstraints(
			BASE_REQUEST,
			dep({ max_completion_tokens_supported: true }),
		);
		assert.strictEqual(out.max_completion_tokens, 8192);
		assert.strictEqual(out.max_tokens, undefined);
	});

	test('both max-flags false → no output-limit field is sent', () => {
		const out = applyDeploymentConstraints(
			BASE_REQUEST,
			dep({ max_tokens_supported: false, max_completion_tokens_supported: false }),
		);
		assert.strictEqual(out.max_tokens, undefined);
		assert.strictEqual(out.max_completion_tokens, undefined);
	});

	test('custom_temperature_supported=false → temperature dropped', () => {
		const out = applyDeploymentConstraints(
			{ ...BASE_REQUEST, temperature: 0.9 },
			dep({ custom_temperature_supported: false }),
		);
		assert.strictEqual(out.temperature, undefined);
	});

	test('garbage types in features → treated as missing (defaults apply)', () => {
		const out = applyDeploymentConstraints(
			BASE_REQUEST,
			dep({
				max_tokens_supported: 'true' as unknown as boolean,
				max_completion_tokens_supported: 0 as unknown as boolean,
				custom_temperature_supported: null as unknown as boolean,
			}),
		);
		assert.strictEqual(out.max_tokens, 8192);
		assert.strictEqual(out.temperature, 0.7);
	});

	test('features not an object at all → normalizer drops it, defaults apply', () => {
		const broken = normalizeDeployment({ id: 'm', features: 'yes' } as unknown as JsonValue);
		assert.strictEqual(broken.features, undefined);
		const out = applyDeploymentConstraints(BASE_REQUEST, broken);
		assert.strictEqual(out.max_tokens, 8192);
		assert.strictEqual(out.temperature, 0.7);
	});

	test('explicit limit overrides default 8192', () => {
		const d = dep({ max_tokens_supported: true }, { limits: { maxCompletionTokens: 1024 } });
		const out = applyDeploymentConstraints(BASE_REQUEST, d);
		assert.strictEqual(out.max_tokens, 1024);
	});

	test('default temperature from deployment.defaults wins over hardcoded 0.7', () => {
		const d = dep({}, { defaults: { temperature: 0.3 } });
		const out = applyDeploymentConstraints(BASE_REQUEST, d);
		assert.strictEqual(out.temperature, 0.3);
	});

	test('tools_supported=false strips tools and tool_choice', () => {
		const out = applyDeploymentConstraints(
			{
				...BASE_REQUEST,
				tools: [
					{
						type: 'function',
						function: { name: 'fn', description: 'd', parameters: {} },
					},
				],
				tool_choice: 'auto',
			},
			dep({ tools_supported: false }),
		);
		assert.strictEqual(out.tools, undefined);
		assert.strictEqual(out.tool_choice, undefined);
	});

	test('selectOutputTokenLimitField with no features', () => {
		assert.strictEqual(selectOutputTokenLimitField(dep()), 'max_tokens');
		assert.strictEqual(selectOutputTokenLimitField(undefined), 'max_tokens');
	});
});

suite('chatRequestBuilder — toApiRequestBody', () => {
	test('keeps max_completion_tokens when both fields would be present', () => {
		const body = toApiRequestBody({
			messages: [{ role: 'user', content: 'x' }],
			max_tokens: 100,
			max_completion_tokens: 200,
		});
		assert.strictEqual(body.max_completion_tokens, 200);
		assert.strictEqual(body.max_tokens, undefined);
	});

	test('keeps max_tokens when only max_tokens is set', () => {
		const body = toApiRequestBody({
			messages: [{ role: 'user', content: 'x' }],
			max_tokens: 100,
		});
		assert.strictEqual(body.max_tokens, 100);
		assert.strictEqual(body.max_completion_tokens, undefined);
	});
});

suite('chatRequestBuilder — error classifiers', () => {
	test('isUnsupportedMaxTokensError matches max_tokens errors only', () => {
		assert.ok(isUnsupportedMaxTokensError("'max_tokens' is not supported with this model"));
		assert.ok(isUnsupportedMaxTokensError('unsupported_parameter: max_tokens'));
		assert.ok(!isUnsupportedMaxTokensError("'max_completion_tokens' is not supported"));
		assert.ok(!isUnsupportedMaxTokensError('unsupported_parameter: max_completion_tokens'));
	});

	test('isUnsupportedMaxCompletionTokensError matches max_completion_tokens errors only', () => {
		assert.ok(
			isUnsupportedMaxCompletionTokensError(
				"'max_completion_tokens' is not supported with this model",
			),
		);
		assert.ok(
			isUnsupportedMaxCompletionTokensError('unsupported_parameter: max_completion_tokens'),
		);
		assert.ok(!isUnsupportedMaxCompletionTokensError("'max_tokens' is not supported"));
	});

	test('isUnsupportedTemperatureError catches common phrasings', () => {
		assert.ok(isUnsupportedTemperatureError('temperature is not supported'));
		assert.ok(isUnsupportedTemperatureError('unsupported value: temperature'));
	});

	test('isContextLengthExceededError catches vLLM/OpenAI phrasings', () => {
		assert.ok(
			isContextLengthExceededError(
				"This model's maximum context length is 65536 tokens. However, you " +
					'requested 8000 output tokens and your prompt contains at least 57537 ' +
					'input tokens, for a total of at least 65537 tokens. Please reduce the ' +
					'length of the input prompt or the number of requested output tokens.',
			),
		);
		assert.ok(isContextLengthExceededError('error code: context_length_exceeded'));
		assert.ok(!isContextLengthExceededError("'max_tokens' is not supported"));
	});
});

suite('chatRequestBuilder — context-length recovery', () => {
	const ERR =
		"This model's maximum context length is 65536 tokens. However, you requested " +
		'8000 output tokens and your prompt contains at least 57537 input tokens, for a ' +
		'total of at least 65537 tokens. Please reduce the length of the input prompt or ' +
		'the number of requested output tokens.';

	test('parseContextLengthError extracts the numeric limits', () => {
		const info = parseContextLengthError(ERR);
		assert.strictEqual(info.maxContext, 65536);
		assert.strictEqual(info.inputTokens, 57537);
		assert.strictEqual(info.requestedOutput, 8000);
	});

	test('parseContextLengthError tolerates a missing field', () => {
		const info = parseContextLengthError('maximum context length is 4096 tokens');
		assert.strictEqual(info.maxContext, 4096);
		assert.strictEqual(info.inputTokens, undefined);
		assert.strictEqual(info.requestedOutput, undefined);
	});

	test('clampOutputTokenLimit overwrites the active limit field', () => {
		assert.strictEqual(
			clampOutputTokenLimit({ messages: [], max_tokens: 8000 }, 7000).max_tokens,
			7000,
		);
		assert.strictEqual(
			clampOutputTokenLimit({ messages: [], max_completion_tokens: 8000 }, 7000)
				.max_completion_tokens,
			7000,
		);
	});

	test('clampOutputTokenLimit is a no-op when no limit field is present', () => {
		const r = clampOutputTokenLimit({ messages: [] }, 7000);
		assert.strictEqual(r.max_tokens, undefined);
		assert.strictEqual(r.max_completion_tokens, undefined);
	});

	test('clamp computed from the error fits prompt + output into the window', () => {
		const info = parseContextLengthError(ERR);
		const clamped = computeClampedOutputTokens(info, 8000);
		assert.ok(clamped !== undefined);
		assert.ok((info.inputTokens ?? 0) + clamped <= (info.maxContext ?? 0));
		assert.strictEqual(clamped, 7671);
	});

	test('re-clamp when upstream reports a higher input count on retry', () => {
		const retryErr =
			"This model's maximum context length is 65536 tokens. However, you requested " +
			'7935 output tokens and your prompt contains at least 57602 input tokens, for a ' +
			'total of at least 65537 tokens. Please reduce the length of the input prompt or ' +
			'the number of requested output tokens.';
		const info = parseContextLengthError(retryErr);
		const clamped = computeClampedOutputTokens(info, 7935);
		assert.strictEqual(clamped, 7606);
		assert.ok((info.inputTokens ?? 0) + clamped <= (info.maxContext ?? 0));
	});

	test('contextClampSlack scales with the context window', () => {
		assert.strictEqual(contextClampSlack(65536), 328);
		assert.ok(contextClampSlack(4096) >= 256);
	});
});

suite('chatRequestBuilder — request mutations used by retry', () => {
	test('forceMaxCompletionTokens swaps and preserves the value', () => {
		const r = forceMaxCompletionTokens({ messages: [], max_tokens: 500 });
		assert.strictEqual(r.max_completion_tokens, 500);
		assert.strictEqual(r.max_tokens, undefined);
	});

	test('forceMaxTokens swaps in the other direction', () => {
		const r = forceMaxTokens({ messages: [], max_completion_tokens: 300 });
		assert.strictEqual(r.max_tokens, 300);
		assert.strictEqual(r.max_completion_tokens, undefined);
	});

	test('dropOutputTokenLimit removes both fields', () => {
		const r = dropOutputTokenLimit({
			messages: [],
			max_tokens: 1,
			max_completion_tokens: 2,
		});
		assert.strictEqual(r.max_tokens, undefined);
		assert.strictEqual(r.max_completion_tokens, undefined);
	});

	test('dropTemperature removes temperature only', () => {
		const r = dropTemperature({ messages: [], temperature: 0.7, max_tokens: 1 });
		assert.strictEqual(r.temperature, undefined);
		assert.strictEqual(r.max_tokens, 1);
	});
});
