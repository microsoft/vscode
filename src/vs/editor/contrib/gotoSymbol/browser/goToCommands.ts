/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { createCancelablePromise, raceCancellation } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { assertType } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from '../../editorState/browser/editorState.js';
import { IActiveCodeEditor, ICodeEditor, isCodeEditor } from '../../../browser/editorBrowser.js';
import { EditorAction2, ServicesAccessor } from '../../../browser/editorExtensions.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { EmbeddedCodeEditorWidget } from '../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { EditorOption, GoToLocationValues } from '../../../common/config/editorOptions.js';
import * as corePosition from '../../../common/core/position.js';
import { IRange, Range } from '../../../common/core/range.js';
import { ScrollType } from '../../../common/editorCommon.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { ITextModel } from '../../../common/model.js';
import { isLocationLink, Location, LocationLink } from '../../../common/languages.js';
import { ReferencesController } from './peek/referencesController.js';
import { ReferencesModel } from './referencesModel.js';
import { ISymbolNavigationService } from './symbolNavigation.js';
import { MessageController } from '../../message/browser/messageController.js';
import { PeekContext } from '../../peekView/browser/peekView.js';
import * as nls from '../../../../nls.js';
import { IAction2F1RequiredOptions, IAction2Options, ISubmenuItem, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { TextEditorSelectionRevealType, TextEditorSelectionSource } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IEditorProgressService } from '../../../../platform/progress/common/progress.js';
import { getDeclarationsAtPosition, getDefinitionsAtPosition, getImplementationsAtPosition, getReferencesAtPosition, getTypeDefinitionsAtPosition } from './goToSymbol.js';
import { IWordAtPosition } from '../../../common/core/wordHelper.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { IsWebContext } from '../../../../platform/contextkey/common/contextkeys.js';

MenuRegistry.appendMenuItem(MenuId.EditorContext, {
	submenu: MenuId.EditorContextPeek,
	title: nls.localize('peek.submenu', "Peek"),
	group: 'navigation',
	order: 100
} satisfies ISubmenuItem);

export interface SymbolNavigationActionConfig {
	openToSide: boolean;
	openInPeek: boolean;
	muteMessage: boolean;
}

export class SymbolNavigationAnchor {

	static is(thing: any): thing is SymbolNavigationAnchor {
		if (!thing || typeof thing !== 'object') {
			return false;
		}
		if (thing instanceof SymbolNavigationAnchor) {
			return true;
		}
		if (corePosition.Position.isIPosition((<SymbolNavigationAnchor>thing).position) && (<SymbolNavigationAnchor>thing).model) {
			return true;
		}
		return false;
	}

	constructor(readonly model: ITextModel, readonly position: corePosition.Position) { }
}

export abstract class SymbolNavigationAction extends EditorAction2 {

	private static _allSymbolNavigationCommands = new Map<string, SymbolNavigationAction>();
	private static _activeAlternativeCommands = new Set<string>();

	static all(): IterableIterator<SymbolNavigationAction> {
		return SymbolNavigationAction._allSymbolNavigationCommands.values();
	}

	private static _patchConfig(opts: IAction2Options & IAction2F1RequiredOptions): IAction2Options {
		const result = { ...opts, f1: true };
		// patch context menu when clause
		if (result.menu) {
			for (const item of Iterable.wrap(result.menu)) {
				if (item.id === MenuId.EditorContext || item.id === MenuId.EditorContextPeek) {
					item.when = ContextKeyExpr.and(opts.precondition, item.when);
				}
			}
		}
		return <typeof opts>result;
	}

	readonly configuration: SymbolNavigationActionConfig;

	constructor(configuration: SymbolNavigationActionConfig, opts: IAction2Options & IAction2F1RequiredOptions) {
		super(SymbolNavigationAction._patchConfig(opts));
		this.configuration = configuration;
		SymbolNavigationAction._allSymbolNavigationCommands.set(opts.id, this);
	}

