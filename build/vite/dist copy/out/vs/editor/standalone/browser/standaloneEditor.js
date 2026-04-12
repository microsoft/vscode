/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { mainWindow } from '../../../base/browser/window.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { splitLines } from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import './standalone-tokens.css';
import { FontMeasurements } from '../../browser/config/fontMeasurements.js';
import { EditorCommand } from '../../browser/editorExtensions.js';
import { ICodeEditorService } from '../../browser/services/codeEditorService.js';
import { createWebWorker as actualCreateWebWorker } from './standaloneWebWorker.js';
import { ApplyUpdateResult, ConfigurationChangedEvent, EditorOptions } from '../../common/config/editorOptions.js';
import { EditorZoom } from '../../common/config/editorZoom.js';
import { BareFontInfo, FontInfo } from '../../common/config/fontInfo.js';
import { EditorType } from '../../common/editorCommon.js';
import * as languages from '../../common/languages.js';
import { ILanguageService } from '../../common/languages/language.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../common/languages/modesRegistry.js';
import { NullState, nullTokenize } from '../../common/languages/nullTokenize.js';
import { FindMatch, TextModelResolvedOptions } from '../../common/model.js';
import { IModelService } from '../../common/services/model.js';
import * as standaloneEnums from '../../common/standalone/standaloneEnums.js';
import { Colorizer } from './colorizer.js';
import { StandaloneDiffEditor2, StandaloneEditor, createTextModel } from './standaloneCodeEditor.js';
import { StandaloneKeybindingService, StandaloneServices } from './standaloneServices.js';
import { IStandaloneThemeService } from '../common/standaloneTheme.js';
import { MenuId, MenuRegistry } from '../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { IMarkerService } from '../../../platform/markers/common/markers.js';
import { IOpenerService } from '../../../platform/opener/common/opener.js';
import { MultiDiffEditorWidget } from '../../browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { IWebWorkerService } from '../../../platform/webWorker/browser/webWorkerService.js';
/**
 * Create a new editor under `domElement`.
 * `domElement` should be empty (not contain other dom nodes).
 * The editor will read the size of `domElement`.
 */
export function create(domElement, options, override) {
    const instantiationService = StandaloneServices.initialize(override || {});
    return instantiationService.createInstance(StandaloneEditor, domElement, options);
}
/**
 * Emitted when an editor is created.
 * Creating a diff editor might cause this listener to be invoked with the two editors.
 * @event
 */
export function onDidCreateEditor(listener) {
    const codeEditorService = StandaloneServices.get(ICodeEditorService);
    return codeEditorService.onCodeEditorAdd((editor) => {
        listener(editor);
    });
}
/**
 * Emitted when an diff editor is created.
 * @event
 */
export function onDidCreateDiffEditor(listener) {
    const codeEditorService = StandaloneServices.get(ICodeEditorService);
    return codeEditorService.onDiffEditorAdd((editor) => {
        listener(editor);
    });
}
/**
 * Get all the created editors.
 */
export function getEditors() {
    const codeEditorService = StandaloneServices.get(ICodeEditorService);
    return codeEditorService.listCodeEditors();
}
/**
 * Get all the created diff editors.
 */
export function getDiffEditors() {
    const codeEditorService = StandaloneServices.get(ICodeEditorService);
    return codeEditorService.listDiffEditors();
}
/**
 * Create a new diff editor under `domElement`.
 * `domElement` should be empty (not contain other dom nodes).
 * The editor will read the size of `domElement`.
 */
export function createDiffEditor(domElement, options, override) {
    const instantiationService = StandaloneServices.initialize(override || {});
    return instantiationService.createInstance(StandaloneDiffEditor2, domElement, options);
}
export function createMultiFileDiffEditor(domElement, override) {
    const instantiationService = StandaloneServices.initialize(override || {});
    return new MultiDiffEditorWidget(domElement, {}, instantiationService);
}
/**
 * Add a command.
 */
export function addCommand(descriptor) {
    if ((typeof descriptor.id !== 'string') || (typeof descriptor.run !== 'function')) {
        throw new Error('Invalid command descriptor, `id` and `run` are required properties!');
    }
    return CommandsRegistry.registerCommand(descriptor.id, descriptor.run);
}
/**
 * Add an action to all editors.
 */
