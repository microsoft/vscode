/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./referenceSearchWidget';
import * as nls from 'vs/nls';
import * as collections from 'vs/base/common/collections';
import {onUnexpectedError} from 'vs/base/common/errors';
import {getPathLabel} from 'vs/base/common/labels';
import {IDisposable, cAll, disposeAll} from 'vs/base/common/lifecycle';
import {Schemas} from 'vs/base/common/network';
import * as strings from 'vs/base/common/strings';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {$, Builder} from 'vs/base/browser/builder';
import * as dom from 'vs/base/browser/dom';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {IMouseEvent} from 'vs/base/browser/mouseEvent';
import {CountBadge} from 'vs/base/browser/ui/countBadge/countBadge';
import {FileLabel} from 'vs/base/browser/ui/filelabel/fileLabel';
import {LeftRightWidget} from 'vs/base/browser/ui/leftRightWidget/leftRightWidget';
import * as tree from 'vs/base/parts/tree/browser/tree';
import {DefaultController, LegacyRenderer} from 'vs/base/parts/tree/browser/treeDefaults';
import {Tree} from 'vs/base/parts/tree/browser/treeImpl';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {DefaultConfig} from 'vs/editor/common/config/defaultConfig';
import {Range} from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {Model} from 'vs/editor/common/model/model';
import {ICodeEditor, IMouseTarget} from 'vs/editor/browser/editorBrowser';
import {EmbeddedCodeEditorWidget} from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import {PeekViewWidget} from 'vs/editor/contrib/zoneWidget/browser/peekViewWidget';
import {EventType, FileReferences, OneReference, ReferencesModel} from './referenceSearchModel';

class DecorationsManager implements IDisposable {

	private static DecorationOptions:editorCommon.IModelDecorationOptions = {
		stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'reference-decoration'
	};

	private _decorationSet = collections.createStringDictionary<OneReference>();
	private _decorationIgnoreSet = collections.createStringDictionary<OneReference>();

	private callOnDispose:Function[] = [];
	private callOnModelChange:Function[] = [];

	constructor(private editor:ICodeEditor, private model:ReferencesModel) {
		this.callOnDispose.push(this.editor.addListener(editorCommon.EventType.ModelChanged, () => this.onModelChanged()));
		this.onModelChanged();
	}

	public dispose(): void {
		this.callOnModelChange = cAll(this.callOnModelChange);
		this.callOnDispose = cAll(this.callOnDispose);
		this.removeDecorations();
	}

	private onModelChanged():void {

		this.removeDecorations();
		this.callOnModelChange = cAll(this.callOnModelChange);

		var model = this.editor.getModel();
		if(!model) {
			return;
		}

		for(var i = 0, len = this.model.children.length; i < len; i++) {
			if(this.model.children[i].resource.toString() === model.getAssociatedResource().toString()) {
				this.addDecorations(this.model.children[i]);
				return;
			}
		}
	}

