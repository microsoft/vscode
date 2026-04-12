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
var WordHighlighter_1, WordHighlighterContribution_1;
import * as nls from '../../../../nls.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { createCancelablePromise, Delayer, first } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { onUnexpectedError, onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { matchesScheme, Schemas } from '../../../../base/common/network.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { isDiffEditor } from '../../../browser/editorBrowser.js';
import { EditorAction, registerEditorAction, registerEditorContribution, registerModelAndPositionCommand } from '../../../browser/editorExtensions.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { Range } from '../../../common/core/range.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { registerEditorFeature } from '../../../common/editorFeatures.js';
import { score } from '../../../common/languageSelector.js';
import { shouldSynchronizeModel } from '../../../common/model.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { ITextModelService } from '../../../common/services/resolverService.js';
import { getHighlightDecorationOptions } from './highlightDecorations.js';
import { TextualMultiDocumentHighlightFeature } from './textualHighlightProvider.js';
const ctxHasWordHighlights = new RawContextKey('hasWordHighlights', false);
export function getOccurrencesAtPosition(registry, model, position, token) {
    const orderedByScore = registry.ordered(model);
    // in order of score ask the occurrences provider
    // until someone response with a good result
    // (good = non undefined and non null value)
    // (result of size == 0 is valid, no highlights is a valid/expected result -- not a signal to fall back to other providers)
    return first(orderedByScore.map(provider => () => {
        return Promise.resolve(provider.provideDocumentHighlights(model, position, token))
            .then(undefined, onUnexpectedExternalError);
    }), (result) => result !== undefined && result !== null).then(result => {
        if (result) {
            const map = new ResourceMap();
            map.set(model.uri, result);
            return map;
        }
        return new ResourceMap();
    });
}
export function getOccurrencesAcrossMultipleModels(registry, model, position, token, otherModels) {
    const orderedByScore = registry.ordered(model);
    // in order of score ask the occurrences provider
    // until someone response with a good result
    // (good = non undefined and non null ResourceMap)
    // (result of size == 0 is valid, no highlights is a valid/expected result -- not a signal to fall back to other providers)
    return first(orderedByScore.map(provider => () => {
        const filteredModels = otherModels.filter(otherModel => {
            return shouldSynchronizeModel(otherModel);
        }).filter(otherModel => {
            return score(provider.selector, otherModel.uri, otherModel.getLanguageId(), true, undefined, undefined) > 0;
        });
        return Promise.resolve(provider.provideMultiDocumentHighlights(model, position, filteredModels, token))
            .then(undefined, onUnexpectedExternalError);
    }), (result) => result !== undefined && result !== null);
}
class OccurenceAtPositionRequest {
    constructor(_model, _selection, _wordSeparators) {
        this._model = _model;
        this._selection = _selection;
        this._wordSeparators = _wordSeparators;
        this._wordRange = this._getCurrentWordRange(_model, _selection);
        this._result = null;
    }
    get result() {
        if (!this._result) {
            this._result = createCancelablePromise(token => this._compute(this._model, this._selection, this._wordSeparators, token));
        }
        return this._result;
    }
    _getCurrentWordRange(model, selection) {
        const word = model.getWordAtPosition(selection.getPosition());
        if (word) {
            return new Range(selection.startLineNumber, word.startColumn, selection.startLineNumber, word.endColumn);
        }
        return null;
    }
    isValid(model, selection, decorations) {
        const lineNumber = selection.startLineNumber;
        const startColumn = selection.startColumn;
        const endColumn = selection.endColumn;
        const currentWordRange = this._getCurrentWordRange(model, selection);
        let requestIsValid = Boolean(this._wordRange && this._wordRange.equalsRange(currentWordRange));
        // Even if we are on a different word, if that word is in the decorations ranges, the request is still valid
        // (Same symbol)
        for (let i = 0, len = decorations.length; !requestIsValid && i < len; i++) {
            const range = decorations.getRange(i);
            if (range && range.startLineNumber === lineNumber) {
                if (range.startColumn <= startColumn && range.endColumn >= endColumn) {
                    requestIsValid = true;
                }
            }
        }
        return requestIsValid;
    }
    cancel() {
        this.result.cancel();
    }
}
class SemanticOccurenceAtPositionRequest extends OccurenceAtPositionRequest {
    constructor(model, selection, wordSeparators, providers) {
        super(model, selection, wordSeparators);
        this._providers = providers;
    }
    _compute(model, selection, wordSeparators, token) {
        return getOccurrencesAtPosition(this._providers, model, selection.getPosition(), token).then(value => {
            if (!value) {
                return new ResourceMap();
            }
            return value;
        });
    }
}
class MultiModelOccurenceRequest extends OccurenceAtPositionRequest {
    constructor(model, selection, wordSeparators, providers, otherModels) {
        super(model, selection, wordSeparators);
        this._providers = providers;
        this._otherModels = otherModels;
    }
    _compute(model, selection, wordSeparators, token) {
        return getOccurrencesAcrossMultipleModels(this._providers, model, selection.getPosition(), token, this._otherModels).then(value => {
            if (!value) {
                return new ResourceMap();
            }
            return value;
        });
    }
}
function computeOccurencesAtPosition(registry, model, selection, wordSeparators) {
    return new SemanticOccurenceAtPositionRequest(model, selection, wordSeparators, registry);
}
function computeOccurencesMultiModel(registry, model, selection, wordSeparators, otherModels) {
    return new MultiModelOccurenceRequest(model, selection, wordSeparators, registry, otherModels);
}
registerModelAndPositionCommand('_executeDocumentHighlights', async (accessor, model, position) => {
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const map = await getOccurrencesAtPosition(languageFeaturesService.documentHighlightProvider, model, position, CancellationToken.None);
    return map?.get(model.uri);
});
let WordHighlighter = class WordHighlighter {
    static { WordHighlighter_1 = this; }
    static { this.storedDecorationIDs = new ResourceMap(); }
    static { this.query = null; }
    constructor(editor, providers, multiProviders, contextKeyService, textModelService, codeEditorService, configurationService, logService) {
        this.toUnhook = new DisposableStore();
        this.workerRequestTokenId = 0;
        this.workerRequestCompleted = false;
        this.workerRequestValue = new ResourceMap();
        this.lastCursorPositionChangeTime = 0;
        this.renderDecorationsTimer = undefined;
        this.runDelayer = this.toUnhook.add(new Delayer(50));
        this.editor = editor;
        this.providers = providers;
        this.multiDocumentProviders = multiProviders;
        this.codeEditorService = codeEditorService;
        this.textModelService = textModelService;
        this.configurationService = configurationService;
        this.logService = logService;
        this._hasWordHighlights = ctxHasWordHighlights.bindTo(contextKeyService);
        this._ignorePositionChangeEvent = false;
        this.occurrencesHighlightEnablement = this.editor.getOption(90 /* EditorOption.occurrencesHighlight */);
        this.occurrencesHighlightDelay = this.configurationService.getValue('editor.occurrencesHighlightDelay');
        this.model = this.editor.getModel();
        this.toUnhook.add(editor.onDidChangeCursorPosition((e) => {
            if (this._ignorePositionChangeEvent) {
                // We are changing the position => ignore this event
                return;
            }
            if (this.occurrencesHighlightEnablement === 'off') {
                // Early exit if nothing needs to be done!
                // Leave some form of early exit check here if you wish to continue being a cursor position change listener ;)
                return;
            }
            this.runDelayer.trigger(() => { this._onPositionChanged(e); }).catch(onUnexpectedError);
        }));
        this.toUnhook.add(editor.onDidFocusEditorText((e) => {
            if (this.occurrencesHighlightEnablement === 'off') {
                // Early exit if nothing needs to be done
                return;
            }
            if (!this.workerRequest) {
                this.runDelayer.trigger(() => { this._run(); }).catch(onUnexpectedError);
            }
        }));
        this.toUnhook.add(editor.onDidChangeModelContent((e) => {
            if (!matchesScheme(this.model.uri, 'output')) {
                this._stopAll();
            }
        }));
        this.toUnhook.add(editor.onDidChangeModel((e) => {
            if (!e.newModelUrl && e.oldModelUrl) {
                this._stopSingular();
            }
            else if (WordHighlighter_1.query) {
                this._run();
            }
        }));
        this.toUnhook.add(editor.onDidChangeConfiguration((e) => {
            const newEnablement = this.editor.getOption(90 /* EditorOption.occurrencesHighlight */);
            if (this.occurrencesHighlightEnablement !== newEnablement) {
                this.occurrencesHighlightEnablement = newEnablement;
                switch (newEnablement) {
                    case 'off':
                        this._stopAll();
                        break;
                    case 'singleFile':
                        this._stopAll(WordHighlighter_1.query?.modelInfo?.modelURI);
                        break;
                    case 'multiFile':
                        if (WordHighlighter_1.query) {
                            this._run(true);
                        }
                        break;
                    default:
                        console.warn('Unknown occurrencesHighlight setting value:', newEnablement);
                        break;
                }
            }
        }));
        this.toUnhook.add(this.configurationService.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('editor.occurrencesHighlightDelay')) {
                const newDelay = configurationService.getValue('editor.occurrencesHighlightDelay');
                if (this.occurrencesHighlightDelay !== newDelay) {
                    this.occurrencesHighlightDelay = newDelay;
                }
            }
        }));
        this.toUnhook.add(editor.onDidBlurEditorWidget(() => {
            // logic is as follows
            // - didBlur => active null => stopall
            // - didBlur => active nb   => if this.editor is notebook, do nothing (new cell, so we don't want to stopAll)
            //              active nb   => if this.editor is NOT nb,   stopAll
            const activeEditor = this.codeEditorService.getFocusedCodeEditor();
            if (!activeEditor) { // clicked into nb cell list, outline, terminal, etc
                this._stopAll();
            }
            else if (activeEditor.getModel()?.uri.scheme === Schemas.vscodeNotebookCell && this.editor.getModel()?.uri.scheme !== Schemas.vscodeNotebookCell) { // switched tabs from non-nb to nb
                this._stopAll();
            }
        }));
        this.decorations = this.editor.createDecorationsCollection();
        this.workerRequestTokenId = 0;
        this.workerRequest = null;
        this.workerRequestCompleted = false;
        this.lastCursorPositionChangeTime = 0;
        this.renderDecorationsTimer = undefined;
        // if there is a query already, highlight off that query
        if (WordHighlighter_1.query) {
            this._run();
        }
    }
    hasDecorations() {
        return (this.decorations.length > 0);
    }
    restore(delay) {
        if (this.occurrencesHighlightEnablement === 'off') {
            return;
        }
        this.runDelayer.cancel();
        this.runDelayer.trigger(() => { this._run(false, delay); }).catch(onUnexpectedError);
    }
    trigger() {
        this.runDelayer.cancel();
        this._run(false, 0); // immediate rendering (delay = 0)
    }
    stop() {
        if (this.occurrencesHighlightEnablement === 'off') {
            return;
        }
        this._stopAll();
    }
    _getSortedHighlights() {
        return (this.decorations.getRanges()
            .sort(Range.compareRangesUsingStarts));
    }
    moveNext() {
        const highlights = this._getSortedHighlights();
        const index = highlights.findIndex((range) => range.containsPosition(this.editor.getPosition()));
        const newIndex = ((index + 1) % highlights.length);
        const dest = highlights[newIndex];
        try {
            this._ignorePositionChangeEvent = true;
            this.editor.setPosition(dest.getStartPosition());
            this.editor.revealRangeInCenterIfOutsideViewport(dest);
            const word = this._getWord();
            if (word) {
                const lineContent = this.editor.getModel().getLineContent(dest.startLineNumber);
                alert(`${lineContent}, ${newIndex + 1} of ${highlights.length} for '${word.word}'`);
            }
        }
        finally {
            this._ignorePositionChangeEvent = false;
        }
    }
    moveBack() {
        const highlights = this._getSortedHighlights();
        const index = highlights.findIndex((range) => range.containsPosition(this.editor.getPosition()));
        const newIndex = ((index - 1 + highlights.length) % highlights.length);
        const dest = highlights[newIndex];
        try {
            this._ignorePositionChangeEvent = true;
            this.editor.setPosition(dest.getStartPosition());
            this.editor.revealRangeInCenterIfOutsideViewport(dest);
            const word = this._getWord();
            if (word) {
                const lineContent = this.editor.getModel().getLineContent(dest.startLineNumber);
                alert(`${lineContent}, ${newIndex + 1} of ${highlights.length} for '${word.word}'`);
            }
        }
        finally {
            this._ignorePositionChangeEvent = false;
        }
    }
    _removeSingleDecorations() {
        // return if no model
        if (!this.editor.hasModel()) {
            return;
        }
        const currentDecorationIDs = WordHighlighter_1.storedDecorationIDs.get(this.editor.getModel().uri);
        if (!currentDecorationIDs) {
            return;
        }
        this.editor.removeDecorations(currentDecorationIDs);
        WordHighlighter_1.storedDecorationIDs.delete(this.editor.getModel().uri);
        if (this.decorations.length > 0) {
            this.decorations.clear();
            this._hasWordHighlights.set(false);
        }
    }
    _removeAllDecorations(preservedModel) {
        const currentEditors = this.codeEditorService.listCodeEditors();
        const deleteURI = [];
        // iterate over editors and store models in currentModels
        for (const editor of currentEditors) {
            if (!editor.hasModel() || isEqual(editor.getModel().uri, preservedModel)) {
                continue;
            }
            const currentDecorationIDs = WordHighlighter_1.storedDecorationIDs.get(editor.getModel().uri);
            if (!currentDecorationIDs) {
                continue;
            }
            editor.removeDecorations(currentDecorationIDs);
            deleteURI.push(editor.getModel().uri);
            const editorHighlighterContrib = WordHighlighterContribution.get(editor);
            if (!editorHighlighterContrib?.wordHighlighter) {
                continue;
            }
            if (editorHighlighterContrib.wordHighlighter.decorations.length > 0) {
                editorHighlighterContrib.wordHighlighter.decorations.clear();
                editorHighlighterContrib.wordHighlighter.workerRequest = null;
                editorHighlighterContrib.wordHighlighter._hasWordHighlights.set(false);
            }
        }
        for (const uri of deleteURI) {
            WordHighlighter_1.storedDecorationIDs.delete(uri);
        }
    }
    _stopSingular() {
        // Remove any existing decorations + a possible query, and re - run to update decorations
        this._removeSingleDecorations();
        if (this.editor.hasTextFocus()) {
            if (this.editor.getModel()?.uri.scheme !== Schemas.vscodeNotebookCell && WordHighlighter_1.query?.modelInfo?.modelURI.scheme !== Schemas.vscodeNotebookCell) { // clear query if focused non-nb editor
                WordHighlighter_1.query = null;
                this._run(); // TODO: @Yoyokrazy -- investigate why we need a full rerun here. likely addressed a case/patch in the first iteration of this feature
            }
            else { // remove modelInfo to account for nb cell being disposed
                if (WordHighlighter_1.query?.modelInfo) {
                    WordHighlighter_1.query.modelInfo = null;
                }
            }
        }
        // Cancel any renderDecorationsTimer
        if (this.renderDecorationsTimer !== undefined) {
            clearTimeout(this.renderDecorationsTimer);
            this.renderDecorationsTimer = undefined;
        }
        // Cancel any worker request
        if (this.workerRequest !== null) {
            this.workerRequest.cancel();
            this.workerRequest = null;
        }
        // Invalidate any worker request callback
        if (!this.workerRequestCompleted) {
            this.workerRequestTokenId++;
            this.workerRequestCompleted = true;
        }
    }
    _stopAll(preservedModel) {
        // Remove any existing decorations
        // TODO: @Yoyokrazy -- this triggers as notebooks scroll, causing highlights to disappear momentarily.
        // maybe a nb type check?
        this._removeAllDecorations(preservedModel);
        // Cancel any renderDecorationsTimer
        if (this.renderDecorationsTimer !== undefined) {
            clearTimeout(this.renderDecorationsTimer);
            this.renderDecorationsTimer = undefined;
        }
        // Cancel any worker request
        if (this.workerRequest !== null) {
            this.workerRequest.cancel();
            this.workerRequest = null;
        }
        // Invalidate any worker request callback
        if (!this.workerRequestCompleted) {
            this.workerRequestTokenId++;
            this.workerRequestCompleted = true;
        }
    }
    _onPositionChanged(e) {
        // disabled
        if (this.occurrencesHighlightEnablement === 'off') {
            this._stopAll();
            return;
        }
        // ignore typing & other
        // need to check if the model is a notebook cell, should not stop if nb
        if (e.source !== 'api' && e.reason !== 3 /* CursorChangeReason.Explicit */) {
            this._stopAll();
            return;
        }
        this._run();
    }
    _getWord() {
        const editorSelection = this.editor.getSelection();
        const lineNumber = editorSelection.startLineNumber;
        const startColumn = editorSelection.startColumn;
        if (this.model.isDisposed()) {
            return null;
        }
        return this.model.getWordAtPosition({
            lineNumber: lineNumber,
            column: startColumn
        });
    }
    getOtherModelsToHighlight(model) {
        if (!model) {
            return [];
        }
        // notebook case
        const isNotebookEditor = model.uri.scheme === Schemas.vscodeNotebookCell;
        if (isNotebookEditor) {
            const currentModels = [];
            const currentEditors = this.codeEditorService.listCodeEditors();
            for (const editor of currentEditors) {
                const tempModel = editor.getModel();
                if (tempModel && tempModel !== model && tempModel.uri.scheme === Schemas.vscodeNotebookCell) {
                    currentModels.push(tempModel);
                }
            }
            return currentModels;
        }
        // inline case
        // ? current works when highlighting outside of an inline diff, highlighting in.
        // ? broken when highlighting within a diff editor. highlighting the main editor does not work
        // ? editor group service could be useful here
        const currentModels = [];
        const currentEditors = this.codeEditorService.listCodeEditors();
        for (const editor of currentEditors) {
            if (!isDiffEditor(editor)) {
                continue;
            }
            const diffModel = editor.getModel();
            if (!diffModel) {
                continue;
            }
            if (model === diffModel.modified) { // embedded inline chat diff would pass this, allowing highlights
                //? currentModels.push(diffModel.original);
                currentModels.push(diffModel.modified);
            }
        }
        if (currentModels.length) { // no matching editors have been found
            return currentModels;
        }
        // multi-doc OFF
        if (this.occurrencesHighlightEnablement === 'singleFile') {
            return [];
        }
        // multi-doc ON
        for (const editor of currentEditors) {
            const tempModel = editor.getModel();
            const isValidModel = tempModel && tempModel !== model;
            if (isValidModel) {
                currentModels.push(tempModel);
            }
        }
        return currentModels;
    }
    async _run(multiFileConfigChange, delay) {
        const hasTextFocus = this.editor.hasTextFocus();
        if (!hasTextFocus) { // new nb cell scrolled in, didChangeModel fires
            if (!WordHighlighter_1.query) { // no previous query, nothing to highlight off of
                this._stopAll();
                return;
            }
        }
        else { // has text focus
            const editorSelection = this.editor.getSelection();
            // ignore multiline selection
            if (!editorSelection || editorSelection.startLineNumber !== editorSelection.endLineNumber) {
                WordHighlighter_1.query = null;
                this._stopAll();
                return;
            }
            const startColumn = editorSelection.startColumn;
            const endColumn = editorSelection.endColumn;
            const word = this._getWord();
            // The selection must be inside a word or surround one word at most
            if (!word || word.startColumn > startColumn || word.endColumn < endColumn) {
                // no previous query, nothing to highlight
                WordHighlighter_1.query = null;
                this._stopAll();
                return;
            }
            WordHighlighter_1.query = {
                modelInfo: {
                    modelURI: this.model.uri,
                    selection: editorSelection,
                }
            };
        }
        this.lastCursorPositionChangeTime = (new Date()).getTime();
        if (isEqual(this.editor.getModel().uri, WordHighlighter_1.query.modelInfo?.modelURI)) { // only trigger new worker requests from the primary model that initiated the query
            // case d)
            // check if the new queried word is contained in the range of a stored decoration for this model
            if (!multiFileConfigChange) {
                const currentModelDecorationRanges = this.decorations.getRanges();
                for (const storedRange of currentModelDecorationRanges) {
                    if (storedRange.containsPosition(this.editor.getPosition())) {
                        return;
                    }
                }
            }
            // stop all previous actions if new word is highlighted
            // if we trigger the run off a setting change -> multifile highlighting, we do not want to remove decorations from this model
            this._stopAll(multiFileConfigChange ? this.model.uri : undefined);
            const myRequestId = ++this.workerRequestTokenId;
            this.workerRequestCompleted = false;
            const otherModelsToHighlight = this.getOtherModelsToHighlight(this.editor.getModel());
            // when reaching here, there are two possible states.
            // 		1) we have text focus, and a valid query was updated.
            // 		2) we do not have text focus, and a valid query is cached.
            // the query will ALWAYS have the correct data for the current highlight request, so it can always be passed to the workerRequest safely
            if (!WordHighlighter_1.query || !WordHighlighter_1.query.modelInfo) {
                return;
            }
            const queryModelRef = await this.textModelService.createModelReference(WordHighlighter_1.query.modelInfo.modelURI);
            try {
                this.workerRequest = this.computeWithModel(queryModelRef.object.textEditorModel, WordHighlighter_1.query.modelInfo.selection, otherModelsToHighlight);
                this.workerRequest?.result.then(data => {
                    if (myRequestId === this.workerRequestTokenId) {
                        this.workerRequestCompleted = true;
                        this.workerRequestValue = data || [];
                        this._beginRenderDecorations(delay ?? this.occurrencesHighlightDelay);
                    }
                }, onUnexpectedError);
            }
            catch (e) {
                this.logService.error('Unexpected error during occurrence request. Log: ', e);
            }
            finally {
                queryModelRef.dispose();
            }
        }
        else if (this.model.uri.scheme === Schemas.vscodeNotebookCell) {
            // new wordHighlighter coming from a different model, NOT the query model, need to create a textModel ref
            const myRequestId = ++this.workerRequestTokenId;
            this.workerRequestCompleted = false;
            if (!WordHighlighter_1.query || !WordHighlighter_1.query.modelInfo) {
                return;
            }
            const queryModelRef = await this.textModelService.createModelReference(WordHighlighter_1.query.modelInfo.modelURI);
            try {
                this.workerRequest = this.computeWithModel(queryModelRef.object.textEditorModel, WordHighlighter_1.query.modelInfo.selection, [this.model]);
                this.workerRequest?.result.then(data => {
                    if (myRequestId === this.workerRequestTokenId) {
                        this.workerRequestCompleted = true;
                        this.workerRequestValue = data || [];
                        this._beginRenderDecorations(delay ?? this.occurrencesHighlightDelay);
                    }
                }, onUnexpectedError);
            }
            catch (e) {
                this.logService.error('Unexpected error during occurrence request. Log: ', e);
            }
            finally {
                queryModelRef.dispose();
            }
        }
    }
    computeWithModel(model, selection, otherModels) {
        if (!otherModels.length) {
            return computeOccurencesAtPosition(this.providers, model, selection, this.editor.getOption(148 /* EditorOption.wordSeparators */));
        }
        else {
            return computeOccurencesMultiModel(this.multiDocumentProviders, model, selection, this.editor.getOption(148 /* EditorOption.wordSeparators */), otherModels);
        }
    }
    _beginRenderDecorations(delay) {
        const currentTime = (new Date()).getTime();
        const minimumRenderTime = this.lastCursorPositionChangeTime + delay;
        if (currentTime >= minimumRenderTime) {
            // Synchronous
            this.renderDecorationsTimer = undefined;
            this.renderDecorations();
        }
        else {
            // Asynchronous
            this.renderDecorationsTimer = setTimeout(() => {
                this.renderDecorations();
            }, (minimumRenderTime - currentTime));
        }
    }
    renderDecorations() {
        this.renderDecorationsTimer = undefined;
        // create new loop, iterate over current editors using this.codeEditorService.listCodeEditors(),
        // if the URI of that codeEditor is in the map, then add the decorations to the decorations array
        // then set the decorations for the editor
        const currentEditors = this.codeEditorService.listCodeEditors();
        for (const editor of currentEditors) {
            const editorHighlighterContrib = WordHighlighterContribution.get(editor);
            if (!editorHighlighterContrib) {
                continue;
            }
            const newDecorations = [];
            const uri = editor.getModel()?.uri;
            if (uri && this.workerRequestValue.has(uri)) {
                const oldDecorationIDs = WordHighlighter_1.storedDecorationIDs.get(uri);
                const newDocumentHighlights = this.workerRequestValue.get(uri);
                if (newDocumentHighlights) {
                    for (const highlight of newDocumentHighlights) {
                        if (!highlight.range) {
                            continue;
                        }
                        newDecorations.push({
                            range: highlight.range,
                            options: getHighlightDecorationOptions(highlight.kind)
                        });
                    }
                }
                let newDecorationIDs = [];
                editor.changeDecorations((changeAccessor) => {
                    newDecorationIDs = changeAccessor.deltaDecorations(oldDecorationIDs ?? [], newDecorations);
                });
                WordHighlighter_1.storedDecorationIDs = WordHighlighter_1.storedDecorationIDs.set(uri, newDecorationIDs);
                if (newDecorations.length > 0) {
                    editorHighlighterContrib.wordHighlighter?.decorations.set(newDecorations);
                    editorHighlighterContrib.wordHighlighter?._hasWordHighlights.set(true);
                }
            }
        }
        // clear the worker request when decorations are completed
        this.workerRequest = null;
    }
    dispose() {
        this._stopSingular();
        this.toUnhook.dispose();
    }
};
WordHighlighter = WordHighlighter_1 = __decorate([
    __param(4, ITextModelService),
    __param(5, ICodeEditorService),
    __param(6, IConfigurationService),
    __param(7, ILogService)
], WordHighlighter);
let WordHighlighterContribution = class WordHighlighterContribution extends Disposable {
    static { WordHighlighterContribution_1 = this; }
    static { this.ID = 'editor.contrib.wordHighlighter'; }
    static get(editor) {
        return editor.getContribution(WordHighlighterContribution_1.ID);
    }
    constructor(editor, contextKeyService, languageFeaturesService, codeEditorService, textModelService, configurationService, logService) {
        super();
        this._wordHighlighter = null;
        const createWordHighlighterIfPossible = () => {
            if (editor.hasModel() && !editor.getModel().isTooLargeForTokenization() && editor.getModel().uri.scheme !== Schemas.accessibleView) {
                this._wordHighlighter = new WordHighlighter(editor, languageFeaturesService.documentHighlightProvider, languageFeaturesService.multiDocumentHighlightProvider, contextKeyService, textModelService, codeEditorService, configurationService, logService);
            }
        };
        this._register(editor.onDidChangeModel((e) => {
            if (this._wordHighlighter) {
                if (!e.newModelUrl && e.oldModelUrl?.scheme !== Schemas.vscodeNotebookCell) { // happens when switching tabs to a notebook that has focus in the cell list, no new model URI (this also doesn't make it to the wordHighlighter, bc no editor.hasModel)
                    this.wordHighlighter?.stop();
                }
                this._wordHighlighter.dispose();
                this._wordHighlighter = null;
            }
            createWordHighlighterIfPossible();
        }));
        createWordHighlighterIfPossible();
    }
    get wordHighlighter() {
        return this._wordHighlighter;
    }
    saveViewState() {
        if (this._wordHighlighter && this._wordHighlighter.hasDecorations()) {
            return true;
        }
        return false;
    }
    moveNext() {
        this._wordHighlighter?.moveNext();
    }
    moveBack() {
        this._wordHighlighter?.moveBack();
    }
    restoreViewState(state) {
        if (this._wordHighlighter && state) {
            this._wordHighlighter.restore(250); // 250 ms delay to restoring view state, since only exts call this
        }
    }
    stopHighlighting() {
        this._wordHighlighter?.stop();
    }
    dispose() {
        if (this._wordHighlighter) {
            this._wordHighlighter.dispose();
            this._wordHighlighter = null;
        }
        super.dispose();
    }
};
WordHighlighterContribution = WordHighlighterContribution_1 = __decorate([
    __param(1, IContextKeyService),
    __param(2, ILanguageFeaturesService),
    __param(3, ICodeEditorService),
    __param(4, ITextModelService),
    __param(5, IConfigurationService),
    __param(6, ILogService)
], WordHighlighterContribution);
export { WordHighlighterContribution };
class WordHighlightNavigationAction extends EditorAction {
    constructor(next, opts) {
        super(opts);
        this._isNext = next;
    }
    run(accessor, editor) {
        const controller = WordHighlighterContribution.get(editor);
        if (!controller) {
            return;
        }
        if (this._isNext) {
            controller.moveNext();
        }
        else {
            controller.moveBack();
        }
    }
}
class NextWordHighlightAction extends WordHighlightNavigationAction {
    constructor() {
        super(true, {
            id: 'editor.action.wordHighlight.next',
            label: nls.localize2('wordHighlight.next.label', "Go to Next Symbol Highlight"),
            precondition: ctxHasWordHighlights,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: 65 /* KeyCode.F7 */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
}
class PrevWordHighlightAction extends WordHighlightNavigationAction {
    constructor() {
        super(false, {
            id: 'editor.action.wordHighlight.prev',
            label: nls.localize2('wordHighlight.previous.label', "Go to Previous Symbol Highlight"),
            precondition: ctxHasWordHighlights,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: 1024 /* KeyMod.Shift */ | 65 /* KeyCode.F7 */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
}
class TriggerWordHighlightAction extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.wordHighlight.trigger',
            label: nls.localize2('wordHighlight.trigger.label', "Trigger Symbol Highlight"),
            precondition: undefined,
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: 0,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    run(accessor, editor) {
        const controller = WordHighlighterContribution.get(editor);
        if (!controller) {
            return;
        }
        controller.restoreViewState(true);
    }
}
registerEditorContribution(WordHighlighterContribution.ID, WordHighlighterContribution, 0 /* EditorContributionInstantiation.Eager */); // eager because it uses `saveViewState`/`restoreViewState`
registerEditorAction(NextWordHighlightAction);
registerEditorAction(PrevWordHighlightAction);
registerEditorAction(TriggerWordHighlightAction);
registerEditorFeature(TextualMultiDocumentHighlightFeature);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29yZEhpZ2hsaWdodGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvd29yZEhpZ2hsaWdodGVyL2Jyb3dzZXIvd29yZEhpZ2hsaWdodGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNqRSxPQUFPLEVBQXFCLHVCQUF1QixFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM5RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUVqRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsYUFBYSxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUUvRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQWUsa0JBQWtCLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFHdEgsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBa0MsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDakcsT0FBTyxFQUFFLFlBQVksRUFBbUQsb0JBQW9CLEVBQUUsMEJBQTBCLEVBQUUsK0JB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