	override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, arg?: SymbolNavigationAnchor | unknown, range?: Range): Promise<void> {
		if (!editor.hasModel()) {
			return Promise.resolve(undefined);
		}
		const notificationService = accessor.get(INotificationService);
		const editorService = accessor.get(ICodeEditorService);
		const progressService = accessor.get(IEditorProgressService);
		const symbolNavService = accessor.get(ISymbolNavigationService);
		const languageFeaturesService = accessor.get(ILanguageFeaturesService);
		const instaService = accessor.get(IInstantiationService);

		const model = editor.getModel();
		const position = editor.getPosition();
		const anchor = SymbolNavigationAnchor.is(arg) ? arg : new SymbolNavigationAnchor(model, position);

		const cts = new EditorStateCancellationTokenSource(editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Position);

		const promise = raceCancellation(this._getLocationModel(languageFeaturesService, anchor.model, anchor.position, cts.token), cts.token).then(async references => {

			if (!references || cts.token.isCancellationRequested) {
				return;
			}

			alert(references.ariaMessage);

			let altAction: SymbolNavigationAction | null | undefined;
			if (references.referenceAt(model.uri, position)) {
				const altActionId = this._getAlternativeCommand(editor);
				if (!SymbolNavigationAction._activeAlternativeCommands.has(altActionId) && SymbolNavigationAction._allSymbolNavigationCommands.has(altActionId)) {
					altAction = SymbolNavigationAction._allSymbolNavigationCommands.get(altActionId)!;
				}
			}

			const referenceCount = references.references.length;

			if (referenceCount === 0) {
				// no result -> show message
				if (!this.configuration.muteMessage) {
					const info = model.getWordAtPosition(position);
					MessageController.get(editor)?.showMessage(this._getNoResultFoundMessage(info), position);
				}
			} else if (referenceCount === 1 && altAction) {
				// already at the only result, run alternative
				SymbolNavigationAction._activeAlternativeCommands.add(this.desc.id);
				instaService.invokeFunction((accessor) => altAction.runEditorCommand(accessor, editor, arg, range).finally(() => {
					SymbolNavigationAction._activeAlternativeCommands.delete(this.desc.id);
				}));

			} else {
				// normal results handling
				return this._onResult(editorService, symbolNavService, editor, references, range);
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

	protected abstract _getLocationModel(languageFeaturesService: ILanguageFeaturesService, model: ITextModel, position: corePosition.Position, token: CancellationToken): Promise<ReferencesModel | undefined>;

	protected abstract _getNoResultFoundMessage(info: IWordAtPosition | null): string;

	protected abstract _getAlternativeCommand(editor: IActiveCodeEditor): string;

	protected abstract _getGoToPreference(editor: IActiveCodeEditor): GoToLocationValues;

	private async _onResult(editorService: ICodeEditorService, symbolNavService: ISymbolNavigationService, editor: IActiveCodeEditor, model: ReferencesModel, range?: Range): Promise<void> {

		const gotoLocation = this._getGoToPreference(editor);
		if (!(editor instanceof EmbeddedCodeEditorWidget) && (this.configuration.openInPeek || (gotoLocation === 'peek' && model.references.length > 1))) {
			this._openInPeek(editor, model, range);

		} else {
			const next = model.firstReference()!;
			const peek = model.references.length > 1 && gotoLocation === 'gotoAndPeek';
			const targetEditor = await this._openReference(editor, editorService, next, this.configuration.openToSide, !peek);
			if (peek && targetEditor) {
				this._openInPeek(targetEditor, model, range);
			} else {
				model.dispose();
			}

			// keep remaining locations around when using
			// 'goto'-mode
			if (gotoLocation === 'goto') {
				symbolNavService.put(next);
			}
		}
	}

	private async _openReference(editor: ICodeEditor, editorService: ICodeEditorService, reference: Location | LocationLink, sideBySide: boolean, highlight: boolean): Promise<ICodeEditor | undefined> {
		// range is the target-selection-range when we have one
		// and the fallback is the 'full' range
		let range: IRange | undefined = undefined;
		if (isLocationLink(reference)) {
			range = reference.targetSelectionRange;
		}
		if (!range) {
			range = reference.range;
		}
		if (!range) {
			return undefined;
		}

		const targetEditor = await editorService.openCodeEditor({
			resource: reference.uri,
			options: {
				selection: Range.collapseToStart(range),
				selectionRevealType: TextEditorSelectionRevealType.NearTopIfOutsideViewport,
				selectionSource: TextEditorSelectionSource.JUMP
			}
		}, editor, sideBySide);

		if (!targetEditor) {
			return undefined;
		}

		if (highlight) {
			const modelNow = targetEditor.getModel();
			const decorations = targetEditor.createDecorationsCollection([{ range, options: { description: 'symbol-navigate-action-highlight', className: 'symbolHighlight' } }]);
			setTimeout(() => {
				if (targetEditor.getModel() === modelNow) {
					decorations.clear();
				}
			}, 350);
		}

		return targetEditor;
	}

	private _openInPeek(target: ICodeEditor, model: ReferencesModel, range?: Range) {
		const controller = ReferencesController.get(target);
		if (controller && target.hasModel()) {
			controller.toggleWidget(range ?? target.getSelection(), createCancelablePromise(_ => Promise.resolve(model)), this.configuration.openInPeek);
		} else {
			model.dispose();
		}
	}
}

//#region --- DEFINITION

export class DefinitionAction extends SymbolNavigationAction {

	protected async _getLocationModel(languageFeaturesService: ILanguageFeaturesService, model: ITextModel, position: corePosition.Position, token: CancellationToken): Promise<ReferencesModel> {
		return new ReferencesModel(await getDefinitionsAtPosition(languageFeaturesService.definitionProvider, model, position, false, token), nls.localize('def.title', 'Definitions'));
	}

	protected _getNoResultFoundMessage(info: IWordAtPosition | null): string {
		return info && info.word
			? nls.localize('noResultWord', "No definition found for '{0}'", info.word)
			: nls.localize('generic.noResults', "No definition found");
	}

	protected _getAlternativeCommand(editor: IActiveCodeEditor): string {
		return editor.getOption(EditorOption.gotoLocation).alternativeDefinitionCommand;
	}

	protected _getGoToPreference(editor: IActiveCodeEditor): GoToLocationValues {
		return editor.getOption(EditorOption.gotoLocation).multipleDefinitions;
	}
}

registerAction2(class GoToDefinitionAction extends DefinitionAction {

	static readonly id = 'editor.action.revealDefinition';

	constructor() {
		super({
			openToSide: false,
			openInPeek: false,
			muteMessage: false
		}, {
			id: GoToDefinitionAction.id,
			title: {
				...nls.localize2('actions.goToDecl.label', "Go to Definition"),
				mnemonicTitle: nls.localize({ key: 'miGotoDefinition', comment: ['&& denotes a mnemonic'] }, "Go to &&Definition"),
			},
			precondition: EditorContextKeys.hasDefinitionProvider,
			keybinding: [{
				when: EditorContextKeys.editorTextFocus,
				primary: KeyCode.F12,
				weight: KeybindingWeight.EditorContrib
			}, {
				when: ContextKeyExpr.and(EditorContextKeys.editorTextFocus, IsWebContext),
				primary: KeyMod.CtrlCmd | KeyCode.F12,
				weight: KeybindingWeight.EditorContrib
			}],
			menu: [{
				id: MenuId.EditorContext,
				group: 'navigation',
				order: 1.1
			}, {
				id: MenuId.MenubarGoMenu,
				precondition: null,
				group: '4_symbol_nav',
				order: 2,
			}]
		});
		CommandsRegistry.registerCommandAlias('editor.action.goToDeclaration', GoToDefinitionAction.id);
	}
});

registerAction2(class OpenDefinitionToSideAction extends DefinitionAction {

	static readonly id = 'editor.action.revealDefinitionAside';

	constructor() {
		super({
			openToSide: true,
			openInPeek: false,
			muteMessage: false
		}, {
			id: OpenDefinitionToSideAction.id,
			title: nls.localize2('actions.goToDeclToSide.label', "Open Definition to the Side"),
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasDefinitionProvider,
				EditorContextKeys.isInEmbeddedEditor.toNegated()),
			keybinding: [{
				when: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.F12),
				weight: KeybindingWeight.EditorContrib
			}, {
				when: ContextKeyExpr.and(EditorContextKeys.editorTextFocus, IsWebContext),
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.F12),
				weight: KeybindingWeight.EditorContrib
			}]
		});
		CommandsRegistry.registerCommandAlias('editor.action.openDeclarationToTheSide', OpenDefinitionToSideAction.id);
	}
});

