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
var LanguageDetectionStatusContribution_1;
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { getCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { localize, localize2 } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IStatusbarService } from '../../../services/statusbar/browser/statusbar.js';
import { ILanguageDetectionService, LanguageDetectionLanguageEventSource } from '../../../services/languageDetection/common/languageDetectionWorkerService.js';
import { ThrottledDelayer } from '../../../../base/common/async.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { NOTEBOOK_EDITOR_EDITABLE } from '../../notebook/common/notebookContextKeys.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { Schemas } from '../../../../base/common/network.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
const detectLanguageCommandId = 'editor.detectLanguage';
let LanguageDetectionStatusContribution = class LanguageDetectionStatusContribution {
    static { LanguageDetectionStatusContribution_1 = this; }
    static { this._id = 'status.languageDetectionStatus'; }
    constructor(_languageDetectionService, _statusBarService, _configurationService, _editorService, _languageService, _keybindingService) {
        this._languageDetectionService = _languageDetectionService;
        this._statusBarService = _statusBarService;
        this._configurationService = _configurationService;
        this._editorService = _editorService;
        this._languageService = _languageService;
        this._keybindingService = _keybindingService;
        this._disposables = new DisposableStore();
        this._delayer = new ThrottledDelayer(1000);
        this._renderDisposables = new DisposableStore();
        _editorService.onDidActiveEditorChange(() => this._update(true), this, this._disposables);
        this._update(false);
    }
    dispose() {
        this._disposables.dispose();
        this._delayer.dispose();
        this._combinedEntry?.dispose();
        this._renderDisposables.dispose();
    }
    _update(clear) {
        if (clear) {
            this._combinedEntry?.dispose();
            this._combinedEntry = undefined;
        }
        this._delayer.trigger(() => this._doUpdate());
    }
    async _doUpdate() {
        const editor = getCodeEditor(this._editorService.activeTextEditorControl);
        this._renderDisposables.clear();
        // update when editor language changes
        editor?.onDidChangeModelLanguage(() => this._update(true), this, this._renderDisposables);
        editor?.onDidChangeModelContent(() => this._update(false), this, this._renderDisposables);
        const editorModel = editor?.getModel();
        const editorUri = editorModel?.uri;
        const existingId = editorModel?.getLanguageId();
        const enablementConfig = this._configurationService.getValue('workbench.editor.languageDetectionHints');
        const enabled = typeof enablementConfig === 'object' && enablementConfig?.untitledEditors;
        const disableLightbulb = !enabled || editorUri?.scheme !== Schemas.untitled || !existingId;
        if (disableLightbulb || !editorUri) {
            this._combinedEntry?.dispose();
            this._combinedEntry = undefined;
        }
        else {
            const lang = await this._languageDetectionService.detectLanguage(editorUri);
            const skip = { 'jsonc': 'json' };
            const existing = editorModel.getLanguageId();
            if (lang && lang !== existing && skip[existing] !== lang) {
                const detectedName = this._languageService.getLanguageName(lang) || lang;
                const tooltip = this._keybindingService.appendKeybinding(localize('status.autoDetectLanguage', "Accept Detected Language: {0}", detectedName), detectLanguageCommandId);
                const props = {
                    name: localize('langDetection.name', "Language Detection"),
                    ariaLabel: localize('langDetection.aria', "Change to Detected Language: {0}", lang),
                    tooltip,
                    command: detectLanguageCommandId,
                    text: '$(lightbulb-autofix)',
                };
                if (!this._combinedEntry) {
                    this._combinedEntry = this._statusBarService.addEntry(props, LanguageDetectionStatusContribution_1._id, 1 /* StatusbarAlignment.RIGHT */, { location: { id: 'status.editor.mode', priority: 100.1 }, alignment: 1 /* StatusbarAlignment.RIGHT */, compact: true });
                }
                else {
                    this._combinedEntry.update(props);
                }
            }
            else {
                this._combinedEntry?.dispose();
                this._combinedEntry = undefined;
            }
        }
    }
};
LanguageDetectionStatusContribution = LanguageDetectionStatusContribution_1 = __decorate([
    __param(0, ILanguageDetectionService),
    __param(1, IStatusbarService),
    __param(2, IConfigurationService),
    __param(3, IEditorService),
    __param(4, ILanguageService),
    __param(5, IKeybindingService)
], LanguageDetectionStatusContribution);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(LanguageDetectionStatusContribution, 3 /* LifecyclePhase.Restored */);
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: detectLanguageCommandId,
            title: localize2('detectlang', "Detect Language from Content"),
            f1: true,
            precondition: ContextKeyExpr.and(NOTEBOOK_EDITOR_EDITABLE.toNegated(), EditorContextKeys.editorTextFocus),
            keybinding: { primary: 34 /* KeyCode.KeyD */ | 512 /* KeyMod.Alt */ | 1024 /* KeyMod.Shift */, weight: 200 /* KeybindingWeight.WorkbenchContrib */ }
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const languageDetectionService = accessor.get(ILanguageDetectionService);
        const editor = getCodeEditor(editorService.activeTextEditorControl);
        const notificationService = accessor.get(INotificationService);
        const editorUri = editor?.getModel()?.uri;
        if (editorUri) {
            const lang = await languageDetectionService.detectLanguage(editorUri);
            if (lang) {
                editor.getModel()?.setLanguage(lang, LanguageDetectionLanguageEventSource);
            }
            else {
                notificationService.warn(localize('noDetection', "Unable to detect editor language"));
            }
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VEZXRlY3Rpb24uY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbGFuZ3VhZ2VEZXRlY3Rpb24vYnJvd3Nlci9sYW5ndWFnZURldGVjdGlvbi5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFtQyxVQUFVLElBQUksbUJBQW1CLEVBQTBCLE1BQU0sa0NBQWtDLENBQUM7QUFDOUksT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBRWxGLE9BQU8sRUFBNEMsaUJBQWlCLEVBQXNCLE1BQU0sa0RBQWtELENBQUM7QUFDbkosT0FBTyxFQUFFLHlCQUF5QixFQUErQixvQ0FBb0MsRUFBRSxNQUFNLDhFQUE4RSxDQUFDO0FBQzVMLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRTFGLE9BQU8sRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDMUYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxN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