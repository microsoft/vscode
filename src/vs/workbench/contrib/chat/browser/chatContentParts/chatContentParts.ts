/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { ChatTreeItem } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatProgressRenderableResponseContent } from 'vs/workbench/contrib/chat/common/chatModel';

export interface IChatContentPart extends IDisposable {
	domNode: HTMLElement;

	hasSameContent(other: IChatProgressRenderableResponseContent, followingContent: IChatProgressRenderableResponseContent[], element: ChatTreeItem): boolean;
	addDisposable?(disposable: IDisposable): void;
}

export interface IChatContentPartRenderContext {
	element: ChatTreeItem;
	index: number;
	content: ReadonlyArray<IChatProgressRenderableResponseContent>;
	preceedingContentParts: ReadonlyArray<IChatContentPart>;
}
