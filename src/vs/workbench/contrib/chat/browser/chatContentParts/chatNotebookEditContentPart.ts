/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { assertType } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { IChatListItemRendererOptions } from '../chat.js';
import { IDisposableReference } from './chatCollections.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { CodeCompareBlockPart } from '../codeBlockPart.js';
import { IChatNotebookEditGroup, IChatProgressRenderableResponseContent } from '../../common/chatModel.js';
import { isResponseVM } from '../../common/chatViewModel.js';

const $ = dom.$;

export class ChatNotebookEditContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;
	private readonly comparePart: IDisposableReference<CodeCompareBlockPart> | undefined;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		chatTextEdit: IChatNotebookEditGroup,
		context: IChatContentPartRenderContext,
		rendererOptions: IChatListItemRendererOptions,
	) {
		super();
		const element = context.element;

		assertType(isResponseVM(element));

		// TODO@jrieken move this into the CompareCodeBlock and properly say what kind of changes happen
		if (rendererOptions.renderTextEditsAsSummary?.(chatTextEdit.uri)) {
			if (element.response.value.every(item => item.kind === 'notebookEditGroup')) {
				this.domNode = $('.interactive-edits-summary', undefined, !element.isComplete
					? ''
					: element.isCanceled
						? localize('edits0', "Making changes was aborted.")
						: localize('editsSummary', "Made changes."));
			} else {
				this.domNode = $('div');
			}
		} else {
			this.domNode = $('div');
		}
	}

	layout(width: number): void {
		this.comparePart?.object.layout(width);
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		// No other change allowed for this content type
		return other.kind === 'notebookEditGroup';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
