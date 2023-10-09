/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { basename } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IRange, Range } from 'vs/editor/common/core/range';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService } from 'vs/platform/log/common/log';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IChatWidget } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatWidget, IChatWidgetContrib } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { IDynamicReference } from 'vs/workbench/contrib/chat/common/chatVariables';

export const dynamicReferenceDecorationType = 'chat-dynamic-reference';

export class ChatDynamicReferenceModel extends Disposable implements IChatWidgetContrib {
	public static readonly ID = 'chatDynamicReferenceModel';

	private readonly _references: IDynamicReference[] = [];
	get references(): ReadonlyArray<IDynamicReference> {
		return [...this._references];
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


interface SelectAndInsertFileActionContext {
	widget: ChatWidget;
	range: IRange;
}

function isSelectAndInsertFileActionContext(context: any): context is SelectAndInsertFileActionContext {
	return 'widget' in context && 'range' in context;
}

export class SelectAndInsertFileAction extends Action2 {
	static readonly ID = 'workbench.action.chat.selectAndInsertFile';

	constructor() {
		super({
			id: SelectAndInsertFileAction.ID,
			title: '' // not displayed
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const textModelService = accessor.get(ITextModelService);
		const logService = accessor.get(ILogService);

		const context = args[0];
		if (!isSelectAndInsertFileActionContext(context)) {
			return;
		}

		const doCleanup = () => {
			// Failed, remove the dangling `file`
			context.widget.inputEditor.executeEdits('chatInsertFile', [{ range: context.range, text: `` }]);
		};

		const quickInputService = accessor.get(IQuickInputService);
		const picks = await quickInputService.quickAccess.pick('');
		if (!picks?.length) {
			logService.trace('SelectAndInsertFileAction: no file selected');
			doCleanup();
			return;
		}

		const resource = (picks[0] as unknown as { resource: unknown }).resource as URI;
		if (!textModelService.canHandleResource(resource)) {
			logService.trace('SelectAndInsertFileAction: non-text resource selected');
			doCleanup();
			return;
		}

		const fileName = basename(resource);
		const editor = context.widget.inputEditor;
		const text = `#file:${fileName}`;
		const range = context.range;
		const success = editor.executeEdits('chatInsertFile', [{ range, text: text + ' ' }]);
		if (!success) {
			logService.trace(`SelectAndInsertFileAction: failed to insert "${text}"`);
			doCleanup();
			return;
		}

		context.widget.getContrib<ChatDynamicReferenceModel>(ChatDynamicReferenceModel.ID)?.addReference({
			range: { startLineNumber: range.startLineNumber, startColumn: range.startColumn, endLineNumber: range.endLineNumber, endColumn: range.startColumn + text.length },
			data: resource
		});
	}
}
registerAction2(SelectAndInsertFileAction);
