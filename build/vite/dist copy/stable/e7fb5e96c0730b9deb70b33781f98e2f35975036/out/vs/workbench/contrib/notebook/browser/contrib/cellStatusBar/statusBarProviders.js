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
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions } from '../../../../../common/contributions.js';
import { CHANGE_CELL_LANGUAGE, DETECT_CELL_LANGUAGE } from '../../notebookBrowser.js';
import { INotebookCellStatusBarService } from '../../../common/notebookCellStatusBarService.js';
import { CellKind } from '../../../common/notebookCommon.js';
import { INotebookKernelService } from '../../../common/notebookKernelService.js';
import { INotebookService } from '../../../common/notebookService.js';
import { ILanguageDetectionService } from '../../../../../services/languageDetection/common/languageDetectionWorkerService.js';
let CellStatusBarLanguagePickerProvider = class CellStatusBarLanguagePickerProvider {
    constructor(_notebookService, _languageService) {
        this._notebookService = _notebookService;
        this._languageService = _languageService;
        this.viewType = '*';
    }
    async provideCellStatusBarItems(uri, index, _token) {
        const doc = this._notebookService.getNotebookTextModel(uri);
        const cell = doc?.cells[index];
        if (!cell) {
            return;
        }
        const statusBarItems = [];
        let displayLanguage = cell.language;
        if (cell.cellKind === CellKind.Markup) {
            displayLanguage = 'markdown';
        }
        else {
            const registeredId = this._languageService.getLanguageIdByLanguageName(cell.language);
            if (registeredId) {
                displayLanguage = this._languageService.getLanguageName(displayLanguage) ?? displayLanguage;
            }
            else {
                // add unregistered lanugage warning item
                const searchTooltip = localize('notebook.cell.status.searchLanguageExtensions', "Unknown cell language. Click to search for '{0}' extensions", cell.language);
                statusBarItems.push({
                    text: `$(dialog-warning)`,
                    command: { id: 'workbench.extensions.search', arguments: [`@tag:${cell.language}`], title: 'Search Extensions' },
                    tooltip: searchTooltip,
                    alignment: 2 /* CellStatusbarAlignment.Right */,
                    priority: -Number.MAX_SAFE_INTEGER + 1
                });
            }
        }
        statusBarItems.push({
            text: displayLanguage,
            command: CHANGE_CELL_LANGUAGE,
            tooltip: localize('notebook.cell.status.language', "Select Cell Language Mode"),
            alignment: 2 /* CellStatusbarAlignment.Right */,
            priority: -Number.MAX_SAFE_INTEGER
        });
        return {
            items: statusBarItems
        };
    }
};
CellStatusBarLanguagePickerProvider = __decorate([
    __param(0, INotebookService),
    __param(1, ILanguageService)
], CellStatusBarLanguagePickerProvider);
let CellStatusBarLanguageDetectionProvider = class CellStatusBarLanguageDetectionProvider {
    constructor(_notebookService, _notebookKernelService, _languageService, _configurationService, _languageDetectionService, _keybindingService) {
        this._notebookService = _notebookService;
        this._notebookKernelService = _notebookKernelService;
        this._languageService = _languageService;
        this._configurationService = _configurationService;
        this._languageDetectionService = _languageDetectionService;
        this._keybindingService = _keybindingService;
        this.viewType = '*';
        this.cache = new ResourceMap();
    }
    async provideCellStatusBarItems(uri, index, token) {
        const doc = this._notebookService.getNotebookTextModel(uri);
        const cell = doc?.cells[index];
        if (!cell) {
            return;
        }
        const enablementConfig = this._configurationService.getValue('workbench.editor.languageDetectionHints');
        const enabled = typeof enablementConfig === 'object' && enablementConfig?.notebookEditors;
        if (!enabled) {
            return;
        }
        const cellUri = cell.uri;
        const contentVersion = cell.textModel?.getVersionId();
        if (!contentVersion) {
            return;
        }
        const currentLanguageId = cell.cellKind === CellKind.Markup ?
            'markdown' :
            (this._languageService.getLanguageIdByLanguageName(cell.language) || cell.language);
        if (!this.cache.has(cellUri)) {
            this.cache.set(cellUri, {
                cellLanguage: currentLanguageId, // force a re-compute upon a change in configured language
                updateTimestamp: 0, // facilitates a disposable-free debounce operation
                contentVersion: 1, // dont run for the initial contents, only on update
            });
        }
        const cached = this.cache.get(cellUri);
        if (cached.cellLanguage !== currentLanguageId || (cached.updateTimestamp < Date.now() - 1000 && cached.contentVersion !== contentVersion)) {
            cached.updateTimestamp = Date.now();
            cached.cellLanguage = currentLanguageId;
            cached.contentVersion = contentVersion;
            const kernel = this._notebookKernelService.getSelectedOrSuggestedKernel(doc);
            if (kernel) {
                const supportedLangs = [...kernel.supportedLanguages, 'markdown'];
                cached.guess = await this._languageDetectionService.detectLanguage(cell.uri, supportedLangs);
            }
        }
        const items = [];
        if (cached.guess && currentLanguageId !== cached.guess) {
            const detectedName = this._languageService.getLanguageName(cached.guess) || cached.guess;
            const tooltip = this._keybindingService.appendKeybinding(localize('notebook.cell.status.autoDetectLanguage', "Accept Detected Language: {0}", detectedName), DETECT_CELL_LANGUAGE);
            items.push({
                text: '$(lightbulb-autofix)',
                command: DETECT_CELL_LANGUAGE,
                tooltip,
                alignment: 2 /* CellStatusbarAlignment.Right */,
                priority: -Number.MAX_SAFE_INTEGER + 1
            });
        }
        return { items };
    }
};
CellStatusBarLanguageDetectionProvider = __decorate([
    __param(0, INotebookService),
    __param(1, INotebookKernelService),
    __param(2, ILanguageService),
    __param(3, IConfigurationService),
    __param(4, ILanguageDetectionService),
    __param(5, IKeybindingService)
], CellStatusBarLanguageDetectionProvider);
let BuiltinCellStatusBarProviders = class BuiltinCellStatusBarProviders extends Disposable {
    constructor(instantiationService, notebookCellStatusBarService) {
        super();
        const builtinProviders = [
            CellStatusBarLanguagePickerProvider,
            CellStatusBarLanguageDetectionProvider,
        ];
        builtinProviders.forEach(p => {
            this._register(notebookCellStatusBarService.registerCellStatusBarItemProvider(instantiationService.createInstance(p)));
        });
    }
};
BuiltinCellStatusBarProviders = __decorate([
    __param(0, IInstantiationService),
    __param(1, INotebookCellStatusBarService)
], BuiltinCellStatusBarProviders);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(BuiltinCellStatusBarProviders, 3 /* LifecyclePhase.Restored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdHVzQmFyUHJvdmlkZXJzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9jb250cmliL2NlbGxTdGF0dXNCYXIvc3RhdHVzQmFyUHJvdmlkZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFbkUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDekYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsVUFBVSxJQUFJLG1CQUFtQixFQUFtQyxNQUFNLHdDQUF3QyxDQUFDO0FBQzVILE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3RGLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxRQUFRLEVBQTBILE1BQU0sbUNBQW1DLENBQUM7QUFDckwsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbEYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdEUsT0FBTyxFQUFF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