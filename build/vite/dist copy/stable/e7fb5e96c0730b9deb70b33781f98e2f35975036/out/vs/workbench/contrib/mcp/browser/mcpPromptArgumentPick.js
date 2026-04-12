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
import { assertNever } from '../../../../base/common/assert.js';
import { disposableTimeout, RunOnceScheduler, timeout } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, ObservablePromise, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { QueryBuilder } from '../../../services/search/common/queryBuilder.js';
import { ISearchService } from '../../../services/search/common/search.js';
import { ITerminalGroupService, ITerminalService } from '../../terminal/browser/terminal.js';
const SHELL_INTEGRATION_TIMEOUT = 5000;
const NO_SHELL_INTEGRATION_IDLE = 1000;
const SUGGEST_DEBOUNCE = 200;
let McpPromptArgumentPick = class McpPromptArgumentPick extends Disposable {
    constructor(prompt, _quickInputService, _terminalService, _searchService, _workspaceContextService, _labelService, _fileService, _modelService, _languageService, _terminalGroupService, _instantiationService, _codeEditorService, _editorService) {
        super();
        this.prompt = prompt;
        this._quickInputService = _quickInputService;
        this._terminalService = _terminalService;
        this._searchService = _searchService;
        this._workspaceContextService = _workspaceContextService;
        this._labelService = _labelService;
        this._fileService = _fileService;
        this._modelService = _modelService;
        this._languageService = _languageService;
        this._terminalGroupService = _terminalGroupService;
        this._instantiationService = _instantiationService;
        this._codeEditorService = _codeEditorService;
        this._editorService = _editorService;
        this.quickPick = this._register(_quickInputService.createQuickPick({ useSeparators: true }));
    }
    async createArgs(token) {
        const { quickPick, prompt } = this;
        quickPick.totalSteps = prompt.arguments.length;
        quickPick.step = 0;
        quickPick.ignoreFocusOut = true;
        quickPick.sortByLabel = false;
        const args = {};
        const backSnapshots = [];
        for (let i = 0; i < prompt.arguments.length; i++) {
            const arg = prompt.arguments[i];
            const restore = backSnapshots.at(i);
            quickPick.step = i + 1;
            quickPick.placeholder = arg.required ? arg.description : `${arg.description || ''} (${localize('optional', 'Optional')})`;
            quickPick.title = localize('mcp.prompt.pick.title', 'Value for: {0}', arg.title || arg.name);
            quickPick.value = restore?.value ?? ((args.hasOwnProperty(arg.name) && args[arg.name]) || '');
            quickPick.items = restore?.items ?? [];
            quickPick.activeItems = restore?.activeItems ?? [];
            quickPick.buttons = i > 0 ? [this._quickInputService.backButton] : [];
            const value = await this._getArg(arg, !!restore, args, token);
            if (value.type === 'back') {
                i -= 2;
            }
            else if (value.type === 'cancel') {
                return undefined;
            }
            else if (value.type === 'arg') {
                backSnapshots[i] = { value: quickPick.value, items: quickPick.items.slice(), activeItems: quickPick.activeItems.slice() };
                args[arg.name] = value.value;
            }
            else {
                assertNever(value);
            }
        }
        quickPick.value = '';
        quickPick.placeholder = localize('loading', 'Loading...');
        quickPick.busy = true;
        return args;
    }
    async _getArg(arg, didRestoreState, argsSoFar, token) {
        const { quickPick } = this;
        const store = new DisposableStore();
        const input$ = observableValue(this, quickPick.value);
        const asyncPicks = [
            {
                name: localize('mcp.arg.suggestions', 'Suggestions'),
                observer: this._promptCompletions(arg, input$, argsSoFar),
            },
            {
                name: localize('mcp.arg.activeFiles', 'Active File'),
                observer: this._activeFileCompletions(),
            },
            {
                name: localize('mcp.arg.files', 'Files'),
                observer: this._fileCompletions(input$),
            }
        ];
        store.add(autorun(reader => {
            if (didRestoreState) {
                input$.read(reader);
                return; // don't overwrite initial items until the user types
            }
            let items = [];
            items.push({ id: 'insert-text', label: localize('mcp.arg.asText', 'Insert as text'), iconClass: ThemeIcon.asClassName(Codicon.textSize), action: 'text', alwaysShow: true });
            items.push({ id: 'run-command', label: localize('mcp.arg.asCommand', 'Run as Command'), description: localize('mcp.arg.asCommand.description', 'Inserts the command output as the prompt argument'), iconClass: ThemeIcon.asClassName(Codicon.terminal), action: 'command', alwaysShow: true });
            let busy = false;
            for (const pick of asyncPicks) {
                const state = pick.observer.read(reader);
                busy ||= state.busy;
                if (state.picks) {
                    items.push({ label: pick.name, type: 'separator' });
                    items = items.concat(state.picks);
                }
            }
            const previouslyActive = quickPick.activeItems;
            quickPick.busy = busy;
            quickPick.items = items;
            const lastActive = items.find(i => previouslyActive.some(a => a.id === i.id));
            const serverSuggestions = asyncPicks[0].observer;
            // Keep any selection state, but otherwise select the first completion item, and avoid default-selecting the top item unless there are no compltions
            if (lastActive) {
                quickPick.activeItems = [lastActive];
            }
            else if (serverSuggestions.read(reader).picks?.length) {
                quickPick.activeItems = [items[3]];
            }
            else if (busy) {
                quickPick.activeItems = [];
            }
            else {
                quickPick.activeItems = [items[0]];
            }
        }));
        try {
            const value = await new Promise(resolve => {
                if (token) {
                    store.add(token.onCancellationRequested(() => {
                        resolve(undefined);
                    }));
                }
                store.add(quickPick.onDidChangeValue(value => {
                    quickPick.validationMessage = undefined;
                    input$.set(value, undefined);
                }));
                store.add(quickPick.onDidAccept(() => {
                    const item = quickPick.selectedItems[0];
                    if (!quickPick.value && arg.required && (!item || item.action === 'text' || item.action === 'command')) {
                        quickPick.validationMessage = localize('mcp.arg.required', "This argument is required");
                    }
                    else if (!item) {
                        // For optional arguments when no item is selected, return empty text action
                        resolve({ id: 'insert-text', label: '', action: 'text' });
                    }
                    else {
                        resolve(item);
                    }
                }));
                store.add(quickPick.onDidTriggerButton(() => {
                    resolve('back');
                }));
                store.add(quickPick.onDidHide(() => {
                    resolve(undefined);
                }));
                quickPick.show();
            });
            if (value === 'back') {
                return { type: 'back' };
            }
            if (value === undefined) {
                return { type: 'cancel' };
            }
            store.clear();
            const cts = new CancellationTokenSource();
            store.add(toDisposable(() => cts.dispose(true)));
            store.add(quickPick.onDidHide(() => store.dispose()));
            switch (value.action) {
                case 'text':
                    return { type: 'arg', value: quickPick.value || undefined };
                case 'command':
                    if (!quickPick.value) {
                        return { type: 'arg', value: undefined };
                    }
                    quickPick.busy = true;
                    return { type: 'arg', value: await this._getTerminalOutput(quickPick.value, cts.token) };
                case 'suggest':
                    return { type: 'arg', value: value.label };
                case 'file':
                    quickPick.busy = true;
                    return { type: 'arg', value: await this._fileService.readFile(value.uri).then(c => c.value.toString()) };
                case 'selectedText':
                    return { type: 'arg', value: value.selectedText };
                default:
                    assertNever(value);
            }
        }
        finally {
            store.dispose();
        }
    }
    _promptCompletions(arg, input, argsSoFar) {
        const alreadyResolved = {};
        for (const [key, value] of Object.entries(argsSoFar)) {
            if (value) {
                alreadyResolved[key] = value;
            }
        }
        return this._asyncCompletions(input, async (i, t) => {
            const items = await this.prompt.complete(arg.name, i, alreadyResolved, t);
            return items.map((i) => ({ id: `suggest:${i}`, label: i, action: 'suggest' }));
        });
    }
    _fileCompletions(input) {
        const qb = this._instantiationService.createInstance(QueryBuilder);
        return this._asyncCompletions(input, async (i, token) => {
            if (!i) {
                return [];
            }
            const query = qb.file(this._workspaceContextService.getWorkspace().folders, {
                filePattern: i,
                maxResults: 10,
            });
            const { results } = await this._searchService.fileSearch(query, token);
            return results.map((i) => ({
                id: i.resource.toString(),
                label: basename(i.resource),
                description: this._labelService.getUriLabel(i.resource),
                iconClasses: getIconClasses(this._modelService, this._languageService, i.resource),
                uri: i.resource,
                action: 'file',
            }));
        });
    }
    _activeFileCompletions() {
        const activeEditorChange = observableSignalFromEvent(this, this._editorService.onDidActiveEditorChange);
        const activeEditor = derived(reader => {
            activeEditorChange.read(reader);
            return this._codeEditorService.getActiveCodeEditor();
        });
        const resourceObs = activeEditor
            .map(e => e ? observableSignalFromEvent(this, e.onDidChangeModel).map(() => e.getModel()?.uri) : undefined)
            .map((o, reader) => o?.read(reader));
        const selectionObs = activeEditor
            .map(e => e ? observableSignalFromEvent(this, e.onDidChangeCursorSelection).map(() => ({ range: e.getSelection(), model: e.getModel() })) : undefined)
            .map((o, reader) => o?.read(reader));
        return derived(reader => {
            const resource = resourceObs.read(reader);
            if (!resource) {
                return { busy: false, picks: [] };
            }
            const items = [];
            // Add active file option
            items.push({
                id: 'active-file',
                label: localize('mcp.arg.activeFile', 'Active File'),
                description: this._labelService.getUriLabel(resource),
                iconClasses: getIconClasses(this._modelService, this._languageService, resource),
                uri: resource,
                action: 'file',
            });
            const selection = selectionObs.read(reader);
            // Add selected text option if there's a selection
            if (selection && selection.model && selection.range && !selection.range.isEmpty()) {
                const selectedText = selection.model.getValueInRange(selection.range);
                const lineCount = selection.range.endLineNumber - selection.range.startLineNumber + 1;
                const description = lineCount === 1
                    ? localize('mcp.arg.selectedText.singleLine', 'line {0}', selection.range.startLineNumber)
                    : localize('mcp.arg.selectedText.multiLine', '{0} lines', lineCount);
                items.push({
                    id: 'selected-text',
                    label: localize('mcp.arg.selectedText', 'Selected Text'),
                    description,
                    selectedText,
                    iconClass: ThemeIcon.asClassName(Codicon.selection),
                    uri: resource,
                    action: 'selectedText',
                });
            }
            return { picks: items, busy: false };
        });
    }
    _asyncCompletions(input, mapper) {
        const promise = derived(reader => {
            const queryValue = input.read(reader);
            const cts = new CancellationTokenSource();
            reader.store.add(toDisposable(() => cts.dispose(true)));
            return new ObservablePromise(timeout(SUGGEST_DEBOUNCE, cts.token)
                .then(() => mapper(queryValue, cts.token))
                .catch(() => []));
        });
        return promise.map((value, reader) => {
            const result = value.promiseResult.read(reader);
            return { picks: result?.data || [], busy: result === undefined };
        });
    }
    async _getTerminalOutput(command, token) {
        // The terminal outlives the specific pick argument. This is both a feature and a bug.
        // Feature: we can reuse the terminal if the user puts in multiple args
        // Bug workaround: if we dispose the terminal here and that results in the panel
        // closing, then focus moves out of the quickpick and into the active editor pane (chat input)
        // https://github.com/microsoft/vscode/blob/6a016f2507cd200b12ca6eecdab2f59da15aacb1/src/vs/workbench/browser/parts/editor/editorGroupView.ts#L1084
        const terminal = (this._terminal ??= this._register(await this._terminalService.createTerminal({
            config: {
                name: localize('mcp.terminal.name', "MCP Terminal"),
                isTransient: true,
                forceShellIntegration: true,
                isFeatureTerminal: true,
            },
            location: TerminalLocation.Panel,
        })));
        this._terminalService.setActiveInstance(terminal);
        this._terminalGroupService.showPanel(false);
        const shellIntegration = terminal.capabilities.get(2 /* TerminalCapability.CommandDetection */);
        if (shellIntegration) {
            return this._getTerminalOutputInner(terminal, command, shellIntegration, token);
        }
        const store = new DisposableStore();
        return await new Promise(resolve => {
            store.add(terminal.capabilities.onDidAddCapability(e => {
                if (e.id === 2 /* TerminalCapability.CommandDetection */) {
                    store.dispose();
                    resolve(this._getTerminalOutputInner(terminal, command, e.capability, token));
                }
            }));
            store.add(token.onCancellationRequested(() => {
                store.dispose();
                resolve(undefined);
            }));
            store.add(disposableTimeout(() => {
                store.dispose();
                resolve(this._getTerminalOutputInner(terminal, command, undefined, token));
            }, SHELL_INTEGRATION_TIMEOUT));
        });
    }
    async _getTerminalOutputInner(terminal, command, shellIntegration, token) {
        const store = new DisposableStore();
        return new Promise(resolve => {
            let allData = '';
            store.add(terminal.onLineData(d => allData += d + '\n'));
            if (shellIntegration) {
                store.add(shellIntegration.onCommandFinished(e => resolve(e.getOutput() || allData)));
            }
            else {
                const done = store.add(new RunOnceScheduler(() => resolve(allData), NO_SHELL_INTEGRATION_IDLE));
                store.add(terminal.onData(() => done.schedule()));
            }
            store.add(token.onCancellationRequested(() => resolve(undefined)));
            store.add(terminal.onDisposed(() => resolve(undefined)));
            terminal.runCommand(command, true);
        }).finally(() => {
            store.dispose();
        });
    }
};
McpPromptArgumentPick = __decorate([
    __param(1, IQuickInputService),
    __param(2, ITerminalService),
    __param(3, ISearchService),
    __param(4, IWorkspaceContextService),
    __param(5, ILabelService),
    __param(6, IFileService),
    __param(7, IModelService),
    __param(8, ILanguageService),
    __param(9, ITerminalGroupService),
    __param(10, IInstantiationService),
    __param(11, ICodeEditorService),
    __param(12, IEditorService)
], McpPromptArgumentPick);
export { McpPromptArgumentPick };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwUHJvbXB0QXJndW1lbnRQaWNrLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWNwL2Jyb3dzZXIvbWNwUHJvbXB0QXJndW1lbnRQaWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsZ0JBQWdCLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDaEcsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBZSxpQkFBaUIsRUFBRSx5QkFBeUIsRUFBRSxlQUFlLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNySixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWpFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxZQUFZLEVBQUUs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