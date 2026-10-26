/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parseGitHubRequestId } from '../client/headers.js';

/** Credential-free diagnostics shared by Mission Control's HTTP clients. */
export interface MissionControlErrorMetadata {
	readonly code?: string;
	readonly limitedResource?: string;
	readonly requestId?: string;
}

/** Projects error codes without retaining response bodies, messages, or credentials. */
export function parseMissionControlError(body: string | null | undefined, requestId?: string | readonly string[] | null): MissionControlErrorMetadata {
	let value: unknown;
	try {
		value = body ? JSON.parse(body) : undefined;
	} catch (error) {
		if (!(error instanceof SyntaxError)) {
			throw error;
		}
	}
	const record = typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined;
	const code = parseMissionControlErrorCode(record?.error_code) ?? parseMissionControlErrorCode(record?.code);
	return {
		code,
		limitedResource: code === 'rate_limit_exceeded' ? parseMissionControlErrorCode(record?.limited_resource) : undefined,
		requestId: parseGitHubRequestId(requestId),
	};
}

export function parseMissionControlErrorCode(value: unknown): string | undefined {
	return typeof value === 'string' && /^[a-z][a-z0-9_]{0,79}$/.test(value)
		&& !/^(?:gh[pousr]_|github_pat_)/.test(value) ? value : undefined;
}

const permanentCodes = new Set([
	'bad_request', 'validation_failed', 'missing_body', 'malformed_body', 'invalid_request', 'invalid_scope', 'invalid_target', 'too_large',
	'narrowing_violation', 'permission_set_unsupported', 'scoped_token_unsupported',
	'unauthenticated', 'authentication_required', 'token_required',
	'forbidden', 'resource_access_denied', 'actor_blocked', 'issuance_denied', 'environment_provisioning_forbidden', 'environment_connection_forbidden',
	'not_found', 'session_not_found', 'task_not_found', 'environment_not_found',
	'session_id_conflict', 'pull_request_exists', 'task_already_archived', 'task_not_archived', 'session_not_steerable',
	'feature_disabled', 'not_implemented', 'managed_settings_unsupported',
	'environment_unreachable', 'environment_compute_missing', 'environment_compute_terminal', 'request_canceled',
]);

/** Authentication failures require credential replacement, not a timer retry. */
export function isRetryableMissionControlError(status: number | undefined, code?: string): boolean {
	if (code === 'rate_limit_exceeded') {
		return true;
	}
	if (code !== undefined && permanentCodes.has(code)) {
		return false;
	}
	return status === undefined || status === 408 || status === 429 || status >= 500;
}

export function missionControlMaxRetries(code?: string): number {
	return code === 'internal_error' ? 2 : 3;
}

/** Server pacing takes precedence over a jittered, bounded client backoff. */
export function missionControlRetryDelay(code: string | undefined, retryAfterSeconds: number | undefined, failures: number): number {
	if (retryAfterSeconds !== undefined && Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
		return retryAfterSeconds * 1000;
	}
	const backoff = code === 'rate_limit_exceeded' ? 5_000 : Math.min(30_000, 1_000 * 2 ** Math.min(failures - 1, 5)) + Math.floor(Math.random() * 250);
	return backoff;
}

export const MISSION_CONTROL_RETRY_BUDGET_MS = 120_000;
