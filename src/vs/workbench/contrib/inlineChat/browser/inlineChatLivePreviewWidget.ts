/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, h } from 'vs/base/browser/dom';
import { MutableDisposable } from 'vs/base/common/lifecycle';
import { assertType } from 'vs/base/common/types';
import { ICodeEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { EmbeddedCodeEditorWidget, EmbeddedDiffEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { IModelDecorationOptions, ITextModel } from 'vs/editor/common/model';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as colorRegistry from 'vs/platform/theme/common/colorRegistry';
import * as editorColorRegistry from 'vs/editor/common/core/editorColorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { INLINE_CHAT_ID, inlineChatDiffInserted, inlineChatDiffRemoved, inlineChatRegionHighlight } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { LineRangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { Position } from 'vs/editor/common/core/position';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { IEditorDecorationsCollection } from 'vs/editor/common/editorCommon';
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
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { generateUuid } from 'vs/base/common/uuid';

export class InlineChatLivePreviewWidget extends ZoneWidget {

	private readonly _hideId = `overlayDiff:${generateUuid()}`;

	private readonly _elements = h('div.inline-chat-diff-widget@domNode');

	private readonly _decorationCollection: IEditorDecorationsCollection;
	private readonly _diffEditor: IDiffEditor;

	private _dim: Dimension | undefined;
	private _isVisible: boolean = false;

	constructor(
		editor: ICodeEditor,
		private readonly _session: Session,
		onDidChangeDiff: (() => void) | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@ILogService private readonly _logService: ILogService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
	) {
		super(editor, { showArrow: false, showFrame: false, isResizeable: false, isAccessible: true, allowUnlimitedHeight: true, showInHiddenAreas: true, keepEditorSelection: true, ordinal: 10000 + 1 });
		super.create();
		assertType(editor.hasModel());

		this._decorationCollection = editor.createDecorationsCollection();

		const diffContributions = EditorExtensionsRegistry
			.getEditorContributions()
			.filter(c => c.id !== INLINE_CHAT_ID && c.id !== FoldingController.ID);

		this._diffEditor = instantiationService.createInstance(EmbeddedDiffEditorWidget, this._elements.domNode, {
			scrollbar: { useShadows: false, alwaysConsumeMouseWheel: false, ignoreHorizontalScrollbarInContentHeight: true, },
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
			useInlineViewWhenSpaceIsLimited: false,
			overflowWidgetsDomNode: editor.getOverflowWidgetsDomNode(),
			onlyShowAccessibleDiffViewer: this.accessibilityService.isScreenReaderOptimized(),
		}, {
			originalEditor: { contributions: diffContributions },
			modifiedEditor: { contributions: diffContributions }
		}, editor);

		this._disposables.add(this._diffEditor);
		this._diffEditor.setModel({ original: this._session.textModel0, modified: editor.getModel() });
		this._diffEditor.updateOptions({
			lineDecorationsWidth: editor.getLayoutInfo().decorationsWidth
		});

		if (onDidChangeDiff) {
			this._disposables.add(this._diffEditor.onDidUpdateDiff(() => { onDidChangeDiff(); }));
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


	protected override _fillContainer(container: HTMLElement): void {
		container.appendChild(this._elements.domNode);
	}

	// --- show / hide --------------------

	get isVisible(): boolean {
		return this._isVisible;
	}

	override hide(): void {
		this._decorationCollection.clear();
		this._cleanupFullDiff();
		super.hide();
		this._isVisible = false;
	}

	override show(): void {
		throw new Error('use showForChanges');
	}

	showForChanges(changes: readonly LineRangeMapping[]): void {
		const hasFocus = this._diffEditor.hasTextFocus();
		this._isVisible = true;

		const onlyInserts = changes.every(change => change.original.isEmpty);

		if (onlyInserts || changes.length === 0 || this._session.textModel0.getValueLength() === 0) {
			// no change or changes to an empty file
			this._logService.debug('[IE] livePreview-mode: no diff');
			this._cleanupFullDiff();
			this._renderInsertWithHighlight(changes);
		} else {
			// complex changes
			this._logService.debug('[IE] livePreview-mode: full diff');
			this._decorationCollection.clear();
			this._renderChangesWithFullDiff(changes);
		}

		// TODO@jrieken find a better fix for this. this is the challenge:
		// the `_updateFromChanges` method invokes show of the zone widget which removes and adds the
		// zone and overlay parts. this dettaches and reattaches the dom nodes which means they lose
		// focus
		if (hasFocus) {
			this._diffEditor.focus();
		}
	}

	private _renderInsertWithHighlight(changes: readonly LineRangeMapping[]) {
		assertType(this.editor.hasModel());

		const options: IModelDecorationOptions = {
			description: 'inline-chat-insert',
			showIfCollapsed: false,
			isWholeLine: true,
			className: 'inline-chat-lines-inserted-range',
		};

		this._decorationCollection.set(changes.map(change => {
			return {
				range: lineRangeAsRange(change.modified),
				options,
			};
		}));
	}

	// --- full diff

	private _renderChangesWithFullDiff(changes: readonly LineRangeMapping[]) {
		assertType(this.editor.hasModel());

		const modified = this.editor.getModel();
		const ranges = this._computeHiddenRanges(modified, changes);

		this._hideEditorRanges(this.editor, [ranges.modifiedHidden]);
		this._hideEditorRanges(this._diffEditor.getOriginalEditor(), ranges.originalDiffHidden);
		this._hideEditorRanges(this._diffEditor.getModifiedEditor(), ranges.modifiedDiffHidden);

		// this._diffEditor.revealLine(ranges.modifiedHidden.startLineNumber, ScrollType.Immediate);

		const lineCountModified = ranges.modifiedHidden.length;
		const lineCountOriginal = ranges.originalHidden.length;

		const heightInLines = Math.max(lineCountModified, lineCountOriginal);

		super.show(ranges.anchor, heightInLines);
		this._logService.debug(`[IE] diff SHOWING at ${ranges.anchor} with ${heightInLines} lines height`);
	}

	private _cleanupFullDiff() {
		this.editor.setHiddenAreas([], this._hideId);
		this._diffEditor.getOriginalEditor().setHiddenAreas([], this._hideId);
		this._diffEditor.getModifiedEditor().setHiddenAreas([], this._hideId);
		super.hide();
	}

	private _computeHiddenRanges(model: ITextModel, changes: readonly LineRangeMapping[]) {

		let originalLineRange = changes[0].original;
		let modifiedLineRange = changes[0].modified;
		for (let i = 1; i < changes.length; i++) {
			originalLineRange = originalLineRange.join(changes[i].original);
			modifiedLineRange = modifiedLineRange.join(changes[i].modified);
		}

		if (originalLineRange.isEmpty) {
			originalLineRange = new LineRange(originalLineRange.startLineNumber, originalLineRange.endLineNumberExclusive + 1);
		}

		const originalDiffHidden = invertLineRange(originalLineRange, this._session.textModel0);
		const modifiedDiffHidden = invertLineRange(modifiedLineRange, model);

		return {
			originalHidden: originalLineRange,
			originalDiffHidden,
			modifiedHidden: modifiedLineRange,
			modifiedDiffHidden,
			anchor: new Position(modifiedLineRange.startLineNumber - 1, 1)
		};
	}

	private _hideEditorRanges(editor: ICodeEditor, lineRanges: LineRange[]): void {
		assertType(editor.hasModel());

		lineRanges = lineRanges.filter(range => !range.isEmpty);
		if (lineRanges.length === 0) {
			// todo?
			this._logService.debug(`[IE] diff NOTHING to hide for ${editor.getId()} with ${String(editor.getModel()?.uri)}`);
			return;
		}

		let hiddenRanges: Range[];
		const hiddenLinesCount = lineRanges.reduce((p, c) => p + c.length, 0); // assumes no overlap
		if (hiddenLinesCount >= editor.getModel().getLineCount()) {
			// TODO: not every line can be hidden, keep the first line around
			hiddenRanges = [editor.getModel().getFullModelRange().delta(1)];
		} else {
			hiddenRanges = lineRanges.map(lineRangeAsRange);
		}
		editor.setHiddenAreas(hiddenRanges, this._hideId);
		this._logService.debug(`[IE] diff HIDING ${hiddenRanges} for ${editor.getId()} with ${String(editor.getModel()?.uri)}`);
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
			this._diffEditor.layout(this._dim.with(undefined, this._dim.height));
			this._logService.debug('[IE] diff LAYOUT', this._dim);
		}
	}
}


export class InlineChatFileCreatePreviewWidget extends ZoneWidget {

	private readonly _elements = h('div.inline-chat-newfile-widget@domNode', [
		h('div.title@title', [
			h('span.name.show-file-icons@name'),
			h('span.detail@detail'),
		]),
		h('div.editor@editor'),
	]);

	private readonly _name: ResourceLabel;
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

		this._name = instaService.createInstance(ResourceLabel, this._elements.name, { supportIcons: true });

		const contributions = EditorExtensionsRegistry
			.getEditorContributions()
			.filter(c => c.id !== INLINE_CHAT_ID);

		this._previewEditor = instaService.createInstance(EmbeddedCodeEditorWidget, this._elements.editor, {
			scrollBeyondLastLine: false,
			stickyScroll: { enabled: false },
			readOnly: true,
			minimap: { enabled: false },
			scrollbar: { alwaysConsumeMouseWheel: false, useShadows: true, ignoreHorizontalScrollbarInContentHeight: true, },
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
		this._name.dispose();
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

		this._name.element.setFile(uri, { fileKind: FileKind.FILE });

		const langSelection = this._languageService.createByFilepathOrFirstLine(uri, undefined);
		const model = this._modelService.createModel('', langSelection, undefined, true);
		model.applyEdits(edits.map(edit => EditOperation.replace(Range.lift(edit.range), edit.text)));
		this._previewModel.value = model;
		this._previewEditor.setModel(model);

		const lineHeight = this.editor.getOption(EditorOption.lineHeight);
		this._elements.title.style.height = `${lineHeight}px`;
		const maxLines = Math.max(4, Math.floor((this.editor.getLayoutInfo().height / lineHeight) / .33));

		const lines = Math.min(maxLines, model.getLineCount());
		const lineHeightPadding = (lineHeight / 12) /* padding-top/bottom*/;


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
