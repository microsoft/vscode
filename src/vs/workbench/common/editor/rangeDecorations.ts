/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import Event, { Emitter } from 'vs/base/common/event';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { toResource } from 'vs/workbench/common/editor';

export interface IRangeHighlightDecoration {
	resource: URI;
	range: editorCommon.IRange;
	isWholeLine?: boolean;
}

export class RangeHighlightDecorations implements IDisposable {

	private rangeHighlightDecorationId: string = null;
	private editor: editorCommon.ICommonCodeEditor = null;
	private editorDisposables: IDisposable[] = [];

	private _onHighlightRemoved: Emitter<void> = new Emitter<void>();
	public readonly onHighlghtRemoved: Event<void> = this._onHighlightRemoved.event;

	constructor( @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
	}

	public removeHighlightRange() {
		if (this.editor && this.editor.getModel() && this.rangeHighlightDecorationId) {
			this.editor.deltaDecorations([this.rangeHighlightDecorationId], []);
			this._onHighlightRemoved.fire();
		}
		this.rangeHighlightDecorationId = null;
	}

	public highlightRange(range: IRangeHighlightDecoration, editor?: editorCommon.ICommonCodeEditor) {
		editor = editor ? editor : this.getEditor(range);
		if (editor) {
			this.doHighlightRange(editor, range);
		}
	}

	private doHighlightRange(editor: editorCommon.ICommonCodeEditor, selectionRange: IRangeHighlightDecoration) {
		this.removeHighlightRange();
		editor.changeDecorations((changeAccessor: editorCommon.IModelDecorationsChangeAccessor) => {
			this.rangeHighlightDecorationId = changeAccessor.addDecoration(selectionRange.range, this.createRangeHighlightDecoration(selectionRange.isWholeLine));
		});
		this.setEditor(editor);
	}

	private getEditor(resourceRange: IRangeHighlightDecoration): editorCommon.ICommonCodeEditor {
		const fileResource = toResource(this.editorService.getActiveEditorInput(), { filter: 'file' });
		if (fileResource) {
			if (fileResource.fsPath === resourceRange.resource.fsPath) {
				return <editorCommon.ICommonCodeEditor>this.editorService.getActiveEditor().getControl();
			}
		}
		return null;
	}

	private setEditor(editor: editorCommon.ICommonCodeEditor) {
		if (this.editor !== editor) {
			this.disposeEditorListeners();
			this.editor = editor;
			this.editorDisposables.push(this.editor.onDidChangeCursorPosition((e: editorCommon.ICursorPositionChangedEvent) => {
				if (
					e.reason === editorCommon.CursorChangeReason.NotSet
					|| e.reason === editorCommon.CursorChangeReason.Explicit
					|| e.reason === editorCommon.CursorChangeReason.Undo
					|| e.reason === editorCommon.CursorChangeReason.Redo
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

	private createRangeHighlightDecoration(isWholeLine: boolean = true): editorCommon.IModelDecorationOptions {
		return {
			stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			className: 'rangeHighlight',
			isWholeLine
		};
	}

	public dispose() {
		if (this.editor && this.editor.getModel()) {
			this.removeHighlightRange();
			this.disposeEditorListeners();
			this.editor = null;
		}
	}
}