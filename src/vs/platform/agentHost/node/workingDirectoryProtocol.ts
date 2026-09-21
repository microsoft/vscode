/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { hasKey } from '../../../base/common/types.js';
import { ActionType, NotificationType, type ActionEnvelope, type INotification, type SessionWorkingDirectoryAction } from '../common/state/sessionActions.js';
import { JsonRpcErrorCodes, ProtocolError, type IStateSnapshot } from '../common/state/sessionProtocol.js';
import { getWorkingDirectoryUri } from '../common/agentHostWorkingDirectories.js';
import { WorkingDirectoryOriginKind, type WorkingDirectory } from '../common/state/protocol/channels-session/state.js';
import type { URI as ProtocolURI } from '../common/state/protocol/common/state.js';

function isProtocolObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseClientWorkingDirectory(value: unknown): URI {
	let resource: unknown = value;
	if (isProtocolObject(value)) {
		if (value.repo !== undefined) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Working-directory repository metadata is host-owned.');
		}
		if (value.origin !== undefined) {
			const origin = value.origin;
			if (!isProtocolObject(origin) || origin.kind !== WorkingDirectoryOriginKind.Local) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Clients may only supply local working-directory origins.');
			}
		}
		resource = value.uri;
	}
	if (typeof resource !== 'string' || resource.length === 0) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Working directory must be a URI or an object with a URI.');
	}
	try {
		return URI.parse(resource, true);
	} catch {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Working directory must contain a valid URI.');
	}
}

export function parseClientWorkingDirectories(value: unknown): URI[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!Array.isArray(value)) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Working directories must be an array.');
	}
	return value.map(directory => {
		if (typeof directory !== 'string') {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'createSession working directories must be URI strings.');
		}
		return parseClientWorkingDirectory(directory);
	});
}

export function validateClientWorkingDirectoryAction(action: SessionWorkingDirectoryAction): void {
	if (action.type === ActionType.SessionWorkingDirectorySet) {
		parseClientWorkingDirectory(action.directory);
	} else {
		if (typeof action.directory !== 'string') {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Working-directory targets must be URI strings.');
		}
		parseClientWorkingDirectory(action.directory);
		if (action.type === ActionType.SessionWorkingDirectoryReplaced) {
			parseClientWorkingDirectory(action.replacement);
		}
	}
}

export function projectWorkingDirectoryFields<T extends { workingDirectories?: readonly (ProtocolURI | WorkingDirectory)[] }>(value: T, supportsWorkingDirectoryInfo: boolean): T {
	if (supportsWorkingDirectoryInfo || !value.workingDirectories?.some(directory => typeof directory !== 'string')) {
		return value;
	}
	return { ...value, workingDirectories: value.workingDirectories.map(getWorkingDirectoryUri) };
}

export function projectWorkingDirectorySnapshot(snapshot: IStateSnapshot, supportsWorkingDirectoryInfo: boolean): IStateSnapshot {
	if (supportsWorkingDirectoryInfo || !hasKey(snapshot.state, { provider: true })) {
		return snapshot;
	}
	const state = projectWorkingDirectoryFields(snapshot.state, false);
	return state === snapshot.state ? snapshot : { ...snapshot, state };
}

export function projectWorkingDirectoryAction(envelope: ActionEnvelope, supportsWorkingDirectoryInfo: boolean): ActionEnvelope {
	if (supportsWorkingDirectoryInfo) {
		return envelope;
	}
	const action = envelope.action;
	switch (action.type) {
		case ActionType.SessionWorkingDirectorySet:
			return typeof action.directory === 'object' && action.directory !== null && typeof action.directory.uri === 'string'
				? { ...envelope, action: { ...action, directory: action.directory.uri } }
				: envelope;
		case ActionType.SessionWorkingDirectoryReplaced:
			return typeof action.replacement === 'object' && action.replacement !== null && typeof action.replacement.uri === 'string'
				? { ...envelope, action: { ...action, replacement: action.replacement.uri } }
				: envelope;
		default:
			return envelope;
	}
}

export function projectWorkingDirectoryNotification(notification: INotification, supportsWorkingDirectoryInfo: boolean): INotification {
	if (supportsWorkingDirectoryInfo) {
		return notification;
	}
	switch (notification.type) {
		case NotificationType.SessionAdded:
			return { ...notification, summary: projectWorkingDirectoryFields(notification.summary, false) };
		case NotificationType.SessionSummaryChanged:
			return { ...notification, changes: projectWorkingDirectoryFields(notification.changes, false) };
		default:
			return notification;
	}
}
