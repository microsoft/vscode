import * as assert from 'assert';
import * as vscode from 'vscode';
import { applyDeploymentConstraints } from '../chatRequestBuilder';
import { normalizeDeployment } from '../deploymentMetadata';
import {
	applyReasoningEffort,
	deploymentSupportsReasoningEffort,
	normalizeReasoningEffort,
} from '../reasoningEffort';
import { type JsonValue } from '../runtimeGuards';
import { type DialChatRequest, type DialDeployment } from '../types';

const BASE_REQUEST: DialChatRequest = {
	messages: [{ role: 'user', content: 'hi' }],
};

const REASONING_LEVELS = ['low', 'medium', 'high'] as const;

function dep(features: Record<string, unknown> = {}): DialDeployment {
	return normalizeDeployment({
		id: 'qwen',
		name: 'qwen',
		features,
	} as unknown as JsonValue);
}

function supportedDep(
	features: Record<string, unknown> = {},
	defaults: Record<string, unknown> = {},
): DialDeployment {
	return normalizeDeployment({
		id: 'qwen',
		name: 'qwen',
		features: { reasoning_efforts: [...REASONING_LEVELS], ...features },
		...(Object.keys(defaults).length > 0 ? { defaults } : {}),
	} as unknown as JsonValue);
}

function options(
	overrides: {
		modelOptions?: Record<string, unknown>;
		modelConfiguration?: Record<string, unknown>;
	} = {},
): vscode.ProvideLanguageModelChatResponseOptions {
	return {
		toolMode: vscode.LanguageModelChatToolMode.Auto,
		requestInitiator: 'test',
		...(overrides.modelOptions !== undefined ? { modelOptions: overrides.modelOptions } : {}),
		...(overrides.modelConfiguration !== undefined
			? { modelConfiguration: overrides.modelConfiguration }
			: {}),
	} as vscode.ProvideLanguageModelChatResponseOptions;
}

suite('reasoningEffort', () => {
	test('normalizeReasoningEffort lowercases known levels', () => {
		assert.strictEqual(normalizeReasoningEffort('High'), 'high');
		assert.strictEqual(normalizeReasoningEffort(' medium '), 'medium');
	});

	test('normalizeReasoningEffort treats none/off as omitted', () => {
		assert.strictEqual(normalizeReasoningEffort('none'), undefined);
		assert.strictEqual(normalizeReasoningEffort('OFF'), undefined);
	});

	test('applyReasoningEffort omits deployment default none', () => {
		const deployment = supportedDep({}, { reasoning_effort: 'none' });
		const { request, diagnostic } = applyReasoningEffort(
			BASE_REQUEST,
			deployment,
			options(),
		);
		assert.strictEqual(request.reasoning_effort, undefined);
		assert.strictEqual(diagnostic.action, 'omitted-sentinel');
		assert.strictEqual(diagnostic.ide.modelOptionsReasoningEffort, null);
	});

	test('deploymentSupportsReasoningEffort requires non-empty reasoning_efforts', () => {
		assert.strictEqual(deploymentSupportsReasoningEffort(dep()), false);
		assert.strictEqual(
			deploymentSupportsReasoningEffort(dep({ reasoning_efforts: [] })),
			false,
		);
		assert.strictEqual(
			deploymentSupportsReasoningEffort(dep({ reasoning_efforts: ['low'] })),
			true,
		);
	});

	test('applyReasoningEffort sends effort when deployment supports it', () => {
		const { request, diagnostic } = applyReasoningEffort(
			BASE_REQUEST,
			supportedDep(),
			options({ modelOptions: { reasoningEffort: 'high' } }),
		);
		assert.strictEqual(request.reasoning_effort, 'high');
		assert.strictEqual(diagnostic.action, 'sent');
		assert.strictEqual(diagnostic.sent, 'high');
		assert.strictEqual(diagnostic.source, 'modelOptions');
		assert.strictEqual(diagnostic.ide.modelOptionsReasoningEffort, 'high');
	});

	test('applyReasoningEffort omits effort when Copilot sets enableThinking false', () => {
		const { request, diagnostic } = applyReasoningEffort(
			BASE_REQUEST,
			supportedDep(),
			options({
				modelConfiguration: { reasoningEffort: 'high' },
				modelOptions: { enableThinking: false },
			}),
		);
		assert.strictEqual(request.reasoning_effort, undefined);
		assert.strictEqual(diagnostic.action, 'omitted-enable-thinking-false');
		assert.strictEqual(diagnostic.requested, 'high');
		assert.strictEqual(diagnostic.ide.modelOptionsEnableThinking, false);
	});

	test('applyReasoningEffort sends effort when enableThinking true', () => {
		const { request, diagnostic } = applyReasoningEffort(
			BASE_REQUEST,
			supportedDep(),
			options({
				modelConfiguration: { reasoningEffort: 'medium' },
				modelOptions: { enableThinking: true },
			}),
		);
		assert.strictEqual(request.reasoning_effort, 'medium');
		assert.strictEqual(diagnostic.action, 'sent');
	});

	test('applyReasoningEffort prefers modelConfiguration over modelOptions', () => {
		const { request, diagnostic } = applyReasoningEffort(
			BASE_REQUEST,
			supportedDep(),
			options({
				modelConfiguration: { reasoningEffort: 'low' },
				modelOptions: { reasoningEffort: 'high' },
			}),
		);
		assert.strictEqual(request.reasoning_effort, 'low');
		assert.strictEqual(diagnostic.source, 'modelConfiguration');
	});

	test('applyReasoningEffort drops effort when deployment flag is absent', () => {
		const { request, diagnostic } = applyReasoningEffort(
			{ ...BASE_REQUEST, reasoning_effort: 'high' },
			dep(),
			options({ modelOptions: { reasoningEffort: 'high' } }),
		);
		assert.strictEqual(request.reasoning_effort, undefined);
		assert.strictEqual(diagnostic.action, 'dropped-unsupported-deployment');
		assert.strictEqual(diagnostic.sent, null);
	});

	test('applyReasoningEffort drops effort not in allowed list', () => {
		const { request, diagnostic } = applyReasoningEffort(
			BASE_REQUEST,
			supportedDep({ reasoning_efforts: ['low', 'medium'] }),
			options({ modelOptions: { reasoningEffort: 'high' } }),
		);
		assert.strictEqual(request.reasoning_effort, undefined);
		assert.strictEqual(diagnostic.action, 'dropped-not-in-allowed-list');
		assert.strictEqual(diagnostic.requested, 'high');
		assert.strictEqual(diagnostic.sent, null);
	});

	test('applyDeploymentConstraints strips reasoning_effort without feature flag', () => {
		const out = applyDeploymentConstraints(
			{ ...BASE_REQUEST, stream: true, reasoning_effort: 'medium' },
			dep(),
		);
		assert.strictEqual(out.reasoning_effort, undefined);
	});

	test('applyDeploymentConstraints keeps reasoning_effort when supported', () => {
		const out = applyDeploymentConstraints(
			{ ...BASE_REQUEST, stream: true, reasoning_effort: 'medium' },
			supportedDep(),
		);
		assert.strictEqual(out.reasoning_effort, 'medium');
	});
});
