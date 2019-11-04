/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IContextKeyService, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Position, IPosition } from 'vs/editor/common/core/position';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ServicesAccessor, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { Location } from 'vs/editor/common/modes';
import { Range } from 'vs/editor/common/core/range';
import { PeekContext, getOuterEditor } from './peekViewWidget';
import { ReferencesController, RequestOptions, ctxReferenceSearchVisible } from './referencesController';
import { ReferencesModel, OneReference } from './referencesModel';
import { createCancelablePromise } from 'vs/base/common/async';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IListService } from 'vs/platform/list/browser/listService';
import { ctxReferenceWidgetSearchTreeFocused } from 'vs/editor/contrib/referenceSearch/referencesWidget';
import { CommandsRegistry, ICommandHandler } from 'vs/platform/commands/common/commands';
import { URI } from 'vs/base/common/uri';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { getReferencesAtPosition } from 'vs/editor/contrib/goToDefinition/goToDefinition';

export const defaultReferenceSearchOptions: RequestOptions = {
	getMetaTitle(model) {
		return model.references.length > 1 ? nls.localize('meta.titleReference', " – {0} references", model.references.length) : '';
	}
};

class ReferenceController implements editorCommon.IEditorContribution {

	public static readonly ID = 'editor.contrib.referenceController';

	constructor(
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		if (editor instanceof EmbeddedCodeEditorWidget) {
			PeekContext.inPeekEditor.bindTo(contextKeyService);
		}
	}

	public dispose(): void {
	}
}

registerEditorContribution(ReferenceController.ID, ReferenceController);


let findReferencesCommand: ICommandHandler = (accessor: ServicesAccessor, resource: URI, position: IPosition) => {
	if (!(resource instanceof URI)) {
		throw new Error('illegal argument, uri');
	}
	if (!position) {
		throw new Error('illegal argument, position');
	}

	const codeEditorService = accessor.get(ICodeEditorService);
	return codeEditorService.openCodeEditor({ resource }, codeEditorService.getFocusedCodeEditor()).then(control => {
		if (!isCodeEditor(control) || !control.hasModel()) {
			return undefined;
		}

		let controller = ReferencesController.get(control);
		if (!controller) {
			return undefined;
		}

		let references = createCancelablePromise(token => getReferencesAtPosition(control.getModel(), Position.lift(position), token).then(references => new ReferencesModel(references)));
		let range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
		return Promise.resolve(controller.toggleWidget(range, references, defaultReferenceSearchOptions));
	});
};

let showReferencesCommand: ICommandHandler = (accessor: ServicesAccessor, resource: URI, position: IPosition, references: Location[]) => {
	if (!(resource instanceof URI)) {
		throw new Error('illegal argument, uri expected');
	}

	if (!references) {
		throw new Error('missing references');
	}

	const codeEditorService = accessor.get(ICodeEditorService);
	return codeEditorService.openCodeEditor({ resource }, codeEditorService.getFocusedCodeEditor()).then(control => {
		if (!isCodeEditor(control)) {
			return undefined;
		}

		let controller = ReferencesController.get(control);
		if (!controller) {
			return undefined;
		}

		return controller.toggleWidget(
			new Range(position.lineNumber, position.column, position.lineNumber, position.column),
			createCancelablePromise(_ => Promise.resolve(new ReferencesModel(references))),
			defaultReferenceSearchOptions
		);
	});
};

// register commands

CommandsRegistry.registerCommand({
	id: 'editor.action.findReferences',
	handler: findReferencesCommand
});

CommandsRegistry.registerCommand({
	id: 'editor.action.showReferences',
	handler: showReferencesCommand,
	description: {
		description: 'Show references at a position in a file',
		args: [
			{ name: 'uri', description: 'The text document in which to show references', constraint: URI },
			{ name: 'position', description: 'The position at which to show', constraint: Position.isIPosition },
			{ name: 'locations', description: 'An array of locations.', constraint: Array },
		]
	}
});

function closeActiveReferenceSearch(accessor: ServicesAccessor) {
	withController(accessor, controller => controller.closeWidget());
}

function openReferenceToSide(accessor: ServicesAccessor) {
	const listService = accessor.get(IListService);

	const focus = listService.lastFocusedList && listService.lastFocusedList.getFocus();
	if (focus instanceof OneReference) {
		withController(accessor, controller => controller.openReference(focus, true));
	}
}

function withController(accessor: ServicesAccessor, fn: (controller: ReferencesController) => void): void {
	const outerEditor = getOuterEditor(accessor);
	if (!outerEditor) {
		return;
	}

	let controller = ReferencesController.get(outerEditor);
	if (!controller) {
		return;
	}

	fn(controller);
}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'goToNextReference',
	weight: KeybindingWeight.WorkbenchContrib + 50,
	primary: KeyCode.F4,
	when: ctxReferenceSearchVisible,
	handler(accessor) {
		withController(accessor, controller => {
			controller.goToNextOrPreviousReference(true);
		});
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'goToNextReferenceFromEmbeddedEditor',
	weight: KeybindingWeight.EditorContrib + 50,
	primary: KeyCode.F4,
	when: PeekContext.inPeekEditor,
	handler(accessor) {
		withController(accessor, controller => {
			controller.goToNextOrPreviousReference(true);
		});
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'goToPreviousReference',
	weight: KeybindingWeight.WorkbenchContrib + 50,
	primary: KeyMod.Shift | KeyCode.F4,
	when: ctxReferenceSearchVisible,
	handler(accessor) {
		withController(accessor, controller => {
			controller.goToNextOrPreviousReference(false);
		});
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'goToPreviousReferenceFromEmbeddedEditor',
	weight: KeybindingWeight.EditorContrib + 50,
	primary: KeyMod.Shift | KeyCode.F4,
	when: PeekContext.inPeekEditor,
	handler(accessor) {
		withController(accessor, controller => {
			controller.goToNextOrPreviousReference(false);
		});
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'closeReferenceSearch',
	weight: KeybindingWeight.WorkbenchContrib + 50,
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape],
	when: ContextKeyExpr.and(ctxReferenceSearchVisible, ContextKeyExpr.not('config.editor.stablePeek')),
	handler: closeActiveReferenceSearch
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'closeReferenceSearchEditor',
	weight: KeybindingWeight.EditorContrib - 101,
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape],
	when: ContextKeyExpr.and(PeekContext.inPeekEditor, ContextKeyExpr.not('config.editor.stablePeek')),
	handler: closeActiveReferenceSearch
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'openReferenceToSide',
	weight: KeybindingWeight.EditorContrib,
	primary: KeyMod.CtrlCmd | KeyCode.Enter,
	mac: {
		primary: KeyMod.WinCtrl | KeyCode.Enter
	},
	when: ContextKeyExpr.and(ctxReferenceSearchVisible, ctxReferenceWidgetSearchTreeFocused),
	handler: openReferenceToSide
});
