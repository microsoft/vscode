/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import { URI } from '../../../base/common/uri.js';
import { workspacelessScratchDir } from '../common/workspacelessScratchDir.js';

/** Ensures the stable, deterministic scratch directory at `<userHome>/.copilot/chats/<sessionId>`, shared across agent harnesses. */
export async function ensureWorkspacelessScratchDir(userHome: URI, sessionId: string): Promise<URI> {
	const dir = workspacelessScratchDir(userHome, sessionId);
	await fs.mkdir(dir.fsPath, { recursive: true });
	return dir;
}
