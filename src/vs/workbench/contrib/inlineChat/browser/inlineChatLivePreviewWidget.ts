/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, getWindow, h, runAtThisOrScheduleAtNextAnimationFrame } from 'vs/base/browser/dom';
import { DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { assertType } from 'vs/base/common/types';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EmbeddedDiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/embeddedDiffEditorWidget';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/embeddedCodeEditorWidget';
import { EditorOption, IDiffEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { IModelDecorationOptions, ITextModel } from 'vs/editor/common/model';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as colorRegistry from 'vs/platform/theme/common/colorRegistry';
import * as editorColorRegistry from 'vs/editor/common/core/editorColorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { INLINE_CHAT_ID, inlineChatDiffInserted, inlineChatDiffRemoved, inlineChatRegionHighlight } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { Position } from 'vs/editor/common/core/position';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { IEditorDecorationsCollection } from 'vs/editor/common/editorCommon';
import { ILogService } from 'vs/platform/log/common/log';
import { invertLineRange, asRange } from 'vs/workbench/contrib/inlineChat/browser/utils';
import { ResourceLabel } from 'vs/workbench/browser/labels';
import { FileKind } from 'vs/platform/files/common/files';
import { HunkInformation, Session } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { FoldingController } from 'vs/editor/contrib/folding/browser/folding';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { generateUuid } from 'vs/base/common/uuid';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/diffEditorWidget';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ButtonBar, IButton } from 'vs/base/browser/ui/button/button';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';
import { SaveReason, SideBySideEditor } from 'vs/workbench/common/editor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IAction, toAction } from 'vs/base/common/actions';
import { IUntitledTextEditorModel } from 'vs/workbench/services/untitled/common/untitledTextEditorModel';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { Codicon } from 'vs/base/common/codicons';
import { TAB_ACTIVE_MODIFIED_BORDER } from 'vs/workbench/common/theme';
import { localize } from 'vs/nls';
import { Event } from 'vs/base/common/event';

export class InlineChatLivePreviewWidget extends ZoneWidget {

	private readonly _hideId = `overlayDiff:${generateUuid()}`;

	private readonly _elements = h('div.inline-chat-diff-widget@domNode');

	private readonly _decorationCollection: IEditorDecorationsCollection;
	private readonly _diffEditor: DiffEditorWidget;

	private _dim: Dimension | undefined;
	private _isVisible: boolean = false;

	constructor(
		editor: ICodeEditor,
		private readonly _session: Session,
		options: IDiffEditorOptions,
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
			...options
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

			const render = this._disposables.add(new MutableDisposable());
			this._disposables.add(this._diffEditor.onDidContentSizeChange(e => {
				if (!this._isVisible || !e.contentHeightChanged) {
					return;
				}
				render.value = runAtThisOrScheduleAtNextAnimationFrame(getWindow(this._diffEditor.getContainerDomNode()), () => {
					const lineHeight = this.editor.getOption(EditorOption.lineHeight);
					const heightInLines = e.contentHeight / lineHeight;
					this._logService.debug(`[IE] relaying with ${heightInLines} lines height`);
					this._relayout(heightInLines);
				});
			}));
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

	showForChanges(hunk: HunkInformation): void {
		const hasFocus = this._diffEditor.hasTextFocus();
		this._isVisible = true;

		const onlyInserts = hunk.isInsertion();

		if (onlyInserts || this._session.textModel0.getValueLength() === 0) {
			// no change or changes to an empty file
			this._logService.debug('[IE] livePreview-mode: no diff');
			this._cleanupFullDiff();
			this._renderInsertWithHighlight(hunk);
		} else {
			// complex changes
			this._logService.debug('[IE] livePreview-mode: full diff');
			this._decorationCollection.clear();
			this._renderChangesWithFullDiff(hunk);
		}

		// TODO@jrieken find a better fix for this. this is the challenge:
		// the `_updateFromChanges` method invokes show of the zone widget which removes and adds the
		// zone and overlay parts. this dettaches and reattaches the dom nodes which means they lose
		// focus
		if (hasFocus) {
			this._diffEditor.focus();
		}
	}

	private _renderInsertWithHighlight(hunk: HunkInformation) {
		assertType(this.editor.hasModel());

		const options: IModelDecorationOptions = {
			description: 'inline-chat-insert',
			showIfCollapsed: false,
			isWholeLine: true,
			className: 'inline-chat-lines-inserted-range',
		};

		this._decorationCollection.set([{
			range: hunk.getRangesN()[0],
			options
		}]);
	}

	// --- full diff

	private _renderChangesWithFullDiff(hunk: HunkInformation) {
		assertType(this.editor.hasModel());

		const ranges = this._computeHiddenRanges(this._session.textModelN, hunk);

		this._hideEditorRanges(this.editor, [ranges.modifiedHidden]);
		this._hideEditorRanges(this._diffEditor.getOriginalEditor(), ranges.originalDiffHidden);
		this._hideEditorRanges(this._diffEditor.getModifiedEditor(), ranges.modifiedDiffHidden);

		// this._diffEditor.revealLine(ranges.modifiedHidden.startLineNumber, ScrollType.Immediate);

		const lineCountModified = ranges.modifiedHidden.length;
		const lineCountOriginal = ranges.originalHidden.length;

		const heightInLines = Math.max(lineCountModified, lineCountOriginal);

		super.show(ranges.anchor, heightInLines);
		this._logService.debug(`[IE] diff SHOWING at ${ranges.anchor} with ${heightInLines} (approx) lines height`);
	}

	private _cleanupFullDiff() {
		this.editor.setHiddenAreas([], this._hideId);
		this._diffEditor.getOriginalEditor().setHiddenAreas([], this._hideId);
		this._diffEditor.getModifiedEditor().setHiddenAreas([], this._hideId);
		super.hide();
		this._isVisible = false;
	}

	private _computeHiddenRanges(model: ITextModel, hunk: HunkInformation) {


		const modifiedLineRange = LineRange.fromRangeInclusive(hunk.getRangesN()[0]);
		let originalLineRange = LineRange.fromRangeInclusive(hunk.getRanges0()[0]);
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
			hiddenRanges = lineRanges.map(lr => asRange(lr, editor.getModel()));
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

	private static TitleHeight = 35;

	private readonly _elements = h('div.inline-chat-newfile-widget@domNode', [
		h('div.title@title', [
			h('span.name.show-file-icons@name'),
			h('span.detail@detail'),
		]),
		h('div.editor@editor'),
	]);

	private readonly _name: ResourceLabel;
	private readonly _previewEditor: ICodeEditor;
	private readonly _previewStore = new MutableDisposable();
	private readonly _buttonBar: ButtonBarWidget;
	private _dim: Dimension | undefined;

	constructor(
		parentEditor: ICodeEditor,
		@IInstantiationService instaService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@ITextModelService private readonly _textModelResolverService: ITextModelService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super(parentEditor, {
			showArrow: false,
			showFrame: true,
			frameColor: colorRegistry.asCssVariable(TAB_ACTIVE_MODIFIED_BORDER),
			frameWidth: 1,
			isResizeable: true,
			isAccessible: true,
			showInHiddenAreas: true,
			ordinal: 10000 + 2
		});
		super.create();

		this._name = instaService.createInstance(ResourceLabel, this._elements.name, { supportIcons: true });
		this._elements.detail.appendChild(renderIcon(Codicon.circleFilled));

		const contributions = EditorExtensionsRegistry
			.getEditorContributions()
			.filter(c => c.id !== INLINE_CHAT_ID);

		this._previewEditor = instaService.createInstance(EmbeddedCodeEditorWidget, this._elements.editor, {
			scrollBeyondLastLine: false,
			stickyScroll: { enabled: false },
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

		this._buttonBar = instaService.createInstance(ButtonBarWidget);
		this._elements.title.appendChild(this._buttonBar.domNode);
	}

	override dispose(): void {
		this._name.dispose();
		this._buttonBar.dispose();
		this._previewEditor.dispose();
		this._previewStore.dispose();
		super.dispose();
	}

	protected override _fillContainer(container: HTMLElement): void {
		container.appendChild(this._elements.domNode);
	}

	override show(): void {
		throw new Error('Use showFileCreation');
	}

	async showCreation(where: Position, untitledTextModel: IUntitledTextEditorModel): Promise<void> {

		const store = new DisposableStore();
		this._previewStore.value = store;

		this._name.element.setFile(untitledTextModel.resource, {
			fileKind: FileKind.FILE,
			fileDecorations: { badges: true, colors: true }
		});

		const actionSave = toAction({
			id: '1',
			label: localize('save', "Create"),
			run: () => untitledTextModel.save({ reason: SaveReason.EXPLICIT })
		});
		const actionSaveAs = toAction({
			id: '2',
			label: localize('saveAs', "Create As"),
			run: async () => {
				const ids = this._editorService.findEditors(untitledTextModel.resource, { supportSideBySide: SideBySideEditor.ANY });
				await this._editorService.save(ids.slice(), { saveAs: true, reason: SaveReason.EXPLICIT });
			}
		});

		this._buttonBar.update([
			[actionSave, actionSaveAs],
			[(toAction({ id: '3', label: localize('discard', "Discard"), run: () => untitledTextModel.revert() }))]
		]);

		store.add(Event.any(
			untitledTextModel.onDidRevert,
			untitledTextModel.onDidSave,
			untitledTextModel.onDidChangeDirty,
			untitledTextModel.onWillDispose
		)(() => this.hide()));

		await untitledTextModel.resolve();

		const ref = await this._textModelResolverService.createModelReference(untitledTextModel.resource);
		store.add(ref);

		const model = ref.object.textEditorModel;
		this._previewEditor.setModel(model);

		const lineHeight = this.editor.getOption(EditorOption.lineHeight);

		this._elements.title.style.height = `${InlineChatFileCreatePreviewWidget.TitleHeight}px`;
		const titleHightInLines = InlineChatFileCreatePreviewWidget.TitleHeight / lineHeight;

		const maxLines = Math.max(4, Math.floor((this.editor.getLayoutInfo().height / lineHeight) * .33));
		const lines = Math.min(maxLines, model.getLineCount());

		super.show(where, titleHightInLines + lines);
	}

	override hide(): void {
		this._previewStore.clear();
		super.hide();
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
			this._previewEditor.layout(this._dim.with(undefined, this._dim.height - InlineChatFileCreatePreviewWidget.TitleHeight));
		}
	}
}


class ButtonBarWidget {

	private readonly _domNode = h('div.buttonbar-widget');
	private readonly _buttonBar: ButtonBar;
	private readonly _store = new DisposableStore();

	constructor(
		@IContextMenuService private _contextMenuService: IContextMenuService,
	) {
		this._buttonBar = new ButtonBar(this.domNode);

	}

	update(allActions: IAction[][]): void {
		this._buttonBar.clear();
		let secondary = false;
		for (const actions of allActions) {
			let btn: IButton;
			const [first, ...rest] = actions;
			if (!first) {
				continue;
			} else if (rest.length === 0) {
				// single action
				btn = this._buttonBar.addButton({ ...defaultButtonStyles, secondary });
			} else {
				btn = this._buttonBar.addButtonWithDropdown({
					...defaultButtonStyles,
					addPrimaryActionToDropdown: false,
					actions: rest,
					contextMenuProvider: this._contextMenuService
				});
			}
			btn.label = first.label;
			this._store.add(btn.onDidClick(() => first.run()));
			secondary = true;
		}
	}

	dispose(): void {
		this._buttonBar.dispose();
		this._store.dispose();
	}

	get domNode() {
		return this._domNode.root;
	}
}
