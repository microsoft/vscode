/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { Orientation } from 'vs/base/browser/ui/sash/sash';
import { Color } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import { dispose, IDisposable, IReference, DisposableStore } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { basenameOrAuthority, dirname } from 'vs/base/common/resources';
import 'vs/css!./media/referencesWidget';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IRange, Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { IModelDeltaDecoration, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationOptions, TextModel } from 'vs/editor/common/model/textModel';
import { Location } from 'vs/editor/common/modes';
import { ITextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { AriaProvider, DataSource, Delegate, FileReferencesRenderer, OneReferenceRenderer, TreeElement, StringRepresentationProvider, IdentityProvider } from 'vs/editor/contrib/referenceSearch/referencesTree';
import * as nls from 'vs/nls';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { activeContrastBorder, contrastBorder, registerColor } from 'vs/platform/theme/common/colorRegistry';
import { ITheme, IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { PeekViewWidget, IPeekViewService } from './peekViewWidget';
import { FileReferences, OneReference, ReferencesModel } from './referencesModel';
import { ITreeRenderer, IAsyncDataSource } from 'vs/base/browser/ui/tree/tree';
import { IAsyncDataTreeOptions } from 'vs/base/browser/ui/tree/asyncDataTree';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { FuzzyScore } from 'vs/base/common/filters';
import { SplitView, Sizing } from 'vs/base/browser/ui/splitview/splitview';


class DecorationsManager implements IDisposable {

	private static readonly DecorationOptions = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'reference-decoration'
	});

	private _decorations = new Map<string, OneReference>();
	private _decorationIgnoreSet = new Set<string>();
	private readonly _callOnDispose = new DisposableStore();
	private readonly _callOnModelChange = new DisposableStore();

	constructor(private _editor: ICodeEditor, private _model: ReferencesModel) {
		this._callOnDispose.add(this._editor.onDidChangeModel(() => this._onModelChanged()));
		this._onModelChanged();
	}

	public dispose(): void {
		this._callOnModelChange.dispose();
		this._callOnDispose.dispose();
		this.removeDecorations();
	}

	private _onModelChanged(): void {
		this._callOnModelChange.clear();
		const model = this._editor.getModel();
		if (model) {
			for (const ref of this._model.groups) {
				if (ref.uri.toString() === model.uri.toString()) {
					this._addDecorations(ref);
					return;
				}
			}
		}
	}

	private _addDecorations(reference: FileReferences): void {
		if (!this._editor.hasModel()) {
			return;
		}
		this._callOnModelChange.add(this._editor.getModel().onDidChangeDecorations((event) => this._onDecorationChanged()));

		const newDecorations: IModelDeltaDecoration[] = [];
		const newDecorationsActualIndex: number[] = [];

		for (let i = 0, len = reference.children.length; i < len; i++) {
			let oneReference = reference.children[i];
			if (this._decorationIgnoreSet.has(oneReference.id)) {
				continue;
			}
			newDecorations.push({
				range: oneReference.range,
				options: DecorationsManager.DecorationOptions
			});
			newDecorationsActualIndex.push(i);
		}

		const decorations = this._editor.deltaDecorations([], newDecorations);
		for (let i = 0; i < decorations.length; i++) {
			this._decorations.set(decorations[i], reference.children[newDecorationsActualIndex[i]]);
		}
	}

	private _onDecorationChanged(): void {
		const toRemove: string[] = [];

		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		this._decorations.forEach((reference, decorationId) => {
			const newRange = model.getDecorationRange(decorationId);

			if (!newRange) {
				return;
			}

			let ignore = false;

			if (Range.equalsRange(newRange, reference.range)) {
				return;

			} else if (Range.spansMultipleLines(newRange)) {
				ignore = true;

			} else {
				const lineLength = reference.range.endColumn - reference.range.startColumn;
				const newLineLength = newRange.endColumn - newRange.startColumn;

				if (lineLength !== newLineLength) {
					ignore = true;
				}
			}

			if (ignore) {
				this._decorationIgnoreSet.add(reference.id);
				toRemove.push(decorationId);
			} else {
				reference.range = newRange;
			}
		});

		for (let i = 0, len = toRemove.length; i < len; i++) {
			this._decorations.delete(toRemove[i]);
		}
		this._editor.deltaDecorations(toRemove, []);
	}

	public removeDecorations(): void {
		let toRemove: string[] = [];
		this._decorations.forEach((value, key) => {
			toRemove.push(key);
		});
		this._editor.deltaDecorations(toRemove, []);
		this._decorations.clear();
	}
}

