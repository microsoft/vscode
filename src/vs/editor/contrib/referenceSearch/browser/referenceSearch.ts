/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {optional} from 'vs/platform/instantiation/common/instantiation';
import {ICommandHandler} from 'vs/platform/commands/common/commands';
import {IKeybindingService, KbExpr} from 'vs/platform/keybinding/common/keybinding';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import {EditorAction} from 'vs/editor/common/editorAction';
import {Behaviour} from 'vs/editor/common/editorActionEnablement';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {Location, ReferenceProviderRegistry} from 'vs/editor/common/modes';
import {IPeekViewService, getOuterEditor} from 'vs/editor/contrib/zoneWidget/browser/peekViewWidget';
import {provideReferences} from '../common/referenceSearch';
import {ReferenceWidget} from './referencesWidget';
import {ReferencesController, RequestOptions, ctxReferenceSearchVisible} from './referencesController';
import {ReferencesModel} from './referencesModel';
import {ServicesAccessor} from 'vs/platform/instantiation/common/instantiation';

const defaultReferenceSearchOptions: RequestOptions = {
	getMetaTitle(model) {
		return model.references.length > 1 && nls.localize('meta.titleReference', " – {0} references", model.references.length);
	}
};

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
		return ReferenceProviderRegistry.has(this.editor.getModel()) && super.isSupported();
	}

	public getEnablementState():boolean {
		if(this.peekViewService && this.peekViewService.isActive) {
			return false;
		}

		return ReferenceProviderRegistry.has(this.editor.getModel());
	}

	public run():TPromise<boolean> {
		let range = this.editor.getSelection();
		let model = this.editor.getModel();
		let references = provideReferences(model, range.getStartPosition()).then(references => new ReferencesModel(references));
		let controller = ReferencesController.getController(this.editor);
		return TPromise.as(controller.toggleWidget(range, references, defaultReferenceSearchOptions)).then(() => true);
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

		let references = provideReferences(control.getModel(), Position.lift(position)).then(references => new ReferencesModel(references));
		let controller = ReferencesController.getController(control);
		let range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
		return TPromise.as(controller.toggleWidget(range, references, defaultReferenceSearchOptions));
	});
};

let showReferencesCommand: ICommandHandler = (accessor:ServicesAccessor, resource:URI, position:editorCommon.IPosition, references:Location[]) => {
	if (!(resource instanceof URI)) {
		throw new Error('illegal argument, uri expected');
	}

	return accessor.get(IEditorService).openEditor({ resource: resource }).then(editor => {

		let control = <editorCommon.ICommonCodeEditor>editor.getControl();
		if (!control || typeof control.getEditorType !== 'function') {
			return;
		}

		let controller = ReferencesController.getController(control);

		return TPromise.as(controller.toggleWidget(
			new Range(position.lineNumber, position.column, position.lineNumber, position.column),
			TPromise.as(new ReferencesModel(references)),
			defaultReferenceSearchOptions)).then(() => true);
	});
};



// register action

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(ReferenceAction, ReferenceAction.ID, nls.localize('references.action.name', "Find All References"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.Shift | KeyCode.F12
}, 'Find All References'));
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

function closeActiveReferenceSearch(accessor, args) {
	var outerEditor = getOuterEditor(accessor, args);
	if (outerEditor) {
		var controller = ReferencesController.getController(outerEditor);
		controller.closeWidget();
	}
}

KeybindingsRegistry.registerCommandDesc({
	id: 'closeReferenceSearch',
	weight: CommonEditorRegistry.commandWeight(50),
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape],
	when: KbExpr.and(KbExpr.has(ctxReferenceSearchVisible), KbExpr.not('config.editor.stablePeek')),
	handler: closeActiveReferenceSearch
});

KeybindingsRegistry.registerCommandDesc({
	id: 'closeReferenceSearchEditor',
	weight: CommonEditorRegistry.commandWeight(-101),
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape],
	when: KbExpr.and(KbExpr.has(ReferenceWidget.INNER_EDITOR_CONTEXT_KEY), KbExpr.not('config.editor.stablePeek')),
	handler: closeActiveReferenceSearch
});
