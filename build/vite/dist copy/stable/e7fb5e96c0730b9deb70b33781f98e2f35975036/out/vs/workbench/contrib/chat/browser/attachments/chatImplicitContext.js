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
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun } from '../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { getCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { isLocation } from '../../../../../editor/common/languages.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { getNotebookEditorFromEditorPane } from '../../../notebook/browser/notebookBrowser.js';
import { WebviewInput } from '../../../webviewPanel/browser/webviewEditorInput.js';
import { IChatEditingService } from '../../common/editing/chatEditingService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { isStringImplicitContextValue } from '../../common/attachments/chatVariableEntries.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { ILanguageModelIgnoredFilesService } from '../../common/ignoredFiles.js';
import { IChatWidgetService } from '../chat.js';
import { IChatContextService } from '../contextContrib/chatContextService.js';
let ChatImplicitContextContribution = class ChatImplicitContextContribution extends Disposable {
    static { this.ID = 'chat.implicitContext'; }
    constructor(codeEditorService, editorService, chatWidgetService, chatService, chatEditingService, configurationService, ignoredFilesService, chatContextService) {
        super();
        this.codeEditorService = codeEditorService;
        this.editorService = editorService;
        this.chatWidgetService = chatWidgetService;
        this.chatService = chatService;
        this.chatEditingService = chatEditingService;
        this.configurationService = configurationService;
        this.ignoredFilesService = ignoredFilesService;
        this.chatContextService = chatContextService;
        this._currentCancelTokenSource = this._register(new MutableDisposable());
        this._implicitContextEnablement = this.configurationService.getValue('chat.implicitContext.enabled');
        const activeEditorDisposables = this._register(new DisposableStore());
        this._register(Event.runAndSubscribe(editorService.onDidActiveEditorChange, (() => {
            activeEditorDisposables.clear();
            const codeEditor = this.findActiveCodeEditor();
            if (codeEditor) {
                activeEditorDisposables.add(Event.debounce(Event.any(codeEditor.onDidChangeModel, codeEditor.onDidChangeModelLanguage, codeEditor.onDidChangeCursorSelection, codeEditor.onDidScrollChange), () => undefined, 500)(() => this.updateImplicitContext()));
            }
            const notebookEditor = this.findActiveNotebookEditor();
            if (notebookEditor) {
                const activeCellDisposables = activeEditorDisposables.add(new DisposableStore());
                activeEditorDisposables.add(notebookEditor.onDidChangeActiveCell(() => {
                    activeCellDisposables.clear();
                    const codeEditor = this.codeEditorService.getActiveCodeEditor();
                    if (codeEditor && codeEditor.getModel()?.uri.scheme === Schemas.vscodeNotebookCell) {
                        activeCellDisposables.add(Event.debounce(Event.any(codeEditor.onDidChangeModel, codeEditor.onDidChangeCursorSelection, codeEditor.onDidScrollChange), () => undefined, 500)(() => this.updateImplicitContext()));
                    }
                }));
                activeEditorDisposables.add(Event.debounce(Event.any(notebookEditor.onDidChangeModel, notebookEditor.onDidChangeActiveCell), () => undefined, 500)(() => this.updateImplicitContext()));
            }
            const webviewEditor = this.findActiveWebviewEditor();
            if (webviewEditor) {
                activeEditorDisposables.add(Event.debounce(webviewEditor.input.webview.onMessage, () => undefined, 500)(() => {
                    this.updateImplicitContext();
                }));
            }
            this.updateImplicitContext();
        })));
        this._register(autorun((reader) => {
            this.chatEditingService.editingSessionsObs.read(reader);
            this.updateImplicitContext();
        }));
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('chat.implicitContext.enabled')) {
                this._implicitContextEnablement = this.configurationService.getValue('chat.implicitContext.enabled');
                this.updateImplicitContext();
            }
        }));
        this._register(this.chatService.onDidSubmitRequest(({ chatSessionResource }) => {
            const widget = this.chatWidgetService.getWidgetBySessionResource(chatSessionResource);
            if (!widget?.input.implicitContext) {
                return;
            }
            if (this._implicitContextEnablement[widget.location] === 'first' && widget.viewModel?.getItems().length !== 0) {
                widget.input.implicitContext.setValues([]);
            }
        }));
        this._register(this.chatWidgetService.onDidAddWidget(async (widget) => {
            await this.updateImplicitContext(widget);
        }));
    }
    findActiveCodeEditor() {
        const codeEditor = this.codeEditorService.getActiveCodeEditor();
        if (codeEditor) {
            const model = codeEditor.getModel();
            if (model?.uri.scheme === Schemas.vscodeNotebookCell) {
                return undefined;
            }
            if (model) {
                return codeEditor;
            }
        }
        for (const codeOrDiffEditor of this.editorService.getVisibleTextEditorControls(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */)) {
            const codeEditor = getCodeEditor(codeOrDiffEditor);
            if (!codeEditor) {
                continue;
            }
            const model = codeEditor.getModel();
            if (model) {
                return codeEditor;
            }
        }
        return undefined;
    }
    findActiveWebviewEditor() {
        const activeEditorPane = this.editorService.activeEditorPane;
        if (activeEditorPane?.input instanceof WebviewInput) {
            return activeEditorPane;
        }
        return undefined;
    }
    findActiveNotebookEditor() {
        return getNotebookEditorFromEditorPane(this.editorService.activeEditorPane);
    }
    async updateImplicitContext(updateWidget) {
        const cancelTokenSource = this._currentCancelTokenSource.value = new CancellationTokenSource();
        const codeEditor = this.findActiveCodeEditor();
        const model = codeEditor?.getModel();
        const selection = codeEditor?.getSelection();
        let newValue;
        let isSelection = false;
        let languageId;
        let providerContext;
        if (model) {
            languageId = model.getLanguageId();
            if (selection && !selection.isEmpty()) {
                newValue = { uri: model.uri, range: selection };
                isSelection = true;
            }
            else {
                if (this.configurationService.getValue('chat.implicitContext.suggestedContext')) {
                    newValue = model.uri;
                }
                else {
                    const visibleRanges = codeEditor?.getVisibleRanges();
                    if (visibleRanges && visibleRanges.length > 0) {
                        // Merge visible ranges. Maybe the reference value could actually be an array of Locations?
                        // Something like a Location with an array of Ranges?
                        let range = visibleRanges[0];
                        visibleRanges.slice(1).forEach(r => {
                            range = range.plusRange(r);
                        });
                        newValue = { uri: model.uri, range };
                    }
                    else {
                        newValue = model.uri;
                    }
                }
            }
            // Also check if a chat context provider can provide additional context for this text editor resource
            providerContext = await this.chatContextService.contextForResource(model.uri, languageId);
        }
        const notebookEditor = this.findActiveNotebookEditor();
        if (notebookEditor?.isReplHistory) {
            // The chat APIs don't work well with Interactive Windows
            newValue = undefined;
        }
        else if (notebookEditor) {
            const activeCell = notebookEditor.getActiveCell();
            if (activeCell) {
                const codeEditor = this.codeEditorService.getActiveCodeEditor();
                const selection = codeEditor?.getSelection();
                const visibleRanges = codeEditor?.getVisibleRanges() || [];
                newValue = activeCell.uri;
                const cellModel = codeEditor?.getModel();
                if (cellModel && isEqual(cellModel.uri, activeCell.uri)) {
                    if (selection && !selection.isEmpty()) {
                        newValue = { uri: activeCell.uri, range: selection };
                        isSelection = true;
                    }
                    else if (visibleRanges.length > 0) {
                        // If the entire cell is visible, just use the cell URI, no need to specify range.
                        if (!isEntireCellVisible(cellModel, visibleRanges)) {
                            // Merge visible ranges. Maybe the reference value could actually be an array of Locations?
                            // Something like a Location with an array of Ranges?
                            let range = visibleRanges[0];
                            visibleRanges.slice(1).forEach(r => {
                                range = range.plusRange(r);
                            });
                            newValue = { uri: activeCell.uri, range };
                        }
                    }
                }
            }
            else {
                newValue = notebookEditor.textModel?.uri;
            }
        }
        const webviewEditor = this.findActiveWebviewEditor();
        if (webviewEditor?.input?.resource) {
            const webviewContext = await this.chatContextService.contextForResource(webviewEditor.input.resource);
            if (webviewContext) {
                newValue = webviewContext;
            }
        }
        const uri = newValue instanceof URI ? newValue : (isStringImplicitContextValue(newValue) ? undefined : newValue?.uri);
        if (uri && (await this.ignoredFilesService.fileIsIgnored(uri, cancelTokenSource.token) ||
            uri.path.endsWith('.copilotmd'))) {
            newValue = undefined;
        }
        if (cancelTokenSource.token.isCancellationRequested) {
            return;
        }
        const widgets = updateWidget ? [updateWidget] : [...this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat), ...this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.EditorInline)];
        for (const widget of widgets) {
            if (!widget.input.implicitContext) {
                continue;
            }
            const setting = this._implicitContextEnablement[widget.location];
            const isFirstInteraction = widget.viewModel?.getItems().length === 0;
            if ((setting === 'always' || setting === 'first' && isFirstInteraction)) {
                // When there's a non-code active editor (e.g. Settings is open), preserve
                // existing values so the attachment bar stays visible.
                // But when there's no active editor at all, clear the values.
                const hasActiveEditor = !!this.editorService.activeEditor;
                if (newValue !== undefined || !widget.input.implicitContext.hasValue || !hasActiveEditor) {
                    widget.input.implicitContext.setValues([{ value: newValue, isSelection }, { value: providerContext, isSelection: false }]);
                }
            }
            else {
                widget.input.implicitContext.setValues([]);
            }
        }
    }
};
ChatImplicitContextContribution = __decorate([
    __param(0, ICodeEditorService),
    __param(1, IEditorService),
    __param(2, IChatWidgetService),
    __param(3, IChatService),
    __param(4, IChatEditingService),
    __param(5, IConfigurationService),
    __param(6, ILanguageModelIgnoredFilesService),
    __param(7, IChatContextService)
], ChatImplicitContextContribution);
export { ChatImplicitContextContribution };
function isEntireCellVisible(cellModel, visibleRanges) {
    if (visibleRanges.length === 1 && visibleRanges[0].startLineNumber === 1 && visibleRanges[0].startColumn === 1 && visibleRanges[0].endLineNumber === cellModel.getLineCount() && visibleRanges[0].endColumn === cellModel.getLineMaxColumn(visibleRanges[0].endLineNumber)) {
        return true;
    }
    return false;
}
export class ChatImplicitContexts extends Disposable {
    constructor() {
        super(...arguments);
        this._onDidChangeValue = this._register(new Emitter());
        this.onDidChangeValue = this._onDidChangeValue.event;
        this._values = this._register(new DisposableMap());
        this._valuesDisposables = this._register(new DisposableStore());
        this._enabled = false;
    }
    setValues(values) {
        this._valuesDisposables.clear();
        this._values.clearAndDisposeAll();
        if (!values || values.length === 0) {
            this._onDidChangeValue.fire();
            return;
        }
        const definedValues = values.filter(value => value.value !== undefined);
        for (const value of definedValues) {
            const implicitContext = new ChatImplicitContext();
            implicitContext.setValue(value.value, value.isSelection);
            implicitContext.enabled = this._enabled;
            const disposableStore = new DisposableStore();
            disposableStore.add(implicitContext.onDidChangeValue(() => {
                this._onDidChangeValue.fire();
            }));
            disposableStore.add(implicitContext);
            this._values.set(implicitContext, disposableStore);
        }
        this._onDidChangeValue.fire();
    }
    get values() {
        return Array.from(this._values.keys());
    }
    get hasEnabled() {
        return Array.from(this._values.keys()).some(v => v.enabled);
    }
    setEnabled(enabled) {
        this._enabled = enabled;
        this.values.forEach((v) => v.enabled = enabled);
    }
    get hasValue() {
        return this.values.some(v => v.value !== undefined);
    }
    get hasNonUri() {
        return this.values.some(v => v.value !== undefined && !URI.isUri(v.value));
    }
    getLocations() {
        return this.values.filter(v => isLocation(v.value)).map(v => v.value);
    }
    getUris() {
        return this.values.filter(v => URI.isUri(v.value)).map(v => v.value);
    }
    get hasNonStringContext() {
        return this.values.some(v => v.value !== undefined && !isStringImplicitContextValue(v.value));
    }
    enabledBaseEntries(includeAllLocations) {
        return this.values.flatMap(v => {
            if (v.enabled) {
                return v.toBaseEntries();
            }
            else if (includeAllLocations && isLocation(v.value)) {
                return v.toBaseEntries();
            }
            return [];
        });
    }
}
export class ChatImplicitContext extends Disposable {
    constructor() {
        super(...arguments);
        this.kind = 'implicit';
        this.isFile = true;
        this._isSelection = false;
        this._onDidChangeValue = this._register(new Emitter());
        this.onDidChangeValue = this._onDidChangeValue.event;
        this._enabled = false;
    }
    get id() {
        if (URI.isUri(this.value)) {
            return 'vscode.implicit.file';
        }
        else if (isStringImplicitContextValue(this.value)) {
            return 'vscode.implicit.string';
        }
        else if (this.value) {
            if (this._isSelection) {
                return 'vscode.implicit.selection';
            }
            else {
                return 'vscode.implicit.viewport';
            }
        }
        else {
            return 'vscode.implicit';
        }
    }
    get name() {
        if (URI.isUri(this.value)) {
            return `file:${basename(this.value)}`;
        }
        if (isLocation(this.value)) {
            return `file:${basename(this.value.uri)}`;
        }
        if (isStringImplicitContextValue(this.value)) {
            if (this.value.name === undefined && this.value.resourceUri === undefined) {
                throw new Error('ChatContextItem must have either a label or a resourceUri');
            }
            return this.value.name ?? basename(this.value.resourceUri);
        }
        return 'implicit';
    }
    get modelDescription() {
        if (URI.isUri(this.value)) {
            return `User's active file`;
        }
        else if (isStringImplicitContextValue(this.value)) {
            if (this.value.name === undefined && this.value.resourceUri === undefined) {
                throw new Error('ChatContextItem must have either a label or a resourceUri');
            }
            const contextName = this.value.name ?? basename(this.value.resourceUri);
            return this.value.modelDescription ?? `User's active context from ${contextName}`;
        }
        else if (this._isSelection) {
            return `User's active selection`;
        }
        else {
            return `User's current visible code`;
        }
    }
    get isSelection() {
        return this._isSelection;
    }
    get value() {
        return this._value;
    }
    get enabled() {
        return this._enabled;
    }
    set enabled(value) {
        this._enabled = value;
        this._onDidChangeValue.fire();
    }
    get uri() {
        if (isStringImplicitContextValue(this.value)) {
            return this.value.uri;
        }
        return this._uri;
    }
    get icon() {
        if (isStringImplicitContextValue(this.value)) {
            return this.value.icon;
        }
        return undefined;
    }
    setValue(value, isSelection) {
        if (isStringImplicitContextValue(value)) {
            this._value = value;
        }
        else {
            this._value = value;
            this._uri = URI.isUri(value) ? value : value?.uri;
        }
        this._isSelection = isSelection;
        this._onDidChangeValue.fire();
    }
    toBaseEntries() {
        if (!this.value) {
            return [];
        }
        if (isStringImplicitContextValue(this.value)) {
            return [
                {
                    kind: 'string',
                    id: this.id,
                    name: this.name,
                    value: this.value.value ?? this.name,
                    modelDescription: this.modelDescription,
                    icon: this.value.icon,
                    uri: this.value.uri,
                    resourceUri: this.value.resourceUri,
                    handle: this.value.handle,
                    commandId: this.value.commandId
                }
            ];
        }
        return [{
                kind: 'file',
                id: this.id,
                name: this.name,
                value: this.value,
                modelDescription: this.modelDescription,
            }];
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEltcGxpY2l0Q29udGV4dC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0SW1wbGljaXRDb250ZXh0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDeEgsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRTVFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsYUFBYSxFQUFlLE1BQU0sZ0RBQWdELENBQUM7QUFDNUYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDakcsT0FBTyxFQUFFLFVBQVUsRUFBWSxNQUFNLDJDQUEyQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBR3RHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNyRixPQUFPLEVBQUUsK0JBQStCLEVBQW1CLE1BQU0sOENBQThDLENBQUM7QUFFaEgsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ25GLE9B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