export class LayoutData {
	ratio: number = 0.7;
	heightInLines: number = 18;

	static fromJSON(raw: string): LayoutData {
		let ratio: number | undefined;
		let heightInLines: number | undefined;
		try {
			const data = <LayoutData>JSON.parse(raw);
			ratio = data.ratio;
			heightInLines = data.heightInLines;
		} catch {
			//
		}
		return {
			ratio: ratio || 0.7,
			heightInLines: heightInLines || 18
		};
	}
}

export interface SelectionEvent {
	kind: 'goto' | 'show' | 'side' | 'open';
	source: 'editor' | 'tree' | 'title';
	element?: Location;
}

export const ctxReferenceWidgetSearchTreeFocused = new RawContextKey<boolean>('referenceSearchTreeFocused', true);

/**
 * ZoneWidget that is shown inside the editor
 */
export class ReferenceWidget extends PeekViewWidget {

	private _model?: ReferencesModel;
	private _decorationsManager?: DecorationsManager;

	private readonly _disposeOnNewModel = new DisposableStore();
	private readonly _callOnDispose = new DisposableStore();
	private _onDidSelectReference = new Emitter<SelectionEvent>();

	private _tree!: WorkbenchAsyncDataTree<ReferencesModel | FileReferences, TreeElement, FuzzyScore>;
	private _treeContainer!: HTMLElement;
	private _splitView!: SplitView;
	private _preview!: ICodeEditor;
	private _previewModelReference!: IReference<ITextEditorModel>;
	private _previewNotAvailableMessage!: TextModel;
	private _previewContainer!: HTMLElement;
	private _messageContainer!: HTMLElement;
	private _dim: dom.Dimension = { height: 0, width: 0 };

	constructor(
		editor: ICodeEditor,
		private _defaultTreeKeyboardSupport: boolean,
		public layoutData: LayoutData,
		@IThemeService themeService: IThemeService,
		@ITextModelService private readonly _textModelResolverService: ITextModelService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IPeekViewService private readonly _peekViewService: IPeekViewService,
		@ILabelService private readonly _uriLabel: ILabelService
	) {
		super(editor, { showFrame: false, showArrow: true, isResizeable: true, isAccessible: true });

		this._applyTheme(themeService.getTheme());
		this._callOnDispose.add(themeService.onThemeChange(this._applyTheme.bind(this)));
		this._peekViewService.addExclusiveWidget(editor, this);
		this.create();
	}

	dispose(): void {
		this.setModel(undefined);
		this._callOnDispose.dispose();
		this._disposeOnNewModel.dispose();
		dispose(this._preview);
		dispose(this._previewNotAvailableMessage);
		dispose(this._tree);
		dispose(this._previewModelReference);
		this._splitView.dispose();
		super.dispose();
	}

	private _applyTheme(theme: ITheme) {
		const borderColor = theme.getColor(peekViewBorder) || Color.transparent;
		this.style({
			arrowColor: borderColor,
			frameColor: borderColor,
			headerBackgroundColor: theme.getColor(peekViewTitleBackground) || Color.transparent,
			primaryHeadingColor: theme.getColor(peekViewTitleForeground),
			secondaryHeadingColor: theme.getColor(peekViewTitleInfoForeground)
		});
	}

	get onDidSelectReference(): Event<SelectionEvent> {
		return this._onDidSelectReference.event;
	}

	show(where: IRange) {
		this.editor.revealRangeInCenterIfOutsideViewport(where, editorCommon.ScrollType.Smooth);
		super.show(where, this.layoutData.heightInLines || 18);
	}

	focus(): void {
		this._tree.domFocus();
	}

