/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../base/common/actions.js';
import { Emitter } from '../../base/common/event.js';
import { Disposable, DisposableStore } from '../../base/common/lifecycle.js';
import { isEqual } from '../../base/common/resources.js';
import { URI } from '../../base/common/uri.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference, isCodeEditor, isCompositeEditor } from '../../editor/browser/editorBrowser.js';
import { EmbeddedCodeEditorWidget } from '../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { EditorOption } from '../../editor/common/config/editorOptions.js';
import { IRange } from '../../editor/common/core/range.js';
import { CursorChangeReason, ICursorPositionChangedEvent } from '../../editor/common/cursorEvents.js';
import { IEditorContribution } from '../../editor/common/editorCommon.js';
import { IModelDecorationsChangeAccessor, TrackedRangeStickiness } from '../../editor/common/model.js';
import { ModelDecorationOptions } from '../../editor/common/model/textModel.js';
import { AbstractFloatingClickMenu, FloatingClickWidget } from '../../platform/actions/browser/floatingMenu.js';
import { IMenuService, MenuId } from '../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../platform/keybinding/common/keybinding.js';
import { IEditorService } from '../services/editor/common/editorService.js';

export interface IRangeHighlightDecoration {
	resource: URI;
	range: IRange;
	isWholeLine?: boolean;
}

export class RangeHighlightDecorations extends Disposable {

	private readonly _onHighlightRemoved = this._register(new Emitter<void>());
	readonly onHighlightRemoved = this._onHighlightRemoved.event;

	private rangeHighlightDecorationId: string | null = null;
	private editor: ICodeEditor | null = null;
	private readonly editorDisposables = this._register(new DisposableStore());

	constructor(@IEditorService private readonly editorService: IEditorService) {
		super();
	}

	removeHighlightRange() {
		if (this.editor && this.rangeHighlightDecorationId) {
			const decorationId = this.rangeHighlightDecorationId;
			this.editor.changeDecorations((accessor) => {
				accessor.removeDecoration(decorationId);
			});
			this._onHighlightRemoved.fire();
		}

		this.rangeHighlightDecorationId = null;
	}

	highlightRange(range: IRangeHighlightDecoration, editor?: unknown) {
		editor = editor ?? this.getEditor(range);
		if (isCodeEditor(editor)) {
			this.doHighlightRange(editor, range);
		} else if (isCompositeEditor(editor) && isCodeEditor(editor.activeCodeEditor)) {
			this.doHighlightRange(editor.activeCodeEditor, range);
		}
	}

	private doHighlightRange(editor: ICodeEditor, selectionRange: IRangeHighlightDecoration) {
		this.removeHighlightRange();

		editor.changeDecorations((changeAccessor: IModelDecorationsChangeAccessor) => {
			this.rangeHighlightDecorationId = changeAccessor.addDecoration(selectionRange.range, this.createRangeHighlightDecoration(selectionRange.isWholeLine));
		});

		this.setEditor(editor);
	}

	private getEditor(resourceRange: IRangeHighlightDecoration): ICodeEditor | undefined {
		const resource = this.editorService.activeEditor?.resource;
		if (resource && isEqual(resource, resourceRange.resource) && isCodeEditor(this.editorService.activeTextEditorControl)) {
			return this.editorService.activeTextEditorControl;
		}

		return undefined;
	}

	private setEditor(editor: ICodeEditor) {
		if (this.editor !== editor) {
			this.editorDisposables.clear();
			this.editor = editor;
			this.editorDisposables.add(this.editor.onDidChangeCursorPosition((e: ICursorPositionChangedEvent) => {
				if (
					e.reason === CursorChangeReason.NotSet
					|| e.reason === CursorChangeReason.Explicit
					|| e.reason === CursorChangeReason.Undo
					|| e.reason === CursorChangeReason.Redo
				) {
					this.removeHighlightRange();
				}
			}));
			this.editorDisposables.add(this.editor.onDidChangeModel(() => { this.removeHighlightRange(); }));
			this.editorDisposables.add(this.editor.onDidDispose(() => {
				this.removeHighlightRange();
				this.editor = null;
			}));
		}
	}

	private static readonly _WHOLE_LINE_RANGE_HIGHLIGHT = ModelDecorationOptions.register({
		description: 'codeeditor-range-highlight-whole',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'rangeHighlight',
		isWholeLine: true
	});

	private static readonly _RANGE_HIGHLIGHT = ModelDecorationOptions.register({
		description: 'codeeditor-range-highlight',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'rangeHighlight'
	});

	private createRangeHighlightDecoration(isWholeLine: boolean = true): ModelDecorationOptions {
		return (isWholeLine ? RangeHighlightDecorations._WHOLE_LINE_RANGE_HIGHLIGHT : RangeHighlightDecorations._RANGE_HIGHLIGHT);
	}

	override dispose() {
		super.dispose();

		if (this.editor?.getModel()) {
			this.removeHighlightRange();
			this.editor = null;
		}
	}
}

export class FloatingEditorClickWidget extends FloatingClickWidget implements IOverlayWidget {

	constructor(
		private editor: ICodeEditor,
		label: string,
		keyBindingAction: string | null,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(
			keyBindingAction && keybindingService.lookupKeybinding(keyBindingAction)
				? `${label} (${keybindingService.lookupKeybinding(keyBindingAction)!.getLabel()})`
				: label
		);
	}

	getId(): string {
		return 'editor.overlayWidget.floatingClickWidget';
	}

	getPosition(): IOverlayWidgetPosition {
		return {
			preference: OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER
		};
	}

	override render() {
		super.render();
		this.editor.addOverlayWidget(this);
	}

	override dispose(): void {
		this.editor.removeOverlayWidget(this);
		super.dispose();
	}

}

export class FloatingEditorClickMenu extends AbstractFloatingClickMenu implements IEditorContribution {
	static readonly ID = 'editor.contrib.floatingClickMenu';

	constructor(
		private readonly editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(MenuId.EditorContent, menuService, contextKeyService);
		this.render();
	}

	protected override createWidget(action: IAction): FloatingClickWidget {
		return this.instantiationService.createInstance(FloatingEditorClickWidget, this.editor, action.label, action.id);
	}

	protected override isVisible() {
		return !(this.editor instanceof EmbeddedCodeEditorWidget) && this.editor?.hasModel() && !this.editor.getOption(EditorOption.inDiffEditor);
	}

	protected override getActionArg(): unknown {
		return this.editor.getModel()?.uri;
	}
}
