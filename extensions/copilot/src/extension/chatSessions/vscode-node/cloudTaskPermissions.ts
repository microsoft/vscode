/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AgentTaskSessionEvent } from '@vscode/copilot-api';
import { l10n } from 'vscode';
import { ChatResponseConfirmationPart } from '../../../vscodeTypes';
import { TaskContent } from '../vscode/cloudAgentBackend';

export interface CloudPermissionConfirmation {
	readonly kind: 'cloudAutomationPermission';
	readonly taskId: string;
	readonly sessionId: string;
	readonly requestId: string;
	readonly eventId: string;
}

export interface CloudTaskPermission {
	readonly confirmation: CloudPermissionConfirmation;
	readonly toolCallId?: string;
	readonly serverName: string;
	readonly toolName: string;
	readonly arguments: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isCloudPermissionConfirmation(value: unknown): value is CloudPermissionConfirmation {
	return isRecord(value) && value.kind === 'cloudAutomationPermission'
		&& ['taskId', 'sessionId', 'requestId', 'eventId'].every(key => typeof value[key] === 'string' && value[key].length > 0);
}

/** Projects unresolved permissions for the latest automation session. */
export function getCloudTaskPermissions(task: TaskContent['task'], events: readonly AgentTaskSessionEvent[]): CloudTaskPermission[] {
	if (typeof task.automation_id !== 'string' || !task.automation_id) {
		return [];
	}
	const latest = task.sessions?.at(-1);
	if (!latest || !['queued', 'in_progress', 'waiting_for_user', 'idle'].includes(task.state)
		|| !['queued', 'in_progress', 'waiting_for_user', 'idle'].includes(latest.state)) {
		return [];
	}
	const pending = new Map<string, { event: AgentTaskSessionEvent & { type: 'permission.requested' }; sessionId: string }>();
	const eventSessions = new Map<string, string>();
	let sessionId = task.sessions?.length === 1 ? latest.id : undefined;
	for (const event of events) {
		if (event.dismissed) {
			continue;
		}
		if (event.type === 'session.start') {
			sessionId = event.data.sessionId;
		}
		const eventSession = event.parentId ? eventSessions.get(event.parentId) ?? sessionId : sessionId;
		if (eventSession) {
			eventSessions.set(event.id, eventSession);
		}
		if (eventSession !== latest.id) {
			continue;
		}
		if (event.type === 'permission.requested') {
			const previous = pending.get(event.data.requestId);
			if (previous && JSON.stringify(previous.event.data) !== JSON.stringify(event.data)) {
				throw new Error(l10n.t('The cloud permission changed. Refresh the session before responding.'));
			}
			pending.set(event.data.requestId, { event, sessionId: latest.id });
		} else if (event.type === 'permission.completed') {
			pending.delete(event.data.requestId);
		} else if (event.type === 'tool.execution_complete') {
			for (const [id, request] of pending) {
				const permission = request.event.data.permissionRequest;
				if (isRecord(permission) && permission.toolCallId === event.data.toolCallId) {
					pending.delete(id);
				}
			}
		}
	}
	return [...pending.values()].map(({ event, sessionId }) => {
		const request = event.data.permissionRequest;
		if (task.remote_steerable !== true || !('remote_steerable' in latest) || latest.remote_steerable !== true) {
			throw new Error(l10n.t('This cloud session does not support permission responses from VS Code.'));
		}
		if (!event.data.requestId || !isRecord(request) || request.kind !== 'mcp'
			|| typeof request.serverName !== 'string' || !request.serverName
			|| typeof request.toolName !== 'string' || !request.toolName || !isRecord(request.args)
			|| (request.toolCallId !== undefined && typeof request.toolCallId !== 'string')) {
			throw new Error(l10n.t('The cloud permission request is incomplete or unsupported. No decision was sent.'));
		}
		return {
			confirmation: { kind: 'cloudAutomationPermission', taskId: task.id, sessionId, requestId: event.data.requestId, eventId: event.id },
			toolCallId: request.toolCallId,
			serverName: request.serverName,
			toolName: request.toolName,
			arguments: request.args,
		};
	});
}

export function cloudPermissionPart(permission: CloudTaskPermission): ChatResponseConfirmationPart {
	return new ChatResponseConfirmationPart(
		l10n.t('Allow {0}?', permission.toolName),
		l10n.t('Cloud automation requests this tool once.\n\nServer: {0}\nTool: {1}\n\nArguments:\n{2}', permission.serverName, permission.toolName, JSON.stringify(permission.arguments, null, 2)),
		permission.confirmation,
		[l10n.t('Allow Once'), l10n.t('Deny')],
	);
}
