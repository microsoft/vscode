/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import Event, { Emitter } from 'vs/base/common/event';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IRange } from 'vs/editor/common/core/range';
import { CursorChangeReason, ICursorPositionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { TrackedRangeStickiness, IModelDecorationsChangeAccessor } from 'vs/editor/common/model';

export interface IRangeHighlightDecoration {
	resource: URI;
	range: IRange;
	isWholeLine?: boolean;
}

export class RangeHighlightDecorations implements IDisposable {

	private rangeHighlightDecorationId: string = null;
	private editor: ICodeEditor = null;
	private editorDisposables: IDisposable[] = [];

	private _onHighlightRemoved: Emitter<void> = new Emitter<void>();
	public readonly onHighlghtRemoved: Event<void> = this._onHighlightRemoved.event;

	constructor(@IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
	}

	public removeHighlightRange() {
		if (this.editor && this.editor.getModel() && this.rangeHighlightDecorationId) {
			this.editor.deltaDecorations([this.rangeHighlightDecorationId], []);
			this._onHighlightRemoved.fire();
		}
		this.rangeHighlightDecorationId = null;
	}

	public highlightRange(range: IRangeHighlightDecoration, editor?: ICodeEditor) {
		editor = editor ? editor : this.getEditor(range);
		if (editor) {
			this.doHighlightRange(editor, range);
		}
	}

	private doHighlightRange(editor: ICodeEditor, selectionRange: IRangeHighlightDecoration) {
		this.removeHighlightRange();
		editor.changeDecorations((changeAccessor: IModelDecorationsChangeAccessor) => {
			this.rangeHighlightDecorationId = changeAccessor.addDecoration(selectionRange.range, this.createRangeHighlightDecoration(selectionRange.isWholeLine));
		});
		this.setEditor(editor);
	}

	private getEditor(resourceRange: IRangeHighlightDecoration): ICodeEditor {
		const activeInput = this.editorService.getActiveEditorInput();
		const resource = activeInput && activeInput.getResource();
		if (resource) {
			if (resource.toString() === resourceRange.resource.toString()) {
				return <ICodeEditor>this.editorService.getActiveEditor().getControl();
			}
		}
		return null;
	}

	private setEditor(editor: ICodeEditor) {
		if (this.editor !== editor) {
			this.disposeEditorListeners();
			this.editor = editor;
			this.editorDisposables.push(this.editor.onDidChangeCursorPosition((e: ICursorPositionChangedEvent) => {
				if (
					e.reason === CursorChangeReason.NotSet
					|| e.reason === CursorChangeReason.Explicit
					|| e.reason === CursorChangeReason.Undo
					|| e.reason === CursorChangeReason.Redo
				) {
					this.removeHighlightRange();
				}
			}));
			this.editorDisposables.push(this.editor.onDidChangeModel(() => { this.removeHighlightRange(); }));
			this.editorDisposables.push(this.editor.onDidDispose(() => {
				this.removeHighlightRange();
				this.editor = null;
			}));
		}
	}

	private disposeEditorListeners() {
		this.editorDisposables.forEach(disposable => disposable.dispose());
		this.editorDisposables = [];
	}

	private static readonly _WHOLE_LINE_RANGE_HIGHLIGHT = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'rangeHighlight',
		isWholeLine: true
	});

	private static readonly _RANGE_HIGHLIGHT = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'rangeHighlight'
	});

	private createRangeHighlightDecoration(isWholeLine: boolean = true): ModelDecorationOptions {
		return (isWholeLine ? RangeHighlightDecorations._WHOLE_LINE_RANGE_HIGHLIGHT : RangeHighlightDecorations._RANGE_HIGHLIGHT);
	}

	public dispose() {
		if (this.editor && this.editor.getModel()) {
			this.removeHighlightRange();
			this.disposeEditorListeners();
			this.editor = null;
		}
	}
}
