/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./referencesWidget';
import * as nls from 'vs/nls';
import * as collections from 'vs/base/common/collections';
import {onUnexpectedError} from 'vs/base/common/errors';
import {getPathLabel} from 'vs/base/common/labels';
import Event, {Emitter} from 'vs/base/common/event';
import {IDisposable, cAll, dispose, Disposables} from 'vs/base/common/lifecycle';
import {Schemas} from 'vs/base/common/network';
import * as strings from 'vs/base/common/strings';
import {TPromise} from 'vs/base/common/winjs.base';
import {$, Builder} from 'vs/base/browser/builder';
import * as dom from 'vs/base/browser/dom';
import {Sash, ISashEvent, IVerticalSashLayoutProvider} from 'vs/base/browser/ui/sash/sash';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {IMouseEvent} from 'vs/base/browser/mouseEvent';
import {GestureEvent} from 'vs/base/browser/touch';
import {CountBadge} from 'vs/base/browser/ui/countBadge/countBadge';
import {FileLabel} from 'vs/base/browser/ui/filelabel/fileLabel';
import {LeftRightWidget} from 'vs/base/browser/ui/leftRightWidget/leftRightWidget';
import * as tree from 'vs/base/parts/tree/browser/tree';
import {DefaultController, LegacyRenderer} from 'vs/base/parts/tree/browser/treeDefaults';
import {Tree} from 'vs/base/parts/tree/browser/treeImpl';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {DefaultConfig} from 'vs/editor/common/config/defaultConfig';
import {Range} from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {Model} from 'vs/editor/common/model/model';
import {ICodeEditor, IMouseTarget} from 'vs/editor/browser/editorBrowser';
import {EmbeddedCodeEditorWidget} from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import {PeekViewWidget, IPeekViewService} from 'vs/editor/contrib/zoneWidget/browser/peekViewWidget';
import {FileReferences, OneReference, ReferencesModel} from './referencesModel';

class DecorationsManager implements IDisposable {

	private static DecorationOptions:editorCommon.IModelDecorationOptions = {
		stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'reference-decoration'
	};

	private _decorationSet = collections.createStringDictionary<OneReference>();
	private _decorationIgnoreSet = collections.createStringDictionary<OneReference>();
	private _callOnDispose:Function[] = [];
	private _callOnModelChange:Function[] = [];

	constructor(private editor:ICodeEditor, private model:ReferencesModel) {
		this._callOnDispose.push(this.editor.addListener(editorCommon.EventType.ModelChanged, () => this._onModelChanged()));
		this._onModelChanged();
	}

	public dispose(): void {
		this._callOnModelChange = cAll(this._callOnModelChange);
		this._callOnDispose = cAll(this._callOnDispose);
		this.removeDecorations();
	}

	private _onModelChanged():void {

		this.removeDecorations();
		this._callOnModelChange = cAll(this._callOnModelChange);

		var model = this.editor.getModel();
		if(!model) {
			return;
		}

		for(var i = 0, len = this.model.groups.length; i < len; i++) {
			if(this.model.groups[i].resource.toString() === model.getAssociatedResource().toString()) {
				this._addDecorations(this.model.groups[i]);
				return;
			}
		}
	}

	private _addDecorations(reference:FileReferences):void {
		this._callOnModelChange.push(this.editor.getModel().addListener(editorCommon.EventType.ModelDecorationsChanged, (event) => this._onDecorationChanged(event)));

		this.editor.getModel().changeDecorations((accessor) => {
			var newDecorations: editorCommon.IModelDeltaDecoration[] = [];
			var newDecorationsActualIndex: number[] = [];

			for(let i = 0, len = reference.children.length; i < len; i++) {
				let oneReference = reference.children[i];
				if(this._decorationIgnoreSet[oneReference.id]) {
					continue;
				}
				newDecorations.push({
					range: oneReference.range,
					options: DecorationsManager.DecorationOptions
				});
				newDecorationsActualIndex.push(i);
			}

			var decorations = accessor.deltaDecorations([], newDecorations);

			for (var i = 0; i < decorations.length; i++) {
				this._decorationSet[decorations[i]] = reference.children[newDecorationsActualIndex[i]];
			}
		});
	}