registerAction2(class PeekDefinitionAction extends DefinitionAction {

	static readonly id = 'editor.action.peekDefinition';

	constructor() {
		super({
			openToSide: false,
			openInPeek: true,
			muteMessage: false
		}, {
			id: PeekDefinitionAction.id,
			title: nls.localize2('actions.previewDecl.label', "Peek Definition"),
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasDefinitionProvider,
				PeekContext.notInPeekEditor,
				EditorContextKeys.isInEmbeddedEditor.toNegated()
			),
			keybinding: {
				when: EditorContextKeys.editorTextFocus,
				primary: KeyMod.Alt | KeyCode.F12,
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F10 },
				weight: KeybindingWeight.EditorContrib
			},
			menu: {
				id: MenuId.EditorContextPeek,
				group: 'peek',
				order: 2
			}
		});
		CommandsRegistry.registerCommandAlias('editor.action.previewDeclaration', PeekDefinitionAction.id);
	}
});

//#endregion

//#region --- DECLARATION

class DeclarationAction extends SymbolNavigationAction {

	protected async _getLocationModel(languageFeaturesService: ILanguageFeaturesService, model: ITextModel, position: corePosition.Position, token: CancellationToken): Promise<ReferencesModel> {
		return new ReferencesModel(await getDeclarationsAtPosition(languageFeaturesService.declarationProvider, model, position, false, token), nls.localize('decl.title', 'Declarations'));
	}

