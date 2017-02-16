/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./referencesWidget';
import * as nls from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import { getPathLabel } from 'vs/base/common/labels';
import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable, dispose, Disposables, empty as EmptyDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import * as strings from 'vs/base/common/strings';
import { TPromise } from 'vs/base/common/winjs.base';
import { $, Builder } from 'vs/base/browser/builder';
import * as dom from 'vs/base/browser/dom';
import { Sash, ISashEvent, IVerticalSashLayoutProvider } from 'vs/base/browser/ui/sash/sash';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { GestureEvent } from 'vs/base/browser/touch';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { FileLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { LeftRightWidget } from 'vs/base/browser/ui/leftRightWidget/leftRightWidget';
import * as tree from 'vs/base/parts/tree/browser/tree';
import { DefaultController, LegacyRenderer } from 'vs/base/parts/tree/browser/treeDefaults';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { DefaultConfig } from 'vs/editor/common/config/defaultConfig';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Model } from 'vs/editor/common/model/model';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { PeekViewWidget, IPeekViewService } from 'vs/editor/contrib/zoneWidget/browser/peekViewWidget';
import { FileReferences, OneReference, ReferencesModel } from './referencesModel';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';

class DecorationsManager implements IDisposable {

	private static DecorationOptions: editorCommon.IModelDecorationOptions = {
		stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'reference-decoration'
	};

	private _decorations = new Map<string, OneReference>();
	private _decorationIgnoreSet = new Set<string>();
	private _callOnDispose: IDisposable[] = [];
	private _callOnModelChange: IDisposable[] = [];

	constructor(private _editor: ICodeEditor, private _model: ReferencesModel) {
		this._callOnDispose.push(this._editor.onDidChangeModel(() => this._onModelChanged()));
		this._onModelChanged();
	}

	public dispose(): void {
		this._callOnModelChange = dispose(this._callOnModelChange);
		this._callOnDispose = dispose(this._callOnDispose);
		this.removeDecorations();
	}

	private _onModelChanged(): void {
		this._callOnModelChange = dispose(this._callOnModelChange);
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
		this._callOnModelChange.push(this._editor.getModel().onDidChangeDecorations((event) => this._onDecorationChanged(event)));

		this._editor.changeDecorations(accessor => {

			const newDecorations: editorCommon.IModelDeltaDecoration[] = [];
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

			const decorations = accessor.deltaDecorations([], newDecorations);
			for (let i = 0; i < decorations.length; i++) {
				this._decorations.set(decorations[i], reference.children[newDecorationsActualIndex[i]]);
			}
		});
	}

	private _onDecorationChanged(event: editorCommon.IModelDecorationsChangedEvent): void {
		const changedDecorations = event.changedDecorations,
			toRemove: string[] = [];

		for (let i = 0, len = changedDecorations.length; i < len; i++) {
			let reference = this._decorations.get(changedDecorations[i]);
			if (!reference) {
				continue;
			}

			const newRange = this._editor.getModel().getDecorationRange(changedDecorations[i]);
			let ignore = false;

			if (Range.equalsRange(newRange, reference.range)) {
				continue;

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
				toRemove.push(changedDecorations[i]);
			} else {
				reference.range = newRange;
			}
		}

		this._editor.changeDecorations((accessor) => {
			for (let i = 0, len = toRemove.length; i < len; i++) {
				delete this._decorations[toRemove[i]];
			}
			accessor.deltaDecorations(toRemove, []);
		});
	}

	public removeDecorations(): void {
		this._editor.changeDecorations(accessor => {
			this._decorations.forEach((value, key) => {
				accessor.removeDecoration(key);
			});
			this._decorations.clear();
		});
	}
}

class DataSource implements tree.IDataSource {

	constructor(
		@ITextModelResolverService private _textModelResolverService: ITextModelResolverService
	) {
		//
	}

	public getId(tree: tree.ITree, element: any): string {
		if (element instanceof ReferencesModel) {
			return 'root';
		} else if (element instanceof FileReferences) {
			return (<FileReferences>element).id;
		} else if (element instanceof OneReference) {
			return (<OneReference>element).id;
		}
		return undefined;
	}

	public hasChildren(tree: tree.ITree, element: any): boolean {
		if (element instanceof ReferencesModel) {
			return true;
		}
		if (element instanceof FileReferences && !(<FileReferences>element).failure) {
			return true;
		}
		return false;
	}

