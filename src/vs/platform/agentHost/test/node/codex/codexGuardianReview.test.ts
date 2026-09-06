/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { formatGuardianDenialNotification, summarizeGuardianReviewAction, toGuardianAssessmentEventJson } from '../../../node/codex/codexGuardianReview.js';
import type { ItemGuardianApprovalReviewCompletedNotification } from '../../../node/codex/protocol/generated/v2/ItemGuardianApprovalReviewCompletedNotification.js';

suite('codexGuardianReview', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const deniedNetworkReview: ItemGuardianApprovalReviewCompletedNotification = {
		threadId: 'thread-1',
		turnId: 'turn-1',
		startedAtMs: 1234,
		completedAtMs: 2345,
		reviewId: 'review-1',
		targetItemId: null,
		decisionSource: 'agent',
		review: {
			status: 'denied',
			riskLevel: 'critical',
			userAuthorization: 'unknown',
			rationale: 'Network access is not allowed for this prompt.',
		},
		action: {
			type: 'networkAccess',
			target: 'https://developers.openai.com/codex/app-server',
			host: 'developers.openai.com',
			protocol: 'https',
			port: 443,
		},
	};

	test('toGuardianAssessmentEventJson converts network review payloads to snake_case', () => {
		assert.deepStrictEqual(toGuardianAssessmentEventJson(deniedNetworkReview), {
			id: 'review-1',
			turn_id: 'turn-1',
			started_at_ms: 1234,
			completed_at_ms: 2345,
			status: 'denied',
			risk_level: 'critical',
			user_authorization: 'unknown',
			rationale: 'Network access is not allowed for this prompt.',
			decision_source: 'agent',
			action: {
				type: 'network_access',
				target: 'https://developers.openai.com/codex/app-server',
				host: 'developers.openai.com',
				protocol: 'https',
				port: 443,
			},
		});
	});

	test('summarizeGuardianReviewAction labels denied network access clearly', () => {
		assert.deepStrictEqual(summarizeGuardianReviewAction(deniedNetworkReview.action), {
			title: 'Network access',
			detail: 'https://developers.openai.com/codex/app-server',
			toolKind: 'search',
		});
	});

	test('summarizeGuardianReviewAction unwraps the OS shell wrapper so the card matches the terminal pill', () => {
		assert.deepStrictEqual({
			command: summarizeGuardianReviewAction({
				type: 'command', source: 'shell',
				command: '/bin/zsh -lc \'rm -rf ~/secret\'', cwd: '/tmp',
			} as never),
			execve: summarizeGuardianReviewAction({
				type: 'execve', source: 'shell',
				program: '/bin/bash', argv: ['-lc', 'echo hi'], cwd: '/tmp',
			} as never),
		}, {
			command: { title: 'Run command', detail: 'rm -rf ~/secret', toolKind: 'terminal' },
			execve: { title: 'Run program', detail: 'echo hi', toolKind: 'terminal' },
		});
	});

	const deniedPermissionsReview: ItemGuardianApprovalReviewCompletedNotification = {
		threadId: 'thread-2',
		turnId: 'turn-2',
		startedAtMs: 10,
		completedAtMs: 20,
		reviewId: 'review-2',
		targetItemId: null,
		decisionSource: 'agent',
		review: {
			status: 'denied',
			riskLevel: null,
			userAuthorization: null,
			rationale: null,
		},
		action: {
			type: 'requestPermissions',
			reason: 'Needs to read outside the workspace',
			permissions: {
				network: { enabled: true },
				fileSystem: {
					read: ['/etc/hosts'],
					write: null,
					globScanMaxDepth: 3,
					entries: [{ path: { type: 'path', path: '/tmp/x' }, access: 'read' }],
				},
			},
		},
	};

	test('toGuardianAssessmentEventJson snake_cases the requestPermissions profile', () => {
		assert.deepStrictEqual(toGuardianAssessmentEventJson(deniedPermissionsReview), {
			id: 'review-2',
			turn_id: 'turn-2',
			started_at_ms: 10,
			completed_at_ms: 20,
			status: 'denied',
			decision_source: 'agent',
			action: {
				type: 'request_permissions',
				reason: 'Needs to read outside the workspace',
				permissions: {
					network: { enabled: true },
					file_system: {
						read: ['/etc/hosts'],
						write: null,
						glob_scan_max_depth: 3,
						entries: [{ path: { type: 'path', path: '/tmp/x' }, access: 'read' }],
					},
				},
			},
		});
	});

	test('formatGuardianDenialNotification renders the action summary and rationale as a distinct blockquote', () => {
		assert.deepStrictEqual(
			[
				formatGuardianDenialNotification({ title: 'Network access', detail: 'https://example.com' }, 'Blocked for safety.'),
				formatGuardianDenialNotification({ title: 'Elevated permissions', detail: '' }, null),
			],
			[
				'\n\n> ⚠️ **Auto-review denied** — Network access: `https://example.com`\n>\n> Blocked for safety.\n',
				'\n\n> ⚠️ **Auto-review denied** — Elevated permissions\n',
			]
		);
	});
});
