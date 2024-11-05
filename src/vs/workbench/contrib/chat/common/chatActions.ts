/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarshalledId } from '../../../../base/common/marshallingIds.js';

export interface IChatViewTitleActionContext {
	$mid: MarshalledId.ChatViewContext;
	sessionId: string;
}

export function isChatViewTitleActionContext(obj: unknown): obj is IChatViewTitleActionContext {
	return !!obj &&
		typeof (obj as IChatViewTitleActionContext).sessionId === 'string'
		&& (obj as IChatViewTitleActionContext).$mid === MarshalledId.ChatViewContext;
}
