/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable, IReference, RefCountedDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { isEqual } from 'vs/base/common/resources';
import { assertType } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { TextEdit } from 'vs/editor/common/languages';
import { createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { IModelService } from 'vs/editor/common/services/model';
import { DefaultModelSHA1Computer } from 'vs/editor/common/services/modelService';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { localize } from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IChatListItemRendererOptions } from 'vs/workbench/contrib/chat/browser/chat';
import { IDisposableReference, ResourcePool } from 'vs/workbench/contrib/chat/browser/chatContentParts/chatCollections';
import { IChatContentPart, IChatContentPartRenderContext } from 'vs/workbench/contrib/chat/browser/chatContentParts/chatContentParts';
import { IChatRendererDelegate } from 'vs/workbench/contrib/chat/browser/chatListRenderer';
import { ChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatOptions';
import { CodeCompareBlockPart, ICodeCompareBlockData, ICodeCompareBlockDiffData } from 'vs/workbench/contrib/chat/browser/codeBlockPart';
import { IChatProgressRenderableResponseContent, IChatTextEditGroup } from 'vs/workbench/contrib/chat/common/chatModel';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatResponseViewModel, isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';

const $ = dom.$;

const ICodeCompareModelService = createDecorator<ICodeCompareModelService>('ICodeCompareModelService');

interface ICodeCompareModelService {
	_serviceBrand: undefined;
	createModel(response: IChatResponseViewModel, chatTextEdit: IChatTextEditGroup): Promise<IReference<{ originalSha1: string; original: IResolvedTextEditorModel; modified: IResolvedTextEditorModel }>>;
}

export class ChatTextEditContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;
	private readonly comparePart: IDisposableReference<CodeCompareBlockPart> | undefined;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		chatTextEdit: IChatTextEditGroup,
		context: IChatContentPartRenderContext,
		rendererOptions: IChatListItemRendererOptions,
		diffEditorPool: DiffEditorPool,
		currentWidth: number,
		@ICodeCompareModelService private readonly codeCompareModelService: ICodeCompareModelService
	) {
		super();
		const element = context.element;

		assertType(isResponseVM(element));

		// TODO@jrieken move this into the CompareCodeBlock and properly say what kind of changes happen
		if (rendererOptions.renderTextEditsAsSummary?.(chatTextEdit.uri)) {
			if (element.response.value.every(item => item.kind === 'textEditGroup')) {
				this.domNode = $('.interactive-edits-summary', undefined, !element.isComplete
					? ''
					: element.isCanceled
						? localize('edits0', "Making changes was aborted.")
						: localize('editsSummary', "Made changes."));
			} else {
				this.domNode = $('div');
			}

			// TODO@roblourens this case is now handled outside this Part in ChatListRenderer, but can it be cleaned up?
			// return;
		} else {


			const cts = new CancellationTokenSource();

			let isDisposed = false;
			this._register(toDisposable(() => {
				isDisposed = true;
				cts.dispose(true);
			}));

			this.comparePart = this._register(diffEditorPool.get());

			// Attach this after updating text/layout of the editor, so it should only be fired when the size updates later (horizontal scrollbar, wrapping)
			// not during a renderElement OR a progressive render (when we will be firing this event anyway at the end of the render)
			this._register(this.comparePart.object.onDidChangeContentHeight(() => {
				this._onDidChangeHeight.fire();
			}));

			const data: ICodeCompareBlockData = {
				element,
				edit: chatTextEdit,
				diffData: (async () => {

					const ref = await this.codeCompareModelService.createModel(element, chatTextEdit);

					if (isDisposed) {
						ref.dispose();
						return;
					}

					this._register(ref);

					return {
						modified: ref.object.modified.textEditorModel,
						original: ref.object.original.textEditorModel,
						originalSha1: ref.object.originalSha1
					} satisfies ICodeCompareBlockDiffData;
				})()
			};
			this.comparePart.object.render(data, currentWidth, cts.token);

			this.domNode = this.comparePart.object.element;
		}
	}

	layout(width: number): void {
		this.comparePart?.object.layout(width);
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		// No other change allowed for this content type
		return other.kind === 'textEditGroup';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}

