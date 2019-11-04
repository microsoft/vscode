/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from 'vs/base/browser/ui/aria/aria';
import { createCancelablePromise, raceCancellation } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { isWeb } from 'vs/base/common/platform';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, IActionOptions, registerEditorAction, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import * as corePosition from 'vs/editor/common/core/position';
import { Range, IRange } from 'vs/editor/common/core/range';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ITextModel, IWordAtPosition } from 'vs/editor/common/model';
import { LocationLink, Location, isLocationLink } from 'vs/editor/common/modes';
import { MessageController } from 'vs/editor/contrib/message/messageController';
import { PeekContext } from 'vs/editor/contrib/referenceSearch/peekViewWidget';
import { ReferencesController } from 'vs/editor/contrib/referenceSearch/referencesController';
import { ReferencesModel } from 'vs/editor/contrib/referenceSearch/referencesModel';
import * as nls from 'vs/nls';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IEditorProgressService } from 'vs/platform/progress/common/progress';
import { getDefinitionsAtPosition, getImplementationsAtPosition, getTypeDefinitionsAtPosition, getDeclarationsAtPosition } from './goToDefinition';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { EditorStateCancellationTokenSource, CodeEditorStateFlag } from 'vs/editor/browser/core/editorState';
import { ISymbolNavigationService } from 'vs/editor/contrib/goToDefinition/goToDefinitionResultsNavigation';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { isStandalone } from 'vs/base/browser/browser';

export class SymbolNavigationActionConfig {

	constructor(
		public readonly openToSide = false,
		public readonly openInPeek = false,
		public readonly filterCurrent = true,
		public readonly showMessage = true,
	) {
		//
	}
}

abstract class SymbolNavigationAction extends EditorAction {

	private readonly _configuration: SymbolNavigationActionConfig;

	constructor(configuration: SymbolNavigationActionConfig, opts: IActionOptions) {
		super(opts);
		this._configuration = configuration;
	}

	run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		if (!editor.hasModel()) {
			return Promise.resolve(undefined);
		}
		const notificationService = accessor.get(INotificationService);
		const editorService = accessor.get(ICodeEditorService);
		const progressService = accessor.get(IEditorProgressService);
		const symbolNavService = accessor.get(ISymbolNavigationService);

		const model = editor.getModel();
		const pos = editor.getPosition();

		const cts = new EditorStateCancellationTokenSource(editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Position);

		const promise = raceCancellation(this._getLocationModel(model, pos, cts.token), cts.token).then(async references => {

			if (!references || cts.token.isCancellationRequested) {
				return;
			}

			const referenceUnderCusor = references.referenceAt(model.uri, pos);
			const referenceCount = references.references.length;

			if (referenceCount === 0) {
				// no result -> show message
				if (this._configuration.showMessage) {
					const info = model.getWordAtPosition(pos);
					MessageController.get(editor).showMessage(this._getNoResultFoundMessage(info), pos);
				}
			} else if (referenceCount === 1 && referenceUnderCusor) {
				// only the position at which we are -> adjust selection
				return this._openReference(editor, editorService, referenceUnderCusor, false).then(() => undefined);

			} else {
				// handle multile results
				return this._onResult(editorService, symbolNavService, editor, references);
			}

		}, (err) => {
			// report an error
			notificationService.error(err);
		}).finally(() => {
			cts.dispose();
		});