	protected _getNoResultFoundMessage(info: IWordAtPosition | null): string {
		return info && info.word
			? nls.localize('decl.noResultWord', "No declaration found for '{0}'", info.word)
			: nls.localize('decl.generic.noResults', "No declaration found");
	}

	protected _getAlternativeCommand(editor: IActiveCodeEditor): string {
		return editor.getOption(EditorOption.gotoLocation).alternativeDeclarationCommand;
	}

	protected _getGoToPreference(editor: IActiveCodeEditor): GoToLocationValues {
		return editor.getOption(EditorOption.gotoLocation).multipleDeclarations;
	}
}

registerAction2(class GoToDeclarationAction extends DeclarationAction {

	static readonly id = 'editor.action.revealDeclaration';

	constructor() {
		super({
			openToSide: false,
			openInPeek: false,
			muteMessage: false
		}, {
			id: GoToDeclarationAction.id,
			title: {
				...nls.localize2('actions.goToDeclaration.label', "Go to Declaration"),
				mnemonicTitle: nls.localize({ key: 'miGotoDeclaration', comment: ['&& denotes a mnemonic'] }, "Go to &&Declaration"),
			},
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasDeclarationProvider,
				EditorContextKeys.isInEmbeddedEditor.toNegated()
			),
			menu: [{
				id: MenuId.EditorContext,
				group: 'navigation',
				order: 1.3
			}, {
				id: MenuId.MenubarGoMenu,
				precondition: null,
				group: '4_symbol_nav',
				order: 3,
			}],
		});
	}

	protected override _getNoResultFoundMessage(info: IWordAtPosition | null): string {
		return info && info.word
			? nls.localize('decl.noResultWord', "No declaration found for '{0}'", info.word)
			: nls.localize('decl.generic.noResults', "No declaration found");
	}
});

registerAction2(class PeekDeclarationAction extends DeclarationAction {
	constructor() {
		super({
			openToSide: false,
			openInPeek: true,
			muteMessage: false
		}, {
			id: 'editor.action.peekDeclaration',
			title: nls.localize2('actions.peekDecl.label', "Peek Declaration"),
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasDeclarationProvider,
				PeekContext.notInPeekEditor,
				EditorContextKeys.isInEmbeddedEditor.toNegated()
			),
			menu: {
				id: MenuId.EditorContextPeek,
				group: 'peek',
				order: 3
			}
		});
	}
});

//#endregion

//#region --- TYPE DEFINITION

class TypeDefinitionAction extends SymbolNavigationAction {

	protected async _getLocationModel(languageFeaturesService: ILanguageFeaturesService, model: ITextModel, position: corePosition.Position, token: CancellationToken): Promise<ReferencesModel> {
		return new ReferencesModel(await getTypeDefinitionsAtPosition(languageFeaturesService.typeDefinitionProvider, model, position, false, token), nls.localize('typedef.title', 'Type Definitions'));
	}

	protected _getNoResultFoundMessage(info: IWordAtPosition | null): string {
		return info && info.word
			? nls.localize('goToTypeDefinition.noResultWord', "No type definition found for '{0}'", info.word)
			: nls.localize('goToTypeDefinition.generic.noResults', "No type definition found");
	}

	protected _getAlternativeCommand(editor: IActiveCodeEditor): string {
		return editor.getOption(EditorOption.gotoLocation).alternativeTypeDefinitionCommand;
	}

