/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';

/**
 * Stable, deterministic per-session scratch directory for a workspace-less
 * (workspace-less chat) session: `<userHome>/.copilot/chats/<sessionId>`. Shared by the
 * Copilot and Claude agents so both resolve the same cwd for a session that was
 * created with no `workingDirectory`.
 */
export function workspacelessScratchDir(userHome: URI, sessionId: string): URI {
	return joinPath(userHome, '.copilot', 'chats', sessionId);
}

/** Ensures the workspace-less scratch dir exists (mkdir -p), returning it. */
export async function ensureWorkspacelessScratchDir(userHome: URI, sessionId: string): Promise<URI> {
	const dir = workspacelessScratchDir(userHome, sessionId);
	await fs.mkdir(dir.fsPath, { recursive: true });
	return dir;
}