	protected _onTitleClick(e: IMouseEvent): void {
		if (this._preview && this._preview.getModel()) {
			this._onDidSelectReference.fire({
				element: this._getFocusedReference(),
				kind: e.ctrlKey || e.metaKey || e.altKey ? 'side' : 'open',
				source: 'title'
			});
		}
	}

	protected _fillBody(containerElement: HTMLElement): void {
		this.setCssClass('reference-zone-widget');

		// message pane
		this._messageContainer = dom.append(containerElement, dom.$('div.messages'));
		dom.hide(this._messageContainer);

		this._splitView = new SplitView(containerElement, { orientation: Orientation.HORIZONTAL });

		// editor
		this._previewContainer = dom.append(containerElement, dom.$('div.preview.inline'));
		let options: IEditorOptions = {
			scrollBeyondLastLine: false,
			scrollbar: {
				verticalScrollbarSize: 14,
				horizontal: 'auto',
				useShadows: true,
				verticalHasArrows: false,
				horizontalHasArrows: false
			},
			overviewRulerLanes: 2,
			fixedOverflowWidgets: true,
			minimap: {
				enabled: false
			}
		};
		this._preview = this._instantiationService.createInstance(EmbeddedCodeEditorWidget, this._previewContainer, options, this.editor);
		dom.hide(this._previewContainer);
		this._previewNotAvailableMessage = TextModel.createFromString(nls.localize('missingPreviewMessage', "no preview available"));

		// tree
		this._treeContainer = dom.append(containerElement, dom.$('div.ref-tree.inline'));
		const treeOptions: IAsyncDataTreeOptions<TreeElement, FuzzyScore> = {
			ariaLabel: nls.localize('treeAriaLabel', "References"),
			keyboardSupport: this._defaultTreeKeyboardSupport,
			accessibilityProvider: new AriaProvider(),
			keyboardNavigationLabelProvider: this._instantiationService.createInstance(StringRepresentationProvider),
			identityProvider: new IdentityProvider()
		};
		this._tree = this._instantiationService.createInstance<HTMLElement, IListVirtualDelegate<TreeElement>, ITreeRenderer<any, FuzzyScore, any>[], IAsyncDataSource<ReferencesModel | FileReferences, TreeElement>, IAsyncDataTreeOptions<TreeElement, FuzzyScore>, WorkbenchAsyncDataTree<ReferencesModel | FileReferences, TreeElement, FuzzyScore>>(
			WorkbenchAsyncDataTree,
			this._treeContainer,
			new Delegate(),
			[
				this._instantiationService.createInstance(FileReferencesRenderer),
				this._instantiationService.createInstance(OneReferenceRenderer),
			],
			this._instantiationService.createInstance(DataSource),
			treeOptions
		);
		ctxReferenceWidgetSearchTreeFocused.bindTo(this._tree.contextKeyService);

		// split stuff
		this._splitView.addView({
			onDidChange: Event.None,
			element: this._previewContainer,
			minimumSize: 200,
			maximumSize: Number.MAX_VALUE,
			layout: (width) => {
				this._preview.layout({ height: this._dim.height, width });
			}
		}, Sizing.Distribute);

		this._splitView.addView({
			onDidChange: Event.None,
			element: this._treeContainer,
			minimumSize: 100,
			maximumSize: Number.MAX_VALUE,
			layout: (width) => {
				this._treeContainer.style.height = `${this._dim.height}px`;
				this._treeContainer.style.width = `${width}px`;
				this._tree.layout(this._dim.height, width);
			}
		}, Sizing.Distribute);

		this._disposables.add(this._splitView.onDidSashChange(() => {
			if (this._dim.width) {
				this.layoutData.ratio = this._splitView.getViewSize(0) / this._dim.width;
			}
		}, undefined));

		// listen on selection and focus
		let onEvent = (element: any, kind: 'show' | 'goto' | 'side') => {
			if (element instanceof OneReference) {
				if (kind === 'show') {
					this._revealReference(element, false);
				}
				this._onDidSelectReference.fire({ element, kind, source: 'tree' });
			}
		};
		this._tree.onDidChangeFocus(e => {
			onEvent(e.elements[0], 'show');
		});
		this._tree.onDidChangeSelection(e => {
			let aside = false;
			let goto = false;
			if (e.browserEvent instanceof KeyboardEvent) {
				// todo@joh make this a command
				goto = true;
			}
			if (aside) {
				onEvent(e.elements[0], 'side');
			} else if (goto) {
				onEvent(e.elements[0], 'goto');
			} else {
				onEvent(e.elements[0], 'show');
			}
		});
		this._tree.onDidOpen(e => {
			const aside = (e.browserEvent instanceof MouseEvent) && (e.browserEvent.ctrlKey || e.browserEvent.metaKey || e.browserEvent.altKey);
			const goto = !e.browserEvent || ((e.browserEvent instanceof MouseEvent) && e.browserEvent.detail === 2);

			if (aside) {
				onEvent(e.elements[0], 'side');
			} else if (goto) {
				onEvent(e.elements[0], 'goto');
			} else {
				onEvent(e.elements[0], 'show');
			}
		});

		dom.hide(this._treeContainer);
	}