	protected _getGoToPreference(editor: IActiveCodeEditor): GoToLocationValues {
		return editor.getOption(EditorOption.gotoLocation).multipleTypeDefinitions;
	}
}

registerAction2(class GoToTypeDefinitionAction extends TypeDefinitionAction {

	public static readonly ID = 'editor.action.goToTypeDefinition';

	constructor() {
		super({
			openToSide: false,
			openInPeek: false,
			muteMessage: false
		}, {
			id: GoToTypeDefinitionAction.ID,
			title: {
				...nls.localize2('actions.goToTypeDefinition.label', "Go to Type Definition"),
				mnemonicTitle: nls.localize({ key: 'miGotoTypeDefinition', comment: ['&& denotes a mnemonic'] }, "Go to &&Type Definition"),
			},
			precondition: EditorContextKeys.hasTypeDefinitionProvider,
			keybinding: {
				when: EditorContextKeys.editorTextFocus,
				primary: 0,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [{
				id: MenuId.EditorContext,
				group: 'navigation',
				order: 1.4
			}, {
				id: MenuId.MenubarGoMenu,
				precondition: null,
				group: '4_symbol_nav',
				order: 3,
			}]
		});
	}
});

registerAction2(class PeekTypeDefinitionAction extends TypeDefinitionAction {

	public static readonly ID = 'editor.action.peekTypeDefinition';

	constructor() {
		super({
			openToSide: false,
			openInPeek: true,
			muteMessage: false
		}, {
			id: PeekTypeDefinitionAction.ID,
			title: nls.localize2('actions.peekTypeDefinition.label', "Peek Type Definition"),
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasTypeDefinitionProvider,
				PeekContext.notInPeekEditor,
				EditorContextKeys.isInEmbeddedEditor.toNegated()
			),
			menu: {
				id: MenuId.EditorContextPeek,
				group: 'peek',
				order: 4
			}
		});
	}
});

//#endregion

//#region --- IMPLEMENTATION

class ImplementationAction extends SymbolNavigationAction {

	protected async _getLocationModel(languageFeaturesService: ILanguageFeaturesService, model: ITextModel, position: corePosition.Position, token: CancellationToken): Promise<ReferencesModel> {
		return new ReferencesModel(await getImplementationsAtPosition(languageFeaturesService.implementationProvider, model, position, false, token), nls.localize('impl.title', 'Implementations'));
	}

	protected _getNoResultFoundMessage(info: IWordAtPosition | null): string {
		return info && info.word
			? nls.localize('goToImplementation.noResultWord', "No implementation found for '{0}'", info.word)
			: nls.localize('goToImplementation.generic.noResults', "No implementation found");
	}

	protected _getAlternativeCommand(editor: IActiveCodeEditor): string {
		return editor.getOption(EditorOption.gotoLocation).alternativeImplementationCommand;
	}

	protected _getGoToPreference(editor: IActiveCodeEditor): GoToLocationValues {
		return editor.getOption(EditorOption.gotoLocation).multipleImplementations;
	}
}

registerAction2(class GoToImplementationAction extends ImplementationAction {

	public static readonly ID = 'editor.action.goToImplementation';

	constructor() {
		super({
			openToSide: false,
			openInPeek: false,
			muteMessage: false
		}, {
			id: GoToImplementationAction.ID,
			title: {
				...nls.localize2('actions.goToImplementation.label', "Go to Implementations"),
				mnemonicTitle: nls.localize({ key: 'miGotoImplementation', comment: ['&& denotes a mnemonic'] }, "Go to &&Implementations"),
			},
			precondition: EditorContextKeys.hasImplementationProvider,
			keybinding: {
				when: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyCode.F12,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [{
				id: MenuId.EditorContext,
				group: 'navigation',
				order: 1.45
			}, {
				id: MenuId.MenubarGoMenu,
				precondition: null,
				group: '4_symbol_nav',
				order: 4,
			}]
		});
	}
});

registerAction2(class PeekImplementationAction extends ImplementationAction {

	public static readonly ID = 'editor.action.peekImplementation';

	constructor() {
		super({
			openToSide: false,
			openInPeek: true,
			muteMessage: false
		}, {
			id: PeekImplementationAction.ID,
			title: nls.localize2('actions.peekImplementation.label', "Peek Implementations"),
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasImplementationProvider,
				PeekContext.notInPeekEditor,
				EditorContextKeys.isInEmbeddedEditor.toNegated()
			),
			keybinding: {
				when: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F12,
				weight: KeybindingWeight.EditorContrib
			},
			menu: {
				id: MenuId.EditorContextPeek,
				group: 'peek',
				order: 5
			}
		});
	}
});

