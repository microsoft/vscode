/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { IMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { Orientation } from '../../../../../base/browser/ui/sash/sash.js';
import { Sizing, SplitView } from '../../../../../base/browser/ui/splitview/splitview.js';
import { Color } from '../../../../../base/common/color.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { DisposableStore, dispose, IDisposable, IReference } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basenameOrAuthority, dirname } from '../../../../../base/common/resources.js';
import './referencesWidget.css';
import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { EmbeddedCodeEditorWidget } from '../../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { IEditorOptions } from '../../../../common/config/editorOptions.js';
import { IRange, Range } from '../../../../common/core/range.js';
import { ScrollType } from '../../../../common/editorCommon.js';
import { IModelDeltaDecoration, TrackedRangeStickiness } from '../../../../common/model.js';
import { ModelDecorationOptions, TextModel } from '../../../../common/model/textModel.js';
import { Location } from '../../../../common/languages.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../common/languages/modesRegistry.js';
import { ITextEditorModel, ITextModelService } from '../../../../common/services/resolverService.js';
import { AccessibilityProvider, DataSource, Delegate, FileReferencesRenderer, IdentityProvider, OneReferenceRenderer, StringRepresentationProvider, TreeElement } from './referencesTree.js';
import * as peekView from '../../../peekView/browser/peekView.js';
import * as nls from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IWorkbenchAsyncDataTreeOptions, WorkbenchAsyncDataTree } from '../../../../../platform/list/browser/listService.js';
import { IColorTheme, IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { FileReferences, OneReference, ReferencesModel } from '../referencesModel.js';
import { ITreeDragAndDrop, ITreeDragOverReaction } from '../../../../../base/browser/ui/tree/tree.js';
import { DataTransfers, IDragAndDropData } from '../../../../../base/browser/dnd.js';
import { ElementsDragAndDropData } from '../../../../../base/browser/ui/list/listView.js';
import { withSelection } from '../../../../../platform/opener/common/opener.js';

class DecorationsManager implements IDisposable {

	private static readonly DecorationOptions = ModelDecorationOptions.register({
		description: 'reference-decoration',
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

	dispose(): void {
		this._callOnModelChange.dispose();
		this._callOnDispose.dispose();
		this.removeDecorations();
	}

	private _onModelChanged(): void {
		this._callOnModelChange.clear();
		const model = this._editor.getModel();
		if (!model) {
			return;
		}
		for (const ref of this._model.references) {
			if (ref.uri.toString() === model.uri.toString()) {
				this._addDecorations(ref.parent);
				return;
			}
		}
	}

	private _addDecorations(reference: FileReferences): void {
		if (!this._editor.hasModel()) {
			return;
		}
		this._callOnModelChange.add(this._editor.getModel().onDidChangeDecorations(() => this._onDecorationChanged()));

		const newDecorations: IModelDeltaDecoration[] = [];
		const newDecorationsActualIndex: number[] = [];

		for (let i = 0, len = reference.children.length; i < len; i++) {
			const oneReference = reference.children[i];
			if (this._decorationIgnoreSet.has(oneReference.id)) {
				continue;
			}
			if (oneReference.uri.toString() !== this._editor.getModel().uri.toString()) {
				continue;
			}
			newDecorations.push({
				range: oneReference.range,
				options: DecorationsManager.DecorationOptions
			});
			newDecorationsActualIndex.push(i);
		}

		this._editor.changeDecorations((changeAccessor) => {
			const decorations = changeAccessor.deltaDecorations([], newDecorations);
			for (let i = 0; i < decorations.length; i++) {
				this._decorations.set(decorations[i], reference.children[newDecorationsActualIndex[i]]);
			}
		});
	}

	private _onDecorationChanged(): void {
		const toRemove: string[] = [];

		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		for (const [decorationId, reference] of this._decorations) {

			const newRange = model.getDecorationRange(decorationId);

			if (!newRange) {
				continue;
			}

			let ignore = false;
			if (Range.equalsRange(newRange, reference.range)) {
				continue;

			}

			if (Range.spansMultipleLines(newRange)) {
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
		}

		for (let i = 0, len = toRemove.length; i < len; i++) {
			this._decorations.delete(toRemove[i]);
		}
		this._editor.removeDecorations(toRemove);
	}

	removeDecorations(): void {
		this._editor.removeDecorations([...this._decorations.keys()]);
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
	readonly kind: 'goto' | 'show' | 'side' | 'open';
	readonly source: 'editor' | 'tree' | 'title';
	readonly element?: Location;
}

class ReferencesTree extends WorkbenchAsyncDataTree<ReferencesModel | FileReferences, TreeElement, FuzzyScore> { }

class ReferencesDragAndDrop implements ITreeDragAndDrop<TreeElement> {

	private readonly disposables = new DisposableStore();

	constructor(@ILabelService private readonly labelService: ILabelService) { }

	getDragURI(element: TreeElement): string | null {
		if (element instanceof FileReferences) {
			return element.uri.toString();
		} else if (element instanceof OneReference) {
			return withSelection(element.uri, element.range).toString();
		}
		return null;
	}

	getDragLabel(elements: TreeElement[]): string | undefined {
		if (elements.length === 0) {
			return undefined;
		}
		const labels = elements.map(e => this.labelService.getUriBasenameLabel(e.uri));
		return labels.join(', ');
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		if (!originalEvent.dataTransfer) {
			return;
		}

		const elements = (data as ElementsDragAndDropData<TreeElement, TreeElement[]>).elements;
		const resources = elements.map(e => this.getDragURI(e)).filter(Boolean);

		if (resources.length) {
			// Apply resources as resource-list
			originalEvent.dataTransfer.setData(DataTransfers.RESOURCES, JSON.stringify(resources));

			// Also add as plain text for outside consumers
			originalEvent.dataTransfer.setData(DataTransfers.TEXT, resources.join('\n'));
		}
	}

	onDragOver(): boolean | ITreeDragOverReaction { return false; }
	drop(): void { }
	dispose(): void { this.disposables.dispose(); }
}

/**
 * ZoneWidget that is shown inside the editor
 */
export class ReferenceWidget extends peekView.PeekViewWidget {

	private _model?: ReferencesModel;
	private _decorationsManager?: DecorationsManager;

	private readonly _disposeOnNewModel = new DisposableStore();
	private readonly _callOnDispose = new DisposableStore();

	private readonly _onDidSelectReference = new Emitter<SelectionEvent>();
	readonly onDidSelectReference = this._onDidSelectReference.event;

	private _tree!: ReferencesTree;
	private _treeContainer!: HTMLElement;
	private _splitView!: SplitView;
	private _preview!: ICodeEditor;
	private _previewModelReference!: IReference<ITextEditorModel>;
	private _previewNotAvailableMessage!: TextModel;
	private _previewContainer!: HTMLElement;
	private _messageContainer!: HTMLElement;
	private _dim = new dom.Dimension(0, 0);
	private _isClosing = false; // whether or not a dispose is already in progress

	constructor(
		editor: ICodeEditor,
		private _defaultTreeKeyboardSupport: boolean,
		public layoutData: LayoutData,
		@IThemeService themeService: IThemeService,
		@ITextModelService private readonly _textModelResolverService: ITextModelService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@peekView.IPeekViewService private readonly _peekViewService: peekView.IPeekViewService,
		@ILabelService private readonly _uriLabel: ILabelService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super(editor, { showFrame: false, showArrow: true, isResizeable: true, isAccessible: true, supportOnTitleClick: true }, _instantiationService);

		this._applyTheme(themeService.getColorTheme());
		this._callOnDispose.add(themeService.onDidColorThemeChange(this._applyTheme.bind(this)));
		this._peekViewService.addExclusiveWidget(editor, this);
		this.create();
	}

	get isClosing() {
		return this._isClosing;
	}

	override dispose(): void {
		this._isClosing = true;
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

	private _applyTheme(theme: IColorTheme) {
		const borderColor = theme.getColor(peekView.peekViewBorder) || Color.transparent;
		this.style({
			arrowColor: borderColor,
			frameColor: borderColor,
			headerBackgroundColor: theme.getColor(peekView.peekViewTitleBackground) || Color.transparent,
			primaryHeadingColor: theme.getColor(peekView.peekViewTitleForeground),
			secondaryHeadingColor: theme.getColor(peekView.peekViewTitleInfoForeground)
		});
	}

	override show(where: IRange) {
		super.show(where, this.layoutData.heightInLines || 18);
	}

	focusOnReferenceTree(): void {
		this._tree.domFocus();
	}

	focusOnPreviewEditor(): void {
		this._preview.focus();
	}

	isPreviewEditorFocused(): boolean {
		return this._preview.hasTextFocus();
	}

	protected override _onTitleClick(e: IMouseEvent): void {
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
		const options: IEditorOptions = {
			scrollBeyondLastLine: false,
			scrollbar: {
				verticalScrollbarSize: 14,
				horizontal: 'auto',
				useShadows: true,
				verticalHasArrows: false,
				horizontalHasArrows: false,
				alwaysConsumeMouseWheel: true
			},
			overviewRulerLanes: 2,
			fixedOverflowWidgets: true,
			minimap: {
				enabled: false
			}
		};
		this._preview = this._instantiationService.createInstance(EmbeddedCodeEditorWidget, this._previewContainer, options, {}, this.editor);
		dom.hide(this._previewContainer);
		this._previewNotAvailableMessage = this._instantiationService.createInstance(TextModel, nls.localize('missingPreviewMessage', "no preview available"), PLAINTEXT_LANGUAGE_ID, TextModel.DEFAULT_CREATION_OPTIONS, null);

		// tree
		this._treeContainer = dom.append(containerElement, dom.$('div.ref-tree.inline'));
		const treeOptions: IWorkbenchAsyncDataTreeOptions<TreeElement, FuzzyScore> = {
			keyboardSupport: this._defaultTreeKeyboardSupport,
			accessibilityProvider: new AccessibilityProvider(),
			keyboardNavigationLabelProvider: this._instantiationService.createInstance(StringRepresentationProvider),
			identityProvider: new IdentityProvider(),
			openOnSingleClick: true,
			selectionNavigation: true,
			overrideStyles: {
				listBackground: peekView.peekViewResultsBackground
			},
			dnd: this._instantiationService.createInstance(ReferencesDragAndDrop)
		};
		if (this._defaultTreeKeyboardSupport) {
			// the tree will consume `Escape` and prevent the widget from closing
			this._callOnDispose.add(dom.addStandardDisposableListener(this._treeContainer, 'keydown', (e) => {
				if (e.equals(KeyCode.Escape)) {
					this._keybindingService.dispatchEvent(e, e.target);
					e.stopPropagation();
				}
			}, true));
		}
		this._tree = this._instantiationService.createInstance(
			ReferencesTree,
			'ReferencesWidget',
			this._treeContainer,
			new Delegate(),
			[
				this._instantiationService.createInstance(FileReferencesRenderer),
				this._instantiationService.createInstance(OneReferenceRenderer),
			],
			this._instantiationService.createInstance(DataSource),
			treeOptions,
		);

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
		const onEvent = (element: any, kind: 'show' | 'goto' | 'side') => {
			if (element instanceof OneReference) {
				if (kind === 'show') {
					this._revealReference(element, false);
				}
				this._onDidSelectReference.fire({ element, kind, source: 'tree' });
			}
		};
		this._disposables.add(this._tree.onDidOpen(e => {
			if (e.sideBySide) {
				onEvent(e.element, 'side');
			} else if (e.editorOptions.pinned) {
				onEvent(e.element, 'goto');
			} else {
				onEvent(e.element, 'show');
			}
		}));

		dom.hide(this._treeContainer);
	}

	protected override _onWidth(width: number) {
		if (this._dim) {
			this._doLayoutBody(this._dim.height, width);
		}
	}

	protected override _doLayoutBody(heightInPixel: number, widthInPixel: number): void {
		super._doLayoutBody(heightInPixel, widthInPixel);
		this._dim = new dom.Dimension(widthInPixel, heightInPixel);
		this.layoutData.heightInLines = this._viewZone ? this._viewZone.heightInLines : this.layoutData.heightInLines;
		this._splitView.layout(widthInPixel);
		this._splitView.resizeView(0, widthInPixel * this.layoutData.ratio);
	}

	setSelection(selection: OneReference): Promise<any> {
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

	setModel(newModel: ReferencesModel | undefined): Promise<any> {
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

		if (this._model.isEmpty) {
			this.setTitle('');
			this._messageContainer.innerText = nls.localize('noResults', "No results");
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
		this.container!.classList.add('results-loaded');
		dom.show(this._treeContainer);
		dom.show(this._previewContainer);
		this._splitView.layout(this._dim.width);
		this.focusOnReferenceTree();

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

	async revealReference(reference: OneReference): Promise<void> {
		await this._revealReference(reference, false);
		this._onDidSelectReference.fire({ element: reference, kind: 'goto', source: 'tree' });
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
			const scrollType = this._preview.getModel() === model.textEditorModel ? ScrollType.Smooth : ScrollType.Immediate;
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
