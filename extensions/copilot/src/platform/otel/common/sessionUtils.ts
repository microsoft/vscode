/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Uri } from 'vscode';

/**
 * Decode a VS Code chat session resource URI to extract the raw session ID.
 *
 * Handles multiple URI schemes:
 * - `vscode-chat-session://local/<base64EncodedSessionId>` — foreground chat sessions
 * - `copilotcli://<sessionId>` — CLI in-process sessions
 * - `claude-code://<sessionId>` — Claude Code sessions
 *
 * Used by the debug panel, span export, and other session-aware features.
 */
export function decodeSessionId(sessionResource: Uri): string {
	if (sessionResource.scheme === 'copilotcli' || sessionResource.scheme === 'claude-code') {
		return sessionResource.path.replace(/^\//, '');
	}
	const pathSegment = sessionResource.path.replace(/^\//, '').split('/').pop() || '';
	if (pathSegment) {
		try {
			return Buffer.from(pathSegment, 'base64').toString('utf-8');
		} catch { /* not base64, use as-is */ }
	}
	return sessionResource.toString();
}