	private _onDecorationChanged(event:any):void {
		var addedOrChangedDecorations = <any[]> event.addedOrChangedDecorations,
			toRemove:string[] = [];

		for(var i = 0, len = addedOrChangedDecorations.length; i < len; i++) {
			var reference = collections.lookup(this._decorationSet, <string> addedOrChangedDecorations[i].id);
			if(!reference) {
				continue;
			}

			var newRange = <editorCommon.IRange> addedOrChangedDecorations[i].range,
				ignore = false;

			if(Range.equalsRange(newRange, reference.range)) {
				continue;

			} else if(Range.spansMultipleLines(newRange)) {
				ignore = true;

			} else {
				var lineLength = reference.range.endColumn - reference.range.startColumn,
					newLineLength = newRange.endColumn - newRange.startColumn;

				if(lineLength !== newLineLength) {
					ignore = true;
				}
			}

			if(ignore) {
				this._decorationIgnoreSet[reference.id] = reference;
				toRemove.push(addedOrChangedDecorations[i].id);
			} else {
				reference.range = newRange;
			}
		}

		this.editor.changeDecorations((accessor) => {
			for (let i = 0, len = toRemove.length; i < len; i++) {
				delete this._decorationSet[toRemove[i]];
			}
			accessor.deltaDecorations(toRemove, []);
		});
	}

	public removeDecorations():void {
		var keys = Object.keys(this._decorationSet);
		if (keys.length > 0) {
			this.editor.changeDecorations((accessor) => {
				accessor.deltaDecorations(keys, []);
			});
		}
		this._decorationSet = {};
	}
}

class DataSource implements tree.IDataSource {

	constructor(
		@IEditorService private _editorService: IEditorService
	) {
		//
	}

	public getId(tree:tree.ITree, element:any):string {
		if(element instanceof ReferencesModel) {
			return 'root';
		} else if(element instanceof FileReferences) {
			return (<FileReferences> element).id;
		} else if(element instanceof OneReference) {
			return (<OneReference> element).id;
		}
	}

	public hasChildren(tree:tree.ITree, element:any):boolean {
		return element instanceof FileReferences || element instanceof ReferencesModel;
	}

	public getChildren(tree:tree.ITree, element:any):TPromise<any[]> {
		if(element instanceof ReferencesModel) {
			return TPromise.as((<ReferencesModel> element).groups);
		} else if(element instanceof FileReferences) {
			return (<FileReferences> element).resolve(this._editorService).then(val => val.children);
		} else {
			return TPromise.as([]);
		}
	}

	public getParent(tree:tree.ITree, element:any):TPromise<any> {
		var result:any = null;
		if(element instanceof FileReferences) {
			result = (<FileReferences> element).parent;
		} else if (element instanceof OneReference) {
			result = (<OneReference> element).parent;
		}
		return TPromise.as(result);
	}
}

class Controller extends DefaultController {

	static Events = {
		FOCUSED: 'events/custom/focused',
		SELECTED: 'events/custom/selected',
		OPEN_TO_SIDE: 'events/custom/opentoside'
	};

	public onTap(tree: tree.ITree, element: any, event: GestureEvent):boolean {
		if (element instanceof FileReferences) {
			event.preventDefault();
			event.stopPropagation();
			return this._expandCollapse(tree, element);
		}

		var result = super.onTap(tree, element, event);
		tree.emit(Controller.Events.FOCUSED, element);
		return result;
	}

	public onMouseDown(tree:tree.ITree, element:any, event:IMouseEvent):boolean {
		if (event.leftButton) {
			if (element instanceof FileReferences) {
				event.preventDefault();
				event.stopPropagation();
				return this._expandCollapse(tree, element);
			}

			var result = super.onClick(tree, element, event);
			if (event.ctrlKey || event.metaKey) {
				tree.emit(Controller.Events.OPEN_TO_SIDE, element);
			} else if(event.detail === 2) {
				tree.emit(Controller.Events.SELECTED, element);
			} else {
				tree.emit(Controller.Events.FOCUSED, element);
			}
			return result;
		}

		return false;
	}

	public onClick(tree:tree.ITree, element:any, event:IMouseEvent):boolean {
		if (event.leftButton) {
			return false; // Already handled by onMouseDown
		}

		return super.onClick(tree, element, event);
	}

	private _expandCollapse(tree:tree.ITree, element:any):boolean {

		if (tree.isExpanded(element)) {
			tree.collapse(element).done(null, onUnexpectedError);
		} else {
			tree.expand(element).done(null, onUnexpectedError);
		}
		return true;
	}

