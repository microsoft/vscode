/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son-Of-Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export { CheckpointManager } from './checkpointManager.js';
export { CheckpointStorage } from './storage.js';
export type {
	Checkpoint,
	CheckpointFile,
	CheckpointCreateRequest,
	CheckpointRestoreRequest,
	SessionManifest,
	RetentionPolicy,
} from './types.js';

import { CheckpointManager } from './checkpointManager.js';
import { CheckpointStorage } from './storage.js';
import { startServer } from './server.js';

const workspaceRoot = process.env.WORKSPACE_ROOT ?? process.cwd();
const storagePath = process.env.CHECKPOINT_BASE_PATH ?? '.son-of-anton/checkpoints';

const storage = new CheckpointStorage(storagePath);
const manager = new CheckpointManager(storage, workspaceRoot);

startServer(manager);