	public getChildren(tree: tree.ITree, element: ReferencesModel | FileReferences): TPromise<any[]> {
		if (element instanceof ReferencesModel) {
			return TPromise.as(element.groups);
		} else if (element instanceof FileReferences) {
			return element.resolve(this._textModelResolverService).then(val => {
				if (element.failure) {
					// refresh the element on failure so that
					// we can update its rendering
					return tree.refresh(element).then(() => val.children);
				}
				return val.children;
			});
		} else {
			return TPromise.as([]);
		}
	}

	public getParent(tree: tree.ITree, element: any): TPromise<any> {
		var result: any = null;
		if (element instanceof FileReferences) {
			result = (<FileReferences>element).parent;
		} else if (element instanceof OneReference) {
			result = (<OneReference>element).parent;
		}
		return TPromise.as(result);
	}
}

/**
 * RevealedReference wraps an optional OneReference.
 * This allows RevealedReference to be passed around (i.e. to Controller)
 * and updates to the reference can be seen.
 */
type RevealedReference = { ref: OneReference | undefined };

class Controller extends DefaultController {

	constructor(private _expandedElements: Map<string, FileReferences>, private _revealedReference: RevealedReference) {
		super();
	}

	static Events = {
		FOCUSED: 'events/custom/focused',
		SELECTED: 'events/custom/selected',
		OPEN_TO_SIDE: 'events/custom/opentoside'
	};

	public onTap(tree: tree.ITree, element: any, event: GestureEvent): boolean {
		if (element instanceof FileReferences) {
			event.preventDefault();
			event.stopPropagation();
			return this._expandCollapse(tree, element);
		}

		var result = super.onTap(tree, element, event);
		tree.emit(Controller.Events.FOCUSED, element);
		return result;
	}

	public onMouseDown(tree: tree.ITree, element: any, event: IMouseEvent): boolean {
		if (event.leftButton) {
			if (element instanceof FileReferences) {
				event.preventDefault();
				event.stopPropagation();
				return this._expandCollapse(tree, element);
			}

			var result = super.onClick(tree, element, event);
			if (event.ctrlKey || event.metaKey) {
				tree.emit(Controller.Events.OPEN_TO_SIDE, element);
			} else if (event.detail === 2) {
				tree.emit(Controller.Events.SELECTED, element);
			} else {
				tree.emit(Controller.Events.FOCUSED, element);
			}
			return result;
		}

		return false;
	}

	public onClick(tree: tree.ITree, element: any, event: IMouseEvent): boolean {
		if (event.leftButton) {
			return false; // Already handled by onMouseDown
		}

		return super.onClick(tree, element, event);
	}

	private _expandCollapse(tree: tree.ITree, element: FileReferences): boolean {

		if (tree.isExpanded(element)) {
			this._expandedElements.delete(element.id);
			if (this._revealedReference.ref && this._revealedReference.ref.parent.id === element.id) {
				// If the revealed reference is a child of the element being collapsed, then it should no longer be revealed.
				this._revealedReference.ref = undefined;
			}
			tree.collapse(element).done(null, onUnexpectedError);
		} else {
			this._expandedElements.set(element.id, element);
			tree.expand(element).done(null, onUnexpectedError);
		}
		return true;
	}

	public onEscape(tree: tree.ITree, event: IKeyboardEvent): boolean {
		return false;
	}

	public onEnter(tree: tree.ITree, event: IKeyboardEvent): boolean {
		var element = tree.getFocus();
		if (element instanceof FileReferences) {
			return this._expandCollapse(tree, element);
		}

		var result = super.onEnter(tree, event);
		if (event.ctrlKey || event.metaKey) {
			tree.emit(Controller.Events.OPEN_TO_SIDE, element);
		} else {
			tree.emit(Controller.Events.SELECTED, element);
		}
		return result;
	}

	public onUp(tree: tree.ITree, event: IKeyboardEvent): boolean {
		super.onUp(tree, event);
		this._fakeFocus(tree, event);
		return true;
	}

	public onPageUp(tree: tree.ITree, event: IKeyboardEvent): boolean {
		super.onPageUp(tree, event);
		this._fakeFocus(tree, event);
		return true;
	}

	public onLeft(tree: tree.ITree, event: IKeyboardEvent): boolean {
		super.onLeft(tree, event);
		this._fakeFocus(tree, event);
		return true;
	}

	public onDown(tree: tree.ITree, event: IKeyboardEvent): boolean {
		super.onDown(tree, event);
		this._fakeFocus(tree, event);
		return true;
	}

	public onPageDown(tree: tree.ITree, event: IKeyboardEvent): boolean {
		super.onPageDown(tree, event);
		this._fakeFocus(tree, event);
		return true;
	}