	protected _onWidth(width: number) {
		if (this._dim) {
			this._doLayoutBody(this._dim.height, width);
		}
	}

	protected _doLayoutBody(heightInPixel: number, widthInPixel: number): void {
		super._doLayoutBody(heightInPixel, widthInPixel);
		this._dim = { height: heightInPixel, width: widthInPixel };
		this.layoutData.heightInLines = this._viewZone ? this._viewZone.heightInLines : this.layoutData.heightInLines;
		this._splitView.layout(widthInPixel);
		this._splitView.resizeView(0, widthInPixel * this.layoutData.ratio);
	}

	public setSelection(selection: OneReference): Promise<any> {
		return this._revealReference(selection, true).then(() => {
			if (!this._model) {
				// disposed
				return;
			}
			// show in tree
			this._tree.setSelection([selection]);
			this._tree.setFocus([selection]);
		});
	}

	public setModel(newModel: ReferencesModel | undefined): Promise<any> {
		// clean up
		this._disposeOnNewModel.clear();
		this._model = newModel;
		if (this._model) {
			return this._onNewModel();
		}
		return Promise.resolve();
	}

	private _onNewModel(): Promise<any> {
		if (!this._model) {
			return Promise.resolve(undefined);
		}

		if (this._model.empty) {
			this.setTitle('');
			this._messageContainer.innerHTML = nls.localize('noResults', "No results");
			dom.show(this._messageContainer);
			return Promise.resolve(undefined);
		}

		dom.hide(this._messageContainer);
		this._decorationsManager = new DecorationsManager(this._preview, this._model);
		this._disposeOnNewModel.add(this._decorationsManager);

		// listen on model changes
		this._disposeOnNewModel.add(this._model.onDidChangeReferenceRange(reference => this._tree.rerender(reference)));

		// listen on editor
		this._disposeOnNewModel.add(this._preview.onMouseDown(e => {
			const { event, target } = e;
			if (event.detail !== 2) {
				return;
			}
			const element = this._getFocusedReference();
			if (!element) {
				return;
			}
			this._onDidSelectReference.fire({
				element: { uri: element.uri, range: target.range! },
				kind: (event.ctrlKey || event.metaKey || event.altKey) ? 'side' : 'open',
				source: 'editor'
			});
		}));

		// make sure things are rendered
		dom.addClass(this.container!, 'results-loaded');
		dom.show(this._treeContainer);
		dom.show(this._previewContainer);
		this._splitView.layout(this._dim.width);
		this.focus();

		// pick input and a reference to begin with
		return this._tree.setInput(this._model.groups.length === 1 ? this._model.groups[0] : this._model);
	}

	private _getFocusedReference(): OneReference | undefined {
		const [element] = this._tree.getFocus();
		if (element instanceof OneReference) {
			return element;
		} else if (element instanceof FileReferences) {
			if (element.children.length > 0) {
				return element.children[0];
			}
		}
		return undefined;
	}

	private _revealedReference?: OneReference;