export function addEditorAction(descriptor) {
    if ((typeof descriptor.id !== 'string') || (typeof descriptor.label !== 'string') || (typeof descriptor.run !== 'function')) {
        throw new Error('Invalid action descriptor, `id`, `label` and `run` are required properties!');
    }
    const precondition = ContextKeyExpr.deserialize(descriptor.precondition);
    const run = (accessor, ...args) => {
        return EditorCommand.runEditorCommand(accessor, args, precondition, (accessor, editor, args) => Promise.resolve(descriptor.run(editor, ...args)));
    };
    const toDispose = new DisposableStore();
    // Register the command
    toDispose.add(CommandsRegistry.registerCommand(descriptor.id, run));
    // Register the context menu item
    if (descriptor.contextMenuGroupId) {
        const menuItem = {
            command: {
                id: descriptor.id,
                title: descriptor.label
            },
            when: precondition,
            group: descriptor.contextMenuGroupId,
            order: descriptor.contextMenuOrder || 0
        };
        toDispose.add(MenuRegistry.appendMenuItem(MenuId.EditorContext, menuItem));
    }
    // Register the keybindings
    if (Array.isArray(descriptor.keybindings)) {
        const keybindingService = StandaloneServices.get(IKeybindingService);
        if (!(keybindingService instanceof StandaloneKeybindingService)) {
            console.warn('Cannot add keybinding because the editor is configured with an unrecognized KeybindingService');
        }
        else {
            const keybindingsWhen = ContextKeyExpr.and(precondition, ContextKeyExpr.deserialize(descriptor.keybindingContext));
            toDispose.add(keybindingService.addDynamicKeybindings(descriptor.keybindings.map((keybinding) => {
                return {
                    keybinding,
                    command: descriptor.id,
                    when: keybindingsWhen
                };
            })));
        }
    }
    return toDispose;
}
/**
 * Add a keybinding rule.
 */
export function addKeybindingRule(rule) {
    return addKeybindingRules([rule]);
}
/**
 * Add keybinding rules.
 */
export function addKeybindingRules(rules) {
    const keybindingService = StandaloneServices.get(IKeybindingService);
    if (!(keybindingService instanceof StandaloneKeybindingService)) {
        console.warn('Cannot add keybinding because the editor is configured with an unrecognized KeybindingService');
        return Disposable.None;
    }
    return keybindingService.addDynamicKeybindings(rules.map((rule) => {
        return {
            keybinding: rule.keybinding,
            command: rule.command,
            commandArgs: rule.commandArgs,
            when: ContextKeyExpr.deserialize(rule.when),
        };
    }));
}
/**
 * Create a new editor model.
 * You can specify the language that should be set for this model or let the language be inferred from the `uri`.
 */
export function createModel(value, language, uri) {
    const languageService = StandaloneServices.get(ILanguageService);
    const languageId = languageService.getLanguageIdByMimeType(language) || language;
    return createTextModel(StandaloneServices.get(IModelService), languageService, value, languageId, uri);
}
/**
 * Change the language for a model.
 */
export function setModelLanguage(model, mimeTypeOrLanguageId) {
    const languageService = StandaloneServices.get(ILanguageService);
    const languageId = languageService.getLanguageIdByMimeType(mimeTypeOrLanguageId) || mimeTypeOrLanguageId || PLAINTEXT_LANGUAGE_ID;
    model.setLanguage(languageService.createById(languageId));
}
/**
 * Set the markers for a model.
 */
export function setModelMarkers(model, owner, markers) {
    if (model) {
        const markerService = StandaloneServices.get(IMarkerService);
        markerService.changeOne(owner, model.uri, markers);
    }
}
/**
 * Remove all markers of an owner.
 */
export function removeAllMarkers(owner) {
    const markerService = StandaloneServices.get(IMarkerService);
    markerService.changeAll(owner, []);
}
/**
 * Get markers for owner and/or resource
 *
 * @returns list of markers
 */
export function getModelMarkers(filter) {
    const markerService = StandaloneServices.get(IMarkerService);
    return markerService.read(filter);
}
/**
 * Emitted when markers change for a model.
 * @event
 */
export function onDidChangeMarkers(listener) {
    const markerService = StandaloneServices.get(IMarkerService);
    return markerService.onMarkerChanged(listener);
}
/**
 * Get the model that has `uri` if it exists.
 */
