/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { IChatProgressRenderableResponseContent } from 'vs/workbench/contrib/chat/common/chatModel';

export interface IChatContentPart extends IDisposable {
	domNode: HTMLElement;

	hasSameContent(other: IChatProgressRenderableResponseContent, followingContent: IChatProgressRenderableResponseContent[]): boolean;
}