	private async _revealReference(reference: OneReference, revealParent: boolean): Promise<void> {

		// check if there is anything to do...
		if (this._revealedReference === reference) {
			return;
		}
		this._revealedReference = reference;

		// Update widget header
		if (reference.uri.scheme !== Schemas.inMemory) {
			this.setTitle(basenameOrAuthority(reference.uri), this._uriLabel.getUriLabel(dirname(reference.uri)));
		} else {
			this.setTitle(nls.localize('peekView.alternateTitle', "References"));
		}

		const promise = this._textModelResolverService.createModelReference(reference.uri);

		if (this._tree.getInput() === reference.parent) {
			this._tree.reveal(reference);
		} else {
			if (revealParent) {
				this._tree.reveal(reference.parent);
			}
			await this._tree.expand(reference.parent);
			this._tree.reveal(reference);
		}

		const ref = await promise;

		if (!this._model) {
			// disposed
			ref.dispose();
			return;
		}

		dispose(this._previewModelReference);

		// show in editor
		const model = ref.object;
		if (model) {
			const scrollType = this._preview.getModel() === model.textEditorModel ? editorCommon.ScrollType.Smooth : editorCommon.ScrollType.Immediate;
			const sel = Range.lift(reference.range).collapseToStart();
			this._previewModelReference = ref;
			this._preview.setModel(model.textEditorModel);
			this._preview.setSelection(sel);
			this._preview.revealRangeInCenter(sel, scrollType);
		} else {
			this._preview.setModel(this._previewNotAvailableMessage);
			ref.dispose();
		}
	}
}

// theming

export const peekViewTitleBackground = registerColor('peekViewTitle.background', { dark: '#1E1E1E', light: '#FFFFFF', hc: '#0C141F' }, nls.localize('peekViewTitleBackground', 'Background color of the peek view title area.'));
export const peekViewTitleForeground = registerColor('peekViewTitleLabel.foreground', { dark: '#FFFFFF', light: '#333333', hc: '#FFFFFF' }, nls.localize('peekViewTitleForeground', 'Color of the peek view title.'));
export const peekViewTitleInfoForeground = registerColor('peekViewTitleDescription.foreground', { dark: '#ccccccb3', light: '#6c6c6cb3', hc: '#FFFFFF99' }, nls.localize('peekViewTitleInfoForeground', 'Color of the peek view title info.'));
export const peekViewBorder = registerColor('peekView.border', { dark: '#007acc', light: '#007acc', hc: contrastBorder }, nls.localize('peekViewBorder', 'Color of the peek view borders and arrow.'));

export const peekViewResultsBackground = registerColor('peekViewResult.background', { dark: '#252526', light: '#F3F3F3', hc: Color.black }, nls.localize('peekViewResultsBackground', 'Background color of the peek view result list.'));
export const peekViewResultsMatchForeground = registerColor('peekViewResult.lineForeground', { dark: '#bbbbbb', light: '#646465', hc: Color.white }, nls.localize('peekViewResultsMatchForeground', 'Foreground color for line nodes in the peek view result list.'));
export const peekViewResultsFileForeground = registerColor('peekViewResult.fileForeground', { dark: Color.white, light: '#1E1E1E', hc: Color.white }, nls.localize('peekViewResultsFileForeground', 'Foreground color for file nodes in the peek view result list.'));
export const peekViewResultsSelectionBackground = registerColor('peekViewResult.selectionBackground', { dark: '#3399ff33', light: '#3399ff33', hc: null }, nls.localize('peekViewResultsSelectionBackground', 'Background color of the selected entry in the peek view result list.'));
export const peekViewResultsSelectionForeground = registerColor('peekViewResult.selectionForeground', { dark: Color.white, light: '#6C6C6C', hc: Color.white }, nls.localize('peekViewResultsSelectionForeground', 'Foreground color of the selected entry in the peek view result list.'));
export const peekViewEditorBackground = registerColor('peekViewEditor.background', { dark: '#001F33', light: '#F2F8FC', hc: Color.black }, nls.localize('peekViewEditorBackground', 'Background color of the peek view editor.'));
export const peekViewEditorGutterBackground = registerColor('peekViewEditorGutter.background', { dark: peekViewEditorBackground, light: peekViewEditorBackground, hc: peekViewEditorBackground }, nls.localize('peekViewEditorGutterBackground', 'Background color of the gutter in the peek view editor.'));

