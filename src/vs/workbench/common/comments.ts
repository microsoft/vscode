/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
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
