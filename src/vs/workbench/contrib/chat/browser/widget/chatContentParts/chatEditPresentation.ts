/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, IReference } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import type { IOpenEditorOptions } from '../../../../../../platform/editor/browser/editor.js';
import type { IResolvedTextEditorModel } from '../../../../../../editor/common/services/resolverService.js';
import type { IChatExternalEdit } from '../../../common/chatService/chatService.js';
import type { IChatTextEditGroup } from '../../../common/model/chatModel.js';
import type { IChatResponseViewModel } from '../../../common/model/chatViewModel.js';
import type { DiffEditorPool } from './chatContentCodePools.js';

export type ChatEditCompareModelFactory = () => Promise<IReference<{ originalSha1: string; original: IResolvedTextEditorModel; modified: IResolvedTextEditorModel }>>;

export interface IChatEditPresentation extends IDisposable {
	readonly domNode: HTMLElement;
	layout(width: number): void;
}

/** A file change with optional before/after resources for created or deleted files. */
export interface IChatEditDiff {
	readonly uri: URI;
	readonly originalURI: URI | undefined;
	readonly modifiedURI: URI | undefined;
	readonly added: number;
	readonly removed: number;
}

export const IChatEditPresentationService = createDecorator<IChatEditPresentationService>('chatEditPresentation');

/** The entry selects edit rendering and opening; shared chat retains compare-model ownership. */
export interface IChatEditPresentationService {
	readonly _serviceBrand: undefined;
	renderTextEdit(edit: IChatTextEditGroup, response: IChatResponseViewModel, createModel: ChatEditCompareModelFactory, diffEditorPool: DiffEditorPool, width: number): IChatEditPresentation;
	openExternalEdit(edit: IChatExternalEdit, options: IOpenEditorOptions): Promise<void>;
}
