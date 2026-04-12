/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var RenameController_1;
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { raceCancellation } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError, onUnexpectedError } from '../../../../base/common/errors.js';
import { isMarkdownString } from '../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { assertType } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Extensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IEditorProgressService } from '../../../../platform/progress/common/progress.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorAction, EditorCommand, registerEditorAction, registerEditorCommand, registerEditorContribution, registerModelAndPositionCommand } from '../../../browser/editorExtensions.js';
import { IBulkEditService } from '../../../browser/services/bulkEditService.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { NewSymbolNameTriggerKind } from '../../../common/languages.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { ITextResourceConfigurationService } from '../../../common/services/textResourceConfiguration.js';
import { EditSources } from '../../../common/textModelEditSource.js';
import { EditorStateCancellationTokenSource } from '../../editorState/browser/editorState.js';
import { MessageController } from '../../message/browser/messageController.js';
import { CONTEXT_RENAME_INPUT_VISIBLE, RenameWidget } from './renameWidget.js';
class RenameSkeleton {
    constructor(model, position, registry) {
        this.model = model;
        this.position = position;
        this._providerRenameIdx = 0;
        this._providers = registry.ordered(model);
    }
    hasProvider() {
        return this._providers.length > 0;
    }
    async resolveRenameLocation(token) {
        const rejects = [];
        for (this._providerRenameIdx = 0; this._providerRenameIdx < this._providers.length; this._providerRenameIdx++) {
            const provider = this._providers[this._providerRenameIdx];
            if (!provider.resolveRenameLocation) {
                break;
            }
            const res = await provider.resolveRenameLocation(this.model, this.position, token);
            if (!res) {
                continue;
            }
            if (res.rejectReason) {
                rejects.push(res.rejectReason);
                continue;
            }
            return res;
        }
        // we are here when no provider prepared a location which means we can
        // just rely on the word under cursor and start with the first provider
        this._providerRenameIdx = 0;
        const word = this.model.getWordAtPosition(this.position);
        if (!word) {
            return {
                range: Range.fromPositions(this.position),
                text: '',
                rejectReason: rejects.length > 0 ? rejects.join('\n') : undefined
            };
        }
        return {
            range: new Range(this.position.lineNumber, word.startColumn, this.position.lineNumber, word.endColumn),
            text: word.word,
            rejectReason: rejects.length > 0 ? rejects.join('\n') : undefined
        };
    }
    async provideRenameEdits(newName, token) {
        return this._provideRenameEdits(newName, this._providerRenameIdx, [], token);
    }
    async _provideRenameEdits(newName, i, rejects, token) {
        const provider = this._providers[i];
        if (!provider) {
            return {
                edits: [],
                rejectReason: rejects.join('\n')
            };
        }
        const result = await provider.provideRenameEdits(this.model, this.position, newName, token);
        if (!result) {
            return this._provideRenameEdits(newName, i + 1, rejects.concat(nls.localize('no result', "No result.")), token);
        }
        else if (result.rejectReason) {
            return this._provideRenameEdits(newName, i + 1, rejects.concat(result.rejectReason), token);
        }
        return result;
    }
}
export function hasProvider(registry, model) {
    const providers = registry.ordered(model);
    return providers.length > 0;
}
export async function prepareRename(registry, model, position, cancellationToken) {
    const skeleton = new RenameSkeleton(model, position, registry);
    return skeleton.resolveRenameLocation(cancellationToken ?? CancellationToken.None);
}
export async function rawRename(registry, model, position, newName, cancellationToken) {
    const skeleton = new RenameSkeleton(model, position, registry);
    return skeleton.provideRenameEdits(newName, cancellationToken ?? CancellationToken.None);
}
export async function rename(registry, model, position, newName) {
    const skeleton = new RenameSkeleton(model, position, registry);
    const loc = await skeleton.resolveRenameLocation(CancellationToken.None);
    if (loc?.rejectReason) {
        return { edits: [], rejectReason: loc.rejectReason };
    }
    return skeleton.provideRenameEdits(newName, CancellationToken.None);
}
// ---  register actions and commands
let RenameController = class RenameController {
    static { RenameController_1 = this; }
    static { this.ID = 'editor.contrib.renameController'; }
    static get(editor) {
        return editor.getContribution(RenameController_1.ID);
    }
    constructor(editor, _instaService, _notificationService, _bulkEditService, _progressService, _logService, _configService, _languageFeaturesService) {
        this.editor = editor;
        this._instaService = _instaService;
        this._notificationService = _notificationService;
        this._bulkEditService = _bulkEditService;
        this._progressService = _progressService;
        this._logService = _logService;
        this._configService = _configService;
        this._languageFeaturesService = _languageFeaturesService;
        this._disposableStore = new DisposableStore();
        this._cts = new CancellationTokenSource();
        this._renameWidget = this._disposableStore.add(this._instaService.createInstance(RenameWidget, this.editor, ['acceptRenameInput', 'acceptRenameInputWithPreview']));
    }
    dispose() {
        this._disposableStore.dispose();
        this._cts.dispose(true);
    }
    async run() {
        const trace = this._logService.trace.bind(this._logService, '[rename]');
        // set up cancellation token to prevent reentrant rename, this
        // is the parent to the resolve- and rename-tokens
        this._cts.dispose(true);
        this._cts = new CancellationTokenSource();
        if (!this.editor.hasModel()) {
            trace('editor has no model');
            return undefined;
        }
        const position = this.editor.getPosition();
        const skeleton = new RenameSkeleton(this.editor.getModel(), position, this._languageFeaturesService.renameProvider);
        if (!skeleton.hasProvider()) {
            trace('skeleton has no provider');
            return undefined;
        }
        // part 1 - resolve rename location
        const cts1 = new EditorStateCancellationTokenSource(this.editor, 4 /* CodeEditorStateFlag.Position */ | 1 /* CodeEditorStateFlag.Value */, undefined, this._cts.token);
        let loc;
        try {
            trace('resolving rename location');
            const resolveLocationOperation = skeleton.resolveRenameLocation(cts1.token);
            this._progressService.showWhile(resolveLocationOperation, 250);
            loc = await resolveLocationOperation;
            trace('resolved rename location');
        }
        catch (e) {
            if (e instanceof CancellationError) {
                trace('resolve rename location cancelled', JSON.stringify(e, null, '\t'));
            }
            else {
                trace('resolve rename location failed', e instanceof Error ? e : JSON.stringify(e, null, '\t'));
                if (typeof e === 'string' || isMarkdownString(e)) {
                    MessageController.get(this.editor)?.showMessage(e || nls.localize('resolveRenameLocationFailed', "An unknown error occurred while resolving rename location"), position);
                }
            }
            return undefined;
        }
        finally {
            cts1.dispose();
        }
        if (!loc) {
            trace('returning early - no loc');
            return undefined;
        }
        if (loc.rejectReason) {
            trace(`returning early - rejected with reason: ${loc.rejectReason}`, loc.rejectReason);
            MessageController.get(this.editor)?.showMessage(loc.rejectReason, position);
            return undefined;
        }
        if (cts1.token.isCancellationRequested) {
            trace('returning early - cts1 cancelled');
            return undefined;
        }
        // part 2 - do rename at location
        const cts2 = new EditorStateCancellationTokenSource(this.editor, 4 /* CodeEditorStateFlag.Position */ | 1 /* CodeEditorStateFlag.Value */, loc.range, this._cts.token);
        const model = this.editor.getModel(); // @ulugbekna: assumes editor still has a model, otherwise, cts1 should've been cancelled
        const newSymbolNamesProviders = this._languageFeaturesService.newSymbolNamesProvider.all(model);
        const resolvedNewSymbolnamesProviders = await Promise.all(newSymbolNamesProviders.map(async (p) => [p, await p.supportsAutomaticNewSymbolNamesTriggerKind ?? false]));
        const requestRenameSuggestions = (triggerKind, cts) => {
            let providers = resolvedNewSymbolnamesProviders.slice();
            if (triggerKind === NewSymbolNameTriggerKind.Automatic) {
                providers = providers.filter(([_, supportsAutomatic]) => supportsAutomatic);
            }
            return providers.map(([p,]) => p.provideNewSymbolNames(model, loc.range, triggerKind, cts));
        };
        trace('creating rename input field and awaiting its result');
        const supportPreview = this._bulkEditService.hasPreviewHandler() && this._configService.getValue(this.editor.getModel().uri, 'editor.rename.enablePreview');
        const inputFieldResult = await this._renameWidget.getInput(loc.range, loc.text, supportPreview, newSymbolNamesProviders.length > 0 ? requestRenameSuggestions : undefined, cts2);
        trace('received response from rename input field');
        // no result, only hint to focus the editor or not
        if (typeof inputFieldResult === 'boolean') {
            trace(`returning early - rename input field response - ${inputFieldResult}`);
            if (inputFieldResult) {
                this.editor.focus();
            }
            cts2.dispose();
            return undefined;
        }
        this.editor.focus();
        trace('requesting rename edits');
        const renameOperation = raceCancellation(skeleton.provideRenameEdits(inputFieldResult.newName, cts2.token), cts2.token).then(async (renameResult) => {
            if (!renameResult) {
                trace('returning early - no rename edits result');
                return;
            }
            if (!this.editor.hasModel()) {
                trace('returning early - no model after rename edits are provided');
                return;
            }
            if (renameResult.rejectReason) {
                trace(`returning early - rejected with reason: ${renameResult.rejectReason}`);
                this._notificationService.info(renameResult.rejectReason);
                return;
            }
            // collapse selection to active end
            this.editor.setSelection(Range.fromPositions(this.editor.getSelection().getPosition()));
            trace('applying edits');
            this._bulkEditService.apply(renameResult, {
                editor: this.editor,
                showPreview: inputFieldResult.wantsPreview,
                label: nls.localize('label', "Renaming '{0}' to '{1}'", loc?.text, inputFieldResult.newName),
                code: 'undoredo.rename',
                quotableLabel: nls.localize('quotableLabel', "Renaming {0} to {1}", loc?.text, inputFieldResult.newName),
                respectAutoSaveConfig: true,
                reason: EditSources.rename(loc?.text, inputFieldResult.newName),
            }).then(result => {
                trace('edits applied');
                if (result.ariaSummary) {
                    alert(nls.localize('aria', "Successfully renamed '{0}' to '{1}'. Summary: {2}", loc.text, inputFieldResult.newName, result.ariaSummary));
                }
            }).catch(err => {
                trace(`error when applying edits ${JSON.stringify(err, null, '\t')}`);
                this._notificationService.error(nls.localize('rename.failedApply', "Rename failed to apply edits"));
                this._logService.error(err);
            });
        }, err => {
            trace('error when providing rename edits', JSON.stringify(err, null, '\t'));
            this._notificationService.error(nls.localize('rename.failed', "Rename failed to compute edits"));
            this._logService.error(err);
        }).finally(() => {
            cts2.dispose();
        });
        trace('returning rename operation');
        this._progressService.showWhile(renameOperation, 250);
        return renameOperation;
    }
    acceptRenameInput(wantsPreview) {
        this._renameWidget.acceptInput(wantsPreview);
    }
    cancelRenameInput() {
        this._renameWidget.cancelInput(true, 'cancelRenameInput command');
    }
    focusNextRenameSuggestion() {
        this._renameWidget.focusNextRenameSuggestion();
    }
    focusPreviousRenameSuggestion() {
        this._renameWidget.focusPreviousRenameSuggestion();
    }
};
RenameController = RenameController_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, INotificationService),
    __param(3, IBulkEditService),
    __param(4, IEditorProgressService),
    __param(5, ILogService),
    __param(6, ITextResourceConfigurationService),
    __param(7, ILanguageFeaturesService)
], RenameController);
// ---- action implementation
export class RenameAction extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.rename',
            label: nls.localize2('rename.label', "Rename Symbol"),
            precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasRenameProvider),
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: 60 /* KeyCode.F2 */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            contextMenuOpts: {
                group: '1_modification',
                order: 1.1
            },
            canTriggerInlineEdits: true,
        });
    }
    runCommand(accessor, args) {
        const editorService = accessor.get(ICodeEditorService);
        const [uri, pos] = Array.isArray(args) && args || [undefined, undefined];
        if (URI.isUri(uri) && Position.isIPosition(pos)) {
            return editorService.openCodeEditor({ resource: uri }, editorService.getActiveCodeEditor()).then(editor => {
                if (!editor) {
                    return;
                }
                editor.setPosition(pos);
                editor.invokeWithinContext(accessor => {
                    this.reportTelemetry(accessor, editor);
                    return this.run(accessor, editor);
                });
            }, onUnexpectedError);
        }
        return super.runCommand(accessor, args);
    }
    run(accessor, editor) {
        const logService = accessor.get(ILogService);
        const controller = RenameController.get(editor);
        if (controller) {
            logService.trace('[RenameAction] got controller, running...');
            return controller.run();
        }
        logService.trace('[RenameAction] returning early - controller missing');
        return Promise.resolve();
    }
}
registerEditorContribution(RenameController.ID, RenameController, 4 /* EditorContributionInstantiation.Lazy */);
registerEditorAction(RenameAction);
const RenameCommand = EditorCommand.bindToContribution(RenameController.get);
registerEditorCommand(new RenameCommand({
    id: 'acceptRenameInput',
    precondition: CONTEXT_RENAME_INPUT_VISIBLE,
    handler: x => x.acceptRenameInput(false),
    kbOpts: {
        weight: 100 /* KeybindingWeight.EditorContrib */ + 99,
        kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, ContextKeyExpr.not('isComposing')),
        primary: 3 /* KeyCode.Enter */
    }
}));
registerEditorCommand(new RenameCommand({
    id: 'acceptRenameInputWithPreview',
    precondition: ContextKeyExpr.and(CONTEXT_RENAME_INPUT_VISIBLE, ContextKeyExpr.has('config.editor.rename.enablePreview')),
    handler: x => x.acceptRenameInput(true),
    kbOpts: {
        weight: 100 /* KeybindingWeight.EditorContrib */ + 99,
        kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, ContextKeyExpr.not('isComposing')),
        primary: 2048 /* KeyMod.CtrlCmd */ + 3 /* KeyCode.Enter */
    }
}));
registerEditorCommand(new RenameCommand({
    id: 'cancelRenameInput',
    precondition: CONTEXT_RENAME_INPUT_VISIBLE,
    handler: x => x.cancelRenameInput(),
    kbOpts: {
        weight: 100 /* KeybindingWeight.EditorContrib */ + 99,
        kbExpr: EditorContextKeys.focus,
        primary: 9 /* KeyCode.Escape */,
        secondary: [1024 /* KeyMod.Shift */ | 9 /* KeyCode.Escape */]
    }
}));
registerAction2(class FocusNextRenameSuggestion extends Action2 {
    constructor() {
        super({
            id: 'focusNextRenameSuggestion',
            title: {
                ...nls.localize2('focusNextRenameSuggestion', "Focus Next Rename Suggestion"),
            },
            precondition: CONTEXT_RENAME_INPUT_VISIBLE,
            keybinding: [
                {
                    primary: 18 /* KeyCode.DownArrow */,
                    weight: 100 /* KeybindingWeight.EditorContrib */ + 99,
                }
            ]
        });
    }
    run(accessor) {
        const currentEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
        if (!currentEditor) {
            return;
        }
        const controller = RenameController.get(currentEditor);
        if (!controller) {
            return;
        }
        controller.focusNextRenameSuggestion();
    }
});
registerAction2(class FocusPreviousRenameSuggestion extends Action2 {
    constructor() {
        super({
            id: 'focusPreviousRenameSuggestion',
            title: {
                ...nls.localize2('focusPreviousRenameSuggestion', "Focus Previous Rename Suggestion"),
            },
            precondition: CONTEXT_RENAME_INPUT_VISIBLE,
            keybinding: [
                {
                    primary: 16 /* KeyCode.UpArrow */,
                    weight: 100 /* KeybindingWeight.EditorContrib */ + 99,
                }
            ]
        });
    }
    run(accessor) {
        const currentEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
        if (!currentEditor) {
            return;
        }
        const controller = RenameController.get(currentEditor);
        if (!controller) {
            return;
        }
        controller.focusPreviousRenameSuggestion();
    }
});
// ---- api bridge command
registerModelAndPositionCommand('_executeDocumentRenameProvider', function (accessor, model, position, ...args) {
    const [newName] = args;
    assertType(typeof newName === 'string');
    const { renameProvider } = accessor.get(ILanguageFeaturesService);
    return rename(renameProvider, model, position, newName);
});
registerModelAndPositionCommand('_executePrepareRename', async function (accessor, model, position) {
    const { renameProvider } = accessor.get(ILanguageFeaturesService);
    const skeleton = new RenameSkeleton(model, position, renameProvider);
    const loc = await skeleton.resolveRenameLocation(CancellationToken.None);
    if (loc?.rejectReason) {
        throw new Error(loc.rejectReason);
    }
    return loc;
});
//todo@jrieken use editor options world
Registry.as(Extensions.Configuration).registerConfiguration({
    id: 'editor',
    properties: {
        'editor.rename.enablePreview': {
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */,
            description: nls.localize('enablePreview', "Enable/disable the ability to preview changes before renaming"),
            default: true,
            type: 'boolean'
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVuYW1lLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvcmVuYW1lL2Jyb3dzZXIvcmVuYW1lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDakUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDcEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDekYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFMUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzFGLE9BQU8sRUFBc0IsVUFBVSxFQUEwQixNQUFNLG9FQUFvRSxDQUFDO0FBQzVJLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUVuRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDaEcsT0FBTyxFQUFFLHNCQUFz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