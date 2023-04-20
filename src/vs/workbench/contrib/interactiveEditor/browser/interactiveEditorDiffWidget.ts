/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, h } from 'vs/base/browser/dom';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { assertType } from 'vs/base/common/types';
import { IActiveCodeEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { EmbeddedDiffEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IRange, Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as colorRegistry from 'vs/platform/theme/common/colorRegistry';
import * as editorColorRegistry from 'vs/editor/common/core/editorColorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { interactiveEditorDiffInserted, interactiveEditorDiffRemoved, interactiveEditorRegionHighlight } from 'vs/workbench/contrib/interactiveEditor/common/interactiveEditor';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { LineRangeMapping } from 'vs/editor/common/diff/linesDiffComputer';
import { Position } from 'vs/editor/common/core/position';

export class InteractiveEditorDiffWidget extends ZoneWidget {

	private static readonly _hideId = 'overlayDiff';

	private readonly _elements = h('div.interactive-editor-diff-widget@domNode');

	private readonly _diffEditor: IDiffEditor;
	private readonly _sessionStore = this._disposables.add(new DisposableStore());
	private _dim: Dimension | undefined;

	constructor(
		editor: IActiveCodeEditor,
		private readonly _textModelv0: ITextModel,
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
			stickyScroll: { enabled: false },
			renderOverviewRuler: false,
			diffAlgorithm: 'advanced'
		}, {
			originalEditor: { contributions: [] },
			modifiedEditor: { contributions: [] }
		}, editor);
		this._disposables.add(this._diffEditor);
		this._diffEditor.setModel({ original: this._textModelv0, modified: editor.getModel() });

		const doStyle = () => {
			const theme = themeService.getColorTheme();
			const overrides: [target: string, source: string][] = [
				[colorRegistry.editorBackground, interactiveEditorRegionHighlight],
				[editorColorRegistry.editorGutter, interactiveEditorRegionHighlight],
				[colorRegistry.diffInsertedLine, interactiveEditorDiffInserted],
				[colorRegistry.diffInserted, interactiveEditorDiffInserted],
				[colorRegistry.diffRemovedLine, interactiveEditorDiffRemoved],
				[colorRegistry.diffRemoved, interactiveEditorDiffRemoved],
			];

			for (const [target, source] of overrides) {
				const value = theme.getColor(source);
				if (value) {
					this._elements.domNode.style.setProperty(colorRegistry.asCssVariableName(target), String(value));
				}
			}
		};
		doStyle();
		this._disposables.add(themeService.onDidColorThemeChange(doStyle));
	}

	protected override _fillContainer(container: HTMLElement): void {
		container.appendChild(this._elements.domNode);
	}

	// --- show / hide --------------------

	override show(): void {
		throw new Error('not supported like this');
	}

	getEndPositionForChanges(range: Range, changes: LineRangeMapping[]): Position | undefined {
		assertType(this.editor.hasModel());

		const modified = this.editor.getModel();
		const ranges = this._computeHiddenRanges(modified, range, changes);
		if (!ranges) {
			return undefined;
		}
		return ranges.modifiedHidden.getEndPosition();
	}

	showDiff(range: () => Range, changes: LineRangeMapping[]): void {
		assertType(this.editor.hasModel());
		this._sessionStore.clear();

		this._sessionStore.add(this._diffEditor.onDidUpdateDiff(() => {
			const result = this._diffEditor.getDiffComputationResult();
			this._doShowForChanges(range(), result?.changes2 ?? []);
		}));
		this._doShowForChanges(range(), changes);
	}

	private _doShowForChanges(range: Range, changes: LineRangeMapping[]): void {
		assertType(this.editor.hasModel());

		const modified = this.editor.getModel();
		const ranges = this._computeHiddenRanges(modified, range, changes);

		if (!ranges) {
			this.hide();
			return;
		}

		this.editor.setHiddenAreas([ranges.modifiedHidden], InteractiveEditorDiffWidget._hideId);
		this._diffEditor.getOriginalEditor().setHiddenAreas(ranges.originalDiffHidden, InteractiveEditorDiffWidget._hideId);
		this._diffEditor.getModifiedEditor().setHiddenAreas(ranges.modifiedDiffHidden, InteractiveEditorDiffWidget._hideId);

		const lineCountModified = ranges.modifiedHidden.endLineNumber - ranges.modifiedHidden.startLineNumber;
		const lineCountOriginal = ranges.originalHidden.endLineNumber - ranges.originalHidden.startLineNumber;

		const lineHeightDiff = 1 + Math.max(lineCountModified, lineCountOriginal);
		const lineHeightPadding = (this.editor.getOption(EditorOption.lineHeight) / 12) /* padding-top/bottom*/;

		const position = ranges.modifiedHidden.getEndPosition();
		super.show(position, lineHeightDiff + lineHeightPadding);
	}

	private _computeHiddenRanges(model: ITextModel, range: Range, changes: LineRangeMapping[]) {
		if (changes.length === 0) {
			return undefined;
		}

		let originalLineRange = changes[0].originalRange;
		let modifiedLineRange = changes[0].modifiedRange;
		for (let i = 1; i < changes.length; i++) {
			originalLineRange = originalLineRange.join(changes[i].originalRange);
			modifiedLineRange = modifiedLineRange.join(changes[i].modifiedRange);
		}

		const startDelta = modifiedLineRange.startLineNumber - range.startLineNumber;
		if (startDelta > 0) {
			modifiedLineRange = new LineRange(modifiedLineRange.startLineNumber - startDelta, modifiedLineRange.endLineNumberExclusive);
			originalLineRange = new LineRange(originalLineRange.startLineNumber - startDelta, originalLineRange.endLineNumberExclusive);
		}

		const endDelta = range.endLineNumber - (modifiedLineRange.endLineNumberExclusive - 1);
		if (endDelta > 0) {
			modifiedLineRange = new LineRange(modifiedLineRange.startLineNumber, modifiedLineRange.endLineNumberExclusive + endDelta);
			originalLineRange = new LineRange(originalLineRange.startLineNumber, originalLineRange.endLineNumberExclusive + endDelta);
		}


		const originalHidden = asRange(originalLineRange, this._textModelv0);
		const originalDiffHidden = invertRange(originalHidden, this._textModelv0);
		const modifiedHidden = asRange(modifiedLineRange, model);
		const modifiedDiffHidden = invertRange(modifiedHidden, model);

		return { originalHidden, originalDiffHidden, modifiedHidden, modifiedDiffHidden };
	}

	override hide(): void {
		this.editor.setHiddenAreas([], InteractiveEditorDiffWidget._hideId);
		this._diffEditor.getOriginalEditor().setHiddenAreas([], InteractiveEditorDiffWidget._hideId);
		this._diffEditor.getModifiedEditor().setHiddenAreas([], InteractiveEditorDiffWidget._hideId);
		super.hide();
	}

	// --- layout -------------------------

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

function invertRange(range: IRange, model: ITextModel): Range[] {
	const result: Range[] = [];
	if (Range.isEmpty(range)) {
		//result.push(model.getFullModelRange());
		// todo@jrieken
		// cannot hide everything, return [] instead

	} else {
		if (range.startLineNumber > 1) {
			result.push(new Range(1, 1, range.startLineNumber - 1, 1));
		}
		if (range.endLineNumber < model.getLineCount()) {
			result.push(new Range(range.endLineNumber + 1, 1, model.getLineCount(), 1));
		}
	}
	return result;
}

function asRange(lineRange: LineRange, model: ITextModel): Range {
	if (lineRange.isEmpty) {
		return new Range(lineRange.startLineNumber, 1, lineRange.startLineNumber, 1);
	} else {
		const endLine = lineRange.endLineNumberExclusive - 1;
		return new Range(lineRange.startLineNumber, 1, endLine, model.getLineMaxColumn(endLine));
	}
}
