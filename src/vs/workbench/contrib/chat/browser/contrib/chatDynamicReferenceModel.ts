/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { Range } from 'vs/editor/common/core/range';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';
import { ILabelService } from 'vs/platform/label/common/label';
import { IChatWidget } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatWidget, IChatWidgetContrib } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { IDynamicReference } from 'vs/workbench/contrib/chat/common/chatVariables';

export const dynamicReferenceDecorationType = 'chat-dynamic-reference';

export class ChatDynamicReferenceModel extends Disposable implements IChatWidgetContrib {
	public static readonly ID = 'chatDynamicReferenceModel';

	private readonly _references: IDynamicReference[] = [];
	get references(): ReadonlyArray<IDynamicReference> {
		return this._references;
	}

	get id() {
		return ChatDynamicReferenceModel.ID;
	}

	constructor(
		private readonly widget: IChatWidget,
		@ILabelService private readonly labelService: ILabelService
	) {
		super();
		this._register(widget.inputEditor.onDidChangeModelContent(e => {
			e.changes.forEach(c => {
				this._references.forEach((ref, i) => {
					if (Range.areIntersecting(ref.range, c.range)) {
						// The reference text was changed, it's broken
						this._references.splice(i, 1);
					} else if (Range.compareRangesUsingStarts(ref.range, c.range) > 0) {
						const delta = c.text.length - c.rangeLength;
						ref.range = {
							startLineNumber: ref.range.startLineNumber,
							startColumn: ref.range.startColumn + delta,
							endLineNumber: ref.range.endLineNumber,
							endColumn: ref.range.endColumn + delta
						};
					}
				});
			});

			this.updateReferences();
		}));
	}

	addReference(ref: IDynamicReference): void {
		this._references.push(ref);
		this.updateReferences();
	}

	private updateReferences(): void {
		this.widget.inputEditor.setDecorationsByType('chat', dynamicReferenceDecorationType, this._references.map(r => (<IDecorationOptions>{
			range: r.range,
			hoverMessage: new MarkdownString(this.labelService.getUriLabel(r.data, { relative: true }))
		})));
	}
}

ChatWidget.CONTRIBS.push(ChatDynamicReferenceModel);
