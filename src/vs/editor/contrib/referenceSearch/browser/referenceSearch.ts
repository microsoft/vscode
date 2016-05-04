/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {isFalsyOrEmpty} from 'vs/base/common/arrays';
import {onUnexpectedError} from 'vs/base/common/errors';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {cAll} from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IInstantiationService, optional} from 'vs/platform/instantiation/common/instantiation';
import {ICommandHandler, IKeybindingContextKey, IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {IMessageService} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import {EditorAction} from 'vs/editor/common/editorAction';
import {Behaviour} from 'vs/editor/common/editorActionEnablement';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {IReference, ReferenceSearchRegistry} from 'vs/editor/common/modes';
import {ICodeEditor} from 'vs/editor/browser/editorBrowser';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {IPeekViewService, getOuterEditor} from 'vs/editor/contrib/zoneWidget/browser/peekViewWidget';
import {findReferences} from '../common/referenceSearch';
import {EventType, ReferencesModel} from './referenceSearchModel';
import {ReferenceWidget, LayoutData} from './referenceSearchWidget';
import {ServicesAccessor} from 'vs/platform/instantiation/common/instantiation';

export class FindReferencesController implements editorCommon.IEditorContribution {

	public static ID = 'editor.contrib.findReferencesController';

	private _editor:ICodeEditor;
	private _widget:ReferenceWidget;
	private _requestIdPool: number;
	private _callOnClear:Function[];
	private _model:ReferencesModel;
	private _modelRevealing:boolean;

	private editorService: IEditorService;
	private telemetryService: ITelemetryService;
	private messageService: IMessageService;
	private instantiationService: IInstantiationService;
	private contextService: IWorkspaceContextService;
	private peekViewService: IPeekViewService;

	private _startTime: number = -1;
	private _referenceSearchVisible: IKeybindingContextKey<boolean>;

	static getController(editor:editorCommon.ICommonCodeEditor): FindReferencesController {
		return <FindReferencesController> editor.getContribution(FindReferencesController.ID);
	}

	public constructor(
		editor: ICodeEditor,
		@IEditorService editorService: IEditorService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IMessageService messageService: IMessageService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService private _storageService: IStorageService,
		@optional(IPeekViewService) peekViewService: IPeekViewService
	) {
		this._requestIdPool = 0;
		this._callOnClear = [];
		this.editorService = editorService;
		this.telemetryService = telemetryService;
		this.messageService = messageService;
		this.instantiationService = instantiationService;
		this.peekViewService = peekViewService;
		this.contextService = contextService;
		this._modelRevealing = false;
		this._editor = editor;
		this._referenceSearchVisible = keybindingService.createKey(CONTEXT_REFERENCE_SEARCH_VISIBLE, false);
	}

	public getId(): string {
		return FindReferencesController.ID;
	}

	public dispose(): void {
		if (this._widget) {
			this._widget.dispose();
			this._widget = null;
		}
		this._editor = null;
	}

	public isInPeekView() : boolean {
		return this.peekViewService && this.peekViewService.isActive;
	}

	public closeReferenceSearch(): void {
		this.clear();
	}

	public processRequest(range: editorCommon.IEditorRange, referencesPromise: TPromise<IReference[]>, metaTitleFn:(references:IReference[])=>string) : ReferenceWidget {
		var widgetPosition = !this._widget ? null : this._widget.position;

		// clean up from previous invocation
		var widgetClosed = this.clear();

		// Close if the position is still the same
		if(widgetClosed && !!widgetPosition && range.containsPosition(widgetPosition)) {
			return null;
		}

		this._referenceSearchVisible.set(true);

		// close the widget on model/mode changes
		this._callOnClear.push(this._editor.addListener(editorCommon.EventType.ModelModeChanged, () => { this.clear(); }));
		this._callOnClear.push(this._editor.addListener(editorCommon.EventType.ModelChanged, () => {
			if(!this._modelRevealing) {
				this.clear();
			}
		}));
		const storageKey = 'peekViewLayout';
		const data = <LayoutData> JSON.parse(this._storageService.get(storageKey, undefined, '{}'));
		this._widget = new ReferenceWidget(this._editor, data, this.editorService, this.contextService, this.instantiationService);
		this._widget.setTitle(nls.localize('labelLoading', "Loading..."));
		this._widget.show(range);
		this._callOnClear.push(this._widget.onDidClose(() => {
			referencesPromise.cancel();

			this._storageService.store(storageKey, JSON.stringify(this._widget.layoutData));
			this._widget = null;
			this.clear();
		}).dispose);

		this._callOnClear.push(this._widget.onDidDoubleClick(event => {

			if(!event.reference) {
				return;
			}

			// open editor
			this.editorService.openEditor({
				resource: event.reference,
				options: { selection: event.range }
			}, event.originalEvent.ctrlKey || event.originalEvent.metaKey).done(null, onUnexpectedError);

			// close zone
			if (!(event.originalEvent.ctrlKey || event.originalEvent.metaKey)) {
				this.clear();
			}
		}).dispose);
		var requestId = ++this._requestIdPool,
			editorModel = this._editor.getModel();

		var timer = this.telemetryService.timedPublicLog('findReferences', {
			mode: editorModel.getMode().getId()
		});

		referencesPromise.then((references:IReference[]) => {

			// still current request? widget still open?
			if(requestId !== this._requestIdPool || !this._widget) {
				timer.stop();
				return;
			}

			// has a result
			if (isFalsyOrEmpty(references)) {
				this._widget.showMessage(nls.localize('noResults', "No results"));
				timer.stop();
				return;
			}

			// create result model
			this._model = new ReferencesModel(references, this.editorService);
			this._model.currentReference = this._model.findReference(editorModel.getAssociatedResource(), range.getStartPosition());

			var unbind = this._model.addListener(EventType.CurrentReferenceChanged, () => {

				this._modelRevealing = true;

				this.editorService.openEditor({
					resource: this._model.currentReference.resource,
					options: { selection: this._model.currentReference.range }
				}).done((openedEditor) => {
					if(!openedEditor || openedEditor.getControl() !== this._editor) {
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
					this._modelRevealing = false;
					this._widget.show(this._model.currentReference.range);
					this._widget.focus();
				}, (err) => {
					this._modelRevealing = false;
					onUnexpectedError(err);
				});
			});

			this._callOnClear.push(unbind);

			// show widget
			this._startTime = Date.now();
			if (this._widget) {
				this._widget.setMetaTitle(metaTitleFn(references));
				this._widget.setModel(this._model);
			}
			timer.stop();

		}, (error:any) => {
			this.messageService.show(Severity.Error, error);
			timer.stop();
		});

		return this._widget;
	}

	private clear():boolean {

		if (this._startTime !== -1) {
			this.telemetryService.publicLog('zoneWidgetShown', {
				mode: 'reference search',
				elapsedTime: Date.now() - this._startTime
			});
			this._startTime = -1;
		}

		var result = false;
		if(this._widget) {
			this._widget.dispose();
			this._widget = null;
			result = true;
		}

		this._referenceSearchVisible.reset();

		cAll(this._callOnClear);

		this._model = null;

		this._editor.focus();
		this._requestIdPool += 1; // Cancel pending requests
		return result;
	}

}


export class ReferenceAction extends EditorAction {

	public static ID = 'editor.action.referenceSearch.trigger';

	private peekViewService: IPeekViewService;

	// state - changes with every invocation

	constructor(
		descriptor: editorCommon.IEditorActionDescriptorData,
		editor: editorCommon.ICommonCodeEditor,
		@IKeybindingService keybindingService: IKeybindingService,
		@optional(IPeekViewService) peekViewService: IPeekViewService
	) {
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
		return TPromise.as(controller.processRequest(range, request, metaTitle)).then(() => true);
	}
}

function metaTitle(references: IReference[]): string {
	if (references.length > 1) {
		return nls.localize('meta.titleReference', " – {0} references", references.length);
	}
}

let findReferencesCommand: ICommandHandler = (accessor:ServicesAccessor, resource:URI, position:editorCommon.IPosition) => {

	if (!(resource instanceof URI)) {
		throw new Error('illegal argument, uri');
	}
	if (!position) {
		throw new Error('illega argument, position');
	}

	return accessor.get(IEditorService).openEditor({ resource }).then(editor => {

		let control = <editorCommon.ICommonCodeEditor>editor.getControl();
		if (!control || typeof control.getEditorType !== 'function') {
			return;
		}

		let request = findReferences(control.getModel(), position);
		let controller = FindReferencesController.getController(control);
		let range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
		return TPromise.as(controller.processRequest(range, request, metaTitle));
	});
};

let showReferencesCommand: ICommandHandler = (accessor:ServicesAccessor, resource:URI, position:editorCommon.IPosition, references:IReference[]) => {
	if (!(resource instanceof URI)) {
		throw new Error('illegal argument, uri expected');
	}

	return accessor.get(IEditorService).openEditor({ resource: resource }).then(editor => {

		let control = <editorCommon.ICommonCodeEditor>editor.getControl();
		if (!control || typeof control.getEditorType !== 'function') {
			return;
		}

		let controller = FindReferencesController.getController(control);
		let range = Position.asEmptyRange(position);
		return TPromise.as(controller.processRequest(Range.lift(range), TPromise.as(references), metaTitle)).then(() => true);
	});
};

var CONTEXT_REFERENCE_SEARCH_VISIBLE = 'referenceSearchVisible';

// register action
EditorBrowserRegistry.registerEditorContribution(FindReferencesController);
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(ReferenceAction, ReferenceAction.ID, nls.localize('references.action.name', "Show References"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.Shift | KeyCode.F12
}, 'Show References'));
KeybindingsRegistry.registerCommandDesc({
	id: 'editor.action.findReferences',
	handler: findReferencesCommand,
	weight: CommonEditorRegistry.commandWeight(50),
	when: null,
	primary: undefined
});
KeybindingsRegistry.registerCommandDesc({
	id: 'editor.action.showReferences',
	handler: showReferencesCommand,
	weight: CommonEditorRegistry.commandWeight(50),
	when: null,
	primary: undefined,
	description: {
		description: 'Show references at a position in a file',
		args: [
			{ name: 'uri', description: 'The text document in which to show references', constraint: URI },
			{ name: 'position', description: 'The position at which to show', constraint: Position.isIPosition },
			{ name: 'locations', description: 'An array of locations.', constraint: Array },
		]
	}
});
CommonEditorRegistry.registerEditorCommand('closeReferenceSearch', CommonEditorRegistry.commandWeight(50), { primary: KeyCode.Escape, secondary: [KeyMod.Shift | KeyCode.Escape] }, false, CONTEXT_REFERENCE_SEARCH_VISIBLE, (accessor, editor, args) => {
	var outerEditor = getOuterEditor(accessor, args);
	if (outerEditor) {
		var controller = FindReferencesController.getController(outerEditor);
		controller.closeReferenceSearch();
	}
});
CommonEditorRegistry.registerEditorCommand('closeReferenceSearchEditor', CommonEditorRegistry.commandWeight(-101), { primary: KeyCode.Escape, secondary: [KeyMod.Shift | KeyCode.Escape] }, false, ReferenceWidget.INNER_EDITOR_CONTEXT_KEY, (accessor, editor, args) => {
	var outerEditor = getOuterEditor(accessor, args);
	if (outerEditor) {
		var controller = FindReferencesController.getController(outerEditor);
		controller.closeReferenceSearch();
	}
});
