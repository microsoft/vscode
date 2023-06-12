/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Widget } from 'vs/base/browser/ui/widget';
import { IOverlayWidget, ICodeEditor, IOverlayWidgetPosition, OverlayWidgetPositionPreference, isCodeEditor, isCompositeEditor } from 'vs/editor/browser/editorBrowser';
import { Emitter } from 'vs/base/common/event';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { $, append, clearNode } from 'vs/base/browser/dom';
import { buttonBackground, buttonForeground, editorBackground, editorForeground, contrastBorder, asCssVariableWithDefault, asCssVariable } from 'vs/platform/theme/common/colorRegistry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IRange } from 'vs/editor/common/core/range';
import { CursorChangeReason, ICursorPositionChangedEvent } from 'vs/editor/common/cursorEvents';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { TrackedRangeStickiness, IModelDecorationsChangeAccessor } from 'vs/editor/common/model';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IAction } from 'vs/base/common/actions';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';

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

	highlightRange(range: IRangeHighlightDecoration, editor?: any) {
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

export class FloatingClickWidget extends Widget implements IOverlayWidget {

	private readonly _onClick = this._register(new Emitter<void>());
	readonly onClick = this._onClick.event;

	private _domNode: HTMLElement;

	constructor(
		private editor: ICodeEditor,
		private label: string,
		keyBindingAction: string | null,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super();

		this._domNode = $('.floating-click-widget');
		this._domNode.style.padding = '6px 11px';
		this._domNode.style.borderRadius = '2px';
		this._domNode.style.cursor = 'pointer';
		this._domNode.style.zIndex = '1';

		if (keyBindingAction) {
			const keybinding = keybindingService.lookupKeybinding(keyBindingAction);
			if (keybinding) {
				this.label += ` (${keybinding.getLabel()})`;
			}
		}
	}

	getId(): string {
		return 'editor.overlayWidget.floatingClickWidget';
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition {
		return {
			preference: OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER
		};
	}

	render() {
		clearNode(this._domNode);
		this._domNode.style.backgroundColor = asCssVariableWithDefault(buttonBackground, asCssVariable(editorBackground));
		this._domNode.style.color = asCssVariableWithDefault(buttonForeground, asCssVariable(editorForeground));
		this._domNode.style.border = `1px solid ${asCssVariable(contrastBorder)}`;

		append(this._domNode, $('')).textContent = this.label;

		this.onclick(this._domNode, e => this._onClick.fire());

		this.editor.addOverlayWidget(this);
	}

	override dispose(): void {
		this.editor.removeOverlayWidget(this);

		super.dispose();
	}
}

export class FloatingClickMenu extends Disposable implements IEditorContribution {

	static readonly ID = 'editor.contrib.floatingClickMenu';

	constructor(
		editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super();

		// DISABLED for embedded editors. In the future we can use a different MenuId for embedded editors
		if (!(editor instanceof EmbeddedCodeEditorWidget)) {
			const menu = menuService.createMenu(MenuId.EditorContent, contextKeyService);
			const menuDisposables = new DisposableStore();
			const renderMenuAsFloatingClickBtn = () => {
				menuDisposables.clear();
				if (!editor.hasModel() || editor.getOption(EditorOption.inDiffEditor)) {
					return;
				}
				const actions: IAction[] = [];
				createAndFillInActionBarActions(menu, { renderShortTitle: true, shouldForwardArgs: true }, actions);
				if (actions.length === 0) {
					return;
				}
				// todo@jrieken find a way to handle N actions, like showing a context menu
				const [first] = actions;
				const widget = instantiationService.createInstance(FloatingClickWidget, editor, first.label, first.id);
				menuDisposables.add(widget);
				menuDisposables.add(widget.onClick(() => first.run(editor.getModel().uri)));
				widget.render();
			};
			this._store.add(menu);
			this._store.add(menuDisposables);
			this._store.add(menu.onDidChange(renderMenuAsFloatingClickBtn));
			renderMenuAsFloatingClickBtn();
		}
	}
}
