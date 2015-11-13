/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./referenceSearchWidget';
import nls = require('vs/nls');
import URI from 'vs/base/common/uri';
import collections = require('vs/base/common/collections');
import lifecycle = require('vs/base/common/lifecycle');
import dom = require('vs/base/browser/dom');
import {TPromise} from 'vs/base/common/winjs.base';
import strings = require('vs/base/common/strings');
import network = require('vs/base/common/network');
import fileLabel = require('vs/base/browser/ui/filelabel/fileLabel');
import errors = require('vs/base/common/errors');
import keyboard = require('vs/base/browser/keyboardEvent');
import mouse = require('vs/base/browser/mouseEvent');
import builder = require('vs/base/browser/builder');
import labels = require('vs/base/common/labels');
import tree = require('vs/base/parts/tree/common/tree');
import treeWidget = require('vs/base/parts/tree/browser/treeImpl');
import treeDefaults = require('vs/base/parts/tree/browser/treeDefaults');
import leftRightWidget = require('vs/base/browser/ui/leftRightWidget/leftRightWidget');
import countBadge = require('vs/base/browser/ui/countBadge/countBadge');
import EditorCommon = require('vs/editor/common/editorCommon');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import {DefaultConfig} from 'vs/editor/common/config/defaultConfig';
import embeddedCodeEditorWidget = require('vs/editor/browser/widget/embeddedCodeEditorWidget');
import codeEditorModel = require('vs/editor/common/model/model');
import peekViewWidget = require('vs/editor/contrib/zoneWidget/browser/peekViewWidget');
import model = require('./referenceSearchModel');
import {Range} from 'vs/editor/common/core/range';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';

class DecorationsManager implements lifecycle.IDisposable {

	private static DecorationOptions:EditorCommon.IModelDecorationOptions = {
		stickiness: EditorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'reference-decoration'
	};

	private _decorationSet = collections.createStringDictionary<model.OneReference>();
	private _decorationIgnoreSet = collections.createStringDictionary<model.OneReference>();

	private callOnDispose:Function[] = [];
	private callOnModelChange:Function[] = [];

	constructor(private editor:EditorBrowser.ICodeEditor, private model:model.Model) {
		this.callOnDispose.push(this.editor.addListener(EditorCommon.EventType.ModelChanged, () => this.onModelChanged()));
		this.onModelChanged();
	}

	public dispose(): void {
		this.callOnModelChange = lifecycle.cAll(this.callOnModelChange);
		this.callOnDispose = lifecycle.cAll(this.callOnDispose);
		this.removeDecorations();
	}