export function getModel(uri) {
    const modelService = StandaloneServices.get(IModelService);
    return modelService.getModel(uri);
}
/**
 * Get all the created models.
 */
export function getModels() {
    const modelService = StandaloneServices.get(IModelService);
    return modelService.getModels();
}
/**
 * Emitted when a model is created.
 * @event
 */
export function onDidCreateModel(listener) {
    const modelService = StandaloneServices.get(IModelService);
    return modelService.onModelAdded(listener);
}
/**
 * Emitted right before a model is disposed.
 * @event
 */
export function onWillDisposeModel(listener) {
    const modelService = StandaloneServices.get(IModelService);
    return modelService.onModelRemoved(listener);
}
/**
 * Emitted when a different language is set to a model.
 * @event
 */
export function onDidChangeModelLanguage(listener) {
    const modelService = StandaloneServices.get(IModelService);
    return modelService.onModelLanguageChanged((e) => {
        listener({
            model: e.model,
            oldLanguage: e.oldLanguageId
        });
    });
}
/**
 * Create a new web worker that has model syncing capabilities built in.
 * Specify an AMD module to load that will `create` an object that will be proxied.
 */
export function createWebWorker(opts) {
    return actualCreateWebWorker(StandaloneServices.get(IModelService), StandaloneServices.get(IWebWorkerService), opts);
}
/**
 * Colorize the contents of `domNode` using attribute `data-lang`.
 */
export function colorizeElement(domNode, options) {
    const languageService = StandaloneServices.get(ILanguageService);
    const themeService = StandaloneServices.get(IStandaloneThemeService);
    return Colorizer.colorizeElement(themeService, languageService, domNode, options).then(() => {
        themeService.registerEditorContainer(domNode);
    });
}
/**
 * Colorize `text` using language `languageId`.
 */
export function colorize(text, languageId, options) {
    const languageService = StandaloneServices.get(ILanguageService);
    const themeService = StandaloneServices.get(IStandaloneThemeService);
    themeService.registerEditorContainer(mainWindow.document.body);
    return Colorizer.colorize(languageService, text, languageId, options);
}
/**
 * Colorize a line in a model.
 */
export function colorizeModelLine(model, lineNumber, tabSize = 4) {
    const themeService = StandaloneServices.get(IStandaloneThemeService);
    themeService.registerEditorContainer(mainWindow.document.body);
    return Colorizer.colorizeModelLine(model, lineNumber, tabSize);
}
/**
 * @internal
 */
function getSafeTokenizationSupport(language) {
    const tokenizationSupport = languages.TokenizationRegistry.get(language);
    if (tokenizationSupport) {
        return tokenizationSupport;
    }
    return {
        getInitialState: () => NullState,
        tokenize: (line, hasEOL, state) => nullTokenize(language, state)
    };
}
/**
 * Tokenize `text` using language `languageId`
 */
export function tokenize(text, languageId) {
    // Needed in order to get the mode registered for subsequent look-ups
    languages.TokenizationRegistry.getOrCreate(languageId);
    const tokenizationSupport = getSafeTokenizationSupport(languageId);
    const lines = splitLines(text);
    const result = [];
    let state = tokenizationSupport.getInitialState();
    for (let i = 0, len = lines.length; i < len; i++) {
        const line = lines[i];
        const tokenizationResult = tokenizationSupport.tokenize(line, true, state);
        result[i] = tokenizationResult.tokens;
        state = tokenizationResult.endState;
    }
    return result;
}
/**
 * Define a new theme or update an existing theme.
 */
export function defineTheme(themeName, themeData) {
    const standaloneThemeService = StandaloneServices.get(IStandaloneThemeService);
    standaloneThemeService.defineTheme(themeName, themeData);
}
/**
 * Switches to a theme.
 */
export function setTheme(themeName) {
    const standaloneThemeService = StandaloneServices.get(IStandaloneThemeService);
    standaloneThemeService.setTheme(themeName);
}
/**
 * Clears all cached font measurements and triggers re-measurement.
 */
export function remeasureFonts() {
    FontMeasurements.clearAllFontInfos();
}
/**
 * Register a command.
 */
