/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son-Of-Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface Checkpoint {
	id: string;
	timestamp: number;
	agentId: string;
	taskId: string;
	action: string;
	toolCall: string;
	files: CheckpointFile[];
	metadata: Record<string, unknown>;
}

export interface CheckpointFile {
	path: string;
	contentHash: string;
	content: string | null;
	exists: boolean;
}

export interface CheckpointCreateRequest {
	agentId: string;
	taskId: string;
	action: string;
	toolCall: string;
	filePaths: string[];
	metadata?: Record<string, unknown>;
}

export interface CheckpointRestoreRequest {
	checkpointId: string;
	sessionId: string;
}

export interface SessionManifest {
	sessionId: string;
	createdAt: number;
	checkpoints: string[];
}

export interface RetentionPolicy {
	sessionRetentionDays: number;
	compressOnSessionEnd: boolean;
}
