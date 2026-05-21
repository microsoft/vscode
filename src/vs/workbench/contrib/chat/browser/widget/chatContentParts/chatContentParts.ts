/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, ReferenceCollection } from '../../../../../../base/common/lifecycle.js';
import { ChatTreeItem, IChatCodeBlockInfo } from '../../chat.js';
import { IChatRendererContent, IChatRequestViewModel, IChatResponseViewModel } from '../../../common/model/chatViewModel.js';
import { DiffEditorPool, EditorPool } from './chatContentCodePools.js';
import { IObservable } from '../../../../../../base/common/observable.js';
import { Event } from '../../../../../../base/common/event.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { ILanguageSelection } from '../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { URI } from '../../../../../../base/common/uri.js';

export interface IChatContentPart extends IDisposable {
	domNode: HTMLElement | undefined;

	/**
	 * Used to indicate a part's ownership of a code block.
	 */
	codeblocksPartId?: string;

	/**
	 * Codeblocks that were rendered by this part.
	 */
	codeblocks?: IChatCodeBlockInfo[];

	/**
	 * Returns true if the other content is equivalent to what is already rendered in this content part.
	 * Returns false if a rerender is needed.
	 * followingContent is all the content that will be rendered after this content part (to support progress messages' behavior).
	 */
	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean;

	/**
	 * Called when the content part is mounted to the DOM after being detached
	 * due to virtualization.
	 */
	onDidRemount?(): void;

	addDisposable?(disposable: IDisposable): void;
}

export interface IChatContentPartRenderContext {
	readonly element: IChatRequestViewModel | IChatResponseViewModel;
	readonly elementIndex: number;
	readonly container: HTMLElement;
	readonly content: ReadonlyArray<IChatRendererContent>;
	readonly contentIndex: number;
	readonly editorPool: EditorPool;
	readonly codeBlockStartIndex: number;
	readonly treeStartIndex: number;
	readonly diffEditorPool: DiffEditorPool;
	readonly currentWidth: IObservable<number>;
	readonly onDidChangeVisibility: Event<boolean>;
	readonly inlineTextModels: InlineTextModelCollection;
}

/**
 * Ref-counted collection of inline text models keyed by URI. Models are
 * created on first acquire and disposed only when the last reference is
 * released, preventing duplicate-model errors during re-renders.
 */
export class InlineTextModelCollection extends Disposable {
	private readonly _collection: InlineTextModelReferenceCollection;

	constructor(@IModelService modelService: IModelService) {
		super();
		this._collection = new InlineTextModelReferenceCollection(modelService);
	}

	acquire(uri: URI, value: string, languageSelection: ILanguageSelection | null, isForSimpleWidget: boolean) {
		return this._collection.acquire(uri.toString(), uri, value, languageSelection, isForSimpleWidget);
	}
}

class InlineTextModelReferenceCollection extends ReferenceCollection<ITextModel> {
	constructor(private readonly modelService: IModelService) {
		super();
	}

	protected override createReferencedObject(key: string, uri: URI, value: string, languageSelection: ILanguageSelection | null, isForSimpleWidget: boolean): ITextModel {
		return this.modelService.createModel(value, languageSelection, uri, isForSimpleWidget);
	}

	protected override destroyReferencedObject(_key: string, model: ITextModel): void {
		model.dispose();
	}
}