export function registerCommand(id, handler) {
    return CommandsRegistry.registerCommand({ id, handler });
}
/**
 * Registers a handler that is called when a link is opened in any editor. The handler callback should return `true` if the link was handled and `false` otherwise.
 * The handler that was registered last will be called first when a link is opened.
 *
 * Returns a disposable that can unregister the opener again.
 */
export function registerLinkOpener(opener) {
    const openerService = StandaloneServices.get(IOpenerService);
    return openerService.registerOpener({
        async open(resource) {
            if (typeof resource === 'string') {
                resource = URI.parse(resource);
            }
            return opener.open(resource);
        }
    });
}
/**
 * Registers a handler that is called when a resource other than the current model should be opened in the editor (e.g. "go to definition").
 * The handler callback should return `true` if the request was handled and `false` otherwise.
 *
 * Returns a disposable that can unregister the opener again.
 *
 * If no handler is registered the default behavior is to do nothing for models other than the currently attached one.
 */
export function registerEditorOpener(opener) {
    const codeEditorService = StandaloneServices.get(ICodeEditorService);
    return codeEditorService.registerCodeEditorOpenHandler(async (input, source, sideBySide) => {
        if (!source) {
            return null;
        }
        const selection = input.options?.selection;
        let selectionOrPosition;
        if (selection && typeof selection.endLineNumber === 'number' && typeof selection.endColumn === 'number') {
            selectionOrPosition = selection;
        }
        else if (selection) {
            selectionOrPosition = { lineNumber: selection.startLineNumber, column: selection.startColumn };
        }
        if (await opener.openCodeEditor(source, input.resource, selectionOrPosition)) {
            return source; // return source editor to indicate that this handler has successfully handled the opening
        }
        return null; // fallback to other registered handlers
    });
}
/**
 * @internal
 */
