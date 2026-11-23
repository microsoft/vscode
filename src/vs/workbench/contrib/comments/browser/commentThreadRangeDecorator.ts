/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, dispose, IDisposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { CommentThread, CommentThreadCollapsibleState } from '../../../../editor/common/languages.js';
import { IModelDeltaDecoration } from '../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../editor/common/model/textModel.js';
import { ICommentInfo, ICommentService } from './commentService.js';

class CommentThreadRangeDecoration implements IModelDeltaDecoration {
	private _decorationId: string | undefined;

	public get id(): string | undefined {
		return this._decorationId;
	}

	public set id(id: string | undefined) {
		this._decorationId = id;
	}

	constructor(
		public readonly range: IRange,
		public readonly options: ModelDecorationOptions) {
	}
}

export class CommentThreadRangeDecorator extends Disposable {
	private static description = 'comment-thread-range-decorator';
	private decorationOptions: ModelDecorationOptions;
	private activeDecorationOptions: ModelDecorationOptions;
	private lineEndDecorationOptions: ModelDecorationOptions;
	private activeLineEndDecorationOptions: ModelDecorationOptions;
	private decorationIds: string[] = [];
	private activeDecorationIds: string[] = [];
	private editor: ICodeEditor | undefined;
	private threadCollapseStateListeners: IDisposable[] = [];
	private currentThreadCollapseStateListener: IDisposable | undefined;

	/**
	 * @param fillsEditorWidth Whether the backgrounds of ranges that span several lines extend to the full width
	 * of the editor, rather than ending with the code on each line.
	 */
	constructor(commentService: ICommentService, private readonly fillsEditorWidth: () => boolean = () => true) {
		super();
		const createOptions = (className: string, shouldFillLineOnLineBreak: boolean) => ModelDecorationOptions.createDynamic({
			description: CommentThreadRangeDecorator.description,
			isWholeLine: false,
			zIndex: 20,
			className,
			shouldFillLineOnLineBreak
		});

		this.decorationOptions = createOptions('comment-thread-range', true);
		this.activeDecorationOptions = createOptions('comment-thread-range-current', true);
		this.lineEndDecorationOptions = createOptions('comment-thread-range', false);
		this.activeLineEndDecorationOptions = createOptions('comment-thread-range-current', false);

		this._register(commentService.onDidChangeCurrentCommentThread(thread => {
			this.updateCurrent(thread);
		}));
		this._register(commentService.onDidUpdateCommentThreads(() => {
			this.updateCurrent(undefined);
		}));
	}

	private updateCurrent(thread: CommentThread<IRange> | undefined) {
		if (!this.editor || (thread?.resource && (thread.resource?.toString() !== this.editor.getModel()?.uri.toString()))) {
			return;
		}
		this.currentThreadCollapseStateListener?.dispose();
		const newDecoration: CommentThreadRangeDecoration[] = [];
		if (thread) {
			const range = thread.range;
			if (range && !((range.startLineNumber === range.endLineNumber) && (range.startColumn === range.endColumn))) {
				if (thread.collapsibleState === CommentThreadCollapsibleState.Expanded) {
					this.currentThreadCollapseStateListener = thread.onDidChangeCollapsibleState(state => {
						if (state === CommentThreadCollapsibleState.Collapsed) {
							this.updateCurrent(undefined);
						}
					});
					newDecoration.push(new CommentThreadRangeDecoration(range, this.fillsEditorWidth() ? this.activeDecorationOptions : this.activeLineEndDecorationOptions));
				}
			}
		}
		this.editor.changeDecorations((changeAccessor) => {
			this.activeDecorationIds = changeAccessor.deltaDecorations(this.activeDecorationIds, newDecoration);
			newDecoration.forEach((decoration, index) => decoration.id = this.decorationIds[index]);
		});
	}

	public update(editor: ICodeEditor | undefined, commentInfos: ICommentInfo[]) {
		const model = editor?.getModel();
		if (!editor || !model) {
			return;
		}
		dispose(this.threadCollapseStateListeners);
		this.editor = editor;

		const commentThreadRangeDecorations: CommentThreadRangeDecoration[] = [];
		const options = this.fillsEditorWidth() ? this.decorationOptions : this.lineEndDecorationOptions;
		for (const info of commentInfos) {
			info.threads.forEach(thread => {
				if (thread.isDisposed) {
					return;
				}

				const range = thread.range;
				// We only want to show a range decoration when there's the range spans either multiple lines
				// or, when is spans multiple characters on the sample line
				if (!range || (range.startLineNumber === range.endLineNumber) && (range.startColumn === range.endColumn)) {
					return;
				}

				this.threadCollapseStateListeners.push(thread.onDidChangeCollapsibleState(() => {
					this.update(editor, commentInfos);
				}));

				if (thread.collapsibleState === CommentThreadCollapsibleState.Collapsed) {
					return;
				}

				commentThreadRangeDecorations.push(new CommentThreadRangeDecoration(range, options));
			});
		}

		editor.changeDecorations((changeAccessor) => {
			this.decorationIds = changeAccessor.deltaDecorations(this.decorationIds, commentThreadRangeDecorations);
			commentThreadRangeDecorations.forEach((decoration, index) => decoration.id = this.decorationIds[index]);
		});
	}

	override dispose() {
		dispose(this.threadCollapseStateListeners);
		this.currentThreadCollapseStateListener?.dispose();
		super.dispose();
	}
}
