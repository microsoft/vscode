/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GuardianApprovalReviewAction } from './protocol/generated/v2/GuardianApprovalReviewAction.js';
import type { ItemGuardianApprovalReviewCompletedNotification } from './protocol/generated/v2/ItemGuardianApprovalReviewCompletedNotification.js';
import type { RequestPermissionProfile } from './protocol/generated/v2/RequestPermissionProfile.js';
import type { JsonValue } from './protocol/generated/serde_json/JsonValue.js';
import { unwrapShellInvocation } from './codexShellCommand.js';

/**
 * Auto-review (guardian) notifications are emitted by the app-server with
 * `ts-rs`-generated camelCase field names. The `thread/approveGuardianDeniedAction`
 * request, however, echoes back a `codex_protocol::protocol::GuardianAssessmentEvent`
 * that is (de)serialized with plain `serde` — which uses **snake_case** for enum
 * variants, enum values, and the tagged-union `type` discriminant. The two shapes
 * therefore diverge (`inProgress` vs `in_progress`, `networkAccess` vs
 * `network_access`, `unifiedExec` vs `unified_exec`, `toolName` vs `tool_name`, …),
 * so we cannot round-trip the notification payload verbatim.
 *
 * These helpers translate the camelCase completed-review notification into the
 * snake_case `GuardianAssessmentEvent` JSON that the app-server can deserialize,
 * and summarise a review action for display on the approval card.
 */

/** camelCase {@link GuardianApprovalReviewStatus} value -> snake_case `GuardianAssessmentStatus`. */
function guardianStatusToEvent(status: string): string {
	switch (status) {
		case 'inProgress': return 'in_progress';
		case 'timedOut': return 'timed_out';
		// `approved`, `denied`, `aborted` are identical in both casings.
		default: return status;
	}
}

/** camelCase {@link GuardianCommandSource} value -> snake_case. */
function commandSourceToEvent(source: string): string {
	return source === 'unifiedExec' ? 'unified_exec' : source;
}

/** camelCase {@link NetworkApprovalProtocol} value -> snake_case. */
function networkProtocolToEvent(protocol: string): string {
	switch (protocol) {
		case 'socks5Tcp': return 'socks5_tcp';
		case 'socks5Udp': return 'socks5_udp';
		// `http`, `https` are identical in both casings.
		default: return protocol;
	}
}

/**
 * camelCase {@link RequestPermissionProfile} -> snake_case. The `network`
 * profile (`{ enabled }`) is identical in both casings, but the file-system
 * profile renames `fileSystem` -> `file_system` and `globScanMaxDepth` ->
 * `glob_scan_max_depth`. Its `read`/`write`/`entries` members (and the entry
 * `path`/`access` fields) are already snake_case in the notification, so they
 * round-trip verbatim.
 */
function requestPermissionProfileToEvent(profile: RequestPermissionProfile): JsonValue {
	const fs = profile.fileSystem;
	let fileSystem: JsonValue = null;
	if (fs) {
		const mapped: Record<string, JsonValue> = { read: fs.read, write: fs.write };
		if (fs.globScanMaxDepth !== undefined) {
			mapped.glob_scan_max_depth = fs.globScanMaxDepth;
		}
		if (fs.entries !== undefined) {
			mapped.entries = fs.entries as JsonValue;
		}
		fileSystem = mapped;
	}
	return { network: profile.network as JsonValue, file_system: fileSystem };
}

/**
 * Translate the camelCase notification action into the snake_case
 * `GuardianAssessmentAction` (`#[serde(tag = "type", rename_all = "snake_case")]`)
 * that `thread/approveGuardianDeniedAction` deserializes.
 */
export function guardianReviewActionToEventAction(action: GuardianApprovalReviewAction): JsonValue {
	switch (action.type) {
		case 'command':
			return { type: 'command', source: commandSourceToEvent(action.source), command: action.command, cwd: action.cwd };
		case 'execve':
			return { type: 'execve', source: commandSourceToEvent(action.source), program: action.program, argv: action.argv, cwd: action.cwd };
		case 'applyPatch':
			return { type: 'apply_patch', cwd: action.cwd, files: action.files };
		case 'networkAccess':
			return { type: 'network_access', target: action.target, host: action.host, protocol: networkProtocolToEvent(action.protocol), port: action.port };
		case 'mcpToolCall':
			return { type: 'mcp_tool_call', server: action.server, tool_name: action.toolName, connector_id: action.connectorId, connector_name: action.connectorName, tool_title: action.toolTitle };
		case 'requestPermissions':
			return { type: 'request_permissions', reason: action.reason, permissions: requestPermissionProfileToEvent(action.permissions) };
	}
}