		progressService.showWhile(promise, 250);
		return promise;
	}

	protected abstract _getLocationModel(model: ITextModel, position: corePosition.Position, token: CancellationToken): Promise<ReferencesModel>;

	protected abstract _getNoResultFoundMessage(info: IWordAtPosition | null): string;

	protected abstract _getMetaTitle(model: ReferencesModel): string;

	private async _onResult(editorService: ICodeEditorService, symbolNavService: ISymbolNavigationService, editor: ICodeEditor, model: ReferencesModel): Promise<void> {

		const msg = model.getAriaMessage();
		alert(msg);

		const gotoLocation = editor.getOption(EditorOption.gotoLocation);
		if (this._configuration.openInPeek || (gotoLocation.multiple === 'peek' && model.references.length > 1)) {
			this._openInPeek(editorService, editor, model);

		} else if (editor.hasModel()) {
			const next = model.firstReference();
			if (!next) {
				return;
			}
			const targetEditor = await this._openReference(editor, editorService, next, this._configuration.openToSide);
			if (targetEditor && model.references.length > 1 && gotoLocation.multiple === 'gotoAndPeek') {
				this._openInPeek(editorService, targetEditor, model);
			} else {
				model.dispose();
			}

			// keep remaining locations around when using
			// 'goto'-mode
			if (gotoLocation.multiple === 'goto') {
				symbolNavService.put(next);
			}
		}
	}

	private _openReference(editor: ICodeEditor, editorService: ICodeEditorService, reference: Location | LocationLink, sideBySide: boolean): Promise<ICodeEditor | null> {
		// range is the target-selection-range when we have one
		// and the the fallback is the 'full' range
		let range: IRange | undefined = undefined;
		if (isLocationLink(reference)) {
			range = reference.targetSelectionRange;
		}
		if (!range) {
			range = reference.range;
		}

		return editorService.openCodeEditor({
			resource: reference.uri,
			options: {
				selection: Range.collapseToStart(range),
				revealInCenterIfOutsideViewport: true
			}
		}, editor, sideBySide);
	}

	private _openInPeek(editorService: ICodeEditorService, target: ICodeEditor, model: ReferencesModel) {
		let controller = ReferencesController.get(target);
		if (controller && target.hasModel()) {
			controller.toggleWidget(target.getSelection(), createCancelablePromise(_ => Promise.resolve(model)), {
				getMetaTitle: (model) => {
					return this._getMetaTitle(model);
				},
				onGoto: (reference) => {
					controller.closeWidget();
					return this._openReference(target, editorService, reference, false);
				}
			});
		} else {
			model.dispose();
		}
	}
}

//#region --- DEFINITION

export class DefinitionAction extends SymbolNavigationAction {

	protected async _getLocationModel(model: ITextModel, position: corePosition.Position, token: CancellationToken): Promise<ReferencesModel> {
		return new ReferencesModel(await getDefinitionsAtPosition(model, position, token));
	}

	protected _getNoResultFoundMessage(info: IWordAtPosition | null): string {
		return info && info.word
			? nls.localize('noResultWord', "No definition found for '{0}'", info.word)
			: nls.localize('generic.noResults', "No definition found");
	}

	protected _getMetaTitle(model: ReferencesModel): string {
		return model.references.length > 1 ? nls.localize('meta.title', " – {0} definitions", model.references.length) : '';
	}
}

const goToDefinitionKb = isWeb && !isStandalone
	? KeyMod.CtrlCmd | KeyCode.F12
	: KeyCode.F12;

export class GoToDefinitionAction extends DefinitionAction {

	static readonly id = 'editor.action.revealDefinition';

	constructor() {
		super(new SymbolNavigationActionConfig(), {
			id: GoToDefinitionAction.id,
			label: nls.localize('actions.goToDecl.label', "Go to Definition"),
			alias: 'Go to Definition',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasDefinitionProvider,
				EditorContextKeys.isInEmbeddedEditor.toNegated()),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: goToDefinitionKb,
				weight: KeybindingWeight.EditorContrib
			},
			menuOpts: {
				group: 'navigation',
				order: 1.1
			}
		});
		CommandsRegistry.registerCommandAlias('editor.action.goToDeclaration', GoToDefinitionAction.id);
	}
}

export class OpenDefinitionToSideAction extends DefinitionAction {

	static readonly id = 'editor.action.revealDefinitionAside';

	constructor() {
		super(new SymbolNavigationActionConfig(true), {
			id: OpenDefinitionToSideAction.id,
			label: nls.localize('actions.goToDeclToSide.label', "Open Definition to the Side"),
			alias: 'Open Definition to the Side',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasDefinitionProvider,
				EditorContextKeys.isInEmbeddedEditor.toNegated()),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, goToDefinitionKb),
				weight: KeybindingWeight.EditorContrib
			}
		});
		CommandsRegistry.registerCommandAlias('editor.action.openDeclarationToTheSide', OpenDefinitionToSideAction.id);
	}
}

