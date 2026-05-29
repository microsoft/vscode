/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isCodexSupportedModel, narrowAdditionalDirectories, narrowApprovalPolicy, narrowBoolean, narrowReasoningEffort, narrowSandboxMode, narrowWebSearchMode, normalizeCodexModelId } from '../../../node/codex/codexSessionConfigKeys.js';

suite('codexSessionConfigKeys', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('narrows valid values and rejects invalid values', () => {
		assert.deepStrictEqual({
			approvalPolicy: [narrowApprovalPolicy('never'), narrowApprovalPolicy('on-request'), narrowApprovalPolicy('nope')],
			sandboxMode: [narrowSandboxMode('read-only'), narrowSandboxMode('workspace-write'), narrowSandboxMode('folder')],
			additionalDirectories: [narrowAdditionalDirectories(['/tmp/a', '', 1, '/tmp/b']), narrowAdditionalDirectories('nope')],
			boolean: [narrowBoolean(true), narrowBoolean(false), narrowBoolean('true')],
			webSearchMode: [narrowWebSearchMode('disabled'), narrowWebSearchMode('cached'), narrowWebSearchMode('online')],
			reasoningEffort: [narrowReasoningEffort('minimal'), narrowReasoningEffort('medium'), narrowReasoningEffort('max')],
		}, {
			approvalPolicy: ['never', 'on-request', undefined],
			sandboxMode: ['read-only', 'workspace-write', undefined],
			additionalDirectories: [['/tmp/a', '/tmp/b'], undefined],
			boolean: [true, false, undefined],
			webSearchMode: ['disabled', 'cached', undefined],
			reasoningEffort: ['minimal', 'medium', undefined],
		});
	});

	test('filters Codex models to supported OpenAI model ids', () => {
		assert.deepStrictEqual([
			isCodexSupportedModel('auto', 'Codex Auto'),
			isCodexSupportedModel('claude-sonnet-4.5', 'Claude Sonnet 4.5'),
			isCodexSupportedModel('gpt-5.2', 'GPT-5.2'),
			isCodexSupportedModel('gpt-5.1-codex-max', 'GPT-5.1 Codex Max'),
			isCodexSupportedModel('codex-mini-latest', 'Codex Mini'),
		], [false, false, true, true, true]);
	});

	test('normalizes provider-prefixed Codex model ids', () => {
		assert.deepStrictEqual({
			raw: normalizeCodexModelId('gpt-5.2'),
			prefixed: normalizeCodexModelId('copilot/gpt-5.2'),
			unsupportedRaw: normalizeCodexModelId('claude-sonnet-4.5'),
			unsupportedPrefixed: normalizeCodexModelId('copilot/auto'),
		}, {
			raw: 'gpt-5.2',
			prefixed: 'gpt-5.2',
			unsupportedRaw: undefined,
			unsupportedPrefixed: undefined,
		});
	});
});