export class DiffEditorPool extends Disposable {

	private readonly _pool: ResourcePool<CodeCompareBlockPart>;

	public inUse(): Iterable<CodeCompareBlockPart> {
		return this._pool.inUse;
	}

	constructor(
		options: ChatEditorOptions,
		delegate: IChatRendererDelegate,
		overflowWidgetsDomNode: HTMLElement | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._pool = this._register(new ResourcePool(() => {
			return instantiationService.createInstance(CodeCompareBlockPart, options, MenuId.ChatCompareBlock, delegate, overflowWidgetsDomNode);
		}));
	}

	get(): IDisposableReference<CodeCompareBlockPart> {
		const codeBlock = this._pool.get();
		let stale = false;
		return {
			object: codeBlock,
			isStale: () => stale,
			dispose: () => {
				codeBlock.reset();
				stale = true;
				this._pool.release(codeBlock);
			}
		};
	}
}

class CodeCompareModelService implements ICodeCompareModelService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ITextModelService private readonly textModelService: ITextModelService,
		@IModelService private readonly modelService: IModelService,
		@IChatService private readonly chatService: IChatService,
	) { }

	async createModel(element: IChatResponseViewModel, chatTextEdit: IChatTextEditGroup): Promise<IReference<{ originalSha1: string; original: IResolvedTextEditorModel; modified: IResolvedTextEditorModel }>> {

		const original = await this.textModelService.createModelReference(chatTextEdit.uri);

		const modified = await this.textModelService.createModelReference((this.modelService.createModel(
			createTextBufferFactoryFromSnapshot(original.object.textEditorModel.createSnapshot()),
			{ languageId: original.object.textEditorModel.getLanguageId(), onDidChange: Event.None },
			URI.from({ scheme: Schemas.vscodeChatCodeBlock, path: chatTextEdit.uri.path, query: generateUuid() }),
			false
		)).uri);

		const d = new RefCountedDisposable(toDisposable(() => {
			original.dispose();
			modified.dispose();
		}));

		// compute the sha1 of the original model
		let originalSha1: string = '';
		if (chatTextEdit.state) {
			originalSha1 = chatTextEdit.state.sha1;
		} else {
			const sha1 = new DefaultModelSHA1Computer();
			if (sha1.canComputeSHA1(original.object.textEditorModel)) {
				originalSha1 = sha1.computeSHA1(original.object.textEditorModel);
				chatTextEdit.state = { sha1: originalSha1, applied: 0 };
			}
		}

		// apply edits to the "modified" model
		const chatModel = this.chatService.getSession(element.sessionId)!;
		const editGroups: ISingleEditOperation[][] = [];
		for (const request of chatModel.getRequests()) {
			if (!request.response) {
				continue;
			}
			for (const item of request.response.response.value) {
				if (item.kind !== 'textEditGroup' || item.state?.applied || !isEqual(item.uri, chatTextEdit.uri)) {
					continue;
				}
				for (const group of item.edits) {
					const edits = group.map(TextEdit.asEditOperation);
					editGroups.push(edits);
				}
			}
			if (request.response === element.model) {
				break;
			}
		}
		for (const edits of editGroups) {
			modified.object.textEditorModel.pushEditOperations(null, edits, () => null);
		}

		// self-acquire a reference to diff models for a short while
		// because streaming usually means we will be using the original-model
		// repeatedly and thereby also should reuse the modified-model and just
		// update it with more edits
		d.acquire();
		setTimeout(() => d.release(), 5000);

		return {
			object: {
				originalSha1,
				original: original.object,
				modified: modified.object
			},
			dispose() {
				d.release();
			},
		};
	}
}

registerSingleton(ICodeCompareModelService, CodeCompareModelService, InstantiationType.Delayed);