	public onRight(tree: tree.ITree, event: IKeyboardEvent): boolean {
		super.onRight(tree, event);
		this._fakeFocus(tree, event);
		return true;
	}

	private _fakeFocus(tree: tree.ITree, event: IKeyboardEvent): void {
		// focus next item
		var focus = tree.getFocus();
		tree.setSelection([focus]);
		// send out event
		tree.emit(Controller.Events.FOCUSED, focus);
	}
}

class Renderer extends LegacyRenderer {
	private _contextService: IWorkspaceContextService;

	constructor( @IWorkspaceContextService contextService: IWorkspaceContextService) {
		super();
		this._contextService = contextService;
	}

	public getHeight(tree: tree.ITree, element: any): number {
		return 22;
	}

	protected render(tree: tree.ITree, element: FileReferences | OneReference, container: HTMLElement): tree.IElementCallback {

		dom.clearNode(container);

		if (element instanceof FileReferences) {
			const fileReferencesContainer = $('.reference-file');

			/* tslint:disable:no-unused-expression */
			new LeftRightWidget(fileReferencesContainer, (left: HTMLElement) => {

				new FileLabel(left, element.uri, this._contextService);
				return <IDisposable>null;

			}, (right: HTMLElement) => {

				const len = element.children.length;
				const badge = new CountBadge(right, len);

				if (element.failure) {
					badge.setTitleFormat(nls.localize('referencesFailre', "Failed to resolve file."));
				} else if (len > 1) {
					badge.setTitleFormat(nls.localize('referencesCount', "{0} references", len));
				} else {
					badge.setTitleFormat(nls.localize('referenceCount', "{0} reference", len));
				}

				return null;
			});
			/* tslint:enable:no-unused-expression */

			fileReferencesContainer.appendTo(container);

		} else if (element instanceof OneReference) {

			const preview = element.parent.preview.preview(element.range);

			if (!preview) {
				return undefined;
			}

			$('.reference').innerHtml(
				strings.format(
					'<span>{0}</span><span class="referenceMatch">{1}</span><span>{2}</span>',
					strings.escape(preview.before),
					strings.escape(preview.inside),
					strings.escape(preview.after))).appendTo(container);
		}

		return null;
	}

}

class VSash {

	private _disposables = new Disposables();
	private _sash: Sash;
	private _ratio: number;
	private _height: number;
	private _width: number;
	private _onDidChangePercentages = new Emitter<VSash>();

	constructor(container: HTMLElement, ratio: number) {
		this._ratio = ratio;
		this._sash = new Sash(container, <IVerticalSashLayoutProvider>{
			getVerticalSashLeft: () => this._width * this._ratio,
			getVerticalSashHeight: () => this._height
		});

		// compute the current widget clientX postion since
		// the sash works with clientX when dragging
		let clientX: number;
		this._disposables.add(this._sash.addListener2('start', (e: ISashEvent) => {
			clientX = e.startX - (this._width * this.ratio);
		}));

		this._disposables.add(this._sash.addListener2('change', (e: ISashEvent) => {
			// compute the new position of the sash and from that
			// compute the new ratio that we are using
			let newLeft = e.currentX - clientX;
			if (newLeft > 20 && newLeft + 20 < this._width) {
				this._ratio = newLeft / this._width;
				this._sash.layout();
				this._onDidChangePercentages.fire(this);
			}
		}));
	}

	dispose() {
		this._sash.dispose();
		this._onDidChangePercentages.dispose();
		this._disposables.dispose();
	}

	get onDidChangePercentages() {
		return this._onDidChangePercentages.event;
	}

	set width(value: number) {
		this._width = value;
		this._sash.layout();
	}

	set height(value: number) {
		this._height = value;
		this._sash.layout();
	}

	get percentages() {
		let left = 100 * this._ratio;
		let right = 100 - left;
		return [`${left}%`, `${right}%`];
	}

	get ratio() {
		return this._ratio;
	}
}

export interface LayoutData {
	ratio: number;
	heightInLines: number;
}

export interface SelectionEvent {
	kind: 'goto' | 'show' | 'side' | 'open';
	source: 'editor' | 'tree' | 'title';
	element: OneReference;
}

/**
 * ZoneWidget that is shown inside the editor
 */
export class ReferenceWidget extends PeekViewWidget {

	private _model: ReferencesModel;
	private _decorationsManager: DecorationsManager;

	/**
	 * Map of FileRefereces by id.
	 */
	private _expandedElements = new Map<string, FileReferences>();
	private _revealedReference: RevealedReference = { ref: undefined };

