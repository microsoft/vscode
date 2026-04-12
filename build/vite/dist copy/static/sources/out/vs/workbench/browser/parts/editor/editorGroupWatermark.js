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
var EditorGroupWatermark_1;
import { $, append, clearNode, h } from '../../../../base/browser/dom.js';
import { KeybindingLabel } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { coalesce, shuffle } from '../../../../base/common/arrays.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { isMacintosh, isWeb, OS } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IStorageService, WillSaveStateReason } from '../../../../platform/storage/common/storage.js';
import { defaultKeybindingLabelStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
const showChatContextKey = ContextKeyExpr.and(ContextKeyExpr.equals('chatSetupHidden', false), ContextKeyExpr.equals('chatSetupDisabled', false));
const openChat = { text: localize('watermark.openChat', "Open Chat"), id: 'workbench.action.chat.open', when: { native: showChatContextKey, web: showChatContextKey } };
const showCommands = { text: localize('watermark.showCommands', "Show All Commands"), id: 'workbench.action.showCommands' };
const gotoFile = { text: localize('watermark.quickAccess', "Go to File"), id: 'workbench.action.quickOpen' };
const openFile = { text: localize('watermark.openFile', "Open File"), id: 'workbench.action.files.openFile' };
const openFolder = { text: localize('watermark.openFolder', "Open Folder"), id: 'workbench.action.files.openFolder' };
const openFileOrFolder = { text: localize('watermark.openFileFolder', "Open File or Folder"), id: 'workbench.action.files.openFileFolder' };
const openRecent = { text: localize('watermark.openRecent', "Open Recent"), id: 'workbench.action.openRecent' };
const newUntitledFile = { text: localize('watermark.newUntitledFile', "New Untitled Text File"), id: 'workbench.action.files.newUntitledFile' };
const findInFiles = { text: localize('watermark.findInFiles', "Find in Files"), id: 'workbench.action.findInFiles' };
const toggleTerminal = { text: localize({ key: 'watermark.toggleTerminal', comment: ['toggle is a verb here'] }, "Toggle Terminal"), id: 'workbench.action.terminal.toggleTerminal', when: { web: ContextKeyExpr.equals('terminalProcessSupported', true) } };
const startDebugging = { text: localize('watermark.startDebugging', "Start Debugging"), id: 'workbench.action.debug.start', when: { web: ContextKeyExpr.equals('terminalProcessSupported', true) } };
const openSettings = { text: localize('watermark.openSettings', "Open Settings"), id: 'workbench.action.openSettings' };
const baseEntries = [
    openChat,
    showCommands,
];
const emptyWindowEntries = coalesce([
    ...baseEntries,
    openRecent,
    ...(isMacintosh && !isWeb ? [openFileOrFolder] : [openFile, openFolder]),
    isMacintosh && !isWeb ? newUntitledFile : undefined, // fill in one more on macOS to get to 5 entries
]);
const workspaceEntries = [
    ...baseEntries,
];
const otherEntries = [
    gotoFile,
    findInFiles,
    startDebugging,
    toggleTerminal,
    openSettings,
];
let EditorGroupWatermark = class EditorGroupWatermark extends Disposable {
    static { EditorGroupWatermark_1 = this; }
    static { this.CACHED_WHEN = 'editorGroupWatermark.whenConditions'; }
    static { this.SETTINGS_KEY = 'workbench.tips.enabled'; }
    static { this.MINIMUM_ENTRIES = 3; }
    constructor(container, keybindingService, contextService, contextKeyService, configurationService, storageService) {
        super();
        this.keybindingService = keybindingService;
        this.contextService = contextService;
        this.contextKeyService = contextKeyService;
        this.configurationService = configurationService;
        this.storageService = storageService;
        this.transientDisposables = this._register(new DisposableStore());
        this.keybindingLabels = this._register(new DisposableStore());
        this.enabled = false;
        this.cachedWhen = this.storageService.getObject(EditorGroupWatermark_1.CACHED_WHEN, 0 /* StorageScope.PROFILE */, Object.create(null));
        this.workbenchState = this.contextService.getWorkbenchState();
        const elements = h('.editor-group-watermark', [
            h('.watermark-container', [
                h('.letterpress'),
                h('.shortcuts@shortcuts'),
            ])
        ]);
        append(container, elements.root);
        this.shortcuts = elements.shortcuts;
        this.registerListeners();
        this.render();
    }
    registerListeners() {
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(EditorGroupWatermark_1.SETTINGS_KEY) &&
                this.enabled !== this.configurationService.getValue(EditorGroupWatermark_1.SETTINGS_KEY)) {
                this.render();
            }
        }));
        this._register(this.contextService.onDidChangeWorkbenchState(workbenchState => {
            if (this.workbenchState !== workbenchState) {
                this.workbenchState = workbenchState;
                this.render();
            }
        }));
        this._register(this.storageService.onWillSaveState(e => {
            if (e.reason === WillSaveStateReason.SHUTDOWN) {
                const entries = [...emptyWindowEntries, ...workspaceEntries, ...otherEntries];
                for (const entry of entries) {
                    const when = isWeb ? entry.when?.web : entry.when?.native;
                    if (when) {
                        this.cachedWhen[entry.id] = this.contextKeyService.contextMatchesRules(when);
                    }
                }
                this.storageService.store(EditorGroupWatermark_1.CACHED_WHEN, JSON.stringify(this.cachedWhen), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
            }
        }));
    }
    render() {
        this.enabled = this.configurationService.getValue(EditorGroupWatermark_1.SETTINGS_KEY);
        clearNode(this.shortcuts);
        this.transientDisposables.clear();
        if (!this.enabled) {
            return;
        }
        const entries = this.filterEntries(this.workbenchState !== 1 /* WorkbenchState.EMPTY */ ? workspaceEntries : emptyWindowEntries);
        if (entries.length < EditorGroupWatermark_1.MINIMUM_ENTRIES) {
            const additionalEntries = this.filterEntries(otherEntries);
            shuffle(additionalEntries);
            entries.push(...additionalEntries.slice(0, EditorGroupWatermark_1.MINIMUM_ENTRIES - entries.length));
        }
        const box = append(this.shortcuts, $('.watermark-box'));
        const update = () => {
            clearNode(box);
            this.keybindingLabels.clear();
            for (const entry of entries) {
                const keys = this.keybindingService.lookupKeybinding(entry.id);
                if (!keys) {
                    continue;
                }
                const dl = append(box, $('dl'));
                const dt = append(dl, $('dt'));
                dt.textContent = entry.text;
                const dd = append(dl, $('dd'));
                const label = this.keybindingLabels.add(new KeybindingLabel(dd, OS, { renderUnboundKeybindings: true, ...defaultKeybindingLabelStyles }));
                label.set(keys);
            }
        };
        update();
        this.transientDisposables.add(this.keybindingService.onDidUpdateKeybindings(update));
    }
    filterEntries(entries) {
        const filteredEntries = entries
            .filter(entry => {
            if (this.cachedWhen[entry.id]) {
                return true; // cached from previous session
            }
            const contextKey = isWeb ? entry.when?.web : entry.when?.native;
            return !contextKey /* works without context */ || this.contextKeyService.contextMatchesRules(contextKey);
        })
            .filter(entry => !!CommandsRegistry.getCommand(entry.id))
            .filter(entry => !!this.keybindingService.lookupKeybinding(entry.id));
        return filteredEntries;
    }
};
EditorGroupWatermark = EditorGroupWatermark_1 = __decorate([
    __param(1, IKeybindingService),
    __param(2, IWorkspaceContextService),
    __param(3, IContextKeyService),
    __param(4, IConfigurationService),
    __param(5, IStorageService)
], EditorGroupWatermark);
export { EditorGroupWatermark };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yR3JvdXBXYXRlcm1hcmsuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yR3JvdXBXYXRlcm1hcmsudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDakcsT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNwRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsY0FBYyxFQUF3QixrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ2hJLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxlQUFlLEVBQStCLG1CQUFtQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbkksT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDbkcsT0FBTyxFQUFFLHdCQUF3QixFQUFrQixNQUFNLG9EQUFvRCxDQUFDO0FBVzlHLE1BQU0sa0JB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