	private addDecorations(reference:FileReferences):void {
		this.callOnModelChange.push(this.editor.getModel().addListener(editorCommon.EventType.ModelDecorationsChanged, (event) => this.onDecorationChanged(event)));

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

	private onDecorationChanged(event:any):void {
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
			return TPromise.as((<ReferencesModel> element).children);
		} else if(element instanceof FileReferences) {
			return (<FileReferences> element).resolve().then(val => val.children);
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

	public onMouseDown(tree:tree.ITree, element:any, event:IMouseEvent):boolean {
		if (event.leftButton) {
			if (element instanceof FileReferences) {
				event.preventDefault();
				event.stopPropagation();
				return this.expandCollapse(tree, element);
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

	private expandCollapse(tree:tree.ITree, element:any):boolean {

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
			return this.expandCollapse(tree, element);
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
		this.fakeFocus(tree, event);
		return true;
	}

	public onPageUp(tree:tree.ITree, event:IKeyboardEvent):boolean {
		super.onPageUp(tree, event);
		this.fakeFocus(tree, event);
		return true;
	}

	public onLeft(tree:tree.ITree, event:IKeyboardEvent):boolean {
		super.onLeft(tree, event);
		this.fakeFocus(tree, event);
		return true;
	}

	public onDown(tree:tree.ITree, event:IKeyboardEvent):boolean {
		super.onDown(tree, event);
		this.fakeFocus(tree, event);
		return true;
	}

	public onPageDown(tree:tree.ITree, event:IKeyboardEvent):boolean {
		super.onPageDown(tree, event);
		this.fakeFocus(tree, event);
		return true;
	}

	public onRight(tree:tree.ITree, event:IKeyboardEvent):boolean {
		super.onRight(tree, event);
		this.fakeFocus(tree, event);
		return true;
	}

	private fakeFocus(tree:tree.ITree, event:IKeyboardEvent):void {
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

/**
 * ZoneWidget that is shown inside the editor
 */
export class ReferenceWidget extends PeekViewWidget {

	public static INNER_EDITOR_CONTEXT_KEY = 'inReferenceSearchEditor';

	public static Events = {
		EditorDoubleClick: 'editorDoubleClick'
	};

	private editorService:IEditorService;
	private contextService:IWorkspaceContextService;
	private instantiationService:IInstantiationService;

	private decorationsManager:DecorationsManager;
	private model:ReferencesModel;
	private callOnModel:IDisposable[];

	private tree:Tree;
	private treeContainer:Builder;

	private preview:ICodeEditor;
	private previewNotAvailableMessage:Model;
	private previewContainer: Builder;
	private previewDecorations:string[];
	private messageContainer: Builder;

	private lastHeight:string;

	constructor(editorService:IEditorService, keybindingService: IKeybindingService, contextService:IWorkspaceContextService, instantiationService:IInstantiationService, editor:ICodeEditor) {
		super(editor, keybindingService, ReferenceWidget.INNER_EDITOR_CONTEXT_KEY, { frameColor: '#007ACC', showFrame: false, showArrow: true });
		this.editorService = editorService;
		this.contextService = contextService;
		this.instantiationService = instantiationService.createChild({ peekViewService: this });

		this.callOnModel = [];

		this.tree = null;
		this.treeContainer = null;

		this.preview = null;
		this.previewContainer = null;
		this.previewDecorations = [];

		this.lastHeight = null;

		this.create();
	}

	_onTitleClick(e:Event):void {
		if(!this.preview || !this.preview.getModel()) {
			return;
		}
		var model = this.preview.getModel(),
			lineNumber = this.preview.getPosition().lineNumber,
			titleRange = new Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber));

		this.emit(ReferenceWidget.Events.EditorDoubleClick, { reference: this.getFocusedReference(), range: titleRange, originalEvent:e });
	}

	_fillBody(containerElement:HTMLElement):void {
		var container = $(containerElement);

		container.addClass('reference-zone-widget');

		// message pane
		container.div({ 'class': 'messages' }, div => {
			this.messageContainer = div.hide();
		});

		// editor
		container.div({ 'class': 'preview inline' }, (div:Builder) => {

			var options:editorCommon.IEditorOptions = {
				scrollBeyondLastLine: false,
				scrollbar: DefaultConfig.editor.scrollbar,
				overviewRulerLanes: 2
			};

			this.preview = this.instantiationService.createInstance(EmbeddedCodeEditorWidget, div.getHTMLElement(), options, this.editor);
			this.previewContainer = div.hide();
			this.previewNotAvailableMessage = new Model(nls.localize('missingPreviewMessage', "no preview available"), Model.DEFAULT_CREATION_OPTIONS, null);
		});

		// tree
		container.div({ 'class': 'ref-tree inline' }, (div:Builder) => {
			var config = {
				dataSource: this.instantiationService.createInstance(DataSource),
				renderer: this.instantiationService.createInstance(Renderer, this.editor),
				//sorter: new Sorter(),
				controller: new Controller()
			};

			var options = {
				allowHorizontalScroll: false,
				twistiePixels: 20,
				ariaLabel: nls.localize('treeAriaLabel', "References")
			};
			this.tree = new Tree(div.getHTMLElement(), config, options);

			this.treeContainer = div.hide();
		});
	}

	_doLayoutBody(heightInPixel:number):void {
		super._doLayoutBody(heightInPixel);

		var h = heightInPixel + 'px';
		if(h === this.lastHeight) {
			return;
		}

		// set height
		this.treeContainer.style({ height: h });
		this.previewContainer.style({ height: h });

		// forward
		this.tree.layout(heightInPixel);
		this.preview.layout();

		this.lastHeight = h;
	}

	public onWidth(widthInPixel:number):void {
		this.preview.layout();
	}

	public setModel(newModel: ReferencesModel): void {
		// clean up
		this.callOnModel = disposeAll(this.callOnModel);
		this.model = newModel;
		if (this.model) {
			this._onNewModel();
		}
	}

	public showMessage(message: string): void{
		this.setTitle('');
		this.messageContainer.innerHtml(message).show();
	}

	private _onNewModel():void {

		this.messageContainer.hide();

		this.decorationsManager = new DecorationsManager(this.preview, this.model);
		this.callOnModel.push(this.decorationsManager);

		// listen on model changes
		this.callOnModel.push(this.model.addListener2(EventType.OnReferenceRangeChanged, (reference:OneReference) => {
			this.tree.refresh(reference);
		}));

		// listen on selection and focus
		this.callOnModel.push(this.tree.addListener2(Controller.Events.FOCUSED, (element) => {
			if (element instanceof OneReference) {
				this.showReferencePreview(element);
			}
		}));
		this.callOnModel.push(this.tree.addListener2(Controller.Events.SELECTED, (element:any) => {
			if (element instanceof OneReference) {
				this.showReferencePreview(element);
				this.model.currentReference = element;
			}
		}));
		this.callOnModel.push(this.tree.addListener2(Controller.Events.OPEN_TO_SIDE, (element:any) => {
			if (element instanceof OneReference) {
				this.editorService.openEditor({
					resource: (<OneReference> element).resource,
					options: {
						selection: element.range
					}
				}, true);
			}
		}));

		var input = this.model.children.length === 1 ? <any> this.model.children[0] : <any> this.model;

		this.tree.setInput(input).then(() => {
			this.tree.setSelection([this.model.currentReference]);
		}).done(null, onUnexpectedError);

		// listen on editor
		this.callOnModel.push(this.preview.addListener2(editorCommon.EventType.MouseDown, (e:{ event:MouseEvent; target:IMouseTarget; }) => {
			if(e.event.detail === 2) {
				this.emit(ReferenceWidget.Events.EditorDoubleClick, { reference: this.getFocusedReference(), range: e.target.range, originalEvent: e.event });
			}
		}));

		// make sure things are rendered
		dom.addClass(this.container, 'results-loaded');
		this.treeContainer.show();
		this.previewContainer.show();
		this.preview.layout();
		this.tree.layout();
		this.focus();

		// preview the current reference
		this.showReferencePreview(this.model.nextReference(this.model.currentReference));
	}

	private getFocusedReference(): URI {
		var element = this.tree.getFocus();
		if(element instanceof OneReference) {
			return (<OneReference> element).resource;
		} else if(element instanceof FileReferences) {
			var referenceFile = (<FileReferences> element);
			if(referenceFile.children.length > 0) {
				return referenceFile.children[0].resource;
			}
		}
		return null;
	}

	public focus():void {
		this.tree.DOMFocus();
	}

	private showReferencePreview(reference:OneReference):void {

		// show in editor
		this.editorService.resolveEditorModel({ resource: reference.resource }).done((model) => {

			if(model) {
				this.preview.setModel(model.textEditorModel);
				var sel = Range.lift(reference.range).collapseToStart();
				this.preview.setSelection(sel);
				this.preview.revealRangeInCenter(sel);
			} else {
				this.preview.setModel(this.previewNotAvailableMessage);
			}

			// Update widget header
			if(reference.resource.scheme !== Schemas.inMemory) {
				this.setTitle(reference.name, getPathLabel(reference.directory, this.contextService));
			} else {
				this.setTitle(nls.localize('peekView.alternateTitle', "References"));
			}

		}, onUnexpectedError);

		// show in tree
		this.tree.reveal(reference)
			.then(() => {
				this.tree.setSelection([reference]);
				this.tree.setFocus(reference);
			})
			.done(null, onUnexpectedError);
	}

	public dispose(): void {
		this.setModel(null);
		disposeAll(<IDisposable[]>[this.preview, this.previewNotAvailableMessage, this.tree]);
		super.dispose();
	}
}