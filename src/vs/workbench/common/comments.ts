/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarshalledId } from '../../base/common/marshallingIds.js';
import { CommentThread } from '../../editor/common/languages.js';

export interface MarshalledCommentThread {
	$mid: MarshalledId.CommentThread;
	commentControlHandle: number;
	commentThreadHandle: number;
}

export interface MarshalledCommentThreadInternal extends MarshalledCommentThread {
	thread: CommentThread;
}
