/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { KeyCode, KeyMod, KeyChord } from 'vs/base/common/keyCodes';
import * as platform from 'vs/base/common/platform';
import Severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import { IEditorService } from 'vs/platform/editor/common/editor';
import { IMessageService } from 'vs/platform/message/common/message';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { editorAction, IActionOptions, ServicesAccessor, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { Location } from 'vs/editor/common/modes';
import { getDefinitionsAtPosition, getImplementationsAtPosition, getTypeDefinitionsAtPosition } from './goToDeclaration';
import { ReferencesController } from 'vs/editor/contrib/referenceSearch/browser/referencesController';
import { ReferencesModel } from 'vs/editor/contrib/referenceSearch/browser/referencesModel';
import { PeekContext } from 'vs/editor/contrib/zoneWidget/browser/peekViewWidget';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { MessageController } from './messageController';
import * as corePosition from 'vs/editor/common/core/position';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IProgressService } from 'vs/platform/progress/common/progress';

export class DefinitionActionConfig {

	constructor(
		public readonly openToSide = false,
		public readonly openInPeek = false,
		public readonly filterCurrent = true,
		public readonly showMessage = true,
	) {
		//
	}
}

export class DefinitionAction extends EditorAction {

	private _configuration: DefinitionActionConfig;

	constructor(configuration: DefinitionActionConfig, opts: IActionOptions) {
		super(opts);
		this._configuration = configuration;
	}

	public run(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor): TPromise<void> {
		const messageService = accessor.get(IMessageService);
		const editorService = accessor.get(IEditorService);
		const progressService = accessor.get(IProgressService);

		const model = editor.getModel();
		const pos = editor.getPosition();

		const definitionPromise = this._getDeclarationsAtPosition(model, pos).then(references => {

			if (model.isDisposed() || editor.getModel() !== model) {
				// new model, no more model
				return;
			}

			// * remove falsy references
			// * find reference at the current pos
			let idxOfCurrent = -1;
			let result: Location[] = [];
			for (let i = 0; i < references.length; i++) {
				let reference = references[i];
				if (!reference || !reference.range) {
					continue;
				}
				let { uri, range } = reference;
				let newLen = result.push({
					uri,
					range
				});
				if (this._configuration.filterCurrent
					&& uri.toString() === model.uri.toString()
					&& Range.containsPosition(range, pos)
					&& idxOfCurrent === -1
				) {
					idxOfCurrent = newLen - 1;
				}
			}

			if (result.length === 0) {
				// no result -> show message
				if (this._configuration.showMessage) {
					const info = model.getWordAtPosition(pos);
					MessageController.get(editor).showMessage(this._getNoResultFoundMessage(info), pos);
				}
			} else if (result.length === 1 && idxOfCurrent !== -1) {
				// only the position at which we are -> adjust selection
				let [current] = result;
				this._openReference(editorService, current, false);

			} else {
				// handle multile results
				this._onResult(editorService, editor, new ReferencesModel(result));
			}

		}, (err) => {
			// report an error
			messageService.show(Severity.Error, err);
		});

		progressService.showWhile(definitionPromise, 250);
		return definitionPromise;
	}

	protected _getDeclarationsAtPosition(model: editorCommon.IModel, position: corePosition.Position): TPromise<Location[]> {
		return getDefinitionsAtPosition(model, position);
	}

	protected _getNoResultFoundMessage(info?: editorCommon.IWordAtPosition): string {
		return info && info.word
			? nls.localize('noResultWord', "No definition found for '{0}'", info.word)
			: nls.localize('generic.noResults', "No definition found");
	}

	protected _getMetaTitle(model: ReferencesModel): string {
		return model.references.length > 1 && nls.localize('meta.title', " – {0} definitions", model.references.length);
	}

	private _onResult(editorService: IEditorService, editor: editorCommon.ICommonCodeEditor, model: ReferencesModel) {

		const msg = model.getAriaMessage();
		alert(msg);

		if (this._configuration.openInPeek) {
			this._openInPeek(editorService, editor, model);
		} else {
			let next = model.nearestReference(editor.getModel().uri, editor.getPosition());
			this._openReference(editorService, next, this._configuration.openToSide).then(editor => {
				if (editor && model.references.length > 1) {
					this._openInPeek(editorService, editor, model);
				} else {
					model.dispose();
				}
			});
		}
	}

	private _openReference(editorService: IEditorService, reference: Location, sideBySide: boolean): TPromise<editorCommon.ICommonCodeEditor> {
		let { uri, range } = reference;
		return editorService.openEditor({
			resource: uri,
			options: {
				selection: Range.collapseToStart(range),
				revealIfVisible: !sideBySide
			}
		}, sideBySide).then(editor => {
			return editor && <editorCommon.ICommonCodeEditor>editor.getControl();
		});
	}

	private _openInPeek(editorService: IEditorService, target: editorCommon.ICommonCodeEditor, model: ReferencesModel) {
		let controller = ReferencesController.get(target);
		if (controller) {
			controller.toggleWidget(target.getSelection(), TPromise.as(model), {
				getMetaTitle: (model) => {
					return this._getMetaTitle(model);
				},
				onGoto: (reference) => {
					controller.closeWidget();
					return this._openReference(editorService, reference, false);
				}
			});
		} else {
			model.dispose();
		}
	}
}

const goToDeclarationKb = platform.isWeb
	? KeyMod.CtrlCmd | KeyCode.F12
	: KeyCode.F12;

