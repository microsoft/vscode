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
import './media/editorstatus.css';
import { localize, localize2 } from '../../../../nls.js';
import { getWindowById, runAtThisOrScheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { format, compare, splitLines } from '../../../../base/common/strings.js';
import { extname, basename, isEqual } from '../../../../base/common/resources.js';
import { areFunctions, assertReturnsDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { toAction } from '../../../../base/common/actions.js';
import { Language } from '../../../../base/common/platform.js';
import { UntitledTextEditorInput } from '../../../services/untitled/common/untitledTextEditorInput.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { Disposable, MutableDisposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { TrimTrailingWhitespaceAction } from '../../../../editor/contrib/linesOperations/browser/linesOperations.js';
import { IndentUsingSpaces, IndentUsingTabs, ChangeTabDisplaySize, DetectIndentation, IndentationToSpacesAction, IndentationToTabsAction } from '../../../../editor/contrib/indentation/browser/indentation.js';
import { BaseBinaryResourceEditor } from './binaryEditor.js';
import { BinaryResourceDiffEditor } from './binaryDiffEditor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IFileService, FILES_ASSOCIATIONS_CONFIG } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { Range } from '../../../../editor/common/core/range.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { ICommandService, CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IExtensionGalleryService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { SUPPORTED_ENCODINGS } from '../../../services/textfile/common/encoding.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { deepClone } from '../../../../base/common/objects.js';
import { getCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Schemas } from '../../../../base/common/network.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { getIconClassesForLanguageId } from '../../../../editor/common/services/getIconClasses.js';
import { Promises, timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IStatusbarService } from '../../../services/statusbar/browser/statusbar.js';
import { IMarkerService, MarkerSeverity, IMarkerData } from '../../../../platform/markers/common/markers.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { SideBySideEditorInput } from '../../../common/editor/sideBySideEditorInput.js';
import { AutomaticLanguageDetectionLikelyWrongId, ILanguageDetectionService } from '../../../services/languageDetection/common/languageDetectionWorkerService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Action2 } from '../../../../platform/actions/common/actions.js';
import { KeyChord } from '../../../../base/common/keyCodes.js';
import { TabFocus } from '../../../../editor/browser/config/tabFocus.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { InputMode } from '../../../../editor/common/inputMode.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
class SideBySideEditorEncodingSupport {
    constructor(primary, secondary) {
        this.primary = primary;
        this.secondary = secondary;
    }
    getEncoding() {
        return this.primary.getEncoding(); // always report from modified (right hand) side
    }
    async setEncoding(encoding, mode) {
        await Promises.settled([this.primary, this.secondary].map(editor => editor.setEncoding(encoding, mode)));
    }
}
class SideBySideEditorLanguageSupport {
    constructor(primary, secondary) {
        this.primary = primary;
        this.secondary = secondary;
    }
    setLanguageId(languageId, source) {
        [this.primary, this.secondary].forEach(editor => editor.setLanguageId(languageId, source));
    }
}
function toEditorWithEncodingSupport(input) {
    // Untitled Text Editor
    if (input instanceof UntitledTextEditorInput) {
        return input;
    }
    // Side by Side (diff) Editor
    if (input instanceof SideBySideEditorInput) {
        const primaryEncodingSupport = toEditorWithEncodingSupport(input.primary);
        const secondaryEncodingSupport = toEditorWithEncodingSupport(input.secondary);
        if (primaryEncodingSupport && secondaryEncodingSupport) {
            return new SideBySideEditorEncodingSupport(primaryEncodingSupport, secondaryEncodingSupport);
        }
        return primaryEncodingSupport;
    }
    // File or Resource Editor
    const encodingSupport = input;
    if (areFunctions(encodingSupport.setEncoding, encodingSupport.getEncoding)) {
        return encodingSupport;
    }
    // Unsupported for any other editor
    return null;
}
function toEditorWithLanguageSupport(input) {
    // Untitled Text Editor
    if (input instanceof UntitledTextEditorInput) {
        return input;
    }
    // Side by Side (diff) Editor
    if (input instanceof SideBySideEditorInput) {
        const primaryLanguageSupport = toEditorWithLanguageSupport(input.primary);
        const secondaryLanguageSupport = toEditorWithLanguageSupport(input.secondary);
        if (primaryLanguageSupport && secondaryLanguageSupport) {
            return new SideBySideEditorLanguageSupport(primaryLanguageSupport, secondaryLanguageSupport);
        }
        return primaryLanguageSupport;
    }
    // File or Resource Editor
    const languageSupport = input;
    if (typeof languageSupport.setLanguageId === 'function') {
        return languageSupport;
    }
    // Unsupported for any other editor
    return null;
}
class StateChange {
    constructor() {
        this.indentation = false;
        this.selectionStatus = false;
        this.languageId = false;
        this.languageStatus = false;
        this.encoding = false;
        this.EOL = false;
        this.tabFocusMode = false;
        this.inputMode = false;
        this.columnSelectionMode = false;
        this.metadata = false;
    }
    combine(other) {
        this.indentation = this.indentation || other.indentation;
        this.selectionStatus = this.selectionStatus || other.selectionStatus;
        this.languageId = this.languageId || other.languageId;
        this.languageStatus = this.languageStatus || other.languageStatus;
        this.encoding = this.encoding || other.encoding;
        this.EOL = this.EOL || other.EOL;
        this.tabFocusMode = this.tabFocusMode || other.tabFocusMode;
        this.inputMode = this.inputMode || other.inputMode;
        this.columnSelectionMode = this.columnSelectionMode || other.columnSelectionMode;
        this.metadata = this.metadata || other.metadata;
    }
    hasChanges() {
        return this.indentation
            || this.selectionStatus
            || this.languageId
            || this.languageStatus
            || this.encoding
            || this.EOL
            || this.tabFocusMode
            || this.inputMode
            || this.columnSelectionMode
            || this.metadata;
    }
}
class State {
    get selectionStatus() { return this._selectionStatus; }
    get languageId() { return this._languageId; }
    get encoding() { return this._encoding; }
    get EOL() { return this._EOL; }
    get indentation() { return this._indentation; }
    get tabFocusMode() { return this._tabFocusMode; }
    get inputMode() { return this._inputMode; }
    get columnSelectionMode() { return this._columnSelectionMode; }
    get metadata() { return this._metadata; }
    update(update) {
        const change = new StateChange();
        switch (update.type) {
            case 'selectionStatus':
                if (this._selectionStatus !== update.selectionStatus) {
                    this._selectionStatus = update.selectionStatus;
                    change.selectionStatus = true;
                }
                break;
            case 'indentation':
                if (this._indentation !== update.indentation) {
                    this._indentation = update.indentation;
                    change.indentation = true;
                }
                break;
            case 'languageId':
                if (this._languageId !== update.languageId) {
                    this._languageId = update.languageId;
                    change.languageId = true;
                }
                break;
            case 'encoding':
                if (this._encoding !== update.encoding) {
                    this._encoding = update.encoding;
                    change.encoding = true;
                }
                break;
            case 'EOL':
                if (this._EOL !== update.EOL) {
                    this._EOL = update.EOL;
                    change.EOL = true;
                }
                break;
            case 'tabFocusMode':
                if (this._tabFocusMode !== update.tabFocusMode) {
                    this._tabFocusMode = update.tabFocusMode;
                    change.tabFocusMode = true;
                }
                break;
            case 'inputMode':
                if (this._inputMode !== update.inputMode) {
                    this._inputMode = update.inputMode;
                    change.inputMode = true;
                }
                break;
            case 'columnSelectionMode':
                if (this._columnSelectionMode !== update.columnSelectionMode) {
                    this._columnSelectionMode = update.columnSelectionMode;
                    change.columnSelectionMode = true;
                }
                break;
            case 'metadata':
                if (this._metadata !== update.metadata) {
                    this._metadata = update.metadata;
                    change.metadata = true;
                }
                break;
        }
        return change;
    }
}
let TabFocusMode = class TabFocusMode extends Disposable {
    constructor(configurationService) {
        super();
        this.configurationService = configurationService;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this.registerListeners();
        const tabFocusModeConfig = configurationService.getValue('editor.tabFocusMode') === true;
        TabFocus.setTabFocusMode(tabFocusModeConfig);
    }
    registerListeners() {
        this._register(TabFocus.onDidChangeTabFocus(tabFocusMode => this._onDidChange.fire(tabFocusMode)));
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('editor.tabFocusMode')) {
                const tabFocusModeConfig = this.configurationService.getValue('editor.tabFocusMode') === true;
                TabFocus.setTabFocusMode(tabFocusModeConfig);
                this._onDidChange.fire(tabFocusModeConfig);
            }
        }));
    }
};
TabFocusMode = __decorate([
    __param(0, IConfigurationService)
], TabFocusMode);
class StatusInputMode extends Disposable {
    constructor() {
        super();
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        InputMode.setInputMode('insert');
        this._register(InputMode.onDidChangeInputMode(inputMode => this._onDidChange.fire(inputMode)));
    }
}
const nlsSingleSelectionRange = localize('singleSelectionRange', "Ln {0}, Col {1} ({2} selected)");
const nlsSingleSelection = localize('singleSelection', "Ln {0}, Col {1}");
const nlsMultiSelectionRange = localize('multiSelectionRange', "{0} selections ({1} characters selected)");
const nlsMultiSelection = localize('multiSelection', "{0} selections");
const nlsEOLLF = localize('endOfLineLineFeed', "LF");
const nlsEOLCRLF = localize('endOfLineCarriageReturnLineFeed', "CRLF");
let EditorStatus = class EditorStatus extends Disposable {
    constructor(targetWindowId, editorService, quickInputService, languageService, textFileService, statusbarService, instantiationService, configurationService) {
        super();
        this.targetWindowId = targetWindowId;
        this.editorService = editorService;
        this.quickInputService = quickInputService;
        this.languageService = languageService;
        this.textFileService = textFileService;
        this.statusbarService = statusbarService;
        this.configurationService = configurationService;
        this.tabFocusModeElement = this._register(new MutableDisposable());
        this.inputModeElement = this._register(new MutableDisposable());
        this.columnSelectionModeElement = this._register(new MutableDisposable());
        this.indentationElement = this._register(new MutableDisposable());
        this.selectionElement = this._register(new MutableDisposable());
        this.encodingElement = this._register(new MutableDisposable());
        this.eolElement = this._register(new MutableDisposable());
        this.languageElement = this._register(new MutableDisposable());
        this.metadataElement = this._register(new MutableDisposable());
        this.state = new State();
        this.toRender = undefined;
        this.activeEditorListeners = this._register(new DisposableStore());
        this.delayedRender = this._register(new MutableDisposable());
        this.currentMarkerStatus = this._register(instantiationService.createInstance(ShowCurrentMarkerInStatusbarContribution));
        this.tabFocusMode = this._register(instantiationService.createInstance(TabFocusMode));
        this.inputMode = this._register(instantiationService.createInstance(StatusInputMode));
        this.registerCommands();
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.editorService.onDidActiveEditorChange(() => this.updateStatusBar()));
        this._register(this.textFileService.untitled.onDidChangeEncoding(model => this.onResourceEncodingChange(model.resource)));
        this._register(this.textFileService.files.onDidChangeEncoding(model => this.onResourceEncodingChange((model.resource))));
        this._register(Event.runAndSubscribe(this.tabFocusMode.onDidChange, (tabFocusMode) => {
            if (tabFocusMode !== undefined) {
                this.onTabFocusModeChange(tabFocusMode);
            }
            else {
                this.onTabFocusModeChange(this.configurationService.getValue('editor.tabFocusMode'));
            }
        }));
        this._register(Event.runAndSubscribe(this.inputMode.onDidChange, (inputMode) => this.onInputModeChange(inputMode ?? 'insert')));
    }
    registerCommands() {
        this._register(CommandsRegistry.registerCommand({ id: `changeEditorIndentation${this.targetWindowId}`, handler: () => this.showIndentationPicker() }));
    }
    async showIndentationPicker() {
        const activeTextEditorControl = getCodeEditor(this.editorService.activeTextEditorControl);
        if (!activeTextEditorControl) {
            return this.quickInputService.pick([{ label: localize('noEditor', "No text editor active at this time") }]);
        }
        if (this.editorService.activeEditor?.isReadonly()) {
            return this.quickInputService.pick([{ label: localize('noWritableCodeEditor', "The active code editor is read-only.") }]);
        }
        const picks = [
            assertReturnsDefined(activeTextEditorControl.getAction(IndentUsingSpaces.ID)),
            assertReturnsDefined(activeTextEditorControl.getAction(IndentUsingTabs.ID)),
            assertReturnsDefined(activeTextEditorControl.getAction(ChangeTabDisplaySize.ID)),
            assertReturnsDefined(activeTextEditorControl.getAction(DetectIndentation.ID)),
            assertReturnsDefined(activeTextEditorControl.getAction(IndentationToSpacesAction.ID)),
            assertReturnsDefined(activeTextEditorControl.getAction(IndentationToTabsAction.ID)),
            assertReturnsDefined(activeTextEditorControl.getAction(TrimTrailingWhitespaceAction.ID))
        ].map((a) => {
            return {
                id: a.id,
                label: a.label,
                detail: (Language.isDefaultVariant() || a.label === a.alias) ? undefined : a.alias,
                run: () => {
                    activeTextEditorControl.focus();
                    a.run();
                }
            };
        });
        picks.splice(3, 0, { type: 'separator', label: localize('indentConvert', "convert file") });
        picks.unshift({ type: 'separator', label: localize('indentView', "change view") });
        const action = await this.quickInputService.pick(picks, { placeHolder: localize('pickAction', "Select Action"), matchOnDetail: true });
        return action?.run();
    }
    updateTabFocusModeElement(visible) {
        if (visible) {
            if (!this.tabFocusModeElement.value) {
                const text = localize('tabFocusModeEnabled', "Tab Moves Focus");
                this.tabFocusModeElement.value = this.statusbarService.addEntry({
                    name: localize('status.editor.tabFocusMode', "Accessibility Mode"),
                    text,
                    ariaLabel: text,
                    tooltip: localize('disableTabMode', "Disable Accessibility Mode"),
                    command: 'editor.action.toggleTabFocusMode',
                    kind: 'prominent'
                }, 'status.editor.tabFocusMode', 1 /* StatusbarAlignment.RIGHT */, 100.7);
            }
        }
        else {
            this.tabFocusModeElement.clear();
        }
    }
    updateInputModeElement(inputMode) {
        if (inputMode === 'overtype') {
            if (!this.inputModeElement.value) {
                const text = localize('inputModeOvertype', 'OVR');
                const name = localize('status.editor.enableInsertMode', "Enable Insert Mode");
                this.inputModeElement.value = this.statusbarService.addEntry({
                    name,
                    text,
                    ariaLabel: text,
                    tooltip: name,
                    command: 'editor.action.toggleOvertypeInsertMode',
                    kind: 'prominent'
                }, 'status.editor.inputMode', 1 /* StatusbarAlignment.RIGHT */, 100.6);
            }
        }
        else {
            this.inputModeElement.clear();
        }
    }
    updateColumnSelectionModeElement(visible) {
        if (visible) {
            if (!this.columnSelectionModeElement.value) {
                const text = localize('columnSelectionModeEnabled', "Column Selection");
                this.columnSelectionModeElement.value = this.statusbarService.addEntry({
                    name: localize('status.editor.columnSelectionMode', "Column Selection Mode"),
                    text,
                    ariaLabel: text,
                    tooltip: localize('disableColumnSelectionMode', "Disable Column Selection Mode"),
                    command: 'editor.action.toggleColumnSelection',
                    kind: 'prominent'
                }, 'status.editor.columnSelectionMode', 1 /* StatusbarAlignment.RIGHT */, 100.8);
            }
        }
        else {
            this.columnSelectionModeElement.clear();
        }
    }
    updateSelectionElement(text) {
        if (!text) {
            this.selectionElement.clear();
            return;
        }
        const editorURI = getCodeEditor(this.editorService.activeTextEditorControl)?.getModel()?.uri;
        if (editorURI?.scheme === Schemas.vscodeNotebookCell) {
            this.selectionElement.clear();
            return;
        }
        const props = {
            name: localize('status.editor.selection', "Editor Selection"),
            text,
            ariaLabel: text,
            tooltip: localize('gotoLine', "Go to Line/Column"),
            command: 'workbench.action.gotoLine'
        };
        this.updateElement(this.selectionElement, props, 'status.editor.selection', 1 /* StatusbarAlignment.RIGHT */, 100.5);
    }
    updateIndentationElement(text) {
        if (!text) {
            this.indentationElement.clear();
            return;
        }
        const editorURI = getCodeEditor(this.editorService.activeTextEditorControl)?.getModel()?.uri;
        if (editorURI?.scheme === Schemas.vscodeNotebookCell) {
            this.indentationElement.clear();
            return;
        }
        const props = {
            name: localize('status.editor.indentation', "Editor Indentation"),
            text,
            ariaLabel: text,
            tooltip: localize('selectIndentation', "Select Indentation"),
            command: `changeEditorIndentation${this.targetWindowId}`
        };
        this.updateElement(this.indentationElement, props, 'status.editor.indentation', 1 /* StatusbarAlignment.RIGHT */, 100.4);
    }
    updateEncodingElement(text) {
        if (!text) {
            this.encodingElement.clear();
            return;
        }
        const props = {
            name: localize('status.editor.encoding', "Editor Encoding"),
            text,
            ariaLabel: text,
            tooltip: localize('selectEncoding', "Select Encoding"),
            command: 'workbench.action.editor.changeEncoding'
        };
        this.updateElement(this.encodingElement, props, 'status.editor.encoding', 1 /* StatusbarAlignment.RIGHT */, 100.3);
    }
    updateEOLElement(text) {
        if (!text) {
            this.eolElement.clear();
            return;
        }
        const props = {
            name: localize('status.editor.eol', "Editor End of Line"),
            text,
            ariaLabel: text,
            tooltip: localize('selectEOL', "Select End of Line Sequence"),
            command: 'workbench.action.editor.changeEOL'
        };
        this.updateElement(this.eolElement, props, 'status.editor.eol', 1 /* StatusbarAlignment.RIGHT */, 100.2);
    }
    updateLanguageIdElement(text) {
        if (!text) {
            this.languageElement.clear();
            return;
        }
        const props = {
            name: localize('status.editor.mode', "Editor Language"),
            text,
            ariaLabel: text,
            tooltip: localize('selectLanguageMode', "Select Language Mode"),
            command: 'workbench.action.editor.changeLanguageMode'
        };
        this.updateElement(this.languageElement, props, 'status.editor.mode', 1 /* StatusbarAlignment.RIGHT */, 100.1);
    }
    updateMetadataElement(text) {
        if (!text) {
            this.metadataElement.clear();
            return;
        }
        const props = {
            name: localize('status.editor.info', "File Information"),
            text,
            ariaLabel: text,
            tooltip: localize('fileInfo', "File Information")
        };
        this.updateElement(this.metadataElement, props, 'status.editor.info', 1 /* StatusbarAlignment.RIGHT */, 100);
    }
    updateElement(element, props, id, alignment, priority) {
        if (!element.value) {
            element.value = this.statusbarService.addEntry(props, id, alignment, priority);
        }
        else {
            element.value.update(props);
        }
    }
    updateState(update) {
        const changed = this.state.update(update);
        if (!changed.hasChanges()) {
            return; // Nothing really changed
        }
        if (!this.toRender) {
            this.toRender = changed;
            this.delayedRender.value = runAtThisOrScheduleAtNextAnimationFrame(getWindowById(this.targetWindowId, true).window, () => {
                this.delayedRender.clear();
                const toRender = this.toRender;
                this.toRender = undefined;
                if (toRender) {
                    this.doRenderNow();
                }
            });
        }
        else {
            this.toRender.combine(changed);
        }
    }
    doRenderNow() {
        this.updateTabFocusModeElement(!!this.state.tabFocusMode);
        this.updateInputModeElement(this.state.inputMode);
        this.updateColumnSelectionModeElement(!!this.state.columnSelectionMode);
        this.updateIndentationElement(this.state.indentation);
        this.updateSelectionElement(this.state.selectionStatus);
        this.updateEncodingElement(this.state.encoding);
        this.updateEOLElement(this.state.EOL ? this.state.EOL === '\r\n' ? nlsEOLCRLF : nlsEOLLF : undefined);
        this.updateLanguageIdElement(this.state.languageId);
        this.updateMetadataElement(this.state.metadata);
    }
    getSelectionLabel(info) {
        if (!info?.selections) {
            return undefined;
        }
        if (info.selections.length === 1) {
            if (info.charactersSelected) {
                return format(nlsSingleSelectionRange, info.selections[0].positionLineNumber, info.selections[0].positionColumn, info.charactersSelected);
            }
            return format(nlsSingleSelection, info.selections[0].positionLineNumber, info.selections[0].positionColumn);
        }
        if (info.charactersSelected) {
            return format(nlsMultiSelectionRange, info.selections.length, info.charactersSelected);
        }
        if (info.selections.length > 0) {
            return format(nlsMultiSelection, info.selections.length);
        }
        return undefined;
    }
    updateStatusBar() {
        const activeInput = this.editorService.activeEditor;
        const activeEditorPane = this.editorService.activeEditorPane;
        const activeCodeEditor = activeEditorPane ? getCodeEditor(activeEditorPane.getControl()) ?? undefined : undefined;
        // Update all states
        this.onColumnSelectionModeChange(activeCodeEditor);
        this.onSelectionChange(activeCodeEditor);
        this.onLanguageChange(activeCodeEditor, activeInput);
        this.onEOLChange(activeCodeEditor);
        this.onEncodingChange(activeEditorPane, activeCodeEditor);
        this.onIndentationChange(activeCodeEditor);
        this.onMetadataChange(activeEditorPane);
        this.currentMarkerStatus.update(activeCodeEditor);
        // Dispose old active editor listeners
        this.activeEditorListeners.clear();
        // Attach new listeners to active editor
        if (activeEditorPane) {
            this.activeEditorListeners.add(activeEditorPane.onDidChangeControl(() => {
                // Since our editor status is mainly observing the
                // active editor control, do a full update whenever
                // the control changes.
                this.updateStatusBar();
            }));
        }
        // Attach new listeners to active code editor
        if (activeCodeEditor) {
            // Hook Listener for Configuration changes
            this.activeEditorListeners.add(activeCodeEditor.onDidChangeConfiguration((event) => {
                if (event.hasChanged(28 /* EditorOption.columnSelection */)) {
                    this.onColumnSelectionModeChange(activeCodeEditor);
                }
            }));
            // Hook Listener for Selection changes
            this.activeEditorListeners.add(Event.defer(activeCodeEditor.onDidChangeCursorPosition)(() => {
                this.onSelectionChange(activeCodeEditor);
                this.currentMarkerStatus.update(activeCodeEditor);
            }));
            // Hook Listener for language changes
            this.activeEditorListeners.add(activeCodeEditor.onDidChangeModelLanguage(() => {
                this.onLanguageChange(activeCodeEditor, activeInput);
            }));
            // Hook Listener for content changes
            this.activeEditorListeners.add(Event.accumulate(activeCodeEditor.onDidChangeModelContent)(e => {
                this.onEOLChange(activeCodeEditor);
                this.currentMarkerStatus.update(activeCodeEditor);
                const selections = activeCodeEditor.getSelections();
                if (selections) {
                    for (const inner of e) {
                        for (const change of inner.changes) {
                            if (selections.some(selection => Range.areIntersecting(selection, change.range))) {
                                this.onSelectionChange(activeCodeEditor);
                                break;
                            }
                        }
                    }
                }
            }));
            // Hook Listener for content options changes
            this.activeEditorListeners.add(activeCodeEditor.onDidChangeModelOptions(() => {
                this.onIndentationChange(activeCodeEditor);
            }));
        }
        // Handle binary editors
        else if (activeEditorPane instanceof BaseBinaryResourceEditor || activeEditorPane instanceof BinaryResourceDiffEditor) {
            const binaryEditors = [];
            if (activeEditorPane instanceof BinaryResourceDiffEditor) {
                const primary = activeEditorPane.getPrimaryEditorPane();
                if (primary instanceof BaseBinaryResourceEditor) {
                    binaryEditors.push(primary);
                }
                const secondary = activeEditorPane.getSecondaryEditorPane();
                if (secondary instanceof BaseBinaryResourceEditor) {
                    binaryEditors.push(secondary);
                }
            }
            else {
                binaryEditors.push(activeEditorPane);
            }
            for (const editor of binaryEditors) {
                this.activeEditorListeners.add(editor.onDidChangeMetadata(() => {
                    this.onMetadataChange(activeEditorPane);
                }));
                this.activeEditorListeners.add(editor.onDidOpenInPlace(() => {
                    this.updateStatusBar();
                }));
            }
        }
    }
    onLanguageChange(editorWidget, editorInput) {
        const info = { type: 'languageId', languageId: undefined };
        // We only support text based editors
        if (editorWidget && editorInput && toEditorWithLanguageSupport(editorInput)) {
            const textModel = editorWidget.getModel();
            if (textModel) {
                const languageId = textModel.getLanguageId();
                info.languageId = this.languageService.getLanguageName(languageId) ?? undefined;
            }
        }
        this.updateState(info);
    }
    onIndentationChange(editorWidget) {
        const update = { type: 'indentation', indentation: undefined };
        if (editorWidget) {
            const model = editorWidget.getModel();
            if (model) {
                const modelOpts = model.getOptions();
                update.indentation = (modelOpts.insertSpaces
                    ? modelOpts.tabSize === modelOpts.indentSize
                        ? localize('spacesSize', "Spaces: {0}", modelOpts.indentSize)
                        : localize('spacesAndTabsSize', "Spaces: {0} (Tab Size: {1})", modelOpts.indentSize, modelOpts.tabSize)
                    : localize({ key: 'tabSize', comment: ['Tab corresponds to the tab key'] }, "Tab Size: {0}", modelOpts.tabSize));
            }
        }
        this.updateState(update);
    }
    onMetadataChange(editor) {
        const update = { type: 'metadata', metadata: undefined };
        if (editor instanceof BaseBinaryResourceEditor || editor instanceof BinaryResourceDiffEditor) {
            update.metadata = editor.getMetadata();
        }
        this.updateState(update);
    }
    onColumnSelectionModeChange(editorWidget) {
        const info = { type: 'columnSelectionMode', columnSelectionMode: false };
        if (editorWidget?.getOption(28 /* EditorOption.columnSelection */)) {
            info.columnSelectionMode = true;
        }
        this.updateState(info);
    }
    onSelectionChange(editorWidget) {
        const info = Object.create(null);
        // We only support text based editors
        if (editorWidget) {
            // Compute selection(s)
            info.selections = editorWidget.getSelections() || [];
            // Compute selection length
            info.charactersSelected = 0;
            const textModel = editorWidget.getModel();
            if (textModel) {
                for (const selection of info.selections) {
                    if (typeof info.charactersSelected !== 'number') {
                        info.charactersSelected = 0;
                    }
                    info.charactersSelected += textModel.getCharacterCountInRange(selection);
                }
            }
            // Compute the visible column for one selection. This will properly handle tabs and their configured widths
            if (info.selections.length === 1) {
                const editorPosition = editorWidget.getPosition();
                const selectionClone = new Selection(info.selections[0].selectionStartLineNumber, info.selections[0].selectionStartColumn, info.selections[0].positionLineNumber, editorPosition ? editorWidget.getStatusbarColumn(editorPosition) : info.selections[0].positionColumn);
                info.selections[0] = selectionClone;
            }
        }
        this.updateState({ type: 'selectionStatus', selectionStatus: this.getSelectionLabel(info) });
    }
    onEOLChange(editorWidget) {
        const info = { type: 'EOL', EOL: undefined };
        if (editorWidget && !editorWidget.getOption(104 /* EditorOption.readOnly */)) {
            const codeEditorModel = editorWidget.getModel();
            if (codeEditorModel) {
                info.EOL = codeEditorModel.getEOL();
            }
        }
        this.updateState(info);
    }
    onEncodingChange(editor, editorWidget) {
        if (editor && !this.isActiveEditor(editor)) {
            return;
        }
        const info = { type: 'encoding', encoding: undefined };
        // We only support text based editors that have a model associated
        // This ensures we do not show the encoding picker while an editor
        // is still loading.
        if (editor && editorWidget?.hasModel()) {
            const encodingSupport = editor.input ? toEditorWithEncodingSupport(editor.input) : null;
            if (encodingSupport) {
                const rawEncoding = encodingSupport.getEncoding();
                const encodingInfo = typeof rawEncoding === 'string' ? SUPPORTED_ENCODINGS[rawEncoding] : undefined;
                if (encodingInfo) {
                    info.encoding = encodingInfo.labelShort; // if we have a label, take it from there
                }
                else {
                    info.encoding = rawEncoding; // otherwise use it raw
                }
            }
        }
        this.updateState(info);
    }
    onResourceEncodingChange(resource) {
        const activeEditorPane = this.editorService.activeEditorPane;
        if (activeEditorPane) {
            const activeResource = EditorResourceAccessor.getCanonicalUri(activeEditorPane.input, { supportSideBySide: SideBySideEditor.PRIMARY });
            if (activeResource && isEqual(activeResource, resource)) {
                const activeCodeEditor = getCodeEditor(activeEditorPane.getControl()) ?? undefined;
                return this.onEncodingChange(activeEditorPane, activeCodeEditor); // only update if the encoding changed for the active resource
            }
        }
    }
    onTabFocusModeChange(tabFocusMode) {
        const info = { type: 'tabFocusMode', tabFocusMode };
        this.updateState(info);
    }
    onInputModeChange(inputMode) {
        const info = { type: 'inputMode', inputMode };
        this.updateState(info);
    }
    isActiveEditor(control) {
        const activeEditorPane = this.editorService.activeEditorPane;
        return !!activeEditorPane && activeEditorPane === control;
    }
};
EditorStatus = __decorate([
    __param(1, IEditorService),
    __param(2, IQuickInputService),
    __param(3, ILanguageService),
    __param(4, ITextFileService),
    __param(5, IStatusbarService),
    __param(6, IInstantiationService),
    __param(7, IConfigurationService)
], EditorStatus);
let EditorStatusContribution = class EditorStatusContribution extends Disposable {
    static { this.ID = 'workbench.contrib.editorStatus'; }
    constructor(editorGroupService) {
        super();
        this.editorGroupService = editorGroupService;
        for (const part of editorGroupService.parts) {
            this.createEditorStatus(part);
        }
        this._register(editorGroupService.onDidCreateAuxiliaryEditorPart(part => this.createEditorStatus(part)));
    }
    createEditorStatus(part) {
        const disposables = new DisposableStore();
        Event.once(part.onWillDispose)(() => disposables.dispose());
        const scopedInstantiationService = this.editorGroupService.getScopedInstantiationService(part);
        disposables.add(scopedInstantiationService.createInstance(EditorStatus, part.windowId));
    }
};
EditorStatusContribution = __decorate([
    __param(0, IEditorGroupsService)
], EditorStatusContribution);
export { EditorStatusContribution };
let ShowCurrentMarkerInStatusbarContribution = class ShowCurrentMarkerInStatusbarContribution extends Disposable {
    constructor(statusbarService, markerService, configurationService) {
        super();
        this.statusbarService = statusbarService;
        this.markerService = markerService;
        this.configurationService = configurationService;
        this.editor = undefined;
        this.markers = [];
        this.currentMarker = null;
        this.statusBarEntryAccessor = this._register(new MutableDisposable());
        this._register(markerService.onMarkerChanged(changedResources => this.onMarkerChanged(changedResources)));
        this._register(Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('problems.showCurrentInStatus'))(() => this.updateStatus()));
    }
    update(editor) {
        this.editor = editor;
        this.updateMarkers();
        this.updateStatus();
    }
    updateStatus() {
        const previousMarker = this.currentMarker;
        this.currentMarker = this.getMarker();
        if (this.hasToUpdateStatus(previousMarker, this.currentMarker)) {
            if (this.currentMarker) {
                const line = splitLines(this.currentMarker.message)[0];
                const text = `${this.getType(this.currentMarker)} ${line}`;
                if (!this.statusBarEntryAccessor.value) {
                    this.statusBarEntryAccessor.value = this.statusbarService.addEntry({ name: localize('currentProblem', "Current Problem"), text, ariaLabel: text }, 'statusbar.currentProblem', 0 /* StatusbarAlignment.LEFT */);
                }
                else {
                    this.statusBarEntryAccessor.value.update({ name: localize('currentProblem', "Current Problem"), text, ariaLabel: text });
                }
            }
            else {
                this.statusBarEntryAccessor.clear();
            }
        }
    }
    hasToUpdateStatus(previousMarker, currentMarker) {
        if (!currentMarker) {
            return true;
        }
        if (!previousMarker) {
            return true;
        }
        return IMarkerData.makeKey(previousMarker) !== IMarkerData.makeKey(currentMarker);
    }
    getType(marker) {
        switch (marker.severity) {
            case MarkerSeverity.Error: return '$(error)';
            case MarkerSeverity.Warning: return '$(warning)';
            case MarkerSeverity.Info: return '$(info)';
        }
        return '';
    }
    getMarker() {
        if (!this.configurationService.getValue('problems.showCurrentInStatus')) {
            return null;
        }
        if (!this.editor) {
            return null;
        }
        const model = this.editor.getModel();
        if (!model) {
            return null;
        }
        const position = this.editor.getPosition();
        if (!position) {
            return null;
        }
        return this.markers.find(marker => Range.containsPosition(marker, position)) || null;
    }
    onMarkerChanged(changedResources) {
        if (!this.editor) {
            return;
        }
        const model = this.editor.getModel();
        if (!model) {
            return;
        }
        if (model && !changedResources.some(r => isEqual(model.uri, r))) {
            return;
        }
        this.updateMarkers();
    }
    updateMarkers() {
        if (!this.editor) {
            return;
        }
        const model = this.editor.getModel();
        if (!model) {
            return;
        }
        if (model) {
            this.markers = this.markerService.read({
                resource: model.uri,
                severities: MarkerSeverity.Error | MarkerSeverity.Warning | MarkerSeverity.Info
            });
            this.markers.sort(this.compareMarker);
        }
        else {
            this.markers = [];
        }
        this.updateStatus();
    }
    compareMarker(a, b) {
        let res = compare(a.resource.toString(), b.resource.toString());
        if (res === 0) {
            res = MarkerSeverity.compare(a.severity, b.severity);
        }
        if (res === 0) {
            res = Range.compareRangesUsingStarts(a, b);
        }
        return res;
    }
};
ShowCurrentMarkerInStatusbarContribution = __decorate([
    __param(0, IStatusbarService),
    __param(1, IMarkerService),
    __param(2, IConfigurationService)
], ShowCurrentMarkerInStatusbarContribution);
export class ChangeLanguageAction extends Action2 {
    static { this.ID = 'workbench.action.editor.changeLanguageMode'; }
    constructor() {
        super({
            id: ChangeLanguageAction.ID,
            title: localize2('changeMode', 'Change Language Mode'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 43 /* KeyCode.KeyM */)
            },
            precondition: ContextKeyExpr.not('notebookEditorFocused'),
            metadata: {
                description: localize('changeLanguageMode.description', "Change the language mode of the active text editor."),
                args: [
                    {
                        name: localize('changeLanguageMode.arg.name', "The name of the language mode to change to."),
                        constraint: (value) => typeof value === 'string',
                    }
                ]
            }
        });
    }
    async run(accessor, languageMode) {
        const quickInputService = accessor.get(IQuickInputService);
        const editorService = accessor.get(IEditorService);
        const languageService = accessor.get(ILanguageService);
        const languageDetectionService = accessor.get(ILanguageDetectionService);
        const textFileService = accessor.get(ITextFileService);
        const preferencesService = accessor.get(IPreferencesService);
        const configurationService = accessor.get(IConfigurationService);
        const telemetryService = accessor.get(ITelemetryService);
        const commandService = accessor.get(ICommandService);
        const galleryService = accessor.get(IExtensionGalleryService);
        const activeTextEditorControl = getCodeEditor(editorService.activeTextEditorControl);
        if (!activeTextEditorControl) {
            await quickInputService.pick([{ label: localize('noEditor', "No text editor active at this time") }]);
            return;
        }
        const textModel = activeTextEditorControl.getModel();
        const resource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
        // Compute language
        let currentLanguageName;
        let currentLanguageId;
        if (textModel) {
            currentLanguageId = textModel.getLanguageId();
            currentLanguageName = languageService.getLanguageName(currentLanguageId) ?? undefined;
        }
        let hasLanguageSupport = !!resource;
        if (resource?.scheme === Schemas.untitled && !textFileService.untitled.get(resource)?.hasAssociatedFilePath) {
            hasLanguageSupport = false; // no configuration for untitled resources (e.g. "Untitled-1")
        }
        // All languages are valid picks
        const languages = languageService.getSortedRegisteredLanguageNames();
        const picks = languages
            .map(({ languageName, languageId }) => {
            const extensions = languageService.getExtensions(languageId).join(' ');
            let description;
            if (currentLanguageName === languageName) {
                description = localize('languageDescription', "({0}) - Configured Language", languageId);
            }
            else {
                description = localize('languageDescriptionConfigured', "({0})", languageId);
            }
            return {
                id: languageId,
                label: languageName,
                meta: extensions,
                iconClasses: getIconClassesForLanguageId(languageId),
                description
            };
        });
        picks.unshift({ type: 'separator', label: localize('languagesPicks', "languages (identifier)") });
        // Offer action to configure via settings
        let configureLanguageAssociations;
        let configureLanguageSettings;
        let galleryAction;
        if (hasLanguageSupport && resource) {
            const ext = extname(resource) || basename(resource);
            if (galleryService.isEnabled()) {
                galleryAction = toAction({
                    id: 'workbench.action.showLanguageExtensions',
                    label: localize('showLanguageExtensions', "Search Marketplace Extensions for '{0}'...", ext),
                    run: () => commandService.executeCommand('workbench.extensions.action.showExtensionsForLanguage', ext)
                });
                picks.unshift(galleryAction);
            }
            configureLanguageSettings = { label: localize('configureModeSettings', "Configure '{0}' language based settings...", currentLanguageName) };
            picks.unshift(configureLanguageSettings);
            configureLanguageAssociations = { label: localize('configureAssociationsExt', "Configure File Association for '{0}'...", ext) };
            picks.unshift(configureLanguageAssociations);
        }
        // Offer to "Auto Detect", but only if the document is not empty.
        const autoDetectLanguage = { label: localize('autoDetect', "Auto Detect") };
        if (textModel && textModel.getValueLength() > 0) {
            picks.unshift(autoDetectLanguage);
        }
        const pick = typeof languageMode === 'string' ? { label: languageMode } : await quickInputService.pick(picks, { placeHolder: localize('pickLanguage', "Select Language Mode"), matchOnDescription: true });
        if (!pick) {
            return;
        }
        if (pick === galleryAction) {
            galleryAction.run();
            return;
        }
        // User decided to permanently configure associations, return right after
        if (pick === configureLanguageAssociations) {
            if (resource) {
                this.configureFileAssociation(resource, languageService, quickInputService, configurationService);
            }
            return;
        }
        // User decided to configure settings for current language
        if (pick === configureLanguageSettings) {
            preferencesService.openUserSettings({ jsonEditor: true, revealSetting: { key: `[${currentLanguageId ?? null}]`, edit: true } });
            return;
        }
        // Change language for active editor
        const activeEditor = editorService.activeEditor;
        if (activeEditor) {
            const languageSupport = toEditorWithLanguageSupport(activeEditor);
            if (languageSupport) {
                // Find language
                let languageSelection;
                let detectedLanguage;
                if (pick === autoDetectLanguage) {
                    if (textModel) {
                        const resource = EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
                        if (resource) {
                            // Detect languages since we are in an untitled file
                            let languageId = languageService.guessLanguageIdByFilepathOrFirstLine(resource, textModel.getLineContent(1)) ?? undefined;
                            if (!languageId || languageId === 'unknown') {
                                detectedLanguage = await languageDetectionService.detectLanguage(resource);
                                languageId = detectedLanguage;
                            }
                            if (languageId) {
                                languageSelection = languageService.createById(languageId);
                            }
                        }
                    }
                }
                else {
                    languageSelection = languageService.createById(pick.id);
                    if (resource) {
                        // fire and forget to not slow things down
                        languageDetectionService.detectLanguage(resource).then(detectedLanguageId => {
                            const chosenLanguageId = languageService.getLanguageIdByLanguageName(pick.label) || 'unknown';
                            if (detectedLanguageId === currentLanguageId && currentLanguageId !== chosenLanguageId) {
                                // If they didn't choose the detected language (which should also be the active language if automatic detection is enabled)
                                // then the automatic language detection was likely wrong and the user is correcting it. In this case, we want telemetry.
                                // Keep track of what model was preferred and length of input to help track down potential differences between the result quality across models and content size.
                                const modelPreference = configurationService.getValue('workbench.editor.preferHistoryBasedLanguageDetection') ? 'history' : 'classic';
                                telemetryService.publicLog2(AutomaticLanguageDetectionLikelyWrongId, {
                                    currentLanguageId: currentLanguageName ?? 'unknown',
                                    nextLanguageId: pick.label,
                                    lineCount: textModel?.getLineCount() ?? -1,
                                    modelPreference,
                                });
                            }
                        });
                    }
                }
                // Change language
                if (typeof languageSelection !== 'undefined') {
                    languageSupport.setLanguageId(languageSelection.languageId, ChangeLanguageAction.ID);
                    if (resource?.scheme === Schemas.untitled) {
                        const modelPreference = configurationService.getValue('workbench.editor.preferHistoryBasedLanguageDetection') ? 'history' : 'classic';
                        telemetryService.publicLog2('setUntitledDocumentLanguage', {
                            to: languageSelection.languageId,
                            from: currentLanguageId ?? 'none',
                            modelPreference,
                        });
                    }
                }
            }
            activeTextEditorControl.focus();
        }
    }
    configureFileAssociation(resource, languageService, quickInputService, configurationService) {
        const extension = extname(resource);
        const base = basename(resource);
        const currentAssociation = languageService.guessLanguageIdByFilepathOrFirstLine(URI.file(base));
        const languages = languageService.getSortedRegisteredLanguageNames();
        const picks = languages.map(({ languageName, languageId }) => {
            return {
                id: languageId,
                label: languageName,
                iconClasses: getIconClassesForLanguageId(languageId),
                description: (languageId === currentAssociation) ? localize('currentAssociation', "Current Association") : undefined
            };
        });
        setTimeout(async () => {
            const language = await quickInputService.pick(picks, { placeHolder: localize('pickLanguageToConfigure', "Select Language Mode to Associate with '{0}'", extension || base) });
            if (language) {
                const fileAssociationsConfig = configurationService.inspect(FILES_ASSOCIATIONS_CONFIG);
                let associationKey;
                if (extension && base[0] !== '.') {
                    associationKey = `*${extension}`; // only use "*.ext" if the file path is in the form of <name>.<ext>
                }
                else {
                    associationKey = base; // otherwise use the basename (e.g. .gitignore, Dockerfile)
                }
                // If the association is already being made in the workspace, make sure to target workspace settings
                let target = 2 /* ConfigurationTarget.USER */;
                if (fileAssociationsConfig.workspaceValue?.[associationKey]) {
                    target = 5 /* ConfigurationTarget.WORKSPACE */;
                }
                // Make sure to write into the value of the target and not the merged value from USER and WORKSPACE config
                const currentAssociations = deepClone((target === 5 /* ConfigurationTarget.WORKSPACE */) ? fileAssociationsConfig.workspaceValue : fileAssociationsConfig.userValue) || Object.create(null);
                currentAssociations[associationKey] = language.id;
                configurationService.updateValue(FILES_ASSOCIATIONS_CONFIG, currentAssociations, target);
            }
        }, 50 /* quick input is sensitive to being opened so soon after another */);
    }
}
export class ChangeEOLAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.editor.changeEOL',
            title: localize2('changeEndOfLine', 'Change End of Line Sequence'),
            f1: true
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const quickInputService = accessor.get(IQuickInputService);
        const activeTextEditorControl = getCodeEditor(editorService.activeTextEditorControl);
        if (!activeTextEditorControl) {
            await quickInputService.pick([{ label: localize('noEditor', "No text editor active at this time") }]);
            return;
        }
        if (editorService.activeEditor?.isReadonly()) {
            await quickInputService.pick([{ label: localize('noWritableCodeEditor', "The active code editor is read-only.") }]);
            return;
        }
        let textModel = activeTextEditorControl.getModel();
        const EOLOptions = [
            { label: nlsEOLLF, eol: 0 /* EndOfLineSequence.LF */ },
            { label: nlsEOLCRLF, eol: 1 /* EndOfLineSequence.CRLF */ },
        ];
        const selectedIndex = (textModel?.getEOL() === '\n') ? 0 : 1;
        const eol = await quickInputService.pick(EOLOptions, { placeHolder: localize('pickEndOfLine', "Select End of Line Sequence"), activeItem: EOLOptions[selectedIndex] });
        if (eol) {
            const activeCodeEditor = getCodeEditor(editorService.activeTextEditorControl);
            if (activeCodeEditor?.hasModel() && !editorService.activeEditor?.isReadonly()) {
                textModel = activeCodeEditor.getModel();
                textModel.pushStackElement();
                textModel.pushEOL(eol.eol);
                textModel.pushStackElement();
            }
        }
        activeTextEditorControl.focus();
    }
}
export class ChangeEncodingAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.editor.changeEncoding',
            title: localize2('changeEncoding', 'Change File Encoding'),
            f1: true
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const quickInputService = accessor.get(IQuickInputService);
        const fileService = accessor.get(IFileService);
        const textFileService = accessor.get(ITextFileService);
        const textResourceConfigurationService = accessor.get(ITextResourceConfigurationService);
        const dialogService = accessor.get(IDialogService);
        const activeTextEditorControl = getCodeEditor(editorService.activeTextEditorControl);
        if (!activeTextEditorControl) {
            await quickInputService.pick([{ label: localize('noEditor', "No text editor active at this time") }]);
            return;
        }
        const activeEditorPane = editorService.activeEditorPane;
        if (!activeEditorPane) {
            await quickInputService.pick([{ label: localize('noEditor', "No text editor active at this time") }]);
            return;
        }
        const encodingSupport = toEditorWithEncodingSupport(activeEditorPane.input);
        if (!encodingSupport) {
            await quickInputService.pick([{ label: localize('noFileEditor', "No file active at this time") }]);
            return;
        }
        const saveWithEncodingPick = { label: localize('saveWithEncoding', "Save with Encoding") };
        const reopenWithEncodingPick = { label: localize('reopenWithEncoding', "Reopen with Encoding") };
        if (!Language.isDefaultVariant()) {
            const saveWithEncodingAlias = 'Save with Encoding';
            if (saveWithEncodingAlias !== saveWithEncodingPick.label) {
                saveWithEncodingPick.detail = saveWithEncodingAlias;
            }
            const reopenWithEncodingAlias = 'Reopen with Encoding';
            if (reopenWithEncodingAlias !== reopenWithEncodingPick.label) {
                reopenWithEncodingPick.detail = reopenWithEncodingAlias;
            }
        }
        let action;
        if (encodingSupport instanceof UntitledTextEditorInput) {
            action = saveWithEncodingPick;
        }
        else if (activeEditorPane.input.isReadonly()) {
            action = reopenWithEncodingPick;
        }
        else {
            action = await quickInputService.pick([reopenWithEncodingPick, saveWithEncodingPick], { placeHolder: localize('pickAction', "Select Action"), matchOnDetail: true });
        }
        if (!action) {
            return;
        }
        await timeout(50); // quick input is sensitive to being opened so soon after another
        const resource = EditorResourceAccessor.getOriginalUri(activeEditorPane.input, { supportSideBySide: SideBySideEditor.PRIMARY });
        if (!resource || (!fileService.hasProvider(resource) && resource.scheme !== Schemas.untitled)) {
            return; // encoding detection only possible for resources the file service can handle or that are untitled
        }
        let guessedEncoding = undefined;
        if (fileService.hasProvider(resource)) {
            const content = await textFileService.readStream(resource, {
                autoGuessEncoding: true,
                candidateGuessEncodings: textResourceConfigurationService.getValue(resource, 'files.candidateGuessEncodings')
            });
            guessedEncoding = content.encoding;
        }
        const isReopenWithEncoding = (action === reopenWithEncodingPick);
        const configuredEncoding = textResourceConfigurationService.getValue(resource, 'files.encoding');
        let directMatchIndex;
        let aliasMatchIndex;
        // All encodings are valid picks
        const picks = Object.keys(SUPPORTED_ENCODINGS)
            .sort((k1, k2) => {
            if (k1 === configuredEncoding) {
                return -1;
            }
            else if (k2 === configuredEncoding) {
                return 1;
            }
            return SUPPORTED_ENCODINGS[k1].order - SUPPORTED_ENCODINGS[k2].order;
        })
            .filter(k => {
            if (k === guessedEncoding && guessedEncoding !== configuredEncoding) {
                return false; // do not show encoding if it is the guessed encoding that does not match the configured
            }
            return !isReopenWithEncoding || !SUPPORTED_ENCODINGS[k].encodeOnly; // hide those that can only be used for encoding if we are about to decode
        })
            .map((key, index) => {
            if (key === encodingSupport.getEncoding()) {
                directMatchIndex = index;
            }
            else if (SUPPORTED_ENCODINGS[key].alias === encodingSupport.getEncoding()) {
                aliasMatchIndex = index;
            }
            return { id: key, label: SUPPORTED_ENCODINGS[key].labelLong, description: key };
        });
        const items = picks.slice();
        // If we have a guessed encoding, show it first unless it matches the configured encoding
        if (guessedEncoding && configuredEncoding !== guessedEncoding && SUPPORTED_ENCODINGS[guessedEncoding]) {
            picks.unshift({ type: 'separator' });
            picks.unshift({ id: guessedEncoding, label: SUPPORTED_ENCODINGS[guessedEncoding].labelLong, description: localize('guessedEncoding', "Guessed from content") });
        }
        const encoding = await quickInputService.pick(picks, {
            placeHolder: isReopenWithEncoding ? localize('pickEncodingForReopen', "Select File Encoding to Reopen File") : localize('pickEncodingForSave', "Select File Encoding to Save with"),
            activeItem: items[typeof directMatchIndex === 'number' ? directMatchIndex : typeof aliasMatchIndex === 'number' ? aliasMatchIndex : -1]
        });
        if (!encoding) {
            return;
        }
        if (!editorService.activeEditorPane) {
            return;
        }
        const activeEncodingSupport = toEditorWithEncodingSupport(editorService.activeEditorPane.input);
        if (typeof encoding.id !== 'undefined' && activeEncodingSupport) {
            // Re-open with encoding does not work on dirty editors, ask to revert
            if (isReopenWithEncoding && editorService.activeEditorPane.input.isDirty()) {
                const { confirmed } = await dialogService.confirm({
                    message: localize('reopenWithEncodingWarning', "Do you want to revert the active text editor and reopen with a different encoding?"),
                    detail: localize('reopenWithEncodingDetail', "This will discard any unsaved changes."),
                    primaryButton: localize('reopen', "Discard Changes and Reopen")
                });
                if (!confirmed) {
                    return;
                }
                await editorService.activeEditorPane.input.revert(editorService.activeEditorPane.group.id);
            }
            // Set new encoding
            await activeEncodingSupport.setEncoding(encoding.id, isReopenWithEncoding ? 1 /* EncodingMode.Decode */ : 0 /* EncodingMode.Encode */);
        }
        activeTextEditorControl.focus();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yU3RhdHVzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvclN0YXR1cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLDBCQUEwQixDQUFDO0FBQ2xDLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLGFBQWEsRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxZQUFZLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN0RixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFXLFFBQVEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUN2RyxPQUFPLEVBQW9CLHNCQUFzQixFQUFlLGdCQUFnQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFFcEgsT0FBTyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUd0RyxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUNySCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsZUFBZSxFQUFFLG9CQUFv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