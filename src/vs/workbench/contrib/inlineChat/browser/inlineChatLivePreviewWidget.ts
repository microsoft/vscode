/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, h } from 'vs/base/browser/dom';
import { DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { assertType } from 'vs/base/common/types';
import { ICodeEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { EmbeddedCodeEditorWidget, EmbeddedDiffEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { IModelDecorationOptions, IModelDeltaDecoration, ITextModel } from 'vs/editor/common/model';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as colorRegistry from 'vs/platform/theme/common/colorRegistry';
import * as editorColorRegistry from 'vs/editor/common/core/editorColorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { INLINE_CHAT_ID, inlineChatDiffInserted, inlineChatDiffRemoved, inlineChatRegionHighlight } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { LineRangeMapping } from 'vs/editor/common/diff/linesDiffComputer';
import { Position } from 'vs/editor/common/core/position';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { IEditorDecorationsCollection, ScrollType } from 'vs/editor/common/editorCommon';
import { ILogService } from 'vs/platform/log/common/log';
import { lineRangeAsRange, invertLineRange } from 'vs/workbench/contrib/inlineChat/browser/utils';
import { ResourceLabel } from 'vs/workbench/browser/labels';
import { URI } from 'vs/base/common/uri';
import { TextEdit } from 'vs/editor/common/languages';
import { FileKind } from 'vs/platform/files/common/files';
import { IModelService } from 'vs/editor/common/services/model';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Session } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { FoldingController } from 'vs/editor/contrib/folding/browser/folding';
import { WordHighlighterContribution } from 'vs/editor/contrib/wordHighlighter/browser/wordHighlighter';

export class InlineChatLivePreviewWidget extends ZoneWidget {

	private static readonly _hideId = 'overlayDiff';

	private readonly _elements = h('div.inline-chat-diff-widget@domNode');

	private readonly _sessionStore = this._disposables.add(new DisposableStore());
	private readonly _diffEditor: IDiffEditor;
	private readonly _inlineDiffDecorations: IEditorDecorationsCollection;
	private _dim: Dimension | undefined;
	private _isVisible: boolean = false;
	private _isDiffLocked: boolean = false;

	constructor(
		editor: ICodeEditor,
		private readonly _session: Session,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@ILogService private readonly _logService: ILogService,
	) {
		super(editor, { showArrow: false, showFrame: false, isResizeable: false, isAccessible: true, allowUnlimitedHeight: true, showInHiddenAreas: true, ordinal: 10000 + 1 });
		super.create();
		assertType(editor.hasModel());

		this._inlineDiffDecorations = editor.createDecorationsCollection();

		const diffContributions = EditorExtensionsRegistry
			.getEditorContributions()
			.filter(c => c.id !== INLINE_CHAT_ID && c.id !== FoldingController.ID);

		this._diffEditor = instantiationService.createInstance(EmbeddedDiffEditorWidget, this._elements.domNode, {
			scrollbar: { useShadows: false, alwaysConsumeMouseWheel: false },
			scrollBeyondLastLine: false,
			renderMarginRevertIcon: true,
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
			isInEmbeddedEditor: true,
			overflowWidgetsDomNode: editor.getOverflowWidgetsDomNode()
		}, {
			originalEditor: { contributions: diffContributions },
			modifiedEditor: { contributions: diffContributions }
		}, editor);

		this._disposables.add(this._diffEditor);
		this._diffEditor.setModel({ original: this._session.textModel0, modified: editor.getModel() });
		this._diffEditor.updateOptions({
			lineDecorationsWidth: editor.getLayoutInfo().decorationsWidth
		});

		const highlighter = WordHighlighterContribution.get(editor);
		if (highlighter) {
			this._disposables.add(highlighter.linkWordHighlighters(this._diffEditor.getModifiedEditor()));
		}

		const doStyle = () => {
			const theme = themeService.getColorTheme();
			const overrides: [target: string, source: string][] = [
				[colorRegistry.editorBackground, inlineChatRegionHighlight],
				[editorColorRegistry.editorGutter, inlineChatRegionHighlight],
				[colorRegistry.diffInsertedLine, inlineChatDiffInserted],
				[colorRegistry.diffInserted, inlineChatDiffInserted],
				[colorRegistry.diffRemovedLine, inlineChatDiffRemoved],
				[colorRegistry.diffRemoved, inlineChatDiffRemoved],
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

	override dispose(): void {
		this._inlineDiffDecorations.clear();
		super.dispose();
	}

	protected override _fillContainer(container: HTMLElement): void {
		container.appendChild(this._elements.domNode);
	}

	// --- show / hide --------------------

	get isVisible(): boolean {
		return this._isVisible;
	}

	override hide(): void {
		this._cleanupFullDiff();
		this._cleanupInlineDiff();
		this._sessionStore.clear();
		super.hide();
		this._isVisible = false;
	}

	override show(): void {
		assertType(this.editor.hasModel());
		this._sessionStore.clear();
		this._isDiffLocked = false;
		this._isVisible = true;

		this._sessionStore.add(this._diffEditor.onDidUpdateDiff(() => {
			const result = this._diffEditor.getDiffComputationResult();
			const hasFocus = this._diffEditor.hasTextFocus();
			this._updateFromChanges(this._session.wholeRange.value, result?.changes2 ?? []);
			// TODO@jrieken find a better fix for this. this is the challenge:
			// the _doShowForChanges method invokes show of the zone widget which removes and adds the
			// zone and overlay parts. this dettaches and reattaches the dom nodes which means they lose
			// focus
			if (hasFocus) {
				this._diffEditor.focus();
			}
		}));
		this._updateFromChanges(this._session.wholeRange.value, this._session.lastTextModelChanges);
	}

	lockToDiff(): void {
		this._isDiffLocked = true;
	}

	private _updateFromChanges(range: Range, changes: readonly LineRangeMapping[]): void {
		assertType(this.editor.hasModel());

		if (this._isDiffLocked) {
			return;
		}

		if (changes.length === 0 || this._session.textModel0.getValueLength() === 0) {
			// no change or changes to an empty file
			this._logService.debug('[IE] livePreview-mode: no diff');
			this.hide();

		} else if (changes.every(isInlineDiffFriendly)) {
			// simple changes
			this._logService.debug('[IE] livePreview-mode: inline diff');
			this._cleanupFullDiff();
			this._renderChangesWithInlineDiff(changes);

		} else {
			// complex changes
			this._logService.debug('[IE] livePreview-mode: full diff');
			this._cleanupInlineDiff();
			this._renderChangesWithFullDiff(changes, range);
		}
	}

	// --- inline diff

	private _renderChangesWithInlineDiff(changes: readonly LineRangeMapping[]) {
		const original = this._session.textModel0;

		const decorations: IModelDeltaDecoration[] = [];

		for (const { innerChanges } of changes) {
			if (!innerChanges) {
				continue;
			}
			for (const { modifiedRange, originalRange } of innerChanges) {

				const options: IModelDecorationOptions = {
					description: 'interactive-diff-inline',
					showIfCollapsed: true,
				};

				if (!modifiedRange.isEmpty()) {
					options.className = 'inline-chat-lines-inserted-range';
				}

				if (!originalRange.isEmpty()) {
					let content = original.getValueInRange(originalRange);
					if (content.length > 7) {
						content = content.substring(0, 7) + '…';
					}
					options.before = {
						content,
						inlineClassName: 'inline-chat-lines-deleted-range-inline'
					};
				}

				decorations.push({
					range: modifiedRange,
					options
				});
			}
		}

		this._inlineDiffDecorations.set(decorations);
	}

	private _cleanupInlineDiff() {
		this._inlineDiffDecorations.clear();
	}

	// --- full diff

	private _renderChangesWithFullDiff(changes: readonly LineRangeMapping[], range: Range) {

		const modified = this.editor.getModel()!;
		const ranges = this._computeHiddenRanges(modified, range, changes);

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

	private _cleanupFullDiff() {
		this.editor.setHiddenAreas([], InlineChatLivePreviewWidget._hideId);
		this._diffEditor.getOriginalEditor().setHiddenAreas([], InlineChatLivePreviewWidget._hideId);
		this._diffEditor.getModifiedEditor().setHiddenAreas([], InlineChatLivePreviewWidget._hideId);
		super.hide();
	}

	private _computeHiddenRanges(model: ITextModel, range: Range, changes: readonly LineRangeMapping[]) {
		assertType(changes.length > 0);

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

		const originalDiffHidden = invertLineRange(originalLineRange, this._session.textModel0);
		const modifiedDiffHidden = invertLineRange(modifiedLineRange, model);

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
			this._logService.debug(`[IE] diff NOTHING to hide for ${editor.getId()} with ${String(editor.getModel()?.uri)}`);
			return;
		}
		const ranges = lineRanges.map(lineRangeAsRange);
		editor.setHiddenAreas(ranges, InlineChatLivePreviewWidget._hideId);
		this._logService.debug(`[IE] diff HIDING ${ranges} for ${editor.getId()} with ${String(editor.getModel()?.uri)}`);
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

function isInlineDiffFriendly(mapping: LineRangeMapping): boolean {
	if (!mapping.modifiedRange.equals(mapping.originalRange)) {
		return false;
	}
	if (!mapping.innerChanges) {
		return false;
	}
	for (const { modifiedRange, originalRange } of mapping.innerChanges) {
		if (Range.spansMultipleLines(modifiedRange) || Range.spansMultipleLines(originalRange)) {
			return false;
		}
	}
	return true;
}


export class InlineChatFileCreatePreviewWidget extends ZoneWidget {

	private readonly _elements = h('div.inline-chat-newfile-widget@domNode', [
		h('div.title.show-file-icons@title'),
		h('div.editor@editor'),
	]);

	private readonly _title: ResourceLabel;
	private readonly _previewEditor: ICodeEditor;
	private readonly _previewModel = new MutableDisposable();
	private _dim: Dimension | undefined;

	constructor(
		parentEditor: ICodeEditor,
		@IInstantiationService instaService: IInstantiationService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IModelService private readonly _modelService: IModelService,
		@IThemeService themeService: IThemeService,

	) {
		super(parentEditor, { showArrow: false, showFrame: false, isResizeable: false, isAccessible: true, showInHiddenAreas: true, ordinal: 10000 + 2 });
		super.create();

		this._title = instaService.createInstance(ResourceLabel, this._elements.title, { supportIcons: true });

		const contributions = EditorExtensionsRegistry
			.getEditorContributions()
			.filter(c => c.id !== INLINE_CHAT_ID);

		this._previewEditor = instaService.createInstance(EmbeddedCodeEditorWidget, this._elements.editor, {
			scrollBeyondLastLine: false,
			stickyScroll: { enabled: false },
			readOnly: true,
			minimap: { enabled: false },
			scrollbar: { alwaysConsumeMouseWheel: false, useShadows: true },
		}, { isSimpleWidget: true, contributions }, parentEditor);

		const doStyle = () => {
			const theme = themeService.getColorTheme();
			const overrides: [target: string, source: string][] = [
				[colorRegistry.editorBackground, inlineChatRegionHighlight],
				[editorColorRegistry.editorGutter, inlineChatRegionHighlight],
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

	override dispose(): void {
		this._title.dispose();
		this._previewEditor.dispose();
		this._previewModel.dispose();
		super.dispose();
	}

	protected override _fillContainer(container: HTMLElement): void {
		container.appendChild(this._elements.domNode);
	}

	override show(): void {
		throw new Error('Use showFileCreation');
	}

	showCreation(where: Range, uri: URI, edits: TextEdit[]): void {

		this._title.element.setFile(uri, { fileKind: FileKind.FILE });
		const langSelection = this._languageService.createByFilepathOrFirstLine(uri, undefined);
		const model = this._modelService.createModel('', langSelection, undefined, true);
		model.applyEdits(edits.map(edit => EditOperation.replace(Range.lift(edit.range), edit.text)));
		this._previewModel.value = model;
		this._previewEditor.setModel(model);

		const lines = Math.min(7, model.getLineCount());
		const lineHeightPadding = (this.editor.getOption(EditorOption.lineHeight) / 12) /* padding-top/bottom*/;


		super.show(where, lines + 1 + lineHeightPadding);
	}

	// --- layout

	protected override revealRange(range: Range, isLastLine: boolean): void {
		// ignore
	}

	protected override _onWidth(widthInPixel: number): void {
		if (this._dim) {
			this._doLayout(this._dim.height, widthInPixel);
		}
	}

	protected override _doLayout(heightInPixel: number, widthInPixel: number): void {

		const { lineNumbersLeft } = this.editor.getLayoutInfo();
		this._elements.title.style.marginLeft = `${lineNumbersLeft}px`;

		const newDim = new Dimension(widthInPixel, heightInPixel);
		if (!Dimension.equals(this._dim, newDim)) {
			this._dim = newDim;
			const oneLineHeightInPx = this.editor.getOption(EditorOption.lineHeight);
			this._previewEditor.layout(this._dim.with(undefined, this._dim.height - oneLineHeightInPx /* title */));
		}
	}
}
