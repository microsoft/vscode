/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, h } from 'vs/base/browser/dom';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { assertType } from 'vs/base/common/types';
import { IActiveCodeEditor, ICodeEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { EmbeddedDiffEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as colorRegistry from 'vs/platform/theme/common/colorRegistry';
import * as editorColorRegistry from 'vs/editor/common/core/editorColorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { INTERACTIVE_EDITOR_ID, interactiveEditorDiffInserted, interactiveEditorDiffRemoved, interactiveEditorRegionHighlight } from 'vs/workbench/contrib/interactiveEditor/common/interactiveEditor';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { LineRangeMapping } from 'vs/editor/common/diff/linesDiffComputer';
import { Position } from 'vs/editor/common/core/position';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { ILogService } from 'vs/platform/log/common/log';

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
		@ILogService private readonly _logService: ILogService,
	) {
		super(editor, { showArrow: false, showFrame: false, isResizeable: false, isAccessible: true });
		super.create();

		const diffContributions = EditorExtensionsRegistry
			.getEditorContributions()
			.filter(c => c.id !== INTERACTIVE_EDITOR_ID);

		this._diffEditor = instantiationService.createInstance(EmbeddedDiffEditorWidget, this._elements.domNode, {
			scrollbar: { useShadows: false, alwaysConsumeMouseWheel: false },
			scrollBeyondLastLine: false,
			renderMarginRevertIcon: false,
			renderOverviewRuler: false,
			rulers: undefined,
			overviewRulerBorder: undefined,
			overviewRulerLanes: 0,
			diffAlgorithm: 'advanced',
			splitViewDefaultRatio: 0.35,
			padding: { top: 0, bottom: 0 },
			folding: false,
			diffCodeLens: false,
			stickyScroll: { enabled: false },
			minimap: { enabled: false },
		}, {
			originalEditor: { contributions: diffContributions },
			modifiedEditor: { contributions: diffContributions }
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
		return ranges?.anchor;
	}

	showDiff(range: () => Range, changes: LineRangeMapping[]): void {
		assertType(this.editor.hasModel());
		this._sessionStore.clear();

		this._sessionStore.add(this._diffEditor.onDidUpdateDiff(() => {
			const result = this._diffEditor.getDiffComputationResult();
			const hasFocus = this._diffEditor.hasTextFocus();
			this._doShowForChanges(range(), result?.changes2 ?? []);
			// TODO@jrieken find a better fix for this. this is the challenge:
			// the _doShowForChanges method invokes show of the zone widget which removes and adds the
			// zone and overlay parts. this dettaches and reattaches the dom nodes which means they lose
			// focus
			if (hasFocus) {
				this._diffEditor.focus();
			}
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

		this._hideEditorRanges(this.editor, [ranges.modifiedHidden]);
		this._hideEditorRanges(this._diffEditor.getOriginalEditor(), ranges.originalDiffHidden);
		this._hideEditorRanges(this._diffEditor.getModifiedEditor(), ranges.modifiedDiffHidden);

		this._diffEditor.revealLine(ranges.modifiedHidden.startLineNumber, ScrollType.Immediate);

		const lineCountModified = ranges.modifiedHidden.length;
		const lineCountOriginal = ranges.originalHidden.length;

		const lineHeightDiff = Math.max(lineCountModified, lineCountOriginal);
		const lineHeightPadding = (this.editor.getOption(EditorOption.lineHeight) / 12) /* padding-top/bottom*/;
		const heightInLines = lineHeightDiff + lineHeightPadding;

		super.show(ranges.anchor, heightInLines);
		this._logService.debug(`[IE] diff SHOWING at ${ranges.anchor} with ${heightInLines} lines height`);
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

		const originalDiffHidden = invert(originalLineRange, this._textModelv0);
		const modifiedDiffHidden = invert(modifiedLineRange, model);

		return {
			originalHidden: originalLineRange,
			originalDiffHidden,
			modifiedHidden: modifiedLineRange,
			modifiedDiffHidden,
			anchor: new Position(modifiedLineRange.endLineNumberExclusive - 1, Number.MAX_SAFE_INTEGER)
		};
	}

	private _hideEditorRanges(editor: ICodeEditor, lineRanges: LineRange[]): void {
		lineRanges = lineRanges.filter(range => !range.isEmpty);
		if (lineRanges.length === 0) {
			// todo?
			this._logService.debug(`[IE] diff NOTHING to hide for ${String(editor.getModel()?.uri)}`);
		} else {
			const ranges = lineRanges.map(r => new Range(r.startLineNumber, 1, r.endLineNumberExclusive - 1, 1));
			editor.setHiddenAreas(ranges, InteractiveEditorDiffWidget._hideId);
			this._logService.debug(`[IE] diff HIDING ${ranges} for ${editor.getId()} with ${String(editor.getModel()?.uri)}`);
		}
	}

	override hide(): void {
		this.editor.setHiddenAreas([], InteractiveEditorDiffWidget._hideId);
		this._diffEditor.getOriginalEditor().setHiddenAreas([], InteractiveEditorDiffWidget._hideId);
		this._diffEditor.getModifiedEditor().setHiddenAreas([], InteractiveEditorDiffWidget._hideId);
		super.hide();
	}

	protected override revealRange(range: Range, isLastLine: boolean): void {
		// ignore
	}

	// --- layout -------------------------

	protected override _onWidth(widthInPixel: number): void {
		if (this._dim) {
			this._doLayout(this._dim.height, widthInPixel);
		}
	}

	protected override _doLayout(heightInPixel: number, widthInPixel: number): void {
		const newDim = new Dimension(widthInPixel, heightInPixel);
		if (!Dimension.equals(this._dim, newDim)) {
			this._dim = newDim;
			this._diffEditor.layout(this._dim.with(undefined, this._dim.height - 12 /* padding */));
			this._logService.debug('[IE] diff LAYOUT', this._dim);
		}
	}
}

function invert(range: LineRange, model: ITextModel): LineRange[] {
	if (range.isEmpty) {
		return [];
	}
	const result: LineRange[] = [];
	result.push(new LineRange(1, range.startLineNumber));
	result.push(new LineRange(range.endLineNumberExclusive, model.getLineCount() + 1));
	return result.filter(r => !r.isEmpty);
}
