/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ChatTreeItem, IChatCodeBlockInfo } from '../chat.js';
import { IChatRendererContent } from '../../common/chatViewModel.js';
import { CodeBlockModelCollection } from '../../common/codeBlockModelCollection.js';
import { DiffEditorPool, EditorPool } from './chatContentCodePools.js';

export interface IChatContentPart extends IDisposable {
	domNode: HTMLElement | undefined;

	/**
	 * Used to indicate a part's ownership of a code block.
	 */
	codeblocksPartId?: string;

	/**
	 * Codeblocks that were rendered by this part into CodeBlockModelCollection.
	 */
	codeblocks?: IChatCodeBlockInfo[];

	/**
	 * Returns true if the other content is equivalent to what is already rendered in this content part.
	 * Returns false if a rerender is needed.
	 * followingContent is all the content that will be rendered after this content part (to support progress messages' behavior).
	 */
	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean;

	addDisposable?(disposable: IDisposable): void;
}

export interface IChatContentPartRenderContext {
	readonly element: ChatTreeItem;
	readonly elementIndex: number;
	readonly container: HTMLElement;
	readonly content: ReadonlyArray<IChatRendererContent>;
	readonly contentIndex: number;
	readonly preceedingContentParts: ReadonlyArray<IChatContentPart>;
	readonly editorPool: EditorPool;
	readonly codeBlockStartIndex: number;
	readonly diffEditorPool: DiffEditorPool;
	readonly codeBlockModelCollection: CodeBlockModelCollection;
	currentWidth(): number;
}