export class PeekDefinitionAction extends DefinitionAction {

	static readonly id = 'editor.action.peekDefinition';

	constructor() {
		super(new SymbolNavigationActionConfig(undefined, true, false), {
			id: PeekDefinitionAction.id,
			label: nls.localize('actions.previewDecl.label', "Peek Definition"),
			alias: 'Peek Definition',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasDefinitionProvider,
				PeekContext.notInPeekEditor,
				EditorContextKeys.isInEmbeddedEditor.toNegated()),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.Alt | KeyCode.F12,
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F10 },
				weight: KeybindingWeight.EditorContrib
			},
			menuOpts: {
				group: 'navigation',
				order: 1.2
			}
		});
		CommandsRegistry.registerCommandAlias('editor.action.previewDeclaration', PeekDefinitionAction.id);
	}
}

//#endregion

//#region --- DECLARATION

export class DeclarationAction extends SymbolNavigationAction {

	protected async _getLocationModel(model: ITextModel, position: corePosition.Position, token: CancellationToken): Promise<ReferencesModel> {
		return new ReferencesModel(await getDeclarationsAtPosition(model, position, token));
	}

	protected _getNoResultFoundMessage(info: IWordAtPosition | null): string {
		return info && info.word
			? nls.localize('decl.noResultWord', "No declaration found for '{0}'", info.word)
			: nls.localize('decl.generic.noResults', "No declaration found");
	}

	protected _getMetaTitle(model: ReferencesModel): string {
		return model.references.length > 1 ? nls.localize('decl.meta.title', " – {0} declarations", model.references.length) : '';
	}
}

export class GoToDeclarationAction extends DeclarationAction {

	static readonly id = 'editor.action.revealDeclaration';

	constructor() {
		super(new SymbolNavigationActionConfig(), {
			id: GoToDeclarationAction.id,
			label: nls.localize('actions.goToDeclaration.label', "Go to Declaration"),
			alias: 'Go to Declaration',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasDeclarationProvider,
				EditorContextKeys.isInEmbeddedEditor.toNegated()),
			menuOpts: {
				group: 'navigation',
				order: 1.3
			}
		});
	}

	protected _getNoResultFoundMessage(info: IWordAtPosition | null): string {
		return info && info.word
			? nls.localize('decl.noResultWord', "No declaration found for '{0}'", info.word)
			: nls.localize('decl.generic.noResults', "No declaration found");
	}

	protected _getMetaTitle(model: ReferencesModel): string {
		return model.references.length > 1 ? nls.localize('decl.meta.title', " – {0} declarations", model.references.length) : '';
	}
}

export class PeekDeclarationAction extends DeclarationAction {
	constructor() {
		super(new SymbolNavigationActionConfig(undefined, true, false), {
			id: 'editor.action.peekDeclaration',
			label: nls.localize('actions.peekDecl.label', "Peek Declaration"),
			alias: 'Peek Declaration',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasDeclarationProvider,
				PeekContext.notInPeekEditor,
				EditorContextKeys.isInEmbeddedEditor.toNegated()),
			menuOpts: {
				group: 'navigation',
				order: 1.31
			}
		});
	}
}

//#endregion

//#region --- IMPLEMENTATION

export class ImplementationAction extends SymbolNavigationAction {

	protected async _getLocationModel(model: ITextModel, position: corePosition.Position, token: CancellationToken): Promise<ReferencesModel> {
		return new ReferencesModel(await getImplementationsAtPosition(model, position, token));
	}

	protected _getNoResultFoundMessage(info: IWordAtPosition | null): string {
		return info && info.word
			? nls.localize('goToImplementation.noResultWord', "No implementation found for '{0}'", info.word)
			: nls.localize('goToImplementation.generic.noResults', "No implementation found");
	}

	protected _getMetaTitle(model: ReferencesModel): string {
		return model.references.length > 1 ? nls.localize('meta.implementations.title', " – {0} implementations", model.references.length) : '';
	}
}

export class GoToImplementationAction extends ImplementationAction {

	public static readonly ID = 'editor.action.goToImplementation';