export function createMonacoEditorAPI() {
    return {
        // methods
        // eslint-disable-next-line local/code-no-any-casts
        create: create,
        // eslint-disable-next-line local/code-no-any-casts
        getEditors: getEditors,
        // eslint-disable-next-line local/code-no-any-casts
        getDiffEditors: getDiffEditors,
        // eslint-disable-next-line local/code-no-any-casts
        onDidCreateEditor: onDidCreateEditor,
        // eslint-disable-next-line local/code-no-any-casts
        onDidCreateDiffEditor: onDidCreateDiffEditor,
        // eslint-disable-next-line local/code-no-any-casts
        createDiffEditor: createDiffEditor,
        // eslint-disable-next-line local/code-no-any-casts
        addCommand: addCommand,
        // eslint-disable-next-line local/code-no-any-casts
        addEditorAction: addEditorAction,
        // eslint-disable-next-line local/code-no-any-casts
        addKeybindingRule: addKeybindingRule,
        // eslint-disable-next-line local/code-no-any-casts
        addKeybindingRules: addKeybindingRules,
        // eslint-disable-next-line local/code-no-any-casts
        createModel: createModel,
        // eslint-disable-next-line local/code-no-any-casts
        setModelLanguage: setModelLanguage,
        // eslint-disable-next-line local/code-no-any-casts
        setModelMarkers: setModelMarkers,
        // eslint-disable-next-line local/code-no-any-casts
        getModelMarkers: getModelMarkers,
        removeAllMarkers: removeAllMarkers,
        // eslint-disable-next-line local/code-no-any-casts
        onDidChangeMarkers: onDidChangeMarkers,
        // eslint-disable-next-line local/code-no-any-casts
        getModels: getModels,
        // eslint-disable-next-line local/code-no-any-casts
        getModel: getModel,
        // eslint-disable-next-line local/code-no-any-casts
        onDidCreateModel: onDidCreateModel,
        // eslint-disable-next-line local/code-no-any-casts
        onWillDisposeModel: onWillDisposeModel,
        // eslint-disable-next-line local/code-no-any-casts
        onDidChangeModelLanguage: onDidChangeModelLanguage,
        // eslint-disable-next-line local/code-no-any-casts
        createWebWorker: createWebWorker,
        // eslint-disable-next-line local/code-no-any-casts
        colorizeElement: colorizeElement,
        // eslint-disable-next-line local/code-no-any-casts
        colorize: colorize,
        // eslint-disable-next-line local/code-no-any-casts
        colorizeModelLine: colorizeModelLine,
        // eslint-disable-next-line local/code-no-any-casts
        tokenize: tokenize,
        // eslint-disable-next-line local/code-no-any-casts
        defineTheme: defineTheme,
        // eslint-disable-next-line local/code-no-any-casts
        setTheme: setTheme,
        remeasureFonts: remeasureFonts,
        registerCommand: registerCommand,
        registerLinkOpener: registerLinkOpener,
        // eslint-disable-next-line local/code-no-any-casts
        registerEditorOpener: registerEditorOpener,
        // enums
        AccessibilitySupport: standaloneEnums.AccessibilitySupport,
        ContentWidgetPositionPreference: standaloneEnums.ContentWidgetPositionPreference,
        CursorChangeReason: standaloneEnums.CursorChangeReason,
        DefaultEndOfLine: standaloneEnums.DefaultEndOfLine,
        EditorAutoIndentStrategy: standaloneEnums.EditorAutoIndentStrategy,
        EditorOption: standaloneEnums.EditorOption,
        EndOfLinePreference: standaloneEnums.EndOfLinePreference,
        EndOfLineSequence: standaloneEnums.EndOfLineSequence,
        MinimapPosition: standaloneEnums.MinimapPosition,
        MinimapSectionHeaderStyle: standaloneEnums.MinimapSectionHeaderStyle,
        MouseTargetType: standaloneEnums.MouseTargetType,
        OverlayWidgetPositionPreference: standaloneEnums.OverlayWidgetPositionPreference,
        OverviewRulerLane: standaloneEnums.OverviewRulerLane,
        GlyphMarginLane: standaloneEnums.GlyphMarginLane,
        RenderLineNumbersType: standaloneEnums.RenderLineNumbersType,
        RenderMinimap: standaloneEnums.RenderMinimap,
        ScrollbarVisibility: standaloneEnums.ScrollbarVisibility,
        ScrollType: standaloneEnums.ScrollType,
        TextEditorCursorBlinkingStyle: standaloneEnums.TextEditorCursorBlinkingStyle,
        TextEditorCursorStyle: standaloneEnums.TextEditorCursorStyle,
        TrackedRangeStickiness: standaloneEnums.TrackedRangeStickiness,
        WrappingIndent: standaloneEnums.WrappingIndent,
        InjectedTextCursorStops: standaloneEnums.InjectedTextCursorStops,
        PositionAffinity: standaloneEnums.PositionAffinity,
        ShowLightbulbIconMode: standaloneEnums.ShowLightbulbIconMode,
        TextDirection: standaloneEnums.TextDirection,
        // classes
        // eslint-disable-next-line local/code-no-any-casts
        ConfigurationChangedEvent: ConfigurationChangedEvent,
        // eslint-disable-next-line local/code-no-any-casts
        BareFontInfo: BareFontInfo,
        // eslint-disable-next-line local/code-no-any-casts
        FontInfo: FontInfo,
        // eslint-disable-next-line local/code-no-any-casts
        TextModelResolvedOptions: TextModelResolvedOptions,
        // eslint-disable-next-line local/code-no-any-casts
        FindMatch: FindMatch,
        // eslint-disable-next-line local/code-no-any-casts
        ApplyUpdateResult: ApplyUpdateResult,
        // eslint-disable-next-line local/code-no-any-casts
        EditorZoom: EditorZoom,
        // eslint-disable-next-line local/code-no-any-casts
        createMultiFileDiffEditor: createMultiFileDiffEditor,
        // vars
        EditorType: EditorType,
        // eslint-disable-next-line local/code-no-any-casts
        EditorOptions: EditorOptions
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhbmRhbG9uZUVkaXRvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9zdGFuZGFsb25lL2Jyb3dzZXIvc3RhbmRhbG9uZUVkaXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8seUJBQXlCLENBQUM7QUFDakMsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFNUUsT0FBTyxFQUFFLGFBQWEsRUFBb0IsTUFBTSxtQ0FBbUMsQ0FBQztBQUNwRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNqRixPQUFPLEVBQThDLGVBQWUsSUFBSSxxQkFBcUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ2hJLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx5QkFBeUIsRUFBRSxhQUFhLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuSCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUd6RSxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sOEJBQThCLENBQUM7QUFDdkUsT0FBTyxLQUFLLFNBQVMsTUFBTSwyQkFBMkIsQ0FBQztBQUN2RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUscUJB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