/**
 * Build the snake_case `GuardianAssessmentEvent` JSON expected by
 * `thread/approveGuardianDeniedAction` from a completed-review notification.
 * Optional fields are omitted when absent (the Rust struct defaults them).
 */
export function toGuardianAssessmentEventJson(notification: ItemGuardianApprovalReviewCompletedNotification): JsonValue {
	const event: Record<string, JsonValue> = {
		id: notification.reviewId,
		turn_id: notification.turnId,
		started_at_ms: notification.startedAtMs,
		status: guardianStatusToEvent(notification.review.status),
		action: guardianReviewActionToEventAction(notification.action),
	};
	if (notification.targetItemId !== null) {
		event.target_item_id = notification.targetItemId;
	}
	if (notification.completedAtMs !== null && notification.completedAtMs !== undefined) {
		event.completed_at_ms = notification.completedAtMs;
	}
	if (notification.review.riskLevel !== null) {
		event.risk_level = notification.review.riskLevel;
	}
	if (notification.review.userAuthorization !== null) {
		event.user_authorization = notification.review.userAuthorization;
	}
	if (notification.review.rationale !== null) {
		event.rationale = notification.review.rationale;
	}
	if (notification.decisionSource !== null && notification.decisionSource !== undefined) {
		event.decision_source = notification.decisionSource;
	}
	return event;
}

/** A human-readable summary of a reviewed action for the approval card. */
export interface IGuardianActionSummary {
	/** Short title (e.g. `"Network access"`). */
	readonly title: string;
	/** Detail line describing the specific action (e.g. the command or host). */
	readonly detail: string;
	/** Closest matching tool kind for iconography, when one applies. */
	readonly toolKind?: 'terminal' | 'search';
}

/** Summarise a review action for display on the denied-action approval card. */
export function summarizeGuardianReviewAction(action: GuardianApprovalReviewAction): IGuardianActionSummary {
	switch (action.type) {
		case 'command':
			// Display-only: unwrap the OS shell wrapper (`/bin/zsh -lc '…'`) so the
			// denial notice and "Approve anyway" card show the same clean command
			// as the terminal pill. The raw action is still round-tripped verbatim
			// to the app-server via toGuardianAssessmentEventJson on approval.
			return { title: 'Run command', detail: unwrapShellInvocation(action.command), toolKind: 'terminal' };
		case 'execve':
			return { title: 'Run program', detail: unwrapShellInvocation([action.program, ...action.argv].join(' ')), toolKind: 'terminal' };
		case 'applyPatch':
			return { title: 'Apply file changes', detail: action.files.join(', ') };
		case 'networkAccess':
			return { title: 'Network access', detail: action.target || `${action.protocol}://${action.host}:${action.port}`, toolKind: 'search' };
		case 'mcpToolCall':
			return { title: 'MCP tool call', detail: `${action.server}/${action.toolName}` };
		case 'requestPermissions':
			return { title: 'Elevated permissions', detail: action.reason ?? 'Requested additional permissions' };
	}
}

/** Escape the inline-code span so an embedded backtick can't break out of it. */
function inlineCode(text: string): string {
	// Use a fence long enough to contain any run of backticks in the text, per
	// CommonMark's variable-length code-span rule, and pad with spaces when the
	// content itself starts/ends with a backtick.
	const longestRun = (text.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
	const fence = '`'.repeat(longestRun + 1);
	const padding = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
	return `${fence}${padding}${text}${padding}${fence}`;
}

/**
 * Compose the durable denial notice for an auto-review denial, rendered as a
 * Markdown response part (which survives turn completion and, unlike a transient
 * progress/system-notification message, is not dropped by the live streaming
 * path) so the user always learns *why* an action was blocked — including the
 * reviewer rationale — even when the turn ends before the best-effort "Approve
 * anyway" card can be acted on. The notice is emitted as a blockquote so it
 * stays visually distinct from the model's own prose even when adjacent
 * Markdown parts are concatenated into one rendered block.
 */
export function formatGuardianDenialNotification(summary: IGuardianActionSummary, rationale: string | null): string {
	const detail = summary.detail?.trim();
	const header = '**Auto-review denied**';
	const lines: string[] = [
		detail
			? `⚠️ ${header} — ${summary.title}: ${inlineCode(detail)}`
			: `⚠️ ${header} — ${summary.title}`,
	];
	const reason = rationale?.trim();
	if (reason) {
		lines.push('', ...reason.split('\n'));
	}
	const quoted = lines.map(line => (line ? `> ${line}` : '>')).join('\n');
	// Leading blank line separates the blockquote from any preceding Markdown
	// part; trailing newline keeps subsequent model output on its own block.
	return `\n\n${quoted}\n`;
}