//#endregion

//#region --- REFERENCES

abstract class ReferencesAction extends SymbolNavigationAction {

	protected _getNoResultFoundMessage(info: IWordAtPosition | null): string {
		return info
			? nls.localize('references.no', "No references found for '{0}'", info.word)
			: nls.localize('references.noGeneric', "No references found");
	}

	protected _getAlternativeCommand(editor: IActiveCodeEditor): string {
		return editor.getOption(EditorOption.gotoLocation).alternativeReferenceCommand;
	}

	protected _getGoToPreference(editor: IActiveCodeEditor): GoToLocationValues {
		return editor.getOption(EditorOption.gotoLocation).multipleReferences;
	}
}

registerAction2(class GoToReferencesAction extends ReferencesAction {

	constructor() {
		super({
			openToSide: false,
			openInPeek: false,
			muteMessage: false
		}, {
			id: 'editor.action.goToReferences',
			title: {
				...nls.localize2('goToReferences.label', "Go to References"),
				mnemonicTitle: nls.localize({ key: 'miGotoReference', comment: ['&& denotes a mnemonic'] }, "Go to &&References"),
			},
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasReferenceProvider,
				PeekContext.notInPeekEditor,
				EditorContextKeys.isInEmbeddedEditor.toNegated()
			),
			keybinding: {
				when: EditorContextKeys.editorTextFocus,
				primary: KeyMod.Shift | KeyCode.F12,
				weight: KeybindingWeight.EditorContrib
			},
			menu: [{
				id: MenuId.EditorContext,
				group: 'navigation',
				order: 1.45
			}, {
				id: MenuId.MenubarGoMenu,
				precondition: null,
				group: '4_symbol_nav',
				order: 5,
			}]
		});
	}

	protected async _getLocationModel(languageFeaturesService: ILanguageFeaturesService, model: ITextModel, position: corePosition.Position, token: CancellationToken): Promise<ReferencesModel> {
		return new ReferencesModel(await getReferencesAtPosition(languageFeaturesService.referenceProvider, model, position, true, false, token), nls.localize('ref.title', 'References'));
	}
});

registerAction2(class PeekReferencesAction extends ReferencesAction {

	constructor() {
		super({
			openToSide: false,
			openInPeek: true,
			muteMessage: false
		}, {
			id: 'editor.action.referenceSearch.trigger',
			title: nls.localize2('references.action.label', "Peek References"),
			precondition: ContextKeyExpr.and(
				EditorContextKeys.hasReferenceProvider,
				PeekContext.notInPeekEditor,
				EditorContextKeys.isInEmbeddedEditor.toNegated()
			),
			menu: {
				id: MenuId.EditorContextPeek,
				group: 'peek',
				order: 6
			}
		});
	}

	protected async _getLocationModel(languageFeaturesService: ILanguageFeaturesService, model: ITextModel, position: corePosition.Position, token: CancellationToken): Promise<ReferencesModel> {
		return new ReferencesModel(await getReferencesAtPosition(languageFeaturesService.referenceProvider, model, position, false, false, token), nls.localize('ref.title', 'References'));
	}
});

//#endregion


//#region --- GENERIC goto symbols command

class GenericGoToLocationAction extends SymbolNavigationAction {

	constructor(
		config: SymbolNavigationActionConfig,
		private readonly _references: Location[],
		private readonly _gotoMultipleBehaviour: GoToLocationValues | undefined,
	) {
		super(config, {
			id: 'editor.action.goToLocation',
			title: nls.localize2('label.generic', "Go to Any Symbol"),
			precondition: ContextKeyExpr.and(
				PeekContext.notInPeekEditor,
				EditorContextKeys.isInEmbeddedEditor.toNegated()
			),
		});
	}

	protected async _getLocationModel(languageFeaturesService: ILanguageFeaturesService, _model: ITextModel, _position: corePosition.Position, _token: CancellationToken): Promise<ReferencesModel | undefined> {
		return new ReferencesModel(this._references, nls.localize('generic.title', 'Locations'));
	}