	private onModelChanged():void {

		this.removeDecorations();
		this.callOnModelChange = lifecycle.cAll(this.callOnModelChange);

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

	private addDecorations(reference:model.FileReferences):void {
		this.callOnModelChange.push(this.editor.getModel().addListener(EditorCommon.EventType.ModelDecorationsChanged, (event) => this.onDecorationChanged(event)));

		this.editor.getModel().changeDecorations((accessor) => {
			var newDecorations: EditorCommon.IModelDeltaDecoration[] = [];
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

			var newRange = <EditorCommon.IRange> addedOrChangedDecorations[i].range,
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
		if(element instanceof model.Model) {
			return 'root';
		} else if(element instanceof model.FileReferences) {
			return (<model.FileReferences> element).id;
		} else if(element instanceof model.OneReference) {
			return (<model.OneReference> element).id;
		}
	}

	public hasChildren(tree:tree.ITree, element:any):boolean {
		return element instanceof model.FileReferences || element instanceof model.Model;
	}

	public getChildren(tree:tree.ITree, element:any):TPromise<any[]> {
		if(element instanceof model.Model) {
			return TPromise.as((<model.Model> element).children);
		} else if(element instanceof model.FileReferences) {
			return (<model.FileReferences> element).resolve().then(val => val.children);
		} else {
			return TPromise.as([]);
		}
	}

	public getParent(tree:tree.ITree, element:any):TPromise<any> {
		var result:any = null;
		if(element instanceof model.FileReferences) {
			result = (<model.FileReferences> element).parent;
		} else if (element instanceof model.OneReference) {
			result = (<model.OneReference> element).parent;
		}
		return TPromise.as(result);
	}
}

class Controller extends treeDefaults.DefaultController {

	static Events = {
		FOCUSED: 'events/custom/focused',
		SELECTED: 'events/custom/selected',
		OPEN_TO_SIDE: 'events/custom/opentoside'
	};

	public onMouseDown(tree:tree.ITree, element:any, event:mouse.StandardMouseEvent):boolean {
		if (event.leftButton) {
			if (element instanceof model.FileReferences) {
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

	public onClick(tree:tree.ITree, element:any, event:mouse.StandardMouseEvent):boolean {
		if (event.leftButton) {
			return false; // Already handled by onMouseDown
		}

		return super.onClick(tree, element, event);
	}

	private expandCollapse(tree:tree.ITree, element:any):boolean {

		if (tree.isExpanded(element)) {
			tree.collapse(element).done(null, errors.onUnexpectedError);
		} else {
			tree.expand(element).done(null, errors.onUnexpectedError);
		}
		return true;
	}

	public onEscape(tree:tree.ITree, event:keyboard.StandardKeyboardEvent):boolean {
		return false;
	}

	public onEnter(tree:tree.ITree, event:keyboard.StandardKeyboardEvent):boolean {
		var element = tree.getFocus();
		if (element instanceof model.FileReferences) {
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

	public onUp(tree:tree.ITree, event:keyboard.StandardKeyboardEvent):boolean {
		super.onUp(tree, event);
		this.fakeFocus(tree, event);
		return true;
	}

	public onPageUp(tree:tree.ITree, event:keyboard.StandardKeyboardEvent):boolean {
		super.onPageUp(tree, event);
		this.fakeFocus(tree, event);
		return true;
	}

	public onLeft(tree:tree.ITree, event:keyboard.StandardKeyboardEvent):boolean {
		super.onLeft(tree, event);
		this.fakeFocus(tree, event);
		return true;
	}

	public onDown(tree:tree.ITree, event:keyboard.StandardKeyboardEvent):boolean {
		super.onDown(tree, event);
		this.fakeFocus(tree, event);
		return true;
	}

	public onPageDown(tree:tree.ITree, event:keyboard.StandardKeyboardEvent):boolean {
		super.onPageDown(tree, event);
		this.fakeFocus(tree, event);
		return true;
	}

	public onRight(tree:tree.ITree, event:keyboard.StandardKeyboardEvent):boolean {
		super.onRight(tree, event);
		this.fakeFocus(tree, event);
		return true;
	}

	private fakeFocus(tree:tree.ITree, event:keyboard.StandardKeyboardEvent):void {
		// focus next item
		var focus = tree.getFocus();
		tree.setSelection([focus]);
		// send out event
		tree.emit(Controller.Events.FOCUSED, focus);
	}
}

class Renderer extends treeDefaults.LegacyRenderer {
	private _contextService:IWorkspaceContextService;

	constructor(private editor: EditorBrowser.ICodeEditor, @IWorkspaceContextService contextService:IWorkspaceContextService) {
		super();
		this._contextService = contextService;
	}

	public getHeight(tree:tree.ITree, element:any):number {
		return 1.2 * this.editor.getConfiguration().lineHeight;
	}

	protected render(tree:tree.ITree, element:any, container:HTMLElement):tree.IElementCallback {

		dom.clearNode(container);

		if(element instanceof model.FileReferences) {
			var fileReferences = <model.FileReferences> element,
				fileReferencesContainer = builder.$('.reference-file');

			new leftRightWidget.LeftRightWidget(fileReferencesContainer, (left: HTMLElement) => {
				var resource = fileReferences.resource;

				new fileLabel.FileLabel(left, resource, this._contextService);

				return <lifecycle.IDisposable> null;

			}, (right: HTMLElement) => {
				var len = fileReferences.children.length;
				return new countBadge.CountBadge(right, len, len > 1 ? nls.localize('referencesCount', "{0} references", len) : nls.localize('referenceCount', "{0} reference", len));
			});

			fileReferencesContainer.appendTo(container);

		} else if(element instanceof model.OneReference) {

			var oneReference = <model.OneReference> element,
				oneReferenceContainer = builder.$('.reference'),
				preview = oneReference.parent.preview.preview(oneReference.range);

			oneReferenceContainer.innerHtml(
				strings.format('<span>{0}</span><span class="referenceMatch">{1}</span><span>{2}</span>',
				preview.before, preview.inside, preview.after)).appendTo(container);
		}

		return null;
	}

}

/**
 * ZoneWidget that is shown inside the editor
 */
export class ReferenceWidget extends peekViewWidget.PeekViewWidget {

	public static INNER_EDITOR_CONTEXT_KEY = 'inReferenceSearchEditor';

	public static Events = {
		EditorDoubleClick: 'editorDoubleClick'
	};

	private editorService:IEditorService;
	private contextService:IWorkspaceContextService;
	private instantiationService:IInstantiationService;

	private decorationsManager:DecorationsManager;
	private model:model.Model;
	private callOnModel:lifecycle.IDisposable[];

	private tree:treeWidget.Tree;
	private treeContainer:builder.Builder;

	private preview:EditorBrowser.ICodeEditor;
	private previewNotAvailableMessage:codeEditorModel.Model;
	private previewContainer: builder.Builder;
	private previewDecorations:string[];
	private messageContainer: builder.Builder;

	private lastHeight:string;

	constructor(editorService:IEditorService, keybindingService: IKeybindingService, contextService:IWorkspaceContextService, instantiationService:IInstantiationService, editor:EditorBrowser.ICodeEditor) {
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
		var container = builder.$(containerElement);

		container.addClass('reference-zone-widget');

		// message pane
		container.div({ 'class': 'messages' }, div => {
			this.messageContainer = div.hide();
		});

		// editor
		container.div({ 'class': 'preview inline' }, (div:builder.Builder) => {

			var options:EditorCommon.IEditorOptions = {
				scrollBeyondLastLine: false,
				scrollbar: DefaultConfig.editor.scrollbar,
				overviewRulerLanes: 2
			};

			this.preview = this.instantiationService.createInstance(embeddedCodeEditorWidget.EmbeddedCodeEditorWidget, div.getHTMLElement(), options, this.editor);
			this.previewContainer = div.hide();
			this.previewNotAvailableMessage = new codeEditorModel.Model(nls.localize('missingPreviewMessage', "no preview available"), null);
		});

		// tree
		container.div({ 'class': 'tree inline' }, (div:builder.Builder) => {
			var config = {
				dataSource: this.instantiationService.createInstance(DataSource),
				renderer: this.instantiationService.createInstance(Renderer, this.editor),
				//sorter: new Sorter(),
				controller: new Controller()
			};

			var options = {
				allowHorizontalScroll: false,
				twistiePixels: 20
			};
			this.tree = new treeWidget.Tree(div.getHTMLElement(), config, options);

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

	public setModel(newModel: model.Model): void {
		// clean up
		this.callOnModel = lifecycle.disposeAll(this.callOnModel);
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
		this.callOnModel.push(this.model.addListener2(model.EventType.OnReferenceRangeChanged, (reference:model.OneReference) => {
			this.tree.refresh(reference);
		}));

		// listen on selection and focus
		this.callOnModel.push(this.tree.addListener2(Controller.Events.FOCUSED, (element) => {
			if (element instanceof model.OneReference) {
				this.showReferencePreview(element);
			}
		}));
		this.callOnModel.push(this.tree.addListener2(Controller.Events.SELECTED, (element:any) => {
			if (element instanceof model.OneReference) {
				this.showReferencePreview(element);
				this.model.currentReference = element;
			}
		}));
		this.callOnModel.push(this.tree.addListener2(Controller.Events.OPEN_TO_SIDE, (element:any) => {
			if (element instanceof model.OneReference) {
				this.editorService.openEditor({
					resource: (<model.OneReference> element).resource,
					options: {
						selection: element.range
					}
				}, true);
			}
		}));

		var input = this.model.children.length === 1 ? <any> this.model.children[0] : <any> this.model;

		this.tree.setInput(input).then(() => {
			this.tree.setSelection([this.model.currentReference]);
		}).done(null, errors.onUnexpectedError);

		// listen on editor
		this.callOnModel.push(this.preview.addListener2(EditorCommon.EventType.MouseDown, (e:{ event:MouseEvent; target:EditorBrowser.IMouseTarget; }) => {
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
		if(element instanceof model.OneReference) {
			return (<model.OneReference> element).resource;
		} else if(element instanceof model.FileReferences) {
			var referenceFile = (<model.FileReferences> element);
			if(referenceFile.children.length > 0) {
				return referenceFile.children[0].resource;
			}
		}
		return null;
	}

	public focus():void {
		this.tree.DOMFocus();
	}

	private showReferencePreview(reference:model.OneReference):void {

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
			if(reference.resource.scheme !== network.schemas.inMemory) {
				this.setTitle(reference.name, labels.getPathLabel(reference.directory, this.contextService));
			} else {
				this.setTitle(nls.localize('peekView.alternateTitle', "References"));
			}

		}, errors.onUnexpectedError);

		// show in tree
		this.tree.reveal(reference);
		this.tree.setSelection([reference]);
		this.tree.setFocus(reference);
	}

	public dispose(): void {
		this.setModel(null);
		lifecycle.disposeAll(<lifecycle.IDisposable[]>[this.preview, this.previewNotAvailableMessage, this.tree]);
		super.dispose();
	}
}