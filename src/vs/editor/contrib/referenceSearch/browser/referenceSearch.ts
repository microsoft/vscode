/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {isFalsyOrEmpty} from 'vs/base/common/arrays';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import Severity from 'vs/base/common/severity';
import lifecycle = require('vs/base/common/lifecycle');
import errors = require('vs/base/common/errors');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import {Range} from 'vs/editor/common/core/range';
import {Position} from 'vs/editor/common/core/position';
import Modes = require('vs/editor/common/modes');
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {EditorAction, Behaviour} from 'vs/editor/common/editorAction';
import widget = require('./referenceSearchWidget');
import model = require('./referenceSearchModel');
import peekView = require('vs/editor/contrib/zoneWidget/browser/peekViewWidget');
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IKeybindingService, IKeybindingContextKey, ICommandHandler} from 'vs/platform/keybinding/common/keybindingService';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';
import ReferenceSearchRegistry from '../common/referenceSearch';
import IPeekViewService = peekView.IPeekViewService;

export class FindReferencesController implements EditorCommon.IEditorContribution {

	public static ID = 'editor.contrib.findReferencesController';

	private editor:EditorBrowser.ICodeEditor;
	private widget:widget.ReferenceWidget;
	private requestIdPool: number;
	private callOnClear:Function[];
	private model:model.Model;
	private modelRevealing:boolean;

	private editorService: IEditorService;
	private telemetryService: ITelemetryService;
	private messageService: IMessageService;
	private instantiationService: IInstantiationService;
	private contextService: IWorkspaceContextService;
	private peekViewService: IPeekViewService;
	private keybindingService: IKeybindingService;

	private _startTime: number = -1;
	private _referenceSearchVisible: IKeybindingContextKey<boolean>;

	static getController(editor:EditorCommon.ICommonCodeEditor): FindReferencesController {
		return <FindReferencesController> editor.getContribution(FindReferencesController.ID);
	}

	public constructor(editor:EditorBrowser.ICodeEditor, @IEditorService editorService: IEditorService, @ITelemetryService telemetryService: ITelemetryService, @IMessageService messageService: IMessageService, @IInstantiationService instantiationService: IInstantiationService, @IPeekViewService peekViewService: IPeekViewService, @IWorkspaceContextService contextService: IWorkspaceContextService, @IKeybindingService keybindingService: IKeybindingService) {
		this.requestIdPool = 0;
		this.callOnClear = [];
		this.editorService = editorService;
		this.telemetryService = telemetryService;
		this.messageService = messageService;
		this.instantiationService = instantiationService;
		this.peekViewService = peekViewService;
		this.contextService = contextService;
		this.keybindingService = keybindingService;
		this.modelRevealing = false;
		this.editor = editor;
		this._referenceSearchVisible = keybindingService.createKey(CONTEXT_REFERENCE_SEARCH_VISIBLE, false);
	}

	public getId(): string {
		return FindReferencesController.ID;
	}

	public dispose(): void {
		if (this.widget) {
			this.widget.dispose();
			this.widget = null;
		}
		this.editor = null;
	}

	public isInPeekView() : boolean {
		return this.peekViewService && this.peekViewService.isActive;
	}

	public closeReferenceSearch(): void {
		this.clear();
	}

