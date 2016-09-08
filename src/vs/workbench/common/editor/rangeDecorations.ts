/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditor } from 'vs/platform/editor/common/editor';
import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';

export interface IRangeHighlightDecoration {
	resource: URI;
	range: Range;
}

export class RangeHighlightDecorations implements IDisposable {

	private rangeHighlightDecorationId: string = null;
	private editor: editorCommon.ICommonCodeEditor = null;
	private editorDisposables: IDisposable[] = [];

	constructor(@IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
	}

	public clearCurrentFileRangeDecoration() {
		if (this.editor && this.rangeHighlightDecorationId) {
			this.doClearRangeDecoration(this.editor, this.rangeHighlightDecorationId);
		}
		this.rangeHighlightDecorationId = null;
	}

	public highlightRange(range: IRangeHighlightDecoration, editor?: IEditor) {
		editor = editor ? editor : this.getEditor(range);
		if (editor) {
			this.doHighlightRange(<editorCommon.ICommonCodeEditor>editor.getControl(), range);
		}
	}

	private doHighlightRange(editor: editorCommon.ICommonCodeEditor, selectionRange: IRangeHighlightDecoration) {
		this.clearCurrentFileRangeDecoration();
		editor.changeDecorations((changeAccessor: editorCommon.IModelDecorationsChangeAccessor) => {
			this.rangeHighlightDecorationId = changeAccessor.addDecoration(selectionRange.range, this.createRangeHighlightDecoration());
		});
		this.updateEditor(editor);
	}

	private getEditor(resourceRange: IRangeHighlightDecoration): IEditor {
		let editorInput = this.editorService.getActiveEditorInput();
		if (editorInput instanceof FileEditorInput) {
			if (editorInput.getResource().fsPath === resourceRange.resource.fsPath) {
				return this.editorService.getActiveEditor();
			}
		}
		return null;
	}

	private updateEditor(editor: editorCommon.ICommonCodeEditor) {
		if (this.editor !== editor) {
			this.disposeEditorListeners();
			this.editor = editor;
			this.editorDisposables.push(this.editor.onDidChangeCursorPosition((e: editorCommon.ICursorPositionChangedEvent) => {
				if (
					e.reason === editorCommon.CursorChangeReason.Explicit
					|| e.reason === editorCommon.CursorChangeReason.Undo
					|| e.reason === editorCommon.CursorChangeReason.Redo
				) {
					this.doClearRangeDecoration(this.editor, this.rangeHighlightDecorationId);
				}
			}));
			this.editorDisposables.push(this.editor.onDidChangeModel(() => { this.doClearRangeDecoration(this.editor, this.rangeHighlightDecorationId); }));
			this.editorDisposables.push(this.editor.onDidDispose(() => {
				this.doClearRangeDecoration(this.editor, this.rangeHighlightDecorationId);
				this.editor = null;
			}));
		}
	}

	private disposeEditorListeners() {
		this.editorDisposables.forEach(disposable => disposable.dispose());
		this.editorDisposables = [];
	}

	private doClearRangeDecoration(model: editorCommon.ICommonCodeEditor, rangeHighlightDecorationId: string) {
		model.deltaDecorations([rangeHighlightDecorationId], []);
	}

	private createRangeHighlightDecoration(): editorCommon.IModelDecorationOptions {
		return {
			stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			className: 'rangeHighlight',
			isWholeLine: true
		};
	}

	public dispose() {
		this.clearCurrentFileRangeDecoration();
		this.disposeEditorListeners();
		this.editor = null;
	}
}