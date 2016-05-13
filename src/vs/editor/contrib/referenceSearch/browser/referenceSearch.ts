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
import {ICommandHandler, IKeybindingService, KbExpr} from 'vs/platform/keybinding/common/keybindingService';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import {EditorAction} from 'vs/editor/common/editorAction';
import {Behaviour} from 'vs/editor/common/editorActionEnablement';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {IReference, ReferenceSearchRegistry} from 'vs/editor/common/modes';
import {IPeekViewService, getOuterEditor} from 'vs/editor/contrib/zoneWidget/browser/peekViewWidget';
import {findReferences} from '../common/referenceSearch';
import {ReferenceWidget} from './referencesWidget';
import {ReferencesController, RequestOptions, ctxReferenceSearchVisible} from './referencesController';
import {ServicesAccessor} from 'vs/platform/instantiation/common/instantiation';

const defaultReferenceSearchOptions: RequestOptions = {
	getMetaTitle(references: IReference[]) {
		return references.length > 1 && nls.localize('meta.titleReference', " – {0} references", references.length);
	},
	onGoto: undefined
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
		let controller = ReferencesController.getController(this.editor);
		return TPromise.as(controller.processRequest(range, request, defaultReferenceSearchOptions)).then(() => true);
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
		let controller = ReferencesController.getController(control);
		let range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
		return TPromise.as(controller.processRequest(range, request, defaultReferenceSearchOptions));
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

		let controller = ReferencesController.getController(control);
		let range = Position.asEmptyRange(position);
		return TPromise.as(controller.processRequest(Range.lift(range), TPromise.as(references), defaultReferenceSearchOptions)).then(() => true);
	});
};



// register action

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

function closeActiveReferenceSearch(accessor, args) {
	var outerEditor = getOuterEditor(accessor, args);
	if (outerEditor) {
		var controller = ReferencesController.getController(outerEditor);
		controller.closeReferenceSearch();
	}
}

KeybindingsRegistry.registerCommandDesc({
	id: 'closeReferenceSearch',
	weight: CommonEditorRegistry.commandWeight(50),
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape],
	when: KbExpr.and(KbExpr.has(ctxReferenceSearchVisible), KbExpr.has('config.editor.dismissPeekOnEsc')),
	handler: closeActiveReferenceSearch
});

KeybindingsRegistry.registerCommandDesc({
	id: 'closeReferenceSearchEditor',
	weight: CommonEditorRegistry.commandWeight(-101),
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape],
	when: KbExpr.and(KbExpr.has(ReferenceWidget.INNER_EDITOR_CONTEXT_KEY), KbExpr.has('config.editor.dismissPeekOnEsc')),
	handler: closeActiveReferenceSearch
});