	public processRequest(range: EditorCommon.IEditorRange, referencesPromise: TPromise<Modes.IReference[]>) : widget.ReferenceWidget {
		var widgetPosition = !this.widget ? null : this.widget.position;

		// clean up from previous invocation
		var widgetClosed = this.clear();

		// Close if the position is still the same
		if(widgetClosed && !!widgetPosition && range.containsPosition(widgetPosition)) {
			return null;
		}

		this._referenceSearchVisible.set(true);

		// close the widget on model/mode changes
		this.callOnClear.push(this.editor.addListener(EditorCommon.EventType.ModelModeChanged, () => { this.clear(); }));
		this.callOnClear.push(this.editor.addListener(EditorCommon.EventType.ModelChanged, () => {
			if(!this.modelRevealing) {
				this.clear();
			}
		}));

		this.widget = new widget.ReferenceWidget(this.editorService, this.keybindingService, this.contextService, this.instantiationService, this.editor);
		this.widget.setTitle(nls.localize('labelLoading', "Loading..."));
		this.widget.show(range, 18);
		this.callOnClear.push(this.widget.addListener(peekView.Events.Closed, () => {
			this.widget = null;
			this.clear();
		}));
		this.callOnClear.push(this.widget.addListener(widget.ReferenceWidget.Events.EditorDoubleClick, (event:any) => {

			if(!event.reference) {
				return;
			}

			// open editor
			this.editorService.openEditor({
				resource: event.reference,
				options: { selection: event.range }
			}, event.originalEvent.ctrlKey || event.originalEvent.metaKey).done(null, errors.onUnexpectedError);

			// close zone
			if (!(event.originalEvent.ctrlKey || event.originalEvent.metaKey)) {
				this.clear();
			}
		}));
		var requestId = ++this.requestIdPool,
			editorModel = this.editor.getModel();

		var timer = this.telemetryService.start('findReferences', {
			mode: editorModel.getMode().getId()
		});

		referencesPromise.then((references:Modes.IReference[]) => {

			// still current request?
			if(requestId !== this.requestIdPool) {
				timer.stop();
				return;
			}

			// has a result
			if (isFalsyOrEmpty(references)) {
				this.widget.showMessage(nls.localize('noResults', "No results"));
				timer.stop();
				return;
			}

			// create result model
			this.model = new model.Model(references, this.editorService);
			this.model.currentReference = this.model.findReference(editorModel.getAssociatedResource(), range.getStartPosition());

			var unbind = this.model.addListener(model.EventType.CurrentReferenceChanged, () => {

				this.modelRevealing = true;

				this.editorService.openEditor({
					resource: this.model.currentReference.resource,
					options: { selection: this.model.currentReference.range }
				}).done((openedEditor) => {
					if(!openedEditor || openedEditor.getControl() !== this.editor) {
						// TODO@Alex TODO@Joh
						// when opening the current reference we might end up
						// in a different editor instance. that means we also have
						// a different instance of this reference search controller
						// and cannot hold onto the widget (which likely doesn't
						// exist). Instead of bailing out we should find the
						// 'sister' action and pass our current model on to it.
						this.clear();
						return;
					}
					this.modelRevealing = false;
					this.widget.show(this.model.currentReference.range, 18);
					this.widget.focus();
				}, (err) => {
					this.modelRevealing = false;
					errors.onUnexpectedError(err);
				});
			});

			this.callOnClear.push(unbind);

			// show widget
			this._startTime = Date.now();
			if (this.widget) {
				this.widget.setModel(this.model);
			}
			timer.stop();

		}, (error:any) => {
			this.messageService.show(Severity.Error, error);
			timer.stop();
		});

		return this.widget;
	}

	private clear():boolean {

		if (this._startTime !== -1) {
			this.telemetryService.publicLog('zoneWidgetShown', {
				mode: 'reference search',
				elapsedTime: Date.now() - this._startTime
			});
			this._startTime = -1;
		}

		this._referenceSearchVisible.reset();

		lifecycle.cAll(this.callOnClear);

		this.model = null;

		var result = false;
		if(this.widget) {
			this.widget.dispose();
			this.widget = null;
			result = true;
		}

		this.editor.focus();
		this.requestIdPool += 1; // Cancel pending requests
		return result;
	}

}


export class ReferenceAction extends EditorAction {

	public static ID = 'editor.action.referenceSearch.trigger';

	private peekViewService: IPeekViewService;

	// state - changes with every invocation

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @IPeekViewService peekViewService: IPeekViewService, @IKeybindingService keybindingService: IKeybindingService) {
		super(descriptor, editor, Behaviour.WidgetFocus | Behaviour.ShowInContextMenu | Behaviour.UpdateOnCursorPositionChange);

		this.label = nls.localize('references.action.label', "Find All References");

		this.peekViewService = peekViewService;
		if (this.peekViewService) {
			keybindingService.createKey(this.peekViewService.contextKey, true);
		}
	}

	public getGroupId(): string {
		return '1_goto/4_references';
	}

	public isSupported():boolean {
		return ReferenceSearchRegistry.has(this.editor.getModel()) && super.isSupported();
	}

	public getEnablementState():boolean {
		if(this.peekViewService && this.peekViewService.isActive) {
			return false;
		}

		let model = this.editor.getModel();
		let position = this.editor.getSelection().getStartPosition();
		let context = model.getLineContext(position.lineNumber);
		let offset = position.column - 1;

		return ReferenceSearchRegistry.all(model).some(support => {
			return support.canFindReferences(context, offset);
		});
	}

	public run():TPromise<boolean> {
		let range = this.editor.getSelection();
		let model = this.editor.getModel();
		let request = findReferences(model, range.getStartPosition());
		let controller = FindReferencesController.getController(this.editor);
		return TPromise.as(controller.processRequest(range, request)).then(() => true);
	}
}