export const peekViewResultsMatchHighlight = registerColor('peekViewResult.matchHighlightBackground', { dark: '#ea5c004d', light: '#ea5c004d', hc: null }, nls.localize('peekViewResultsMatchHighlight', 'Match highlight color in the peek view result list.'));
export const peekViewEditorMatchHighlight = registerColor('peekViewEditor.matchHighlightBackground', { dark: '#ff8f0099', light: '#f5d802de', hc: null }, nls.localize('peekViewEditorMatchHighlight', 'Match highlight color in the peek view editor.'));
export const peekViewEditorMatchHighlightBorder = registerColor('peekViewEditor.matchHighlightBorder', { dark: null, light: null, hc: activeContrastBorder }, nls.localize('peekViewEditorMatchHighlightBorder', 'Match highlight border in the peek view editor.'));


registerThemingParticipant((theme, collector) => {
	const findMatchHighlightColor = theme.getColor(peekViewResultsMatchHighlight);
	if (findMatchHighlightColor) {
		collector.addRule(`.monaco-editor .reference-zone-widget .ref-tree .referenceMatch .highlight { background-color: ${findMatchHighlightColor}; }`);
	}
	const referenceHighlightColor = theme.getColor(peekViewEditorMatchHighlight);
	if (referenceHighlightColor) {
		collector.addRule(`.monaco-editor .reference-zone-widget .preview .reference-decoration { background-color: ${referenceHighlightColor}; }`);
	}
	const referenceHighlightBorder = theme.getColor(peekViewEditorMatchHighlightBorder);
	if (referenceHighlightBorder) {
		collector.addRule(`.monaco-editor .reference-zone-widget .preview .reference-decoration { border: 2px solid ${referenceHighlightBorder}; box-sizing: border-box; }`);
	}
	const hcOutline = theme.getColor(activeContrastBorder);
	if (hcOutline) {
		collector.addRule(`.monaco-editor .reference-zone-widget .ref-tree .referenceMatch .highlight { border: 1px dotted ${hcOutline}; box-sizing: border-box; }`);
	}
	const resultsBackground = theme.getColor(peekViewResultsBackground);
	if (resultsBackground) {
		collector.addRule(`.monaco-editor .reference-zone-widget .ref-tree { background-color: ${resultsBackground}; }`);
	}
	const resultsMatchForeground = theme.getColor(peekViewResultsMatchForeground);
	if (resultsMatchForeground) {
		collector.addRule(`.monaco-editor .reference-zone-widget .ref-tree { color: ${resultsMatchForeground}; }`);
	}
	const resultsFileForeground = theme.getColor(peekViewResultsFileForeground);
	if (resultsFileForeground) {
		collector.addRule(`.monaco-editor .reference-zone-widget .ref-tree .reference-file { color: ${resultsFileForeground}; }`);
	}
	const resultsSelectedBackground = theme.getColor(peekViewResultsSelectionBackground);
	if (resultsSelectedBackground) {
		collector.addRule(`.monaco-editor .reference-zone-widget .ref-tree .monaco-list:focus .monaco-list-rows > .monaco-list-row.selected:not(.highlighted) { background-color: ${resultsSelectedBackground}; }`);
	}
	const resultsSelectedForeground = theme.getColor(peekViewResultsSelectionForeground);
	if (resultsSelectedForeground) {
		collector.addRule(`.monaco-editor .reference-zone-widget .ref-tree .monaco-list:focus .monaco-list-rows > .monaco-list-row.selected:not(.highlighted) { color: ${resultsSelectedForeground} !important; }`);
	}
	const editorBackground = theme.getColor(peekViewEditorBackground);
	if (editorBackground) {
		collector.addRule(
			`.monaco-editor .reference-zone-widget .preview .monaco-editor .monaco-editor-background,` +
			`.monaco-editor .reference-zone-widget .preview .monaco-editor .inputarea.ime-input {` +
			`	background-color: ${editorBackground};` +
			`}`);
	}
	const editorGutterBackground = theme.getColor(peekViewEditorGutterBackground);
	if (editorGutterBackground) {
		collector.addRule(
			`.monaco-editor .reference-zone-widget .preview .monaco-editor .margin {` +
			`	background-color: ${editorGutterBackground};` +
			`}`);
	}
});
