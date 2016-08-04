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
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ServicesAccessor, EditorKbExpr, EditorAction, CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {Location, ReferenceProviderRegistry} from 'vs/editor/common/modes';
import {IPeekViewService, getOuterEditor} from 'vs/editor/contrib/zoneWidget/browser/peekViewWidget';
import {provideReferences} from '../common/referenceSearch';
import {ReferenceWidget} from './referencesWidget';
import {ReferencesController, RequestOptions, ctxReferenceSearchVisible} from './referencesController';
import {ReferencesModel} from './referencesModel';

const defaultReferenceSearchOptions: RequestOptions = {
	getMetaTitle(model) {
		return model.references.length > 1 && nls.localize('meta.titleReference', " – {0} references", model.references.length);
	}
};

export class ReferenceController implements editorCommon.IEditorContribution {

	static ID = 'editor.contrib.referenceController';

	constructor(
		editor:editorCommon.ICommonCodeEditor,
		@IKeybindingService keybindingService: IKeybindingService,
		@optional(IPeekViewService) peekViewService: IPeekViewService
	) {
		if (peekViewService) {
			keybindingService.createKey(peekViewService.contextKey, true);
		}
	}

	public dispose(): void {
	}

	public getId(): string {
		return ReferenceController.ID;
	}
}

export class ReferenceAction extends EditorAction {

	constructor() {
		super(
			'editor.action.referenceSearch.trigger',
			nls.localize('references.action.label', "Find All References"),
			'Find All References',
			false
		);

		this.kbOpts = {
			kbExpr: EditorKbExpr.TextFocus,
			primary: KeyMod.Shift | KeyCode.F12
		};

		this.menuOpts = {
			kbExpr: KbExpr.has(editorCommon.ModeContextKeys.hasReferenceProvider),
			group: 'navigation',
			order: 1.3
		};
	}

	public supported(accessor:ServicesAccessor, editor:editorCommon.ICommonCodeEditor): boolean {
		if (!super.supported(accessor, editor)) {
			return false;
		}
		return ReferenceProviderRegistry.has(editor.getModel());
	}

	public enabled(accessor:ServicesAccessor, editor:editorCommon.ICommonCodeEditor): boolean {
		if (!super.enabled(accessor, editor)) {
			return false;
		}
		const peekViewService = accessor.get(IPeekViewService, optional);
		if (peekViewService && peekViewService.isActive) {
			return false;
		}

		return ReferenceProviderRegistry.has(editor.getModel());
	}

	public run(accessor:ServicesAccessor, editor:editorCommon.ICommonCodeEditor): void {
		let range = editor.getSelection();
		let model = editor.getModel();
		let references = provideReferences(model, range.getStartPosition()).then(references => new ReferencesModel(references));
		let controller = ReferencesController.getController(editor);
		controller.toggleWidget(range, references, defaultReferenceSearchOptions);
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

CommonEditorRegistry.registerEditorContribution(ReferenceController);
CommonEditorRegistry.registerEditorAction(new ReferenceAction());

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