	constructor() {
		super(new SymbolNavigationActionConfig(), {
			id: GoToImplementationAction.ID,
			label: nls.localize('actions.goToImplementation.label', "Go to Implementation"),
			alias: 'Go to Implementation',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasImplementationProvider,
				EditorContextKeys.isInEmbeddedEditor.toNegated()),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyCode.F12,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}
}

export class PeekImplementationAction extends ImplementationAction {

	public static readonly ID = 'editor.action.peekImplementation';

	constructor() {
		super(new SymbolNavigationActionConfig(false, true, false), {
			id: PeekImplementationAction.ID,
			label: nls.localize('actions.peekImplementation.label', "Peek Implementation"),
			alias: 'Peek Implementation',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasImplementationProvider,
				EditorContextKeys.isInEmbeddedEditor.toNegated()),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F12,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}
}

//#endregion

//#region --- TYPE DEFINITION

export class TypeDefinitionAction extends SymbolNavigationAction {

	protected async _getLocationModel(model: ITextModel, position: corePosition.Position, token: CancellationToken): Promise<ReferencesModel> {
		return new ReferencesModel(await getTypeDefinitionsAtPosition(model, position, token));
	}

	protected _getNoResultFoundMessage(info: IWordAtPosition | null): string {
		return info && info.word
			? nls.localize('goToTypeDefinition.noResultWord', "No type definition found for '{0}'", info.word)
			: nls.localize('goToTypeDefinition.generic.noResults', "No type definition found");
	}

	protected _getMetaTitle(model: ReferencesModel): string {
		return model.references.length > 1 ? nls.localize('meta.typeDefinitions.title', " – {0} type definitions", model.references.length) : '';
	}
}

export class GoToTypeDefinitionAction extends TypeDefinitionAction {

	public static readonly ID = 'editor.action.goToTypeDefinition';

	constructor() {
		super(new SymbolNavigationActionConfig(), {
			id: GoToTypeDefinitionAction.ID,
			label: nls.localize('actions.goToTypeDefinition.label', "Go to Type Definition"),
			alias: 'Go to Type Definition',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasTypeDefinitionProvider,
				EditorContextKeys.isInEmbeddedEditor.toNegated()),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: 0,
				weight: KeybindingWeight.EditorContrib
			},
			menuOpts: {
				group: 'navigation',
				order: 1.4
			}
		});
	}
}

export class PeekTypeDefinitionAction extends TypeDefinitionAction {

	public static readonly ID = 'editor.action.peekTypeDefinition';

	constructor() {
		super(new SymbolNavigationActionConfig(false, true, false), {
			id: PeekTypeDefinitionAction.ID,
			label: nls.localize('actions.peekTypeDefinition.label', "Peek Type Definition"),
			alias: 'Peek Type Definition',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasTypeDefinitionProvider,
				EditorContextKeys.isInEmbeddedEditor.toNegated()),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: 0,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}
}

//#endregion

registerEditorAction(GoToDefinitionAction);
registerEditorAction(OpenDefinitionToSideAction);
registerEditorAction(PeekDefinitionAction);
registerEditorAction(GoToDeclarationAction);
registerEditorAction(PeekDeclarationAction);
registerEditorAction(GoToImplementationAction);
registerEditorAction(PeekImplementationAction);
registerEditorAction(GoToTypeDefinitionAction);
registerEditorAction(PeekTypeDefinitionAction);

// Go to menu
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
	group: '4_symbol_nav',
	command: {
		id: 'editor.action.goToDeclaration',
		title: nls.localize({ key: 'miGotoDefinition', comment: ['&& denotes a mnemonic'] }, "Go to &&Definition")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
	group: '4_symbol_nav',
	command: {
		id: 'editor.action.goToTypeDefinition',
		title: nls.localize({ key: 'miGotoTypeDefinition', comment: ['&& denotes a mnemonic'] }, "Go to &&Type Definition")
	},
	order: 3
});

MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
	group: '4_symbol_nav',
	command: {
		id: 'editor.action.goToImplementation',
		title: nls.localize({ key: 'miGotoImplementation', comment: ['&& denotes a mnemonic'] }, "Go to &&Implementation")
	},
	order: 4
});