	public onEscape(tree:tree.ITree, event:IKeyboardEvent):boolean {
		return false;
	}

	public onEnter(tree:tree.ITree, event:IKeyboardEvent):boolean {
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

	public onUp(tree:tree.ITree, event:IKeyboardEvent):boolean {
		super.onUp(tree, event);
		this._fakeFocus(tree, event);
		return true;
	}

	public onPageUp(tree:tree.ITree, event:IKeyboardEvent):boolean {
		super.onPageUp(tree, event);
		this._fakeFocus(tree, event);
		return true;
	}

	public onLeft(tree:tree.ITree, event:IKeyboardEvent):boolean {
		super.onLeft(tree, event);
		this._fakeFocus(tree, event);
		return true;
	}

	public onDown(tree:tree.ITree, event:IKeyboardEvent):boolean {
		super.onDown(tree, event);
		this._fakeFocus(tree, event);
		return true;
	}

	public onPageDown(tree:tree.ITree, event:IKeyboardEvent):boolean {
		super.onPageDown(tree, event);
		this._fakeFocus(tree, event);
		return true;
	}

	public onRight(tree:tree.ITree, event:IKeyboardEvent):boolean {
		super.onRight(tree, event);
		this._fakeFocus(tree, event);
		return true;
	}

	private _fakeFocus(tree:tree.ITree, event:IKeyboardEvent):void {
		// focus next item
		var focus = tree.getFocus();
		tree.setSelection([focus]);
		// send out event
		tree.emit(Controller.Events.FOCUSED, focus);
	}
}

class Renderer extends LegacyRenderer {
	private _contextService:IWorkspaceContextService;

	constructor(private editor: ICodeEditor, @IWorkspaceContextService contextService:IWorkspaceContextService) {
		super();
		this._contextService = contextService;
	}

	public getHeight(tree:tree.ITree, element:any):number {
		return 1.2 * this.editor.getConfiguration().lineHeight;
	}

