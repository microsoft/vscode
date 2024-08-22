/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom';
import { CancellationTokenSource } from '../../../../../base/common/cancellation';
import { Emitter, Event } from '../../../../../base/common/event';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle';
import { Schemas } from '../../../../../base/common/network';
import { isEqual } from '../../../../../base/common/resources';
import { URI } from '../../../../../base/common/uri';
import { generateUuid } from '../../../../../base/common/uuid';
import { ISingleEditOperation } from '../../../../../editor/common/core/editOperation';
import { TextEdit } from '../../../../../editor/common/languages';
import { createTextBufferFactoryFromSnapshot } from '../../../../../editor/common/model/textModel';
import { IModelService } from '../../../../../editor/common/services/model';
import { DefaultModelSHA1Computer } from '../../../../../editor/common/services/modelService';
import { ITextModelService } from '../../../../../editor/common/services/resolverService';
import { localize } from '../../../../../nls';
import { MenuId } from '../../../../../platform/actions/common/actions';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation';
import { IChatListItemRendererOptions } from '../chat';
import { IDisposableReference, ResourcePool } from './chatCollections';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts';
import { IChatRendererDelegate } from '../chatListRenderer';
import { ChatEditorOptions } from '../chatOptions';
import { CodeCompareBlockPart, ICodeCompareBlockData, ICodeCompareBlockDiffData } from '../codeBlockPart';
import { IChatProgressRenderableResponseContent, IChatTextEditGroup } from '../../common/chatModel';
import { IChatService } from '../../common/chatService';
import { isResponseVM } from '../../common/chatViewModel';

const $ = dom.$;

export class ChatTextEditContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;
	private readonly ref: IDisposableReference<CodeCompareBlockPart> | undefined;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		chatTextEdit: IChatTextEditGroup,
		context: IChatContentPartRenderContext,
		rendererOptions: IChatListItemRendererOptions,
		diffEditorPool: DiffEditorPool,
		currentWidth: number,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IModelService private readonly modelService: IModelService,
		@IChatService private readonly chatService: IChatService,
	) {
		super();
		const element = context.element;

		// TODO@jrieken move this into the CompareCodeBlock and properly say what kind of changes happen
		if (rendererOptions.renderTextEditsAsSummary?.(chatTextEdit.uri)) {
			if (isResponseVM(element) && element.response.value.every(item => item.kind === 'textEditGroup')) {
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
				this.ref?.object.clearModel();
			}));

			this.ref = this._register(diffEditorPool.get());

			// Attach this after updating text/layout of the editor, so it should only be fired when the size updates later (horizontal scrollbar, wrapping)
			// not during a renderElement OR a progressive render (when we will be firing this event anyway at the end of the render)
			this._register(this.ref.object.onDidChangeContentHeight(() => {
				this._onDidChangeHeight.fire();
			}));

			const data: ICodeCompareBlockData = {
				element,
				edit: chatTextEdit,
				diffData: (async () => {

					const ref = await this.textModelService.createModelReference(chatTextEdit.uri);

					if (isDisposed) {
						ref.dispose();
						return;
					}

					this._register(ref);

					const original = ref.object.textEditorModel;
					let originalSha1: string = '';

					if (chatTextEdit.state) {
						originalSha1 = chatTextEdit.state.sha1;
					} else {
						const sha1 = new DefaultModelSHA1Computer();
						if (sha1.canComputeSHA1(original)) {
							originalSha1 = sha1.computeSHA1(original);
							chatTextEdit.state = { sha1: originalSha1, applied: 0 };
						}
					}

					const modified = this.modelService.createModel(
						createTextBufferFactoryFromSnapshot(original.createSnapshot()),
						{ languageId: original.getLanguageId(), onDidChange: Event.None },
						URI.from({ scheme: Schemas.vscodeChatCodeBlock, path: original.uri.path, query: generateUuid() }),
						false
					);
					const modRef = await this.textModelService.createModelReference(modified.uri);
					this._register(modRef);

					const editGroups: ISingleEditOperation[][] = [];
					if (isResponseVM(element)) {
						const chatModel = this.chatService.getSession(element.sessionId)!;

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
					}

					for (const edits of editGroups) {
						modified.pushEditOperations(null, edits, () => null);
					}

					return {
						modified,
						original,
						originalSha1
					} satisfies ICodeCompareBlockDiffData;
				})()
			};
			this.ref.object.render(data, currentWidth, cts.token);

			this.domNode = this.ref.object.element;
		}
	}

	layout(width: number): void {
		this.ref?.object.layout(width);
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
