/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, h } from 'vs/base/browser/dom';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { assertType } from 'vs/base/common/types';
import { ICodeEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { EmbeddedDiffEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { interactiveEditorRegionHighlight } from 'vs/workbench/contrib/interactiveEditor/common/interactiveEditor';

export class InteractiveEditorDiffWidget extends ZoneWidget {

	private static readonly _hideId = 'overlayDiff';

	private readonly _elements = h('div.interactive-editor-diff-widget@domNode');

	private readonly _diffEditor: IDiffEditor;
	private readonly _sessionStore = this._disposables.add(new DisposableStore());
	private _dim: Dimension | undefined;

	constructor(
		editor: ICodeEditor,
		private readonly _originalModel: ITextModel,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
	) {
		super(editor, { showArrow: false, showFrame: false, isResizeable: false, isAccessible: true });
		super.create();

		this._diffEditor = instantiationService.createInstance(EmbeddedDiffEditorWidget, this._elements.domNode, {
			scrollbar: { useShadows: false, alwaysConsumeMouseWheel: false },
			renderMarginRevertIcon: false,
			diffCodeLens: false,
			scrollBeyondLastLine: false,
			stickyScroll: { enabled: false }
		}, editor);
		this._disposables.add(this._diffEditor);

		const highlightBgColor = themeService.getColorTheme().getColor(interactiveEditorRegionHighlight)?.toString() ?? '';
		this._elements.domNode.style.setProperty('--vscode-editor-background', highlightBgColor);
		this._elements.domNode.style.setProperty('--vscode-editorGutter-background', highlightBgColor);
	}

	protected override _fillContainer(container: HTMLElement): void {
		container.appendChild(this._elements.domNode);
	}

	override show(range: IRange): void {
		assertType(this.editor.hasModel());
		this._sessionStore.clear();

		this.editor.setHiddenAreas([range], InteractiveEditorDiffWidget._hideId);
		const modified = this.editor.getModel();
		const lineHeightDiff = Math.max(1, Math.abs(modified.getLineCount() - this._originalModel.getLineCount()) + (range.endLineNumber - range.startLineNumber));
		const lineHeightPadding = (this.editor.getOption(EditorOption.lineHeight) / 12) /* padding-top/bottom*/;

		this._diffEditor.setModel({ original: this._originalModel, modified });
		this._diffEditor.revealRange(range, ScrollType.Immediate);
		this._diffEditor.getModifiedEditor().setHiddenAreas(InteractiveEditorDiffWidget._invert(range, modified), InteractiveEditorDiffWidget._hideId);
		// this._diffEditor.getOriginalEditor().setHiddenAreas(InteractiveEditorDiffWidget._invert(rangeOriginal, this._originalModel), InteractiveEditorDiffWidget._hideId);

		const updateHiddenAreasOriginal = () => {
			// todo@jrieken this needs work when both are equal
			const changes = this._diffEditor.getLineChanges();
			if (!changes) {
				return;
			}
			let startLine = Number.MAX_VALUE;
			let endLine = 0;
			for (const change of changes) {
				startLine = Math.min(startLine, change.originalStartLineNumber);
				endLine = Math.max(endLine, change.originalEndLineNumber || change.originalStartLineNumber);
			}
			const originalRange = this._originalModel.validateRange({ startLineNumber: startLine, startColumn: 1, endLineNumber: endLine, endColumn: Number.MAX_VALUE });

			const hiddenRanges = InteractiveEditorDiffWidget._invert(originalRange, this._originalModel);
			this._diffEditor.getOriginalEditor().setHiddenAreas(hiddenRanges, InteractiveEditorDiffWidget._hideId);
		};
		this._diffEditor.onDidUpdateDiff(updateHiddenAreasOriginal, undefined, this._sessionStore);
		updateHiddenAreasOriginal();

		super.show(new Position(range.endLineNumber, 1), lineHeightDiff + lineHeightPadding);
	}

	private static _invert(range: IRange, model: ITextModel): IRange[] {
		const result: IRange[] = [];
		if (range.startLineNumber > 1) {
			result.push({ startLineNumber: 1, startColumn: 1, endLineNumber: range.startLineNumber - 1, endColumn: 1 });
		}
		if (range.endLineNumber < model.getLineCount()) {
			result.push({ startLineNumber: range.endLineNumber + 1, startColumn: 1, endLineNumber: model.getLineCount(), endColumn: 1 });
		}
		return result;
	}

	override hide(): void {
		this.editor.setHiddenAreas([], InteractiveEditorDiffWidget._hideId);
		super.hide();
	}

	protected override _onWidth(widthInPixel: number): void {
		if (this._dim) {
			this._doLayout(this._dim.height, widthInPixel);
		}
	}

	protected override _doLayout(heightInPixel: number, widthInPixel: number): void {
		const newDim = new Dimension(widthInPixel, heightInPixel);
		if (Dimension.equals(this._dim, newDim)) {
			return;
		}
		this._dim = newDim;
		this._diffEditor.layout(this._dim.with(undefined, this._dim.height - 12 /* padding */));
	}
}