@editorAction
export class GoToDefinitionAction extends DefinitionAction {

	public static ID = 'editor.action.goToDeclaration';

	constructor() {
		super(new DefinitionActionConfig(), {
			id: GoToDefinitionAction.ID,
			label: nls.localize('actions.goToDecl.label', "Go to Definition"),
			alias: 'Go to Definition',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasDefinitionProvider,
				EditorContextKeys.isInEmbeddedEditor.toNegated()),
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: goToDeclarationKb
			},
			menuOpts: {
				group: 'navigation',
				order: 1.1
			}
		});
	}
}

@editorAction
export class OpenDefinitionToSideAction extends DefinitionAction {

	public static ID = 'editor.action.openDeclarationToTheSide';

	constructor() {
		super(new DefinitionActionConfig(true), {
			id: OpenDefinitionToSideAction.ID,
			label: nls.localize('actions.goToDeclToSide.label', "Open Definition to the Side"),
			alias: 'Open Definition to the Side',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasDefinitionProvider,
				EditorContextKeys.isInEmbeddedEditor.toNegated()),
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, goToDeclarationKb)
			}
		});
	}
}

@editorAction
export class PeekDefinitionAction extends DefinitionAction {
	constructor() {
		super(new DefinitionActionConfig(void 0, true, false), {
			id: 'editor.action.previewDeclaration',
			label: nls.localize('actions.previewDecl.label', "Peek Definition"),
			alias: 'Peek Definition',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasDefinitionProvider,
				PeekContext.notInPeekEditor,
				EditorContextKeys.isInEmbeddedEditor.toNegated()),
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.Alt | KeyCode.F12,
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F10 }
			},
			menuOpts: {
				group: 'navigation',
				order: 1.2
			}
		});
	}
}

export class ImplementationAction extends DefinitionAction {
	protected _getDeclarationsAtPosition(model: editorCommon.IModel, position: corePosition.Position): TPromise<Location[]> {
		return getImplementationsAtPosition(model, position);
	}

	protected _getNoResultFoundMessage(info?: editorCommon.IWordAtPosition): string {
		return info && info.word
			? nls.localize('goToImplementation.noResultWord', "No implementation found for '{0}'", info.word)
			: nls.localize('goToImplementation.generic.noResults', "No implementation found");
	}

	protected _getMetaTitle(model: ReferencesModel): string {
		return model.references.length > 1 && nls.localize('meta.implementations.title', " – {0} implementations", model.references.length);
	}
}

@editorAction
export class GoToImplementationAction extends ImplementationAction {

	public static ID = 'editor.action.goToImplementation';

	constructor() {
		super(new DefinitionActionConfig(), {
			id: GoToImplementationAction.ID,
			label: nls.localize('actions.goToImplementation.label', "Go to Implementation"),
			alias: 'Go to Implementation',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasImplementationProvider,
				EditorContextKeys.isInEmbeddedEditor.toNegated()),
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.CtrlCmd | KeyCode.F12
			}
		});
	}
}

@editorAction
export class PeekImplementationAction extends ImplementationAction {

	public static ID = 'editor.action.peekImplementation';

	constructor() {
		super(new DefinitionActionConfig(false, true, false), {
			id: PeekImplementationAction.ID,
			label: nls.localize('actions.peekImplementation.label', "Peek Implementation"),
			alias: 'Peek Implementation',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasImplementationProvider,
				EditorContextKeys.isInEmbeddedEditor.toNegated()),
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F12
			}
		});
	}
}

export class TypeDefinitionAction extends DefinitionAction {
	protected _getDeclarationsAtPosition(model: editorCommon.IModel, position: corePosition.Position): TPromise<Location[]> {
		return getTypeDefinitionsAtPosition(model, position);
	}

	protected _getNoResultFoundMessage(info?: editorCommon.IWordAtPosition): string {
		return info && info.word
			? nls.localize('goToTypeDefinition.noResultWord', "No type definition found for '{0}'", info.word)
			: nls.localize('goToTypeDefinition.generic.noResults', "No type definition found");
	}

	protected _getMetaTitle(model: ReferencesModel): string {
		return model.references.length > 1 && nls.localize('meta.typeDefinitions.title', " – {0} type definitions", model.references.length);
	}
}

@editorAction
export class GoToTypeDefintionAction extends TypeDefinitionAction {

	public static ID = 'editor.action.goToTypeDefinition';

	constructor() {
		super(new DefinitionActionConfig(), {
			id: GoToTypeDefintionAction.ID,
			label: nls.localize('actions.goToTypeDefinition.label', "Go to Type Definition"),
			alias: 'Go to Type Definition',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasTypeDefinitionProvider,
				EditorContextKeys.isInEmbeddedEditor.toNegated()),
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: 0
			},
			menuOpts: {
				group: 'navigation',
				order: 1.4
			}
		});
	}
}

@editorAction
export class PeekTypeDefinitionAction extends TypeDefinitionAction {

	public static ID = 'editor.action.peekTypeDefinition';

	constructor() {
		super(new DefinitionActionConfig(false, true, false), {
			id: PeekTypeDefinitionAction.ID,
			label: nls.localize('actions.peekTypeDefinition.label', "Peek Type Definition"),
			alias: 'Peek Type Definition',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasTypeDefinitionProvider,
				EditorContextKeys.isInEmbeddedEditor.toNegated()),
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: 0
			}
		});
	}
}