	protected _getNoResultFoundMessage(info: IWordAtPosition | null): string {
		return info && nls.localize('generic.noResult', "No results for '{0}'", info.word) || '';
	}

	protected _getGoToPreference(editor: IActiveCodeEditor): GoToLocationValues {
		return this._gotoMultipleBehaviour ?? editor.getOption(EditorOption.gotoLocation).multipleReferences;
	}

	protected _getAlternativeCommand() { return ''; }
}

CommandsRegistry.registerCommand({
	id: 'editor.action.goToLocations',
	metadata: {
		description: 'Go to locations from a position in a file',
		args: [
			{ name: 'uri', description: 'The text document in which to start', constraint: URI },
			{ name: 'position', description: 'The position at which to start', constraint: corePosition.Position.isIPosition },
			{ name: 'locations', description: 'An array of locations.', constraint: Array },
			{ name: 'multiple', description: 'Define what to do when having multiple results, either `peek`, `gotoAndPeek`, or `goto`' },
			{ name: 'noResultsMessage', description: 'Human readable message that shows when locations is empty.' },
		]
	},
	handler: async (accessor: ServicesAccessor, resource: any, position: any, references: any, multiple?: any, noResultsMessage?: string, openInPeek?: boolean) => {
		assertType(URI.isUri(resource));
		assertType(corePosition.Position.isIPosition(position));
		assertType(Array.isArray(references));
		assertType(typeof multiple === 'undefined' || typeof multiple === 'string');
		assertType(typeof openInPeek === 'undefined' || typeof openInPeek === 'boolean');

		const editorService = accessor.get(ICodeEditorService);
		const editor = await editorService.openCodeEditor({ resource }, editorService.getFocusedCodeEditor());

		if (isCodeEditor(editor)) {
			editor.setPosition(position);
			editor.revealPositionInCenterIfOutsideViewport(position, ScrollType.Smooth);

			return editor.invokeWithinContext(accessor => {
				const command = new class extends GenericGoToLocationAction {
					protected override _getNoResultFoundMessage(info: IWordAtPosition | null) {
						return noResultsMessage || super._getNoResultFoundMessage(info);
					}
				}({
					muteMessage: !Boolean(noResultsMessage),
					openInPeek: Boolean(openInPeek),
					openToSide: false
				}, references, multiple as GoToLocationValues);

				accessor.get(IInstantiationService).invokeFunction(command.run.bind(command), editor);
			});
		}
	}
});

CommandsRegistry.registerCommand({
	id: 'editor.action.peekLocations',
	metadata: {
		description: 'Peek locations from a position in a file',
		args: [
			{ name: 'uri', description: 'The text document in which to start', constraint: URI },
			{ name: 'position', description: 'The position at which to start', constraint: corePosition.Position.isIPosition },
			{ name: 'locations', description: 'An array of locations.', constraint: Array },
			{ name: 'multiple', description: 'Define what to do when having multiple results, either `peek`, `gotoAndPeek`, or `goto`' },
		]
	},
	handler: async (accessor: ServicesAccessor, resource: any, position: any, references: any, multiple?: any) => {
		accessor.get(ICommandService).executeCommand('editor.action.goToLocations', resource, position, references, multiple, undefined, true);
	}
});

//#endregion


//#region --- REFERENCE search special commands

CommandsRegistry.registerCommand({
	id: 'editor.action.findReferences',
	handler: (accessor: ServicesAccessor, resource: any, position: any) => {
		assertType(URI.isUri(resource));
		assertType(corePosition.Position.isIPosition(position));

		const languageFeaturesService = accessor.get(ILanguageFeaturesService);
		const codeEditorService = accessor.get(ICodeEditorService);
		return codeEditorService.openCodeEditor({ resource }, codeEditorService.getFocusedCodeEditor()).then(control => {
			if (!isCodeEditor(control) || !control.hasModel()) {
				return undefined;
			}

			const controller = ReferencesController.get(control);
			if (!controller) {
				return undefined;
			}

			const references = createCancelablePromise(token => getReferencesAtPosition(languageFeaturesService.referenceProvider, control.getModel(), corePosition.Position.lift(position), false, false, token).then(references => new ReferencesModel(references, nls.localize('ref.title', 'References'))));
			const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
			return Promise.resolve(controller.toggleWidget(range, references, false));
		});
	}
});

// use NEW command
CommandsRegistry.registerCommandAlias('editor.action.showReferences', 'editor.action.peekLocations');

//#endregion
