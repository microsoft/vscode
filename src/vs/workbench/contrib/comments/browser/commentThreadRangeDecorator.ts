/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IRange } from 'vs/editor/common/core/range';
import { IModelDecorationOptions, IModelDeltaDecoration } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { ICommentInfo } from 'vs/workbench/contrib/comments/browser/commentService';

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

export class CommentThreadRangeDecorator {
	public static description = 'comment-thread-range-decorator';
	private decorationOptions: ModelDecorationOptions;
	private decorationIds: string[] = [];

	constructor() {
		const decorationOptions: IModelDecorationOptions = {
			description: CommentThreadRangeDecorator.description,
			isWholeLine: false,
			zIndex: 20,
			className: 'comment-thread-range'
		};

		this.decorationOptions = ModelDecorationOptions.createDynamic(decorationOptions);
	}

	public update(editor: ICodeEditor, commentInfos: ICommentInfo[]) {
		const model = editor.getModel();
		if (!model) {
			return;
		}

		const commentThreadRangeDecorations: CommentThreadRangeDecoration[] = [];
		for (const info of commentInfos) {
			info.threads.forEach(thread => {
				if (thread.isDisposed) {
					return;
				}
				const range = thread.range;
				// We only want to show a range decoration when there's the range spans either multiple lines
				// or, when is spans multiple characters on the sample line
				if ((range.startLineNumber === range.endLineNumber) && (range.startColumn === range.endColumn)) {
					return;
				}
				commentThreadRangeDecorations.push(new CommentThreadRangeDecoration(range, this.decorationOptions));
			});
		}

		this.decorationIds = editor.deltaDecorations(this.decorationIds, commentThreadRangeDecorations);
		commentThreadRangeDecorations.forEach((decoration, index) => decoration.id = this.decorationIds[index]);
	}
}