	private _disposeOnNewModel: IDisposable[] = [];
	private _onDidSelectReference = new Emitter<SelectionEvent>();

	private _tree: Tree;
	private _treeContainer: Builder;
	private _sash: VSash;
	private _preview: ICodeEditor;
	private _previewModelReference: IDisposable = EmptyDisposable;
	private _previewNotAvailableMessage: Model;
	private _previewContainer: Builder;
	private _messageContainer: Builder;

	constructor(
		editor: ICodeEditor,
		public layoutData: LayoutData,
		private _textModelResolverService: ITextModelResolverService,
		private _contextService: IWorkspaceContextService,
		private _instantiationService: IInstantiationService
	) {
		super(editor, { frameColor: '#007ACC', showFrame: false, showArrow: true, isResizeable: true });

		this._instantiationService = this._instantiationService.createChild(new ServiceCollection([IPeekViewService, this]));
		this.create();
	}

	public dispose(): void {
		this.setModel(null);
		dispose<IDisposable>(this._preview, this._previewNotAvailableMessage, this._tree, this._sash);
		super.dispose();
	}

	get onDidSelectReference(): Event<SelectionEvent> {
		return this._onDidSelectReference.event;
	}

	show(where: editorCommon.IRange) {
		this.editor.revealRangeInCenterIfOutsideViewport(where);
		super.show(where, this.layoutData.heightInLines || 18);
	}

	focus(): void {
		this._tree.DOMFocus();
	}

	protected _onTitleClick(e: MouseEvent): void {
		if (this._preview && this._preview.getModel()) {
			this._onDidSelectReference.fire({
				element: this._getFocusedReference(),
				kind: e.ctrlKey || e.metaKey ? 'side' : 'open',
				source: 'title'
			});
		}
	}

	protected _fillBody(containerElement: HTMLElement): void {
		var container = $(containerElement);

		container.addClass('reference-zone-widget');

		// message pane
		container.div({ 'class': 'messages' }, div => {
			this._messageContainer = div.hide();
		});

		// editor
		container.div({ 'class': 'preview inline' }, (div: Builder) => {

			var options: editorCommon.IEditorOptions = {
				scrollBeyondLastLine: false,
				scrollbar: DefaultConfig.editor.scrollbar,
				overviewRulerLanes: 2,
				fixedOverflowWidgets: true
			};

			this._preview = this._instantiationService.createInstance(EmbeddedCodeEditorWidget, div.getHTMLElement(), options, this.editor);
			this._previewContainer = div.hide();
			this._previewNotAvailableMessage = Model.createFromString(nls.localize('missingPreviewMessage', "no preview available"));
		});

		// sash
		this._sash = new VSash(containerElement, this.layoutData.ratio || .8);
		this._sash.onDidChangePercentages(() => {
			let [left, right] = this._sash.percentages;
			this._previewContainer.style({ width: left });
			this._treeContainer.style({ width: right });
			this._preview.layout();
			this._tree.layout();
			this.layoutData.ratio = this._sash.ratio;
		});

		// tree
		container.div({ 'class': 'ref-tree inline' }, (div: Builder) => {
			var config = {
				dataSource: this._instantiationService.createInstance(DataSource),
				renderer: this._instantiationService.createInstance(Renderer),
				//sorter: new Sorter(),
				controller: new Controller(this._expandedElements, this._revealedReference)
			};

			var options = {
				allowHorizontalScroll: false,
				twistiePixels: 20,
				ariaLabel: nls.localize('treeAriaLabel', "References")
			};
			this._tree = new Tree(div.getHTMLElement(), config, options);

			this._treeContainer = div.hide();
		});
	}

	protected _doLayoutBody(heightInPixel: number, widthInPixel: number): void {
		super._doLayoutBody(heightInPixel, widthInPixel);

		const height = heightInPixel + 'px';
		this._sash.height = heightInPixel;
		this._sash.width = widthInPixel;

		// set height/width
		const [left, right] = this._sash.percentages;
		this._previewContainer.style({ height, width: left });
		this._treeContainer.style({ height, width: right });

		// forward
		this._tree.layout(heightInPixel);
		this._preview.layout();

		// store layout data
		this.layoutData = {
			heightInLines: this._viewZone.heightInLines,
			ratio: this._sash.ratio
		};
	}

	public _onWidth(widthInPixel: number): void {
		this._sash.width = widthInPixel;
		this._preview.layout();
	}

