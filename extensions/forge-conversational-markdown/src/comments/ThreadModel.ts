/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { BlockAnchor, CommentMessage, CommentThreadRecord, ThreadAnchor, ThreadStatus } from '../protocol/types';

export type { BlockAnchor, CommentMessage, CommentThreadRecord, ThreadAnchor, ThreadStatus };

/** In-memory thread used by the editor host (mutable comments / status). */
export interface MutableCommentThreadRecord {
	id: string;
	status: ThreadStatus;
	anchor: ThreadAnchor;
	comments: CommentMessage[];
	createdAt: string;
	updatedAt: string;
}

export function newThreadId(): string {
	return `th-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function newCommentId(): string {
	return `cm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function nowIso(): string {
	return new Date().toISOString();
}
