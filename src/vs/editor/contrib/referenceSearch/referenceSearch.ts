/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IEditorService } from 'vs/platform/editor/common/editor';
import { CommandsRegistry, ICommandHandler } from 'vs/platform/commands/common/commands';
import { IContextKeyService, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Position, IPosition } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { registerEditorAction, ServicesAccessor, EditorAction, registerEditorContribution, registerDefaultLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { Location, ReferenceProviderRegistry } from 'vs/editor/common/modes';
import { PeekContext, getOuterEditor } from './peekViewWidget';
import { ReferencesController, RequestOptions, ctxReferenceSearchVisible } from './referencesController';
import { ReferencesModel, OneReference } from './referencesModel';
import { asWinJsPromise } from 'vs/base/common/async';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { ITextModel } from 'vs/editor/common/model';
import { IListService } from 'vs/platform/list/browser/listService';
import { ctxReferenceWidgetSearchTreeFocused } from 'vs/editor/contrib/referenceSearch/referencesWidget';

const defaultReferenceSearchOptions: RequestOptions = {
	getMetaTitle(model) {
		return model.references.length > 1 && nls.localize('meta.titleReference', " – {0} references", model.references.length);
	}
};

export class ReferenceController implements editorCommon.IEditorContribution {

	private static readonly ID = 'editor.contrib.referenceController';

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

	public getId(): string {
		return ReferenceController.ID;
	}
}

export class ReferenceAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.referenceSearch.trigger',
			label: nls.localize('references.action.label', "Find All References"),
			alias: 'Find All References',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasReferenceProvider,
				PeekContext.notInPeekEditor,
				EditorContextKeys.isInEmbeddedEditor.toNegated()),
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.Shift | KeyCode.F12
			},
			menuOpts: {
				group: 'navigation',
				order: 1.5
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		let controller = ReferencesController.get(editor);
		if (!controller) {
			return;
		}
		let range = editor.getSelection();
		let model = editor.getModel();
		let references = provideReferences(model, range.getStartPosition()).then(references => new ReferencesModel(references));
		controller.toggleWidget(range, references, defaultReferenceSearchOptions);
	}
}

registerEditorContribution(ReferenceController);

registerEditorAction(ReferenceAction);

let findReferencesCommand: ICommandHandler = (accessor: ServicesAccessor, resource: URI, position: IPosition) => {

	if (!(resource instanceof URI)) {
		throw new Error('illegal argument, uri');
	}
	if (!position) {
		throw new Error('illegal argument, position');
	}

	return accessor.get(IEditorService).openEditor({ resource }).then(editor => {

		let control = editor.getControl();
		if (!isCodeEditor(control)) {
			return undefined;
		}

		let controller = ReferencesController.get(control);
		if (!controller) {
			return undefined;
		}

		let references = provideReferences(control.getModel(), Position.lift(position)).then(references => new ReferencesModel(references));
		let range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
		return TPromise.as(controller.toggleWidget(range, references, defaultReferenceSearchOptions));
	});
};

let showReferencesCommand: ICommandHandler = (accessor: ServicesAccessor, resource: URI, position: IPosition, references: Location[]) => {
	if (!(resource instanceof URI)) {
		throw new Error('illegal argument, uri expected');
	}

	return accessor.get(IEditorService).openEditor({ resource: resource }).then(editor => {

		let control = editor.getControl();
		if (!isCodeEditor(control)) {
			return undefined;
		}

		let controller = ReferencesController.get(control);
		if (!controller) {
			return undefined;
		}

		return TPromise.as(controller.toggleWidget(
			new Range(position.lineNumber, position.column, position.lineNumber, position.column),
			TPromise.as(new ReferencesModel(references)),
			defaultReferenceSearchOptions)).then(() => true);
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

function closeActiveReferenceSearch(accessor: ServicesAccessor, args: any) {
	withController(accessor, controller => controller.closeWidget());
}

function openReferenceToSide(accessor: ServicesAccessor, args: any) {
	const listService = accessor.get(IListService);

	const focus = listService.lastFocusedList && listService.lastFocusedList.getFocus();
	if (focus instanceof OneReference) {
		withController(accessor, controller => controller.openReference(focus, true));
	}
}

function withController(accessor: ServicesAccessor, fn: (controller: ReferencesController) => void): void {
	var outerEditor = getOuterEditor(accessor);
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
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(50),
	primary: KeyCode.F4,
	when: ctxReferenceSearchVisible,
	handler(accessor) {
		withController(accessor, controller => {
			controller.goToNextOrPreviousReference(true);
		});
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'goToPreviousReference',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(50),
	primary: KeyMod.Shift | KeyCode.F4,
	when: ctxReferenceSearchVisible,
	handler(accessor) {
		withController(accessor, controller => {
			controller.goToNextOrPreviousReference(false);
		});
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'closeReferenceSearch',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(50),
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape],
	when: ContextKeyExpr.and(ctxReferenceSearchVisible, ContextKeyExpr.not('config.editor.stablePeek')),
	handler: closeActiveReferenceSearch
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'closeReferenceSearchEditor',
	weight: KeybindingsRegistry.WEIGHT.editorContrib(-101),
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape],
	when: ContextKeyExpr.and(PeekContext.inPeekEditor, ContextKeyExpr.not('config.editor.stablePeek')),
	handler: closeActiveReferenceSearch
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'openReferenceToSide',
	weight: KeybindingsRegistry.WEIGHT.editorContrib(),
	primary: KeyMod.CtrlCmd | KeyCode.Enter,
	mac: {
		primary: KeyMod.WinCtrl | KeyCode.Enter
	},
	when: ContextKeyExpr.and(ctxReferenceSearchVisible, ctxReferenceWidgetSearchTreeFocused),
	handler: openReferenceToSide
});

export function provideReferences(model: ITextModel, position: Position): TPromise<Location[]> {

	// collect references from all providers
	const promises = ReferenceProviderRegistry.ordered(model).map(provider => {
		return asWinJsPromise((token) => {
			return provider.provideReferences(model, position, { includeDeclaration: true }, token);
		}).then(result => {
			if (Array.isArray(result)) {
				return <Location[]>result;
			}
			return undefined;
		}, err => {
			onUnexpectedExternalError(err);
		});
	});

	return TPromise.join(promises).then(references => {
		let result: Location[] = [];
		for (let ref of references) {
			if (ref) {
				result.push(...ref);
			}
		}
		return result;
	});
}

registerDefaultLanguageCommand('_executeReferenceProvider', provideReferences);