function findReferences(model: EditorCommon.IModel, position: EditorCommon.IPosition): TPromise<Modes.IReference[]> {
	let references: Modes.IReference[] = [];

	// collect references from all providers
	let promises = ReferenceSearchRegistry.all(model).map(provider => {
		return provider.findReferences(model.getAssociatedResource(), position, true).then(result => {
			if (Array.isArray(result)) {
				references.push(...result);
			}
		}, err => {
			errors.onUnexpectedError(err);
		});
	});

	return TPromise.join(promises).then(() => references);
}

let findReferencesCommand: ICommandHandler = (accessor, args) => {

	let resource = <URI>args[0];
	let position = <EditorCommon.IPosition>args[1];

	if (!(resource instanceof URI)) {
		throw new Error('illegal argument, uri');
	}
	if (!position) {
		throw new Error('illega argument, position')
	}

	return accessor.get(IEditorService).openEditor({ resource }).then(editor => {

		let control = <EditorCommon.ICommonCodeEditor>editor.getControl();
		if (!control || typeof control.getEditorType !== 'function') {
			return;
		}

		let request = findReferences(control.getModel(), position);
		let controller = FindReferencesController.getController(control);
		let range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
		return TPromise.as(controller.processRequest(range, request));
	});
}

let showReferencesCommand: ICommandHandler = (accessor, args:[URI, EditorCommon.IPosition, Modes.IReference[]]) => {
	if (!(args[0] instanceof URI)) {
		throw new Error('illegal argument, uri expected');
	}

	return accessor.get(IEditorService).openEditor({ resource: args[0] }).then(editor => {

		let control = <EditorCommon.ICommonCodeEditor>editor.getControl();
		if (!control || typeof control.getEditorType !== 'function') {
			return;
		}

		let controller = FindReferencesController.getController(control);
		let range = Position.asEmptyRange(args[1]);
		return TPromise.as(controller.processRequest(Range.lift(range), TPromise.as(args[2])));
	});
};

var CONTEXT_REFERENCE_SEARCH_VISIBLE = 'referenceSearchVisible';

// register action
EditorBrowserRegistry.registerEditorContribution(FindReferencesController);
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(ReferenceAction, ReferenceAction.ID, nls.localize('references.action.name', "Show References"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.Shift | KeyCode.F12
}));
KeybindingsRegistry.registerCommandDesc({
	id: 'editor.action.findReferences',
	handler: findReferencesCommand,
	weight: CommonEditorRegistry.commandWeight(50),
	context: [],
	primary: undefined
});
KeybindingsRegistry.registerCommandDesc({
	id: 'editor.action.showReferences',
	handler: showReferencesCommand,
	weight: CommonEditorRegistry.commandWeight(50),
	context: [],
	primary: undefined
});
CommonEditorRegistry.registerEditorCommand('closeReferenceSearch', CommonEditorRegistry.commandWeight(50), { primary: KeyCode.Escape }, false, CONTEXT_REFERENCE_SEARCH_VISIBLE, (accessor, editor, args) => {
	var outerEditor = peekView.getOuterEditor(accessor, args);
	if (outerEditor) {
		var controller = FindReferencesController.getController(outerEditor);
		controller.closeReferenceSearch();
	}
});
CommonEditorRegistry.registerEditorCommand('closeReferenceSearchEditor', CommonEditorRegistry.commandWeight(-101), { primary: KeyCode.Escape }, false, widget.ReferenceWidget.INNER_EDITOR_CONTEXT_KEY, (accessor, editor, args) => {
	var outerEditor = peekView.getOuterEditor(accessor, args);
	if (outerEditor) {
		var controller = FindReferencesController.getController(outerEditor);
		controller.closeReferenceSearch();
	}
});