	public isTreeInDefaultState(): boolean {
		return this._revealedReference.ref === undefined && this._expandedElements.size === 0;
	}

	public setSelection(selection: OneReference): TPromise<any> {
		return this._revealReference(selection);
	}

	public setModel(newModel: ReferencesModel, incrementalUpdate: boolean = false): TPromise<any> {
		// clean up
		this._disposeOnNewModel = dispose(this._disposeOnNewModel);
		this._model = newModel;
		if (!incrementalUpdate) {
			this._expandedElements.clear();
			this._revealedReference.ref = undefined;
		}
		if (this._model) {
			return this._onNewModel();
		}
		return undefined;
	}

	private _onNewModel(): TPromise<any> {

		if (this._model.empty) {
			this.setTitle('');
			this._messageContainer.innerHtml(nls.localize('noResults', "No results")).show();
			return TPromise.as(void 0);
		}

		this._messageContainer.hide();
		this._decorationsManager = new DecorationsManager(this._preview, this._model);
		this._disposeOnNewModel.push(this._decorationsManager);

		// listen on model changes
		this._disposeOnNewModel.push(this._model.onDidChangeReferenceRange(reference => this._tree.refresh(reference)));

		// listen on selection and focus
		this._disposeOnNewModel.push(this._tree.addListener2(Controller.Events.FOCUSED, (element) => {
			if (element instanceof OneReference) {
				this._revealReference(element);
				this._onDidSelectReference.fire({ element, kind: 'show', source: 'tree' });
			}
		}));
		this._disposeOnNewModel.push(this._tree.addListener2(Controller.Events.SELECTED, (element: any) => {
			if (element instanceof OneReference) {
				this._onDidSelectReference.fire({ element, kind: 'goto', source: 'tree' });
			}
		}));
		this._disposeOnNewModel.push(this._tree.addListener2(Controller.Events.OPEN_TO_SIDE, (element: any) => {
			if (element instanceof OneReference) {
				this._onDidSelectReference.fire({ element, kind: 'side', source: 'tree' });
			}
		}));

		// listen on editor
		this._disposeOnNewModel.push(this._preview.onMouseDown((e) => {
			if (e.event.detail === 2) {
				this._onDidSelectReference.fire({
					element: this._getFocusedReference(),
					kind: (e.event.ctrlKey || e.event.metaKey) ? 'side' : 'open',
					source: 'editor'
				});
			}
		}));

		// make sure things are rendered
		dom.addClass(this.container, 'results-loaded');
		this._treeContainer.show();
		this._previewContainer.show();
		this._preview.layout();
		this._tree.layout();
		this.focus();

		// pick input and a reference to begin with
		const input = this._model.groups.length === 1 ? this._model.groups[0] : this._model;
		return this._tree.setInput(input).then(() => {
			// Apply any saved state (for incremental updates).
			this._expandedElements.forEach((element) => {
				this._tree.expand(element).done(null, onUnexpectedError);
			});
			if (this._revealedReference.ref) {
				this._revealReference(this._revealedReference.ref);
			}
		});
	}

	private _getFocusedReference(): OneReference {
		const element = this._tree.getFocus();
		if (element instanceof OneReference) {
			return element;
		} else if (element instanceof FileReferences) {
			if (element.children.length > 0) {
				return element.children[0];
			}
		}
		return undefined;
	}

	private _revealReference(reference: OneReference) {
		this._revealedReference.ref = reference;

		// Update widget header
		if (reference.uri.scheme !== Schemas.inMemory) {
			this.setTitle(reference.name, getPathLabel(reference.directory, this._contextService));
		} else {
			this.setTitle(nls.localize('peekView.alternateTitle', "References"));
		}

		const promise = this._textModelResolverService.createModelReference(reference.uri);

		return TPromise.join([promise, this._tree.reveal(reference)]).then(values => {
			const ref = values[0];

			if (!this._model) {
				ref.dispose();
				// disposed
				return;
			}

			this._previewModelReference.dispose();
			this._previewModelReference = EmptyDisposable;

			// show in editor
			const model = ref.object;
			if (model) {
				this._previewModelReference = ref;
				this._preview.setModel(model.textEditorModel);
				var sel = Range.lift(reference.range).collapseToStart();
				this._preview.setSelection(sel);
				this._preview.revealRangeInCenter(sel);
			} else {
				this._preview.setModel(this._previewNotAvailableMessage);
				ref.dispose();
			}

			// show in tree
			this._tree.setSelection([reference]);
			this._tree.setFocus(reference);

		}, onUnexpectedError);
	}
}
