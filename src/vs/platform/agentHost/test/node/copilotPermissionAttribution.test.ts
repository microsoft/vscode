/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { PermissionDecisionSource, PermissionRequestResult, PermissionResult } from '@github/copilot-sdk';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { attributePermissionResult, permissionResultToConfirmKind } from '../../node/copilot/copilotPermissionAttribution.js';

suite('Copilot permission attribution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps the decision unchanged while identifying the responder', () => {
		assert.deepStrictEqual([
			attributePermissionResult({ kind: 'approve-once' }, 'human_response'),
			attributePermissionResult({ kind: 'reject' }, 'human_response'),
			attributePermissionResult({ kind: 'approve-once' }, 'assisted_approval'),
			attributePermissionResult({ kind: 'approve-once' }, 'host_policy'),
			attributePermissionResult({ kind: 'reject' }, 'unattended_fallback'),
			attributePermissionResult({ kind: 'reject' }, undefined),
			attributePermissionResult({ kind: 'no-result' }, 'human_response'),
		], [
			{ kind: 'attributed', result: { kind: 'approve-once' }, decisionContext: { source: 'human_response', surface: 'sdk', outcome: 'prompted_user', responseCapability: 'interactive' } },
			{ kind: 'attributed', result: { kind: 'reject' }, decisionContext: { source: 'human_response', surface: 'sdk', outcome: 'prompted_user', responseCapability: 'interactive' } },
			{ kind: 'attributed', result: { kind: 'approve-once' }, decisionContext: { source: 'assisted_approval', surface: 'sdk', outcome: 'auto_approved' } },
			{ kind: 'attributed', result: { kind: 'approve-once' }, decisionContext: { source: 'host_policy', surface: 'sdk', outcome: 'auto_approved' } },
			{ kind: 'attributed', result: { kind: 'reject' }, decisionContext: { source: 'unattended_fallback', surface: 'sdk', outcome: 'autopilot_denied' } },
			{ kind: 'reject' },
			{ kind: 'no-result' },
		]);
	});

	test('retains positive outcomes for automatic approval response variants', () => {
		const approvals = [
			{ kind: 'approve-once' },
			{ kind: 'approved' },
			{ kind: 'approve-for-session' },
			{ kind: 'approve-for-location', approval: { kind: 'read' }, locationKey: 'workspace' },
			{ kind: 'approve-permanently', domain: 'example.com' },
		] satisfies PermissionRequestResult[];
		assert.deepStrictEqual(approvals.map(result => attributePermissionResult(result, 'host_policy')), approvals.map(result => ({
			kind: 'attributed',
			result,
			decisionContext: { source: 'host_policy', surface: 'sdk', outcome: 'auto_approved' },
		})));
	});

	test('requires explicit human attribution, including scoped grants', () => {
		const sources: (PermissionDecisionSource | undefined)[] = [undefined, 'human_response', 'host_policy', 'assisted_approval', 'unattended_fallback'];
		const results: PermissionResult['kind'][] = ['approved', 'approved-for-session', 'approved-for-location', 'denied-interactively-by-user', 'denied-by-rules', 'denied-by-content-exclusion-policy', 'denied-by-permission-request-hook', 'denied-no-approval-rule-and-could-not-request-from-user', 'cancelled'];
		assert.deepStrictEqual(results.map(result => sources.map(source => permissionResultToConfirmKind(result, source, false))), [
			['unknown', 'userAction', 'confirmationNotNeeded', 'confirmationNotNeeded', 'confirmationNotNeeded'],
			['unknown', 'userAction', 'setting', 'setting', 'setting'],
			['unknown', 'userAction', 'setting', 'setting', 'setting'],
			['denied', 'denied', 'denied', 'denied', 'denied'],
			['denied', 'denied', 'denied', 'denied', 'denied'],
			['denied', 'denied', 'denied', 'denied', 'denied'],
			['denied', 'denied', 'denied', 'denied', 'denied'],
			['denied', 'denied', 'denied', 'denied', 'denied'],
			['denied', 'denied', 'denied', 'denied', 'denied'],
		]);
	});

	test('hook and no-permission paths do not imply human approval', () => {
		assert.deepStrictEqual([
			permissionResultToConfirmKind(undefined, undefined, false),
			permissionResultToConfirmKind('approved', undefined, true),
			permissionResultToConfirmKind('denied-by-permission-request-hook', undefined, true),
		], ['confirmationNotNeeded', 'confirmationNotNeeded', 'denied']);
	});
});
