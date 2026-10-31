/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createAttributedPermissionResult, type AttributedPermissionResult, type PermissionDecisionSource, type PermissionRequestResult, type PermissionResult } from '@github/copilot-sdk';
import type { IAgentHostToolApprovalReport } from '../agentHostTelemetryReporter.js';

export function attributePermissionResult(result: PermissionRequestResult, source: PermissionDecisionSource | undefined): PermissionRequestResult | AttributedPermissionResult {
	if (!source || result.kind === 'no-result') {
		return result;
	}
	if (source === 'human_response') {
		return createAttributedPermissionResult(result, {
			source,
			surface: 'sdk',
			outcome: 'prompted_user',
			responseCapability: 'interactive',
		});
	}
	return createAttributedPermissionResult(result, {
		source,
		surface: 'sdk',
		outcome: isApprovalResponse(result) ? 'auto_approved' : 'autopilot_denied',
	});
}

function isApprovalResponse(result: PermissionRequestResult): boolean {
	switch (result.kind) {
		case 'approve-once':
		case 'approved':
		case 'approve-for-session':
		case 'approve-for-location':
		case 'approve-permanently':
			return true;
		default:
			return false;
	}
}

export function isPermissionDeniedKind(kind: PermissionResult['kind'] | undefined): boolean {
	switch (kind) {
		case 'cancelled':
		case 'denied-by-rules':
		case 'denied-no-approval-rule-and-could-not-request-from-user':
		case 'denied-interactively-by-user':
		case 'denied-by-content-exclusion-policy':
		case 'denied-by-permission-request-hook':
			return true;
		default:
			return false;
	}
}

export function permissionResultToConfirmKind(kind: PermissionResult['kind'] | undefined, source: PermissionDecisionSource | undefined, resolvedByHook: boolean): IAgentHostToolApprovalReport['confirmKind'] {
	if (isPermissionDeniedKind(kind)) {
		return 'denied';
	}
	if (kind === undefined || resolvedByHook) {
		return 'confirmationNotNeeded';
	}
	if (source === 'human_response') {
		return 'userAction';
	}
	if (source) {
		return kind === 'approved-for-session' || kind === 'approved-for-location' ? 'setting' : 'confirmationNotNeeded';
	}
	return 'unknown';
}
