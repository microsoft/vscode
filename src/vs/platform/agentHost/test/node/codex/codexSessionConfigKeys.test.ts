/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { narrowAdditionalDirectories, narrowApprovalPolicy, narrowBoolean, narrowReasoningEffort, narrowSandboxMode, narrowWebSearchMode } from '../../../node/codex/codexSessionConfigKeys.js';

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
});