	protected render(tree:tree.ITree, element:any, container:HTMLElement):tree.IElementCallback {

		dom.clearNode(container);

		if(element instanceof FileReferences) {
			var fileReferences = <FileReferences> element,
				fileReferencesContainer = $('.reference-file');

			/* tslint:disable:no-unused-expression */
			new LeftRightWidget(fileReferencesContainer, (left: HTMLElement) => {
				var resource = fileReferences.resource;
				new FileLabel(left, resource, this._contextService);

				return <IDisposable> null;

			}, (right: HTMLElement) => {
				var len = fileReferences.children.length;
				return new CountBadge(right, len, len > 1 ? nls.localize('referencesCount', "{0} references", len) : nls.localize('referenceCount', "{0} reference", len));
			});
			/* tslint:enable:no-unused-expression */

			fileReferencesContainer.appendTo(container);

		} else if(element instanceof OneReference) {

			var oneReference = <OneReference> element,
				oneReferenceContainer = $('.reference'),
				preview = oneReference.parent.preview.preview(oneReference.range);

			oneReferenceContainer.innerHtml(
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

	constructor(container: HTMLElement, ratio:number) {
		this._ratio = ratio;
		this._sash = new Sash(container, <IVerticalSashLayoutProvider>{
			getVerticalSashLeft: () => this._width * this._ratio,
			getVerticalSashHeight: () => this._height
		});

		let data: { startX: number, startRatio: number };
		this._disposables.add(this._sash.addListener2('start', (e: ISashEvent) => {
			data = { startX: e.startX, startRatio: this._ratio };
		}));

		this._disposables.add(this._sash.addListener2('change', (e: ISashEvent) => {
			let {currentX} = e;
			let newRatio = data.startRatio * (currentX / data.startX);
			if (newRatio > .05 && newRatio < .95) {
				this._ratio = newRatio;
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
	element: OneReference;
}

/**
 * ZoneWidget that is shown inside the editor
 */
export class ReferenceWidget extends PeekViewWidget {

	public static INNER_EDITOR_CONTEXT_KEY = 'inReferenceSearchEditor';

	private _model: ReferencesModel;
	private _decorationsManager: DecorationsManager;

	private _disposeOnNewModel: IDisposable[] = [];
	private _onDidSelectReference = new Emitter<SelectionEvent>();

	private _tree: Tree;
	private _treeContainer: Builder;
	private _sash: VSash;
	private _preview: ICodeEditor;
	private _previewNotAvailableMessage: Model;
	private _previewContainer: Builder;
	private _messageContainer: Builder;

	constructor(
		editor: ICodeEditor,
		public layoutData: LayoutData,
		private _editorService: IEditorService,
		private _contextService: IWorkspaceContextService,
		private _instantiationService: IInstantiationService
	) {
		super(editor, ReferenceWidget.INNER_EDITOR_CONTEXT_KEY, { frameColor: '#007ACC', showFrame: false, showArrow: true, isResizeable: true });

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
				kind: e.ctrlKey || e.metaKey ? 'side' : 'open'
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
				overviewRulerLanes: 2
			};

			this._preview = this._instantiationService.createInstance(EmbeddedCodeEditorWidget, div.getHTMLElement(), options, this.editor);
			this._previewContainer = div.hide();
			this._previewNotAvailableMessage = new Model(nls.localize('missingPreviewMessage', "no preview available"), Model.DEFAULT_CREATION_OPTIONS, null);
		});

		// sash
		this._sash = new VSash(containerElement, this.layoutData.ratio || .8);
		this._sash.onDidChangePercentages(() => {
			let [left, right] = this._sash.percentages;
			this._previewContainer.style({ width: left});
			this._treeContainer.style({ width: right });
			this._preview.layout();
			this._tree.layout();
			this.layoutData.ratio = this._sash.ratio;
		});

		// tree
		container.div({ 'class': 'ref-tree inline' }, (div: Builder) => {
			var config = {
				dataSource: this._instantiationService.createInstance(DataSource),
				renderer: this._instantiationService.createInstance(Renderer, this.editor),
				//sorter: new Sorter(),
				controller: new Controller()
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

	public setSelection(selection: OneReference): TPromise<any> {
		return this._revealReference(selection);
	}

	public setModel(newModel: ReferencesModel): TPromise<any> {
		// clean up
		this._disposeOnNewModel = dispose(this._disposeOnNewModel);
		this._model = newModel;
		if (this._model) {
			return this._onNewModel();
		}
	}

	private _onNewModel(): TPromise<any> {

		if (this._model.empty) {
			this.setTitle('');
			this._messageContainer.innerHtml(nls.localize('noResults', "No results")).show();
			return;
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
				this._onDidSelectReference.fire({ element, kind: 'show' });
			}
		}));
		this._disposeOnNewModel.push(this._tree.addListener2(Controller.Events.SELECTED, (element: any) => {
			if (element instanceof OneReference) {
				this._revealReference(element);
				this._onDidSelectReference.fire({ element, kind: 'goto' });
			}
		}));
		this._disposeOnNewModel.push(this._tree.addListener2(Controller.Events.OPEN_TO_SIDE, (element: any) => {
			if (element instanceof OneReference) {
				this._onDidSelectReference.fire({ element, kind: 'side' });
			}
		}));

		// listen on editor
		this._disposeOnNewModel.push(this._preview.addListener2(editorCommon.EventType.MouseDown, (e: { event: MouseEvent; target: IMouseTarget; }) => {
			if (e.event.detail === 2) {
				this._onDidSelectReference.fire({
					element: this._getFocusedReference(),
					kind: (e.event.ctrlKey || e.event.metaKey) ? 'side' : 'open'
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
		return this._tree.setInput(input);
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
	}

	private _revealReference(reference: OneReference) {

		// Update widget header
		if (reference.resource.scheme !== Schemas.inMemory) {
			this.setTitle(reference.name, getPathLabel(reference.directory, this._contextService));
		} else {
			this.setTitle(nls.localize('peekView.alternateTitle', "References"));
		}

		return TPromise.join([
			this._editorService.resolveEditorModel({ resource: reference.resource }),
			this._tree.reveal(reference)
		]).then(values => {
			if (!this._model) {
				// disposed
				return;
			}

			// show in editor
			let [model] = values;
			if (model) {
				this._preview.setModel(model.textEditorModel);
				var sel = Range.lift(reference.range).collapseToStart();
				this._preview.setSelection(sel);
				this._preview.revealRangeInCenter(sel);
			} else {
				this._preview.setModel(this._previewNotAvailableMessage);
			}

			// show in tree
			this._tree.setSelection([reference]);
			this._tree.setFocus(reference);

		}, onUnexpectedError);
	}
}
