/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { createCancelablePromise, raceCancellation } from '../../../../base/common/async.js';
import { KeyChord } from '../../../../base/common/keyCodes.js';
import { assertType } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { EditorStateCancellationTokenSource } from '../../editorState/browser/editorState.js';
import { isCodeEditor } from '../../../browser/editorBrowser.js';
import { EditorAction2 } from '../../../browser/editorExtensions.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { EmbeddedCodeEditorWidget } from '../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import * as corePosition from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { isLocationLink } from '../../../common/languages.js';
import { ReferencesController } from './peek/referencesController.js';
import { ReferencesModel } from './referencesModel.js';
import { ISymbolNavigationService } from './symbolNavigation.js';
import { MessageController } from '../../message/browser/messageController.js';
import { PeekContext } from '../../peekView/browser/peekView.js';
import * as nls from '../../../../nls.js';
import { MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IEditorProgressService } from '../../../../platform/progress/common/progress.js';
import { getDeclarationsAtPosition, getDefinitionsAtPosition, getImplementationsAtPosition, getReferencesAtPosition, getTypeDefinitionsAtPosition } from './goToSymbol.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { IsWebContext } from '../../../../platform/contextkey/common/contextkeys.js';
MenuRegistry.appendMenuItem(MenuId.EditorContext, {
    submenu: MenuId.EditorContextPeek,
    title: nls.localize('peek.submenu', "Peek"),
    group: 'navigation',
    order: 100
});
export class SymbolNavigationAnchor {
    static is(thing) {
        if (!thing || typeof thing !== 'object') {
            return false;
        }
        if (thing instanceof SymbolNavigationAnchor) {
            return true;
        }
        if (corePosition.Position.isIPosition(thing.position) && thing.model) {
            return true;
        }
        return false;
    }
    constructor(model, position) {
        this.model = model;
        this.position = position;
    }
}
export class SymbolNavigationAction extends EditorAction2 {
    static { this._allSymbolNavigationCommands = new Map(); }
    static { this._activeAlternativeCommands = new Set(); }
    static all() {
        return SymbolNavigationAction._allSymbolNavigationCommands.values();
    }
    static _patchConfig(opts) {
        const result = { ...opts, f1: true };
        // patch context menu when clause
        if (result.menu) {
            for (const item of Iterable.wrap(result.menu)) {
                if (item.id === MenuId.EditorContext || item.id === MenuId.EditorContextPeek) {
                    item.when = ContextKeyExpr.and(opts.precondition, item.when);
                }
            }
        }
        return result;
    }
    constructor(configuration, opts) {
        super(SymbolNavigationAction._patchConfig(opts));
        this.configuration = configuration;
        SymbolNavigationAction._allSymbolNavigationCommands.set(opts.id, this);
    }
    runEditorCommand(accessor, editor, arg, range) {
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
        const cts = new EditorStateCancellationTokenSource(editor, 1 /* CodeEditorStateFlag.Value */ | 4 /* CodeEditorStateFlag.Position */);
        const promise = raceCancellation(this._getLocationModel(languageFeaturesService, anchor.model, anchor.position, cts.token), cts.token).then(async (references) => {
            if (!references || cts.token.isCancellationRequested) {
                return;
            }
            alert(references.ariaMessage);
            let altAction;
            if (references.referenceAt(model.uri, position)) {
                const altActionId = this._getAlternativeCommand(editor);
                if (altActionId !== undefined && !SymbolNavigationAction._activeAlternativeCommands.has(altActionId) && SymbolNavigationAction._allSymbolNavigationCommands.has(altActionId)) {
                    altAction = SymbolNavigationAction._allSymbolNavigationCommands.get(altActionId);
                }
            }
            const referenceCount = references.references.length;
            if (referenceCount === 0) {
                // no result -> show message
                if (!this.configuration.muteMessage) {
                    const info = model.getWordAtPosition(position);
                    MessageController.get(editor)?.showMessage(this._getNoResultFoundMessage(info), position);
                }
            }
            else if (referenceCount === 1 && altAction) {
                // already at the only result, run alternative
                SymbolNavigationAction._activeAlternativeCommands.add(this.desc.id);
                instaService.invokeFunction((accessor) => altAction.runEditorCommand(accessor, editor, arg, range).finally(() => {
                    SymbolNavigationAction._activeAlternativeCommands.delete(this.desc.id);
                }));
            }
            else {
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
    async _onResult(editorService, symbolNavService, editor, model, range) {
        const gotoLocation = this._getGoToPreference(editor);
        if (!(editor instanceof EmbeddedCodeEditorWidget) && (this.configuration.openInPeek || (gotoLocation === 'peek' && model.references.length > 1))) {
            this._openInPeek(editor, model, range);
        }
        else {
            const next = model.firstReference();
            const peek = model.references.length > 1 && gotoLocation === 'gotoAndPeek';
            const targetEditor = await this._openReference(editor, editorService, next, this.configuration.openToSide, !peek);
            if (peek && targetEditor) {
                this._openInPeek(targetEditor, model, range);
            }
            else {
                model.dispose();
            }
            // keep remaining locations around when using
            // 'goto'-mode
            if (gotoLocation === 'goto') {
                symbolNavService.put(next);
            }
        }
    }
    async _openReference(editor, editorService, reference, sideBySide, highlight) {
        // range is the target-selection-range when we have one
        // and the fallback is the 'full' range
        let range = undefined;
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
                selectionRevealType: 3 /* TextEditorSelectionRevealType.NearTopIfOutsideViewport */,
                selectionSource: "code.jump" /* TextEditorSelectionSource.JUMP */
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
    _openInPeek(target, model, range) {
        const controller = ReferencesController.get(target);
        if (controller && target.hasModel()) {
            controller.toggleWidget(range ?? target.getSelection(), createCancelablePromise(_ => Promise.resolve(model)), this.configuration.openInPeek);
        }
        else {
            model.dispose();
        }
    }
}
//#region --- DEFINITION
export class DefinitionAction extends SymbolNavigationAction {
    async _getLocationModel(languageFeaturesService, model, position, token) {
        return new ReferencesModel(await getDefinitionsAtPosition(languageFeaturesService.definitionProvider, model, position, false, token), nls.localize('def.title', 'Definitions'));
    }
    _getNoResultFoundMessage(info) {
        return info && info.word
            ? nls.localize('noResultWord', "No definition found for '{0}'", info.word)
            : nls.localize('generic.noResults', "No definition found");
    }
    _getAlternativeCommand(editor) {
        return editor.getOption(67 /* EditorOption.gotoLocation */).alternativeDefinitionCommand;
    }
    _getGoToPreference(editor) {
        return editor.getOption(67 /* EditorOption.gotoLocation */).multipleDefinitions;
    }
}
registerAction2(class GoToDefinitionAction extends DefinitionAction {
    static { this.id = 'editor.action.revealDefinition'; }
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
                    primary: 70 /* KeyCode.F12 */,
                    weight: 100 /* KeybindingWeight.EditorContrib */
                }, {
                    when: ContextKeyExpr.and(EditorContextKeys.editorTextFocus, IsWebContext),
                    primary: 2048 /* KeyMod.CtrlCmd */ | 70 /* KeyCode.F12 */,
                    weight: 100 /* KeybindingWeight.EditorContrib */
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
    static { this.id = 'editor.action.revealDefinitionAside'; }
    constructor() {
        super({
            openToSide: true,
            openInPeek: false,
            muteMessage: false
        }, {
            id: OpenDefinitionToSideAction.id,
            title: nls.localize2('actions.goToDeclToSide.label', "Open Definition to the Side"),
            precondition: ContextKeyExpr.and(EditorContextKeys.hasDefinitionProvider, EditorContextKeys.isInEmbeddedEditor.toNegated()),
            keybinding: [{
                    when: EditorContextKeys.editorTextFocus,
                    primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 70 /* KeyCode.F12 */),
                    weight: 100 /* KeybindingWeight.EditorContrib */
                }, {
                    when: ContextKeyExpr.and(EditorContextKeys.editorTextFocus, IsWebContext),
                    primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 70 /* KeyCode.F12 */),
                    weight: 100 /* KeybindingWeight.EditorContrib */
                }]
        });
        CommandsRegistry.registerCommandAlias('editor.action.openDeclarationToTheSide', OpenDefinitionToSideAction.id);
    }
});
registerAction2(class PeekDefinitionAction extends DefinitionAction {
    static { this.id = 'editor.action.peekDefinition'; }
    constructor() {
        super({
            openToSide: false,
            openInPeek: true,
            muteMessage: false
        }, {
            id: PeekDefinitionAction.id,
            title: nls.localize2('actions.previewDecl.label', "Peek Definition"),
            precondition: ContextKeyExpr.and(EditorContextKeys.hasDefinitionProvider, PeekContext.notInPeekEditor, EditorContextKeys.isInEmbeddedEditor.toNegated()),
            keybinding: {
                when: EditorContextKeys.editorTextFocus,
                primary: 512 /* KeyMod.Alt */ | 70 /* KeyCode.F12 */,
                linux: { primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 68 /* KeyCode.F10 */ },
                weight: 100 /* KeybindingWeight.EditorContrib */
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
    async _getLocationModel(languageFeaturesService, model, position, token) {
        return new ReferencesModel(await getDeclarationsAtPosition(languageFeaturesService.declarationProvider, model, position, false, token), nls.localize('decl.title', 'Declarations'));
    }
    _getNoResultFoundMessage(info) {
        return info && info.word
            ? nls.localize('decl.noResultWord', "No declaration found for '{0}'", info.word)
            : nls.localize('decl.generic.noResults', "No declaration found");
    }
    _getAlternativeCommand(editor) {
        return editor.getOption(67 /* EditorOption.gotoLocation */).alternativeDeclarationCommand;
    }
    _getGoToPreference(editor) {
        return editor.getOption(67 /* EditorOption.gotoLocation */).multipleDeclarations;
    }
}
registerAction2(class GoToDeclarationAction extends DeclarationAction {
    static { this.id = 'editor.action.revealDeclaration'; }
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
            precondition: ContextKeyExpr.and(EditorContextKeys.hasDeclarationProvider, EditorContextKeys.isInEmbeddedEditor.toNegated()),
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
    _getNoResultFoundMessage(info) {
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
            precondition: ContextKeyExpr.and(EditorContextKeys.hasDeclarationProvider, PeekContext.notInPeekEditor, EditorContextKeys.isInEmbeddedEditor.toNegated()),
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
    async _getLocationModel(languageFeaturesService, model, position, token) {
        return new ReferencesModel(await getTypeDefinitionsAtPosition(languageFeaturesService.typeDefinitionProvider, model, position, false, token), nls.localize('typedef.title', 'Type Definitions'));
    }
    _getNoResultFoundMessage(info) {
        return info && info.word
            ? nls.localize('goToTypeDefinition.noResultWord', "No type definition found for '{0}'", info.word)
            : nls.localize('goToTypeDefinition.generic.noResults', "No type definition found");
    }
    _getAlternativeCommand(editor) {
        return editor.getOption(67 /* EditorOption.gotoLocation */).alternativeTypeDefinitionCommand;
    }
    _getGoToPreference(editor) {
        return editor.getOption(67 /* EditorOption.gotoLocation */).multipleTypeDefinitions;
    }
}
registerAction2(class GoToTypeDefinitionAction extends TypeDefinitionAction {
    static { this.ID = 'editor.action.goToTypeDefinition'; }
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
                weight: 100 /* KeybindingWeight.EditorContrib */
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
    static { this.ID = 'editor.action.peekTypeDefinition'; }
    constructor() {
        super({
            openToSide: false,
            openInPeek: true,
            muteMessage: false
        }, {
            id: PeekTypeDefinitionAction.ID,
            title: nls.localize2('actions.peekTypeDefinition.label', "Peek Type Definition"),
            precondition: ContextKeyExpr.and(EditorContextKeys.hasTypeDefinitionProvider, PeekContext.notInPeekEditor, EditorContextKeys.isInEmbeddedEditor.toNegated()),
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
    async _getLocationModel(languageFeaturesService, model, position, token) {
        return new ReferencesModel(await getImplementationsAtPosition(languageFeaturesService.implementationProvider, model, position, false, token), nls.localize('impl.title', 'Implementations'));
    }
    _getNoResultFoundMessage(info) {
        return info && info.word
            ? nls.localize('goToImplementation.noResultWord', "No implementation found for '{0}'", info.word)
            : nls.localize('goToImplementation.generic.noResults', "No implementation found");
    }
    _getAlternativeCommand(editor) {
        return editor.getOption(67 /* EditorOption.gotoLocation */).alternativeImplementationCommand;
    }
    _getGoToPreference(editor) {
        return editor.getOption(67 /* EditorOption.gotoLocation */).multipleImplementations;
    }
}
registerAction2(class GoToImplementationAction extends ImplementationAction {
    static { this.ID = 'editor.action.goToImplementation'; }
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
                primary: 2048 /* KeyMod.CtrlCmd */ | 70 /* KeyCode.F12 */,
                weight: 100 /* KeybindingWeight.EditorContrib */
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
    static { this.ID = 'editor.action.peekImplementation'; }
    constructor() {
        super({
            openToSide: false,
            openInPeek: true,
            muteMessage: false
        }, {
            id: PeekImplementationAction.ID,
            title: nls.localize2('actions.peekImplementation.label', "Peek Implementations"),
            precondition: ContextKeyExpr.and(EditorContextKeys.hasImplementationProvider, PeekContext.notInPeekEditor, EditorContextKeys.isInEmbeddedEditor.toNegated()),
            keybinding: {
                when: EditorContextKeys.editorTextFocus,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 70 /* KeyCode.F12 */,
                weight: 100 /* KeybindingWeight.EditorContrib */
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
class ReferencesAction extends SymbolNavigationAction {
    _getNoResultFoundMessage(info) {
        return info
            ? nls.localize('references.no', "No references found for '{0}'", info.word)
            : nls.localize('references.noGeneric', "No references found");
    }
    _getAlternativeCommand(editor) {
        return editor.getOption(67 /* EditorOption.gotoLocation */).alternativeReferenceCommand;
    }
    _getGoToPreference(editor) {
        return editor.getOption(67 /* EditorOption.gotoLocation */).multipleReferences;
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
            precondition: ContextKeyExpr.and(EditorContextKeys.hasReferenceProvider, PeekContext.notInPeekEditor, EditorContextKeys.isInEmbeddedEditor.toNegated()),
            keybinding: {
                when: EditorContextKeys.editorTextFocus,
                primary: 1024 /* KeyMod.Shift */ | 70 /* KeyCode.F12 */,
                weight: 100 /* KeybindingWeight.EditorContrib */
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
    async _getLocationModel(languageFeaturesService, model, position, token) {
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
            precondition: ContextKeyExpr.and(EditorContextKeys.hasReferenceProvider, PeekContext.notInPeekEditor, EditorContextKeys.isInEmbeddedEditor.toNegated()),
            menu: {
                id: MenuId.EditorContextPeek,
                group: 'peek',
                order: 6
            }
        });
    }
    async _getLocationModel(languageFeaturesService, model, position, token) {
        return new ReferencesModel(await getReferencesAtPosition(languageFeaturesService.referenceProvider, model, position, false, false, token), nls.localize('ref.title', 'References'));
    }
});
//#endregion
//#region --- GENERIC goto symbols command
class GenericGoToLocationAction extends SymbolNavigationAction {
    constructor(config, _references, _gotoMultipleBehaviour) {
        super(config, {
            id: 'editor.action.goToLocation',
            title: nls.localize2('label.generic', "Go to Any Symbol"),
            precondition: ContextKeyExpr.and(PeekContext.notInPeekEditor, EditorContextKeys.isInEmbeddedEditor.toNegated()),
        });
        this._references = _references;
        this._gotoMultipleBehaviour = _gotoMultipleBehaviour;
    }
    async _getLocationModel(languageFeaturesService, _model, _position, _token) {
        return new ReferencesModel(this._references, nls.localize('generic.title', 'Locations'));
    }
    _getNoResultFoundMessage(info) {
        return info && nls.localize('generic.noResult', "No results for '{0}'", info.word) || '';
    }
    _getGoToPreference(editor) {
        return this._gotoMultipleBehaviour ?? editor.getOption(67 /* EditorOption.gotoLocation */).multipleReferences;
    }
    _getAlternativeCommand() {
        return undefined;
    }
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
    handler: async (accessor, resource, position, references, multiple, noResultsMessage, openInPeek) => {
        assertType(URI.isUri(resource));
        assertType(corePosition.Position.isIPosition(position));
        assertType(Array.isArray(references));
        assertType(typeof multiple === 'undefined' || typeof multiple === 'string');
        assertType(typeof openInPeek === 'undefined' || typeof openInPeek === 'boolean');
        const editorService = accessor.get(ICodeEditorService);
        const editor = await editorService.openCodeEditor({ resource }, editorService.getFocusedCodeEditor());
        if (isCodeEditor(editor)) {
            editor.setPosition(position);
            editor.revealPositionInCenterIfOutsideViewport(position, 0 /* ScrollType.Smooth */);
            return editor.invokeWithinContext(accessor => {
                const command = new class extends GenericGoToLocationAction {
                    _getNoResultFoundMessage(info) {
                        return noResultsMessage || super._getNoResultFoundMessage(info);
                    }
                }({
                    muteMessage: !Boolean(noResultsMessage),
                    openInPeek: Boolean(openInPeek),
                    openToSide: false
                }, references, multiple);
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
    handler: async (accessor, resource, position, references, multiple) => {
        accessor.get(ICommandService).executeCommand('editor.action.goToLocations', resource, position, references, multiple, undefined, true);
    }
});
//#endregion
//#region --- REFERENCE search special commands
CommandsRegistry.registerCommand({
    id: 'editor.action.findReferences',
    handler: (accessor, resource, position) => {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ29Ub0NvbW1hbmRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvZ290b1N5bWJvbC9icm93c2VyL2dvVG9Db21tYW5kcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDakUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFN0YsT0FBTyxFQUFFLFFBQVEsRUFBbUIsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDOUQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBdUIsa0NBQWtDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuSCxPQUFPLEVBQWtDLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxhQUFhLEVBQW9CLE1BQU0sc0NBQXNDLENBQUM7QUFDdkYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDcEYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFFMUcsT0FBTyxLQUFLLFlBQVksTUFBTSxrQ0FBa0MsQ0FBQztBQUNqRSxPQUFPLEVBQVUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFFOUQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFekUsT0FBTyxFQUFFLGNBQWMsRUFBMEIsTUFBTSw4QkFBOEIsQ0FBQztBQUN0RixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDdkQsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDL0UsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2pFLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUE0RCxNQUFNLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2pLLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNyRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFdEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFbkcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDaEcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDMUYsT0FBTyxFQUFFLHlCQUF5QixFQUFFLHdCQUF3QixFQUFFLDRCQUE0QixFQUFFLHVCQUF1QixFQUFFLDRCQUE0QixFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFFM0ssT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDeEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUVyRixZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUU7SUFDakQsT0FBTyxFQUFFLE1BQU0sQ0FBQyxpQkFBaUI7SUFDakMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLE1BQU0sQ0FBQztJQUMzQyxLQUFLLEVBQUUsWUFBWTtJQUNuQixLQUFLLEVBQUUsR0FBRztDQUNhLENBQUMsQ0FBQztBQVExQixNQUFNLE9BQU8sc0JBQXNCO0lBRWxDLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBVTtRQUNuQixJQUFJLENBQUMsS0FBSyxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3pDLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELElBQUksS0FBSyxZQUFZLHNCQUFzQixFQUFFLENBQUM7WUFDN0MsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsSUFBSSxZQUFZLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBMEIsS0FBTSxDQUFDLFFBQVEsQ0FBQyxJQUE2QixLQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDMUgsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRUQsWUFBcUIsS0FBaUIsRUFBVyxRQUErQjtRQUEzRCxVQUFLLEdBQUwsS0FBSyxDQUFZO1FBQVcsYUFBUSxHQUFSLFFBQVEsQ0FBdUI7SUFBSSxDQUFDO0NBQ3JGO0FBRUQsTUFBTSxPQUFnQixzQkFBdUIsU0FBUSxhQUFhO2FBRWxELGlDQUE0QixHQUFHLElBQUksR0FBRyxFQUFrQyxDQUFDO2FBQ3pFLCtCQUEwQixHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7SUFFOUQsTUFBTSxDQUFDLEdBQUc7UUFDVCxPQUFPLHNCQUFzQixDQUFDLDRCQUE0QixDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQ3JFLENBQUM7SUFFTyxNQUFNLENBQUMsWUFBWSxDQUFDLElBQWlEO1FBQzVFLE1BQU0sTUFBTSxHQUFHLEVBQUUsR0FBRyxJQUFJLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxDQUFDO1FBQ3JDLGlDQUFpQztRQUNqQyxJQUFJLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNqQixLQUFLLE1BQU0sSUFBSSxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7Z0JBQy9DLElBQUksSUFBSSxDQUFDLEVBQUUsS0FBSyxNQUFNLENBQUMsYUFBYSxJQUFJLElBQUksQ0FBQyxFQUFFLEtBQUssTUFBTSxDQUFDLGlCQUFpQixFQUFFLENBQUM7b0JBQzlFLElBQUksQ0FBQyxJQUFJLEdBQUcsY0FBYyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDOUQsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBb0IsTUFBTSxDQUFDO0lBQzVCLENBQUM7SUFJRCxZQUFZLGFBQTJDLEVBQUUsSUFBaUQ7UUFDekcsS0FBSyxDQUFDLHNCQUFzQixDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ2pELElBQUksQ0FBQyxhQUFhLEdBQUcsYUFBYSxDQUFDO1FBQ25DLHNCQUFzQixDQUFDLDRCQUE0QixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3hFLENBQUM7SUFFUSxnQkFBZ0IsQ0FBQyxRQUEwQixFQUFFLE1BQW1CLEVBQUUsR0FBc0MsRUFBRSxLQUFhO1FBQy9ILElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQztZQUN4QixPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDbkMsQ0FBQztRQUNELE1BQU0sbUJBQW1CLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBQy9ELE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUN2RCxNQUFNLGVBQWUsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDN0QsTUFBTSxnQkFBZ0IsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHdCQUF3QixDQUFDLENBQUM7UUFDaEUsTUFBTSx1QkFBdUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHdCQUF3QixDQUFDLENBQUM7UUFDdkUsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1FBRXpELE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNoQyxNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDdEMsTUFBTSxNQUFNLEdBQUcsc0JBQXNCLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksc0JBQXNCLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRWxHLE1BQU0sR0FBRyxHQUFHLElBQUksa0NBQWtDLENBQUMsTUFBTSxFQUFFLHdFQUF3RCxDQUFDLENBQUM7UUFFckgsTUFBTSxPQUFPLEdBQUcsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLHVCQUF1QixFQUFFLE1BQU0sQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUMsVUFBVSxFQUFDLEVBQUU7WUFFOUosSUFBSSxDQUFDLFVBQVUsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLHVCQUF1QixFQUFFLENBQUM7Z0JBQ3RELE9BQU87WUFDUixDQUFDO1lBRUQsS0FBSyxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUU5QixJQUFJLFNBQW9ELENBQUM7WUFDekQsSUFBSSxVQUFVLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsUUFBUSxDQUFDLEVBQUUsQ0FBQztnQkFDakQsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUN4RCxJQUFJLFdBQVcsS0FBSyxTQUFTLElBQUksQ0FBQyxzQkFBc0IsQ0FBQywwQkFBMEIsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksc0JBQXNCLENBQUMsNEJBQTRCLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7b0JBQzlLLFNBQVMsR0FBRyxzQkFBc0IsQ0FBQyw0QkFBNEIsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFFLENBQUM7Z0JBQ25GLENBQUM7WUFDRixDQUFDO1lBRUQsTUFBTSxjQUFjLEdBQUcsVUFBVSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUM7WUFFcEQsSUFBSSxjQUFjLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQzFCLDRCQUE0QjtnQkFDNUIsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxFQUFFLENBQUM7b0JBQ3JDLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztvQkFDL0MsaUJBQWlCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLFdBQVcsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUM7Z0JBQzNGLENBQUM7WUFDRixDQUFDO2lCQUFNLElBQUksY0FBYyxLQUFLLENBQUMsSUFBSSxTQUFTLEVBQUUsQ0FBQztnQkFDOUMsOENBQThDO2dCQUM5QyxzQkFBc0IsQ0FBQywwQkFBMEIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDcEUsWUFBWSxDQUFDLGNBQWMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsU0FBUyxDQUFDLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUU7b0JBQy9HLHNCQUFzQixDQUFDLDBCQUEwQixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN4RSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRUwsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLDBCQUEwQjtnQkFDMUIsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ25GLENBQUM7UUFFRixDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsRUFBRTtZQUNWLGtCQUFrQjtZQUNsQixtQkFBbUIsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDaEMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRTtZQUNmLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNmLENBQUMsQ0FBQyxDQUFDO1FBRUgsZUFBZSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDeEMsT0FBTyxPQUFPLENBQUM7SUFDaEIsQ0FBQztJQVVPLEtBQUssQ0FBQyxTQUFTLENBQUMsYUFBaUMsRUFBRSxnQkFBMEMsRUFBRSxNQUF5QixFQUFFLEtBQXNCLEVBQUUsS0FBYTtRQUV0SyxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDckQsSUFBSSxDQUFDLENBQUMsTUFBTSxZQUFZLHdCQUF3QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFVBQVUsSUFBSSxDQUFDLFlBQVksS0FBSyxNQUFNLElBQUksS0FBSyxDQUFDLFVBQVUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ2xKLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QyxDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxjQUFjLEVBQUcsQ0FBQztZQUNyQyxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksWUFBWSxLQUFLLGFBQWEsQ0FBQztZQUMzRSxNQUFNLFlBQVksR0FBRyxNQUFNLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNsSCxJQUFJLElBQUksSUFBSSxZQUFZLEVBQUUsQ0FBQztnQkFDMUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxZQUFZLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzlDLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDakIsQ0FBQztZQUVELDZDQUE2QztZQUM3QyxjQUFjO1lBQ2QsSUFBSSxZQUFZLEtBQUssTUFBTSxFQUFFLENBQUM7Z0JBQzdCLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM1QixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFTyxLQUFLLENBQUMsY0FBYyxDQUFDLE1BQW1CLEVBQUUsYUFBaUMsRUFBRSxTQUFrQyxFQUFFLFVBQW1CLEVBQUUsU0FBa0I7UUFDL0osdURBQXVEO1FBQ3ZELHVDQUF1QztRQUN2QyxJQUFJLEtBQUssR0FBdUIsU0FBUyxDQUFDO1FBQzFDLElBQUksY0FBYyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7WUFDL0IsS0FBSyxHQUFHLFNBQVMsQ0FBQyxvQkFBb0IsQ0FBQztRQUN4QyxDQUFDO1FBQ0QsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osS0FBSyxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUM7UUFDekIsQ0FBQztRQUNELElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNaLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxNQUFNLFlBQVksR0FBRyxNQUFNLGFBQWEsQ0FBQyxjQUFjLENBQUM7WUFDdkQsUUFBUSxFQUFFLFNBQVMsQ0FBQyxHQUFHO1lBQ3ZCLE9BQU8sRUFBRTtnQkFDUixTQUFTLEVBQUUsS0FBSyxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUM7Z0JBQ3ZDLG1CQUFtQixnRUFBd0Q7Z0JBQzNFLGVBQWUsa0RBQWdDO2FBQy9DO1NBQ0QsRUFBRSxNQUFNLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFFdkIsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ25CLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ2YsTUFBTSxRQUFRLEdBQUcsWUFBWSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3pDLE1BQU0sV0FBVyxHQUFHLFlBQVksQ0FBQywyQkFBMkIsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxFQUFFLFdBQVcsRUFBRSxrQ0FBa0MsRUFBRSxTQUFTLEVBQUUsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN0SyxVQUFVLENBQUMsR0FBRyxFQUFFO2dCQUNmLElBQUksWUFBWSxDQUFDLFFBQVEsRUFBRSxLQUFLLFFBQVEsRUFBRSxDQUFDO29CQUMxQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ3JCLENBQUM7WUFDRixDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDVCxDQUFDO1FBRUQsT0FBTyxZQUFZLENBQUM7SUFDckIsQ0FBQztJQUVPLFdBQVcsQ0FBQyxNQUFtQixFQUFFLEtBQXNCLEVBQUUsS0FBYTtRQUM3RSxNQUFNLFVBQVUsR0FBRyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDcEQsSUFBSSxVQUFVLElBQUksTUFBTSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUM7WUFDckMsVUFBVSxDQUFDLFlBQVksQ0FBQyxLQUFLLElBQUksTUFBTSxDQUFDLFlBQVksRUFBRSxFQUFFLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDOUksQ0FBQzthQUFNLENBQUM7WUFDUCxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDakIsQ0FBQztJQUNGLENBQUM7O0FBR0Ysd0JBQXdCO0FBRXhCLE1BQU0sT0FBTyxnQkFBaUIsU0FBUSxzQkFBc0I7SUFFakQsS0FBSyxDQUFDLGlCQUFpQixDQUFDLHVCQUFpRCxFQUFFLEtBQWlCLEVBQUUsUUFBK0IsRUFBRSxLQUF3QjtRQUNoSyxPQUFPLElBQUksZUFBZSxDQUFDLE1BQU0sd0JBQXdCLENBQUMsdUJBQXVCLENBQUMsa0JBQWtCLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQztJQUNqTCxDQUFDO0lBRVMsd0JBQXdCLENBQUMsSUFBNEI7UUFDOUQsT0FBTyxJQUFJLElBQUksSUFBSSxDQUFDLElBQUk7WUFDdkIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLCtCQUErQixFQUFFLElBQUksQ0FBQyxJQUFJLENBQUM7WUFDMUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsbUJBQW1CLEVBQUUscUJBQXFCLENBQUMsQ0FBQztJQUM3RCxDQUFDO0lBRVMsc0JBQXNCLENBQUMsTUFBeUI7UUFDekQsT0FBTyxNQUFNLENBQUMsU0FBUyxvQ0FBMkIsQ0FBQyw0QkFBNEIsQ0FBQztJQUNqRixDQUFDO0lBRVMsa0JBQWtCLENBQUMsTUFBeUI7UUFDckQsT0FBTyxNQUFNLENBQUMsU0FBUyxvQ0FBMkIsQ0FBQyxtQkFBbUIsQ0FBQztJQUN4RSxDQUFDO0NBQ0Q7QUFFRCxlQUFlLENBQUMsTUFBTSxvQkFBcUIsU0FBUSxnQkFBZ0I7YUFFbEQsT0FBRSxHQUFHLGdDQUFnQyxDQUFDO0lBRXREO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsVUFBVSxFQUFFLEtBQUs7WUFDakIsVUFBVSxFQUFFLEtBQUs7WUFDakIsV0FBVyxFQUFFLEtBQUs7U0FDbEIsRUFBRTtZQUNGLEVBQUUsRUFBRSxvQkFBb0IsQ0FBQyxFQUFFO1lBQzNCLEtBQUssRUFBRTtnQkFDTixHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsd0JBQXdCLEVBQUUsa0JBQWtCLENBQUM7Z0JBQzlELGFBQWEsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLGtCQUFrQixFQUFFLE9BQU8sRUFBRSxDQUFDLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxvQkFBb0IsQ0FBQzthQUNsSDtZQUNELFlBQVksRUFBRSxpQkFBaUIsQ0FBQyxxQkFBcUI7WUFDckQsVUFBVSxFQUFFLENBQUM7b0JBQ1osSUFBSSxFQUFFLGlCQUFpQixDQUFDLGVBQWU7b0JBQ3ZDLE9BQU8sc0JBQWE7b0JBQ3BCLE1BQU0sMENBQWdDO2lCQUN0QyxFQUFFO29CQUNGLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLGVBQWUsRUFBRSxZQUFZLENBQUM7b0JBQ3pFLE9BQU8sRUFBRSxnREFBNEI7b0JBQ3JDLE1BQU0sMENBQWdDO2lCQUN0QyxDQUFDO1lBQ0YsSUFBSSxFQUFFLENBQUM7b0JBQ04sRUFBRSxFQUFFLE1BQU0sQ0FBQyxhQUFhO29CQUN4QixLQUFLLEVBQUUsWUFBWTtvQkFDbkIsS0FBSyxFQUFFLEdBQUc7aUJBQ1YsRUFBRTtvQkFDRixFQUFFLEVBQUUsTUFBTSxDQUFDLGFBQWE7b0JBQ3hCLFlBQVksRUFBRSxJQUFJO29CQUNsQixLQUFLLEVBQUUsY0FBYztvQkFDckIsS0FBSyxFQUFFLENBQUM7aUJBQ1IsQ0FBQztTQUNGLENBQUMsQ0FBQztRQUNILGdCQUFnQixDQUFDLG9CQUFvQixDQUFDLCtCQUErQixFQUFFLG9CQUFvQixDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ2pHLENBQUM7Q0FDRCxDQUFDLENBQUM7QUFFSCxlQUFlLENBQUMsTUFBTSwwQkFBMkIsU0FBUSxnQkFBZ0I7YUFFeEQsT0FBRSxHQUFHLHFDQUFxQyxDQUFDO0lBRTNEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsVUFBVSxFQUFFLElBQUk7WUFDaEIsVUFBVSxFQUFFLEtBQUs7WUFDakIsV0FBVyxFQUFFLEtBQUs7U0FDbEIsRUFBRTtZQUNGLEVBQUUsRUFBRSwwQkFBMEIsQ0FBQyxFQUFFO1lBQ2pDLEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLDhCQUE4QixFQUFFLDZCQUE2QixDQUFDO1lBQ25GLFlBQVksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUMvQixpQkFBaUIsQ0FBQyxxQkFBcUIsRUFDdkMsaUJBQWlCLENBQUMsa0JBQWtCLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDbEQsVUFBVSxFQUFFLENBQUM7b0JBQ1osSUFBSSxFQUFFLGlCQUFpQixDQUFDLGVBQWU7b0JBQ3ZDLE9BQU8sRUFBRSxRQUFRLENBQUMsaURBQTZCLHVCQUFjO29CQUM3RCxNQUFNLDBDQUFnQztpQkFDdEMsRUFBRTtvQkFDRixJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxlQUFlLEVBQUUsWUFBWSxDQUFDO29CQUN6RSxPQUFPLEVBQUUsUUFBUSxDQUFDLGlEQUE2QixFQUFFLGdEQUE0QixDQUFDO29CQUM5RSxNQUFNLDBDQUFnQztpQkFDdEMsQ0FBQztTQUNGLENBQUMsQ0FBQztRQUNILGdCQUFnQixDQUFDLG9CQUFvQixDQUFDLHdDQUF3QyxFQUFFLDBCQUEwQixDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ2hILENBQUM7Q0FDRCxDQUFDLENBQUM7QUFFSCxlQUFlLENBQUMsTUFBTSxvQkFBcUIsU0FBUSxnQkFBZ0I7YUFFbEQsT0FBRSxHQUFHLDhCQUE4QixDQUFDO0lBRXBEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsVUFBVSxFQUFFLEtBQUs7WUFDakIsVUFBVSxFQUFFLElBQUk7WUFDaEIsV0FBVyxFQUFFLEtBQUs7U0FDbEIsRUFBRTtZQUNGLEVBQUUsRUFBRSxvQkFBb0IsQ0FBQyxFQUFFO1lBQzNCLEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLDJCQUEyQixFQUFFLGlCQUFpQixDQUFDO1lBQ3BFLFlBQVksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUMvQixpQkFBaUIsQ0FBQyxxQkFBcUIsRUFDdkMsV0FBVyxDQUFDLGVBQWUsRUFDM0IsaUJBQWlCLENBQUMsa0JBQWtCLENBQUMsU0FBUyxFQUFFLENBQ2hEO1lBQ0QsVUFBVSxFQUFFO2dCQUNYLElBQUksRUFBRSxpQkFBaUIsQ0FBQyxlQUFlO2dCQUN2QyxPQUFPLEVBQUUsMkNBQXdCO2dCQUNqQyxLQUFLLEVBQUUsRUFBRSxPQUFPLEVBQUUsbURBQTZCLHVCQUFjLEVBQUU7Z0JBQy9ELE1BQU0sMENBQWdDO2FBQ3RDO1lBQ0QsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsaUJBQWlCO2dCQUM1QixLQUFLLEVBQUUsTUFBTTtnQkFDYixLQUFLLEVBQUUsQ0FBQzthQUNSO1NBQ0QsQ0FBQyxDQUFDO1FBQ0gsZ0JBQWdCLENBQUMsb0JBQW9CLENBQUMsa0NBQWtDLEVBQUUsb0JBQW9CLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDcEcsQ0FBQztDQUNELENBQUMsQ0FBQztBQUVILFlBQVk7QUFFWix5QkFBeUI7QUFFekIsTUFBTSxpQkFBa0IsU0FBUSxzQkFBc0I7SUFFM0MsS0FBSyxDQUFDLGlCQUFpQixDQUFDLHVCQUFpRCxFQUFFLEtBQWlCLEVBQUUsUUFBK0IsRUFBRSxLQUF3QjtRQUNoSyxPQUFPLElBQUksZUFBZSxDQUFDLE1BQU0seUJBQXlCLENBQUMsdUJBQXVCLENBQUMsbUJBQW1CLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQztJQUNyTCxDQUFDO0lBRVMsd0JBQXdCLENBQUMsSUFBNEI7UUFDOUQsT0FBTyxJQUFJLElBQUksSUFBSSxDQUFDLElBQUk7WUFDdkIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsbUJBQW1CLEVBQUUsZ0NBQWdDLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQztZQUNoRixDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFFUyxzQkFBc0IsQ0FBQyxNQUF5QjtRQUN6RCxPQUFPLE1BQU0sQ0FBQyxTQUFTLG9DQUEyQixDQUFDLDZCQUE2QixDQUFDO0lBQ2xGLENBQUM7SUFFUyxrQkFBa0IsQ0FBQyxNQUF5QjtRQUNyRCxPQUFPLE1BQU0sQ0FBQyxTQUFTLG9DQUEyQixDQUFDLG9CQUFvQixDQUFDO0lBQ3pFLENBQUM7Q0FDRDtBQUVELGVBQWUsQ0FBQyxNQUFNLHFCQUFzQixTQUFRLGlCQUFpQjthQUVwRCxPQUFFLEdBQUcsaUNBQWlDLENBQUM7SUFFdkQ7UUFDQyxLQUFLLENBQUM7WUFDTCxVQUFVLEVBQUUsS0FBSztZQUNqQixVQUFVLEVBQUUsS0FBSztZQUNqQixXQUFXLEVBQUUsS0FBSztTQUNsQixFQUFFO1lBQ0YsRUFBRSxFQUFFLHFCQUFxQixDQUFDLEVBQUU7WUFDNUIsS0FBSyxFQUFFO2dCQUNOLEdBQUcsR0FBRyxDQUFDLFNBQVMsQ0FBQywrQkFBK0IsRUFBRSxtQkFBbUIsQ0FBQztnQkFDdEUsYUFBYSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxHQUFHLEVBQUUsbUJBQW1CLEVBQUUsT0FBTyxFQUFFLENBQUMsdUJBQXVCLENBQUMsRUFBRSxFQUFFLHFCQUFxQixDQUFDO2FBQ3BIO1lBQ0QsWUFBWSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQy9CLGlCQUFpQixDQUFDLHNCQUFzQixFQUN4QyxpQkFBaUIsQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLEVBQUUsQ0FDaEQ7WUFDRCxJQUFJLEVBQUUsQ0FBQztvQkFDTixFQUFFLEVBQUUsTUFBTSxDQUFDLGFBQWE7b0JBQ3hCLEtBQUssRUFBRSxZQUFZO29CQUNuQixLQUFLLEVBQUUsR0FBRztpQkFDVixFQUFFO29CQUNGLEVBQUUsRUFBRSxNQUFNLENBQUMsYUFBYTtvQkFDeEIsWUFBWSxFQUFFLElBQUk7b0JBQ2xCLEtBQUssRUFBRSxjQUFjO29CQUNyQixLQUFLLEVBQUUsQ0FBQztpQkFDUixDQUFDO1NBQ0YsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVrQix3QkFBd0IsQ0FBQyxJQUE0QjtRQUN2RSxPQUFPLElBQUksSUFBSSxJQUFJLENBQUMsSUFBSTtZQUN2QixDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSxnQ0FBZ0MsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDO1lBQ2hGLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLHdCQUF3QixFQUFFLHNCQUFzQixDQUFDLENBQUM7SUFDbkUsQ0FBQztDQUNELENBQUMsQ0FBQztBQUVILGVBQWUsQ0FBQyxNQUFNLHFCQUFzQixTQUFRLGlCQUFpQjtJQUNwRTtRQUNDLEtBQUssQ0FBQztZQUNMLFVBQVUsRUFBRSxLQUFLO1lBQ2pCLFVBQVUsRUFBRSxJQUFJO1lBQ2hCLFdBQVcsRUFBRSxLQUFLO1NBQ2xCLEVBQUU7WUFDRixFQUFFLEVBQUUsK0JBQStCO1lBQ25DLEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLHdCQUF3QixFQUFFLGtCQUFrQixDQUFDO1lBQ2xFLFlBQVksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUMvQixpQkFBaUIsQ0FBQyxzQkFBc0IsRUFDeEMsV0FBVyxDQUFDLGVBQWUsRUFDM0IsaUJBQWlCLENBQUMsa0JBQWtCLENBQUMsU0FBUyxFQUFFLENBQ2hEO1lBQ0QsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsaUJBQWlCO2dCQUM1QixLQUFLLEVBQUUsTUFBTTtnQkFDYixLQUFLLEVBQUUsQ0FBQzthQUNSO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNELENBQUMsQ0FBQztBQUVILFlBQVk7QUFFWiw2QkFBNkI7QUFFN0IsTUFBTSxvQkFBcUIsU0FBUSxzQkFBc0I7SUFFOUMsS0FBSyxDQUFDLGlCQUFpQixDQUFDLHVCQUFpRCxFQUFFLEtBQWlCLEVBQUUsUUFBK0IsRUFBRSxLQUF3QjtRQUNoSyxPQUFPLElBQUksZUFBZSxDQUFDLE1BQU0sNEJBQTRCLENBQUMsdUJBQXVCLENBQUMsc0JBQXNCLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxlQUFlLEVBQUUsa0JBQWtCLENBQUMsQ0FBQyxDQUFDO0lBQ2xNLENBQUM7SUFFUyx3QkFBd0IsQ0FBQyxJQUE0QjtRQUM5RCxPQUFPLElBQUksSUFBSSxJQUFJLENBQUMsSUFBSTtZQUN2QixDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxpQ0FBaUMsRUFBRSxvQ0FBb0MsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDO1lBQ2xHLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLHNDQUFzQyxFQUFFLDBCQUEwQixDQUFDLENBQUM7SUFDckYsQ0FBQztJQUVTLHNCQUFzQixDQUFDLE1BQXlCO1FBQ3pELE9BQU8sTUFBTSxDQUFDLFNBQVMsb0NBQTJCLENBQUMsZ0NBQWdDLENBQUM7SUFDckYsQ0FBQztJQUVTLGtCQUFrQixDQUFDLE1BQXlCO1FBQ3JELE9BQU8sTUFBTSxDQUFDLFNBQVMsb0NBQTJCLENBQUMsdUJBQXVCLENBQUM7SUFDNUUsQ0FBQztDQUNEO0FBRUQsZUFBZSxDQUFDLE1BQU0sd0JBQXlCLFNBQVEsb0JBQW9CO2FBRW5ELE9BQUUsR0FBRyxrQ0FBa0MsQ0FBQztJQUUvRDtRQUNDLEtBQUssQ0FBQztZQUNMLFVBQVUsRUFBRSxLQUFLO1lBQ2pCLFVBQVUsRUFBRSxLQUFLO1lBQ2pCLFdBQVcsRUFBRSxLQUFLO1NBQ2xCLEVBQUU7WUFDRixFQUFFLEVBQUUsd0JBQXdCLENBQUMsRUFBRTtZQUMvQixLQUFLLEVBQUU7Z0JBQ04sR0FBRyxHQUFHLENBQUMsU0FBUyxDQUFDLGtDQUFrQyxFQUFFLHVCQUF1QixDQUFDO2dCQUM3RSxhQUFhLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLEdBQUcsRUFBRSxzQkFBc0IsRUFBRSxPQUFPLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUseUJBQXlCLENBQUM7YUFDM0g7WUFDRCxZQUFZLEVBQUUsaUJBQWlCLENBQUMseUJBQXlCO1lBQ3pELFVBQVUsRUFBRTtnQkFDWCxJQUFJLEVBQUUsaUJBQWlCLENBQUMsZUFBZTtnQkFDdkMsT0FBTyxFQUFFLENBQUM7Z0JBQ1YsTUFBTSwwQ0FBZ0M7YUFDdEM7WUFDRCxJQUFJLEVBQUUsQ0FBQztvQkFDTixFQUFFLEVBQUUsTUFBTSxDQUFDLGFBQWE7b0JBQ3hCLEtBQUssRUFBRSxZQUFZO29CQUNuQixLQUFLLEVBQUUsR0FBRztpQkFDVixFQUFFO29CQUNGLEVBQUUsRUFBRSxNQUFNLENBQUMsYUFBYTtvQkFDeEIsWUFBWSxFQUFFLElBQUk7b0JBQ2xCLEtBQUssRUFBRSxjQUFjO29CQUNyQixLQUFLLEVBQUUsQ0FBQztpQkFDUixDQUFDO1NBQ0YsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNELENBQUMsQ0FBQztBQUVILGVBQWUsQ0FBQyxNQUFNLHdCQUF5QixTQUFRLG9CQUFvQjthQUVuRCxPQUFFLEdBQUcsa0NBQWtDLENBQUM7SUFFL0Q7UUFDQyxLQUFLLENBQUM7WUFDTCxVQUFVLEVBQUUsS0FBSztZQUNqQixVQUFVLEVBQUUsSUFBSTtZQUNoQixXQUFXLEVBQUUsS0FBSztTQUNsQixFQUFFO1lBQ0YsRUFBRSxFQUFFLHdCQUF3QixDQUFDLEVBQUU7WUFDL0IsS0FBSyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsa0NBQWtDLEVBQUUsc0JBQXNCLENBQUM7WUFDaEYsWUFBWSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQy9CLGlCQUFpQixDQUFDLHlCQUF5QixFQUMzQyxXQUFXLENBQUMsZUFBZSxFQUMzQixpQkFBaUIsQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLEVBQUUsQ0FDaEQ7WUFDRCxJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxpQkFBaUI7Z0JBQzVCLEtBQUssRUFBRSxNQUFNO2dCQUNiLEtBQUssRUFBRSxDQUFDO2FBQ1I7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsWUFBWTtBQUVaLDRCQUE0QjtBQUU1QixNQUFNLG9CQUFxQixTQUFRLHNCQUFzQjtJQUU5QyxLQUFLLENBQUMsaUJBQWlCLENBQUMsdUJBQWlELEVBQUUsS0FBaUIsRUFBRSxRQUErQixFQUFFLEtBQXdCO1FBQ2hLLE9BQU8sSUFBSSxlQUFlLENBQUMsTUFBTSw0QkFBNEIsQ0FBQyx1QkFBdUIsQ0FBQyxzQkFBc0IsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxpQkFBaUIsQ0FBQyxDQUFDLENBQUM7SUFDOUwsQ0FBQztJQUVTLHdCQUF3QixDQUFDLElBQTRCO1FBQzlELE9BQU8sSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJO1lBQ3ZCLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLGlDQUFpQyxFQUFFLG1DQUFtQyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUM7WUFDakcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsc0NBQXNDLEVBQUUseUJBQXlCLENBQUMsQ0FBQztJQUNwRixDQUFDO0lBRVMsc0JBQXNCLENBQUMsTUFBeUI7UUFDekQsT0FBTyxNQUFNLENBQUMsU0FBUyxvQ0FBMkIsQ0FBQyxnQ0FBZ0MsQ0FBQztJQUNyRixDQUFDO0lBRVMsa0JBQWtCLENBQUMsTUFBeUI7UUFDckQsT0FBTyxNQUFNLENBQUMsU0FBUyxvQ0FBMkIsQ0FBQyx1QkFBdUIsQ0FBQztJQUM1RSxDQUFDO0NBQ0Q7QUFFRCxlQUFlLENBQUMsTUFBTSx3QkFBeUIsU0FBUSxvQkFBb0I7YUFFbkQsT0FBRSxHQUFHLGtDQUFrQyxDQUFDO0lBRS9EO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsVUFBVSxFQUFFLEtBQUs7WUFDakIsVUFBVSxFQUFFLEtBQUs7WUFDakIsV0FBVyxFQUFFLEtBQUs7U0FDbEIsRUFBRTtZQUNGLEVBQUUsRUFBRSx3QkFBd0IsQ0FBQyxFQUFFO1lBQy9CLEtBQUssRUFBRTtnQkFDTixHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsa0NBQWtDLEVBQUUsdUJBQXVCLENBQUM7Z0JBQzdFLGFBQWEsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLHNCQUFzQixFQUFFLE9BQU8sRUFBRSxDQUFDLHVCQUF1QixDQUFDLEVBQUUsRUFBRSx5QkFBeUIsQ0FBQzthQUMzSDtZQUNELFlBQVksRUFBRSxpQkFBaUIsQ0FBQyx5QkFBeUI7WUFDekQsVUFBVSxFQUFFO2dCQUNYLElBQUksRUFBRSxpQkFBaUIsQ0FBQyxlQUFlO2dCQUN2QyxPQUFPLEVBQUUsZ0RBQTRCO2dCQUNyQyxNQUFNLDBDQUFnQzthQUN0QztZQUNELElBQUksRUFBRSxDQUFDO29CQUNOLEVBQUUsRUFBRSxNQUFNLENBQUMsYUFBYTtvQkFDeEIsS0FBSyxFQUFFLFlBQVk7b0JBQ25CLEtBQUssRUFBRSxJQUFJO2lCQUNYLEVBQUU7b0JBQ0YsRUFBRSxFQUFFLE1BQU0sQ0FBQyxhQUFhO29CQUN4QixZQUFZLEVBQUUsSUFBSTtvQkFDbEIsS0FBSyxFQUFFLGNBQWM7b0JBQ3JCLEtBQUssRUFBRSxDQUFDO2lCQUNSLENBQUM7U0FDRixDQUFDLENBQUM7SUFDSixDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsZUFBZSxDQUFDLE1BQU0sd0JBQXlCLFNBQVEsb0JBQW9CO2FBRW5ELE9BQUUsR0FBRyxrQ0FBa0MsQ0FBQztJQUUvRDtRQUNDLEtBQUssQ0FBQztZQUNMLFVBQVUsRUFBRSxLQUFLO1lBQ2pCLFVBQVUsRUFBRSxJQUFJO1lBQ2hCLFdBQVcsRUFBRSxLQUFLO1NBQ2xCLEVBQUU7WUFDRixFQUFFLEVBQUUsd0JBQXdCLENBQUMsRUFBRTtZQUMvQixLQUFLLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxrQ0FBa0MsRUFBRSxzQkFBc0IsQ0FBQztZQUNoRixZQUFZLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FDL0IsaUJBQWlCLENBQUMseUJBQXlCLEVBQzNDLFdBQVcsQ0FBQyxlQUFlLEVBQzNCLGlCQUFpQixDQUFDLGtCQUFrQixDQUFDLFNBQVMsRUFBRSxDQUNoRDtZQUNELFVBQVUsRUFBRTtnQkFDWCxJQUFJLEVBQUUsaUJBQWlCLENBQUMsZUFBZTtnQkFDdkMsT0FBTyxFQUFFLG1EQUE2Qix1QkFBYztnQkFDcEQsTUFBTSwwQ0FBZ0M7YUFDdEM7WUFDRCxJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxpQkFBaUI7Z0JBQzVCLEtBQUssRUFBRSxNQUFNO2dCQUNiLEtBQUssRUFBRSxDQUFDO2FBQ1I7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsWUFBWTtBQUVaLHdCQUF3QjtBQUV4QixNQUFlLGdCQUFpQixTQUFRLHNCQUFzQjtJQUVuRCx3QkFBd0IsQ0FBQyxJQUE0QjtRQUM5RCxPQUFPLElBQUk7WUFDVixDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxlQUFlLEVBQUUsK0JBQStCLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQztZQUMzRSxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO0lBQ2hFLENBQUM7SUFFUyxzQkFBc0IsQ0FBQyxNQUF5QjtRQUN6RCxPQUFPLE1BQU0sQ0FBQyxTQUFTLG9DQUEyQixDQUFDLDJCQUEyQixDQUFDO0lBQ2hGLENBQUM7SUFFUyxrQkFBa0IsQ0FBQyxNQUF5QjtRQUNyRCxPQUFPLE1BQU0sQ0FBQyxTQUFTLG9DQUEyQixDQUFDLGtCQUFrQixDQUFDO0lBQ3ZFLENBQUM7Q0FDRDtBQUVELGVBQWUsQ0FBQyxNQUFNLG9CQUFxQixTQUFRLGdCQUFnQjtJQUVsRTtRQUNDLEtBQUssQ0FBQztZQUNMLFVBQVUsRUFBRSxLQUFLO1lBQ2pCLFVBQVUsRUFBRSxLQUFLO1lBQ2pCLFdBQVcsRUFBRSxLQUFLO1NBQ2xCLEVBQUU7WUFDRixFQUFFLEVBQUUsOEJBQThCO1lBQ2xDLEtBQUssRUFBRTtnQkFDTixHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsc0JBQXNCLEVBQUUsa0JBQWtCLENBQUM7Z0JBQzVELGFBQWEsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLGlCQUFpQixFQUFFLE9BQU8sRUFBRSxDQUFDLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxvQkFBb0IsQ0FBQzthQUNqSDtZQUNELFlBQVksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUMvQixpQkFBaUIsQ0FBQyxvQkFBb0IsRUFDdEMsV0FBVyxDQUFDLGVBQWUsRUFDM0IsaUJBQWlCLENBQUMsa0JBQWtCLENBQUMsU0FBUyxFQUFFLENBQ2hEO1lBQ0QsVUFBVSxFQUFFO2dCQUNYLElBQUksRUFBRSxpQkFBaUIsQ0FBQyxlQUFlO2dCQUN2QyxPQUFPLEVBQUUsOENBQTBCO2dCQUNuQyxNQUFNLDBDQUFnQzthQUN0QztZQUNELElBQUksRUFBRSxDQUFDO29CQUNOLEVBQUUsRUFBRSxNQUFNLENBQUMsYUFBYTtvQkFDeEIsS0FBSyxFQUFFLFlBQVk7b0JBQ25CLEtBQUssRUFBRSxJQUFJO2lCQUNYLEVBQUU7b0JBQ0YsRUFBRSxFQUFFLE1BQU0sQ0FBQyxhQUFhO29CQUN4QixZQUFZLEVBQUUsSUFBSTtvQkFDbEIsS0FBSyxFQUFFLGNBQWM7b0JBQ3JCLEtBQUssRUFBRSxDQUFDO2lCQUNSLENBQUM7U0FDRixDQUFDLENBQUM7SUFDSixDQUFDO0lBRVMsS0FBSyxDQUFDLGlCQUFpQixDQUFDLHVCQUFpRCxFQUFFLEtBQWlCLEVBQUUsUUFBK0IsRUFBRSxLQUF3QjtRQUNoSyxPQUFPLElBQUksZUFBZSxDQUFDLE1BQU0sdUJBQXVCLENBQUMsdUJBQXVCLENBQUMsaUJBQWlCLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLFlBQVksQ0FBQyxDQUFDLENBQUM7SUFDcEwsQ0FBQztDQUNELENBQUMsQ0FBQztBQUVILGVBQWUsQ0FBQyxNQUFNLG9CQUFxQixTQUFRLGdCQUFnQjtJQUVsRTtRQUNDLEtBQUssQ0FBQztZQUNMLFVBQVUsRUFBRSxLQUFLO1lBQ2pCLFVBQVUsRUFBRSxJQUFJO1lBQ2hCLFdBQVcsRUFBRSxLQUFLO1NBQ2xCLEVBQUU7WUFDRixFQUFFLEVBQUUsdUNBQXVDO1lBQzNDLEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLHlCQUF5QixFQUFFLGlCQUFpQixDQUFDO1lBQ2xFLFlBQVksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUMvQixpQkFBaUIsQ0FBQyxvQkFBb0IsRUFDdEMsV0FBVyxDQUFDLGVBQWUsRUFDM0IsaUJBQWlCLENBQUMsa0JBQWtCLENBQUMsU0FBUyxFQUFFLENBQ2hEO1lBQ0QsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsaUJBQWlCO2dCQUM1QixLQUFLLEVBQUUsTUFBTTtnQkFDYixLQUFLLEVBQUUsQ0FBQzthQUNSO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVTLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyx1QkFBaUQsRUFBRSxLQUFpQixFQUFFLFFBQStCLEVBQUUsS0FBd0I7UUFDaEssT0FBTyxJQUFJLGVBQWUsQ0FBQyxNQUFNLHVCQUF1QixDQUFDLHVCQUF1QixDQUFDLGlCQUFpQixFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDO0lBQ3JMLENBQUM7Q0FDRCxDQUFDLENBQUM7QUFFSCxZQUFZO0FBR1osMENBQTBDO0FBRTFDLE1BQU0seUJBQTBCLFNBQVEsc0JBQXNCO0lBRTdELFlBQ0MsTUFBb0MsRUFDbkIsV0FBdUIsRUFDdkIsc0JBQXNEO1FBRXZFLEtBQUssQ0FBQyxNQUFNLEVBQUU7WUFDYixFQUFFLEVBQUUsNEJBQTRCO1lBQ2hDLEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLGVBQWUsRUFBRSxrQkFBa0IsQ0FBQztZQUN6RCxZQUFZLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FDL0IsV0FBVyxDQUFDLGVBQWUsRUFDM0IsaUJBQWlCLENBQUMsa0JBQWtCLENBQUMsU0FBUyxFQUFFLENBQ2hEO1NBQ0QsQ0FBQyxDQUFDO1FBVmMsZ0JBQVcsR0FBWCxXQUFXLENBQVk7UUFDdkIsMkJBQXNCLEdBQXRCLHNCQUFzQixDQUFnQztJQVV4RSxDQUFDO0lBRVMsS0FBSyxDQUFDLGlCQUFpQixDQUFDLHVCQUFpRCxFQUFFLE1BQWtCLEVBQUUsU0FBZ0MsRUFBRSxNQUF5QjtRQUNuSyxPQUFPLElBQUksZUFBZSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxlQUFlLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQztJQUMxRixDQUFDO0lBRVMsd0JBQXdCLENBQUMsSUFBNEI7UUFDOUQsT0FBTyxJQUFJLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxzQkFBc0IsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQzFGLENBQUM7SUFFUyxrQkFBa0IsQ0FBQyxNQUF5QjtRQUNyRCxPQUFPLElBQUksQ0FBQyxzQkFBc0IsSUFBSSxNQUFNLENBQUMsU0FBUyxvQ0FBMkIsQ0FBQyxrQkFBa0IsQ0FBQztJQUN0RyxDQUFDO0lBRVMsc0JBQXNCO1FBQy9CLE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7Q0FDRDtBQUVELGdCQUFnQixDQUFDLGVBQWUsQ0FBQztJQUNoQyxFQUFFLEVBQUUsNkJBQTZCO0lBQ2pDLFFBQVEsRUFBRTtRQUNULFdBQVcsRUFBRSwyQ0FBMkM7UUFDeEQsSUFBSSxFQUFFO1lBQ0wsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxxQ0FBcUMsRUFBRSxVQUFVLEVBQUUsR0FBRyxFQUFFO1lBQ3BGLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsZ0NBQWdDLEVBQUUsVUFBVSxFQUFFLFlBQVksQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFO1lBQ2xILEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsd0JBQXdCLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRTtZQUMvRSxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsV0FBVyxFQUFFLHlGQUF5RixFQUFFO1lBQzVILEVBQUUsSUFBSSxFQUFFLGtCQUFrQixFQUFFLFdBQVcsRUFBRSw0REFBNEQsRUFBRTtTQUN2RztLQUNEO0lBQ0QsT0FBTyxFQUFFLEtBQUssRUFBRSxRQUEwQixFQUFFLFFBQWEsRUFBRSxRQUFhLEVBQUUsVUFBZSxFQUFFLFFBQWMsRUFBRSxnQkFBeUIsRUFBRSxVQUFvQixFQUFFLEVBQUU7UUFDN0osVUFBVSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUNoQyxVQUFVLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUN4RCxVQUFVLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBQ3RDLFVBQVUsQ0FBQyxPQUFPLFFBQVEsS0FBSyxXQUFXLElBQUksT0FBTyxRQUFRLEtBQUssUUFBUSxDQUFDLENBQUM7UUFDNUUsVUFBVSxDQUFDLE9BQU8sVUFBVSxLQUFLLFdBQVcsSUFBSSxPQUFPLFVBQVUsS0FBSyxTQUFTLENBQUMsQ0FBQztRQUVqRixNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDdkQsTUFBTSxNQUFNLEdBQUcsTUFBTSxhQUFhLENBQUMsY0FBYyxDQUFDLEVBQUUsUUFBUSxFQUFFLEVBQUUsYUFBYSxDQUFDLG9CQUFvQixFQUFFLENBQUMsQ0FBQztRQUV0RyxJQUFJLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQzFCLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDN0IsTUFBTSxDQUFDLHVDQUF1QyxDQUFDLFFBQVEsNEJBQW9CLENBQUM7WUFFNUUsT0FBTyxNQUFNLENBQUMsbUJBQW1CLENBQUMsUUFBUSxDQUFDLEVBQUU7Z0JBQzVDLE1BQU0sT0FBTyxHQUFHLElBQUksS0FBTSxTQUFRLHlCQUF5QjtvQkFDdkMsd0JBQXdCLENBQUMsSUFBNEI7d0JBQ3ZFLE9BQU8sZ0JBQWdCLElBQUksS0FBSyxDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQyxDQUFDO29CQUNqRSxDQUFDO2lCQUNELENBQUM7b0JBQ0QsV0FBVyxFQUFFLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDO29CQUN2QyxVQUFVLEVBQUUsT0FBTyxDQUFDLFVBQVUsQ0FBQztvQkFDL0IsVUFBVSxFQUFFLEtBQUs7aUJBQ2pCLEVBQUUsVUFBVSxFQUFFLFFBQThCLENBQUMsQ0FBQztnQkFFL0MsUUFBUSxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUN2RixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUM7SUFDRixDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsZ0JBQWdCLENBQUMsZUFBZSxDQUFDO0lBQ2hDLEVBQUUsRUFBRSw2QkFBNkI7SUFDakMsUUFBUSxFQUFFO1FBQ1QsV0FBVyxFQUFFLDBDQUEwQztRQUN2RCxJQUFJLEVBQUU7WUFDTCxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLHFDQUFxQyxFQUFFLFVBQVUsRUFBRSxHQUFHLEVBQUU7WUFDcEYsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxnQ0FBZ0MsRUFBRSxVQUFVLEVBQUUsWUFBWSxDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUU7WUFDbEgsRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBRSx3QkFBd0IsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFO1lBQy9FLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUseUZBQXlGLEVBQUU7U0FDNUg7S0FDRDtJQUNELE9BQU8sRUFBRSxLQUFLLEVBQUUsUUFBMEIsRUFBRSxRQUFhLEVBQUUsUUFBYSxFQUFFLFVBQWUsRUFBRSxRQUFjLEVBQUUsRUFBRTtRQUM1RyxRQUFRLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDLGNBQWMsQ0FBQyw2QkFBNkIsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3hJLENBQUM7Q0FDRCxDQUFDLENBQUM7QUFFSCxZQUFZO0FBR1osK0NBQStDO0FBRS9DLGdCQUFnQixDQUFDLGVBQWUsQ0FBQztJQUNoQyxFQUFFLEVBQUUsOEJBQThCO0lBQ2xDLE9BQU8sRUFBRSxDQUFDLFFBQTBCLEVBQUUsUUFBYSxFQUFFLFFBQWEsRUFBRSxFQUFFO1FBQ3JFLFVBQVUsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDaEMsVUFBVSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFFeEQsTUFBTSx1QkFBdUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHdCQUF3QixDQUFDLENBQUM7UUFDdkUsTUFBTSxpQkFBaUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDM0QsT0FBTyxpQkFBaUIsQ0FBQyxjQUFjLENBQUMsRUFBRSxRQUFRLEVBQUUsRUFBRSxpQkFBaUIsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFO1lBQzlHLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQztnQkFDbkQsT0FBTyxTQUFTLENBQUM7WUFDbEIsQ0FBQztZQUVELE1BQU0sVUFBVSxHQUFHLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNyRCxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ2pCLE9BQU8sU0FBUyxDQUFDO1lBQ2xCLENBQUM7WUFFRCxNQUFNLFVBQVUsR0FBRyx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLHVCQUF1QixDQUFDLHVCQUF1QixDQUFDLGlCQUFpQixFQUFFLE9BQU8sQ0FBQyxRQUFRLEVBQUUsRUFBRSxZQUFZLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLElBQUksZUFBZSxDQUFDLFVBQVUsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwUyxNQUFNLEtBQUssR0FBRyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLFVBQVUsRUFBRSxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDcEcsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsS0FBSyxFQUFFLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQzNFLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNELENBQUMsQ0FBQztBQUVILGtCQUFrQjtBQUNsQixnQkFBZ0IsQ0FBQyxvQkFBb0IsQ0FBQyw4QkFBOEIsRUFBRSw2QkFBNkIsQ0FBQyxDQUFDO0FBRXJHLFlBQVkifQ==