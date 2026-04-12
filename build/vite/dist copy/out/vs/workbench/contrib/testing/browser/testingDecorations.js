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
var TestingDecorations_1, TestMessageDecoration_1;
import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { Action, Separator, SubmenuAction } from '../../../../base/common/actions.js';
import { equals } from '../../../../base/common/arrays.js';
import { mapFindFirst } from '../../../../base/common/arraysFind.js';
import { RunOnceScheduler, Throttler, timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { stripIcons } from '../../../../base/common/iconLabels.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { clamp } from '../../../../base/common/numbers.js';
import { autorun } from '../../../../base/common/observable.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { count, truncateMiddle } from '../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { overviewRulerError, overviewRulerInfo } from '../../../../editor/common/core/editorColorRegistry.js';
import { Position } from '../../../../editor/common/core/position.js';
import { GlyphMarginLane, OverviewRulerLane } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { localize } from '../../../../nls.js';
import { getFlatContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { EditorLineNumberContextMenu, GutterActionsRegistry } from '../../codeEditor/browser/editorLineNumberMenu.js';
import { getTestingConfiguration } from '../common/configuration.js';
import { labelForTestInState } from '../common/constants.js';
import { TestId } from '../common/testId.js';
import { ITestProfileService } from '../common/testProfileService.js';
import { LiveTestResult } from '../common/testResult.js';
import { ITestResultService } from '../common/testResultService.js';
import { ITestService, getContextForTestItem, simplifyTestsToExecute, testsInFile } from '../common/testService.js';
import { ITestingDecorationsService, TestDecorations } from '../common/testingDecorations.js';
import { ITestingPeekOpener } from '../common/testingPeekOpener.js';
import { isFailedState, maxPriority } from '../common/testingStates.js';
import { buildTestUri, parseTestUri } from '../common/testingUri.js';
import { getTestItemContextOverlay } from './explorerProjections/testItemContextOverlay.js';
import { testingDebugAllIcon, testingDebugIcon, testingRunAllIcon, testingRunIcon, testingStatesToIcons } from './icons.js';
import { renderTestMessageAsText } from './testMessageColorizer.js';
import { MessageSubject } from './testResultsView/testResultsSubject.js';
import { TestingOutputPeekController } from './testingOutputPeek.js';
const MAX_INLINE_MESSAGE_LENGTH = 128;
const MAX_TESTS_IN_SUBMENU = 30;
const GLYPH_MARGIN_LANE = GlyphMarginLane.Center;
function isOriginalInDiffEditor(codeEditorService, codeEditor) {
    const diffEditors = codeEditorService.listDiffEditors();
    for (const diffEditor of diffEditors) {
        if (diffEditor.getOriginalEditor() === codeEditor) {
            return true;
        }
    }
    return false;
}
/** Value for saved decorations, providing fast accessors for the hot 'syncDecorations' path */
class CachedDecorations {
    constructor() {
        this.runByIdKey = new Map();
    }
    get size() {
        return this.runByIdKey.size;
    }
    /** Gets a test run decoration that contains exactly the given test IDs */
    getForExactTests(testIds) {
        const key = testIds.sort().join('\0\0');
        return this.runByIdKey.get(key);
    }
    /** Adds a new test run decroation */
    addTest(d) {
        const key = d.testIds.sort().join('\0\0');
        this.runByIdKey.set(key, d);
    }
    /** Finds an extension by VS Code event ID */
    getById(decorationId) {
        for (const d of this.runByIdKey.values()) {
            if (d.id === decorationId) {
                return d;
            }
        }
        return undefined;
    }
    /** Iterate over all decorations */
    *[Symbol.iterator]() {
        for (const d of this.runByIdKey.values()) {
            yield d;
        }
    }
}
let TestingDecorationService = class TestingDecorationService extends Disposable {
    constructor(codeEditorService, configurationService, testService, results, instantiationService, modelService) {
        super();
        this.configurationService = configurationService;
        this.testService = testService;
        this.results = results;
        this.instantiationService = instantiationService;
        this.modelService = modelService;
        this.generation = 0;
        this.changeEmitter = this._register(new Emitter());
        this.decorationCache = new ResourceMap();
        /**
         * List of messages that should be hidden because an editor changed their
         * underlying ranges. I think this is good enough, because:
         *  - Message decorations are never shown across reloads; this does not
         *    need to persist
         *  - Message instances are stable for any completed test results for
         *    the duration of the session.
         */
        this.invalidatedMessages = new WeakSet();
        /** @inheritdoc */
        this.onDidChange = this.changeEmitter.event;
        this._register(codeEditorService.registerDecorationType('test-message-decoration', TestMessageDecoration.decorationId, {}, undefined));
        this._register(modelService.onModelRemoved(e => this.decorationCache.delete(e.uri)));
        const debounceInvalidate = this._register(new RunOnceScheduler(() => this.invalidate(), 100));
        // If ranges were updated in the document, mark that we should explicitly
        // sync decorations to the published lines, since we assume that everything
        // is up to date. This prevents issues, as in #138632, #138835, #138922.
        this._register(this.testService.onWillProcessDiff(diff => {
            for (const entry of diff) {
                if (entry.op !== 2 /* TestDiffOpType.DocumentSynced */) {
                    continue;
                }
                const rec = this.decorationCache.get(entry.uri);
                if (rec) {
                    rec.rangeUpdateVersionId = entry.docv;
                }
            }
            if (!debounceInvalidate.isScheduled()) {
                debounceInvalidate.schedule();
            }
        }));
        this._register(Event.any(this.results.onResultsChanged, this.results.onTestChanged, this.testService.excluded.onTestExclusionsChanged, Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration("testing.gutterEnabled" /* TestingConfigKeys.GutterEnabled */)))(() => {
            if (!debounceInvalidate.isScheduled()) {
                debounceInvalidate.schedule();
            }
        }));
        this._register(GutterActionsRegistry.registerGutterActionsGenerator((context, result) => {
            const model = context.editor.getModel();
            const testingDecorations = TestingDecorations.get(context.editor);
            if (!model || !testingDecorations?.currentUri) {
                return;
            }
            const currentDecorations = this.syncDecorations(testingDecorations.currentUri);
            if (!currentDecorations.size) {
                return;
            }
            const modelDecorations = model.getLinesDecorations(context.lineNumber, context.lineNumber);
            for (const { id } of modelDecorations) {
                const decoration = currentDecorations.getById(id);
                if (decoration) {
                    const { object: actions } = decoration.getContextMenuActions();
                    for (const action of actions) {
                        result.push(action, '1_testing');
                    }
                }
            }
        }));
    }
    /** @inheritdoc */
    invalidateResultMessage(message) {
        this.invalidatedMessages.add(message);
        this.invalidate();
    }
    /** @inheritdoc */
    syncDecorations(resource) {
        const model = this.modelService.getModel(resource);
        if (!model) {
            return new CachedDecorations();
        }
        const cached = this.decorationCache.get(resource);
        if (cached && cached.generation === this.generation && (cached.rangeUpdateVersionId === undefined || cached.rangeUpdateVersionId !== model.getVersionId())) {
            return cached.value;
        }
        return this.applyDecorations(model);
    }
    /** @inheritdoc */
    getDecoratedTestPosition(resource, testId) {
        const model = this.modelService.getModel(resource);
        if (!model) {
            return undefined;
        }
        const decoration = Iterable.find(this.syncDecorations(resource), v => v instanceof RunTestDecoration && v.isForTest(testId));
        if (!decoration) {
            return undefined;
        }
        // decoration is collapsed, so the range is meaningless; only position matters.
        return model.getDecorationRange(decoration.id)?.getStartPosition();
    }
    invalidate() {
        this.generation++;
        this.changeEmitter.fire();
    }
    /**
     * Sets whether alternate actions are shown for the model.
     */
    updateDecorationsAlternateAction(resource, isAlt) {
        const model = this.modelService.getModel(resource);
        const cached = this.decorationCache.get(resource);
        if (!model || !cached || cached.isAlt === isAlt) {
            return;
        }
        cached.isAlt = isAlt;
        model.changeDecorations(accessor => {
            for (const decoration of cached.value) {
                if (decoration instanceof RunTestDecoration && decoration.editorDecoration.alternate) {
                    accessor.changeDecorationOptions(decoration.id, isAlt ? decoration.editorDecoration.alternate : decoration.editorDecoration.options);
                }
            }
        });
    }
    /**
     * Applies the current set of test decorations to the given text model.
     */
    applyDecorations(model) {
        const gutterEnabled = getTestingConfiguration(this.configurationService, "testing.gutterEnabled" /* TestingConfigKeys.GutterEnabled */);
        const cached = this.decorationCache.get(model.uri);
        const testRangesUpdated = cached?.rangeUpdateVersionId === model.getVersionId();
        const lastDecorations = cached?.value ?? new CachedDecorations();
        const newDecorations = model.changeDecorations(accessor => {
            const newDecorations = new CachedDecorations();
            const runDecorations = new TestDecorations();
            for (const test of this.testService.collection.getNodeByUrl(model.uri)) {
                if (!test.item.range) {
                    continue;
                }
                const stateLookup = this.results.getStateById(test.item.extId);
                const line = test.item.range.startLineNumber;
                runDecorations.push({ line, id: '', test, resultItem: stateLookup?.[1] });
            }
            for (const [line, tests] of runDecorations.lines()) {
                const multi = tests.length > 1;
                let existing = lastDecorations.getForExactTests(tests.map(t => t.test.item.extId));
                // see comment in the constructor for what's going on here
                if (existing && testRangesUpdated && model.getDecorationRange(existing.id)?.startLineNumber !== line) {
                    existing = undefined;
                }
                if (existing) {
                    if (existing.replaceOptions(tests, gutterEnabled)) {
                        accessor.changeDecorationOptions(existing.id, existing.editorDecoration.options);
                    }
                    newDecorations.addTest(existing);
                }
                else {
                    newDecorations.addTest(multi
                        ? this.instantiationService.createInstance(MultiRunTestDecoration, tests, gutterEnabled, model)
                        : this.instantiationService.createInstance(RunSingleTestDecoration, tests[0].test, tests[0].resultItem, model, gutterEnabled));
                }
            }
            const saveFromRemoval = new Set();
            for (const decoration of newDecorations) {
                if (decoration.id === '') {
                    decoration.id = accessor.addDecoration(decoration.editorDecoration.range, decoration.editorDecoration.options);
                }
                else {
                    saveFromRemoval.add(decoration.id);
                }
            }
            for (const decoration of lastDecorations) {
                if (!saveFromRemoval.has(decoration.id)) {
                    accessor.removeDecoration(decoration.id);
                }
            }
            this.decorationCache.set(model.uri, {
                generation: this.generation,
                rangeUpdateVersionId: cached?.rangeUpdateVersionId,
                value: newDecorations,
            });
            return newDecorations;
        });
        return newDecorations || lastDecorations;
    }
};
TestingDecorationService = __decorate([
    __param(0, ICodeEditorService),
    __param(1, IConfigurationService),
    __param(2, ITestService),
    __param(3, ITestResultService),
    __param(4, IInstantiationService),
    __param(5, IModelService)
], TestingDecorationService);
export { TestingDecorationService };
let TestingDecorations = class TestingDecorations extends Disposable {
    static { TestingDecorations_1 = this; }
    /**
     * Results invalidated by editor changes.
     */
    static { this.invalidatedTests = new WeakSet(); }
    /**
     * Gets the decorations associated with the given code editor.
     */
    static get(editor) {
        return editor.getContribution("editor.contrib.testingDecorations" /* Testing.DecorationsContributionId */);
    }
    get currentUri() { return this._currentUri; }
    constructor(editor, codeEditorService, testService, decorations, uriIdentityService, results, configurationService, instantiationService) {
        super();
        this.editor = editor;
        this.codeEditorService = codeEditorService;
        this.testService = testService;
        this.decorations = decorations;
        this.uriIdentityService = uriIdentityService;
        this.results = results;
        this.configurationService = configurationService;
        this.instantiationService = instantiationService;
        this.expectedWidget = this._register(new MutableDisposable());
        this.actualWidget = this._register(new MutableDisposable());
        this.errorContentWidgets = this._register(new DisposableMap());
        this.loggedMessageDecorations = new Map();
        this._register(codeEditorService.registerDecorationType('test-message-decoration', TestMessageDecoration.decorationId, {}, undefined, editor));
        this.attachModel(editor.getModel()?.uri);
        this._register(decorations.onDidChange(() => {
            if (this._currentUri) {
                decorations.syncDecorations(this._currentUri);
            }
        }));
        const msgThrottler = this._register(new Throttler());
        this._register(this.results.onTestChanged(ev => {
            if (ev.reason !== 2 /* TestResultItemChangeReason.NewMessage */) {
                return;
            }
            msgThrottler.queue(() => {
                this.applyResults();
                return timeout(100);
            });
        }));
        this._register(Event.any(this.results.onResultsChanged, editor.onDidChangeModel, this.testService.showInlineOutput.onDidChange)(() => this.applyResults()));
        const win = dom.getWindow(editor.getDomNode());
        this._register(dom.addDisposableListener(win, 'keydown', e => {
            if (new StandardKeyboardEvent(e).keyCode === 6 /* KeyCode.Alt */ && this._currentUri) {
                decorations.updateDecorationsAlternateAction(this._currentUri, true);
            }
        }));
        this._register(dom.addDisposableListener(win, 'keyup', e => {
            if (new StandardKeyboardEvent(e).keyCode === 6 /* KeyCode.Alt */ && this._currentUri) {
                decorations.updateDecorationsAlternateAction(this._currentUri, false);
            }
        }));
        this._register(dom.addDisposableListener(win, 'blur', () => {
            if (this._currentUri) {
                decorations.updateDecorationsAlternateAction(this._currentUri, false);
            }
        }));
        this._register(this.editor.onKeyUp(e => {
            if (e.keyCode === 6 /* KeyCode.Alt */ && this._currentUri) {
                decorations.updateDecorationsAlternateAction(this._currentUri, false);
            }
        }));
        this._register(this.editor.onDidChangeModel(e => this.attachModel(e.newModelUrl || undefined)));
        this._register(this.editor.onMouseDown(e => {
            if (e.target.position && this.currentUri) {
                const modelDecorations = editor.getModel()?.getLineDecorations(e.target.position.lineNumber) ?? [];
                if (!modelDecorations.length) {
                    return;
                }
                const cache = decorations.syncDecorations(this.currentUri);
                for (const { id } of modelDecorations) {
                    if (cache.getById(id)?.click(e)) {
                        e.event.stopPropagation();
                        return;
                    }
                }
            }
        }));
        this._register(Event.accumulate(this.editor.onDidChangeModelContent, 0, undefined, this._store)(evts => {
            const model = editor.getModel();
            if (!this._currentUri || !model) {
                return;
            }
            let changed = false;
            for (const [message, deco] of this.loggedMessageDecorations) {
                // invalidate decorations if either the line they're on was changed,
                // or if the range of the test was changed. The range of the test is
                // not always present, so check bo.
                const invalidate = evts.some(e => e.changes.some(c => c.range.startLineNumber <= deco.line && c.range.endLineNumber >= deco.line
                    || (deco.resultItem?.item.range && deco.resultItem.item.range.startLineNumber <= c.range.startLineNumber && deco.resultItem.item.range.endLineNumber >= c.range.endLineNumber)));
                if (invalidate) {
                    changed = true;
                    TestingDecorations_1.invalidatedTests.add(deco.resultItem || message);
                }
            }
            if (changed) {
                this.applyResults();
            }
        }));
        const updateFontFamilyVar = () => {
            this.editor.getContainerDomNode().style.setProperty('--testMessageDecorationFontFamily', editor.getOption(58 /* EditorOption.fontFamily */));
            this.editor.getContainerDomNode().style.setProperty('--testMessageDecorationFontSize', `${editor.getOption(61 /* EditorOption.fontSize */)}px`);
        };
        this._register(this.editor.onDidChangeConfiguration((e) => {
            if (e.hasChanged(58 /* EditorOption.fontFamily */)) {
                updateFontFamilyVar();
            }
        }));
        updateFontFamilyVar();
    }
    attachModel(uri) {
        switch (uri && parseTestUri(uri)?.type) {
            case 4 /* TestUriType.ResultExpectedOutput */:
                this.expectedWidget.value = new ExpectedLensContentWidget(this.editor);
                this.actualWidget.clear();
                break;
            case 3 /* TestUriType.ResultActualOutput */:
                this.expectedWidget.clear();
                this.actualWidget.value = new ActualLensContentWidget(this.editor);
                break;
            default:
                this.expectedWidget.clear();
                this.actualWidget.clear();
        }
        if (isOriginalInDiffEditor(this.codeEditorService, this.editor)) {
            uri = undefined;
        }
        this._currentUri = uri;
        if (!uri) {
            return;
        }
        this.decorations.syncDecorations(uri);
        (async () => {
            for await (const _tests of testsInFile(this.testService, this.uriIdentityService, uri, false)) {
                // consume the iterator so that all tests in the file get expanded. Or
                // at least until the URI changes. If new items are requested, changes
                // will be trigged in the `onDidProcessDiff` callback.
                if (this._currentUri !== uri) {
                    break;
                }
            }
        })();
    }
    applyResults() {
        const model = this.editor.getModel();
        if (!model) {
            return this.clearResults();
        }
        const uriStr = model.uri.toString();
        const seenLines = new Set();
        this.applyResultsContentWidgets(uriStr, seenLines);
        this.applyResultsLoggedMessages(uriStr, seenLines);
    }
    clearResults() {
        this.errorContentWidgets.clearAndDisposeAll();
    }
    isMessageInvalidated(message) {
        return TestingDecorations_1.invalidatedTests.has(message);
    }
    applyResultsContentWidgets(uriStr, seenLines) {
        const seen = new Set();
        if (getTestingConfiguration(this.configurationService, "testing.showAllMessages" /* TestingConfigKeys.ShowAllMessages */)) {
            this.results.results.forEach(lastResult => this.applyContentWidgetsFromResult(lastResult, uriStr, seen, seenLines));
        }
        else if (this.results.results.length) {
            this.applyContentWidgetsFromResult(this.results.results[0], uriStr, seen, seenLines);
        }
        for (const message of this.errorContentWidgets.keys()) {
            if (!seen.has(message)) {
                this.errorContentWidgets.deleteAndDispose(message);
            }
        }
    }
    applyContentWidgetsFromResult(lastResult, uriStr, seen, seenLines) {
        for (const test of lastResult.tests) {
            if (TestingDecorations_1.invalidatedTests.has(test)) {
                continue;
            }
            for (let taskId = 0; taskId < test.tasks.length; taskId++) {
                const state = test.tasks[taskId];
                // push error decorations first so they take precedence over normal output
                for (let i = 0; i < state.messages.length; i++) {
                    const m = state.messages[i];
                    if (m.type !== 0 /* TestMessageType.Error */ || this.isMessageInvalidated(m)) {
                        continue;
                    }
                    const line = m.location?.uri.toString() === uriStr
                        ? m.location.range.startLineNumber
                        : m.stackTrace && mapFindFirst(m.stackTrace, (f) => f.position && f.uri?.toString() === uriStr ? f.position.lineNumber : undefined);
                    if (line === undefined || seenLines.has(line)) {
                        continue;
                    }
                    seenLines.add(line);
                    let deco = this.errorContentWidgets.get(m);
                    if (!deco) {
                        const lineLength = this.editor.getModel()?.getLineLength(line) ?? 100;
                        deco = this.instantiationService.createInstance(TestErrorContentWidget, this.editor, new Position(line, lineLength + 1), m, test, buildTestUri({
                            type: 3 /* TestUriType.ResultActualOutput */,
                            messageIndex: i,
                            taskIndex: taskId,
                            resultId: lastResult.id,
                            testExtId: test.item.extId,
                        }));
                        this.errorContentWidgets.set(m, deco);
                    }
                    seen.add(m);
                }
            }
        }
    }
    applyResultsLoggedMessages(uriStr, messageLines) {
        this.editor.changeDecorations(accessor => {
            const seen = new Set();
            if (getTestingConfiguration(this.configurationService, "testing.showAllMessages" /* TestingConfigKeys.ShowAllMessages */)) {
                this.results.results.forEach(r => this.applyLoggedMessageFromResult(r, uriStr, seen, messageLines, accessor));
            }
            else if (this.results.results.length) {
                this.applyLoggedMessageFromResult(this.results.results[0], uriStr, seen, messageLines, accessor);
            }
            for (const [message, { id }] of this.loggedMessageDecorations) {
                if (!seen.has(message)) {
                    accessor.removeDecoration(id);
                }
            }
        });
    }
    applyLoggedMessageFromResult(lastResult, uriStr, seen, messageLines, accessor) {
        if (!this.testService.showInlineOutput.value || !(lastResult instanceof LiveTestResult)) {
            return;
        }
        const tryAdd = (resultItem, m, uri) => {
            if (this.isMessageInvalidated(m) || m.location?.uri.toString() !== uriStr) {
                return;
            }
            seen.add(m);
            const line = m.location.range.startLineNumber;
            if (messageLines.has(line) || this.loggedMessageDecorations.has(m)) {
                return;
            }
            const deco = this.instantiationService.createInstance(TestMessageDecoration, m, uri, this.editor.getModel());
            messageLines.add(line);
            const id = accessor.addDecoration(deco.editorDecoration.range, deco.editorDecoration.options);
            this.loggedMessageDecorations.set(m, { id, line, resultItem });
        };
        for (const test of lastResult.tests) {
            if (TestingDecorations_1.invalidatedTests.has(test)) {
                continue;
            }
            for (let taskId = 0; taskId < test.tasks.length; taskId++) {
                const state = test.tasks[taskId];
                for (let i = state.messages.length - 1; i >= 0; i--) {
                    const m = state.messages[i];
                    if (m.type === 1 /* TestMessageType.Output */) {
                        tryAdd(test, m, buildTestUri({
                            type: 3 /* TestUriType.ResultActualOutput */,
                            messageIndex: i,
                            taskIndex: taskId,
                            resultId: lastResult.id,
                            testExtId: test.item.extId,
                        }));
                    }
                }
            }
        }
        for (const task of lastResult.tasks) {
            for (const m of task.otherMessages) {
                tryAdd(undefined, m);
            }
        }
    }
};
TestingDecorations = TestingDecorations_1 = __decorate([
    __param(1, ICodeEditorService),
    __param(2, ITestService),
    __param(3, ITestingDecorationsService),
    __param(4, IUriIdentityService),
    __param(5, ITestResultService),
    __param(6, IConfigurationService),
    __param(7, IInstantiationService)
], TestingDecorations);
export { TestingDecorations };
const collapseRange = (originalRange) => ({
    startLineNumber: originalRange.startLineNumber,
    endLineNumber: originalRange.startLineNumber,
    startColumn: originalRange.startColumn,
    endColumn: originalRange.startColumn,
});
const createRunTestDecoration = (tests, states, visible, defaultGutterAction) => {
    const range = tests[0]?.item.range;
    if (!range) {
        throw new Error('Test decorations can only be created for tests with a range');
    }
    if (!visible) {
        return {
            range: collapseRange(range),
            options: { isWholeLine: true, description: 'run-test-decoration' },
        };
    }
    let computedState = 0 /* TestResultState.Unset */;
    const hoverMessageParts = [];
    let testIdWithMessages;
    let retired = false;
    for (let i = 0; i < tests.length; i++) {
        const test = tests[i];
        const resultItem = states[i];
        const state = resultItem?.computedState ?? 0 /* TestResultState.Unset */;
        if (hoverMessageParts.length < 10) {
            hoverMessageParts.push(labelForTestInState(test.item.label, state));
        }
        computedState = maxPriority(computedState, state);
        retired = retired || !!resultItem?.retired;
        if (!testIdWithMessages && resultItem?.tasks.some(t => t.messages.length)) {
            testIdWithMessages = test.item.extId;
        }
    }
    const hasMultipleTests = tests.length > 1 || tests[0].children.size > 0;
    const primaryIcon = computedState === 0 /* TestResultState.Unset */
        ? (hasMultipleTests ? testingRunAllIcon : testingRunIcon)
        : testingStatesToIcons.get(computedState);
    const alternateIcon = defaultGutterAction === "debug" /* DefaultGutterClickAction.Debug */
        ? (hasMultipleTests ? testingRunAllIcon : testingRunIcon)
        : (hasMultipleTests ? testingDebugAllIcon : testingDebugIcon);
    let hoverMessage;
    let glyphMarginClassName = 'testing-run-glyph';
    if (retired) {
        glyphMarginClassName += ' retired';
    }
    const defaultOptions = {
        description: 'run-test-decoration',
        showIfCollapsed: true,
        get hoverMessage() {
            if (!hoverMessage) {
                const building = hoverMessage = new MarkdownString('', true).appendText(hoverMessageParts.join(', ') + '.');
                if (testIdWithMessages) {
                    const args = encodeURIComponent(JSON.stringify([testIdWithMessages]));
                    building.appendMarkdown(` [${localize('peekTestOutout', 'Peek Test Output')}](command:vscode.peekTestError?${args})`);
                }
            }
            return hoverMessage;
        },
        glyphMargin: { position: GLYPH_MARGIN_LANE },
        glyphMarginClassName: `${ThemeIcon.asClassName(primaryIcon)} ${glyphMarginClassName}`,
        stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        zIndex: 10000,
    };
    const alternateOptions = {
        ...defaultOptions,
        glyphMarginClassName: `${ThemeIcon.asClassName(alternateIcon)} ${glyphMarginClassName}`,
    };
    return {
        range: collapseRange(range),
        options: defaultOptions,
        alternate: alternateOptions,
    };
};
var LensContentWidgetVars;
(function (LensContentWidgetVars) {
    LensContentWidgetVars["FontFamily"] = "testingDiffLensFontFamily";
    LensContentWidgetVars["FontFeatures"] = "testingDiffLensFontFeatures";
})(LensContentWidgetVars || (LensContentWidgetVars = {}));
class TitleLensContentWidget {
    constructor(editor) {
        this.editor = editor;
        /** @inheritdoc */
        this.allowEditorOverflow = false;
        /** @inheritdoc */
        this.suppressMouseDown = true;
        this._domNode = dom.$('span');
        queueMicrotask(() => {
            this.applyStyling();
            this.editor.addContentWidget(this);
        });
    }
    applyStyling() {
        let fontSize = this.editor.getOption(25 /* EditorOption.codeLensFontSize */);
        let height;
        if (!fontSize || fontSize < 5) {
            fontSize = (this.editor.getOption(61 /* EditorOption.fontSize */) * .9) | 0;
            height = this.editor.getOption(75 /* EditorOption.lineHeight */);
        }
        else {
            height = (fontSize * Math.max(1.3, this.editor.getOption(75 /* EditorOption.lineHeight */) / this.editor.getOption(61 /* EditorOption.fontSize */))) | 0;
        }
        const editorFontInfo = this.editor.getOption(59 /* EditorOption.fontInfo */);
        const node = this._domNode;
        node.classList.add('testing-diff-lens-widget');
        node.textContent = this.getText();
        node.style.lineHeight = `${height}px`;
        node.style.fontSize = `${fontSize}px`;
        node.style.fontFamily = `var(--${"testingDiffLensFontFamily" /* LensContentWidgetVars.FontFamily */})`;
        node.style.fontFeatureSettings = `var(--${"testingDiffLensFontFeatures" /* LensContentWidgetVars.FontFeatures */})`;
        const containerStyle = this.editor.getContainerDomNode().style;
        containerStyle.setProperty("testingDiffLensFontFamily" /* LensContentWidgetVars.FontFamily */, this.editor.getOption(24 /* EditorOption.codeLensFontFamily */) ?? 'inherit');
        containerStyle.setProperty("testingDiffLensFontFeatures" /* LensContentWidgetVars.FontFeatures */, editorFontInfo.fontFeatureSettings);
        this.editor.changeViewZones(accessor => {
            if (this.viewZoneId) {
                accessor.removeZone(this.viewZoneId);
            }
            this.viewZoneId = accessor.addZone({
                afterLineNumber: 0,
                afterColumn: 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */,
                domNode: document.createElement('div'),
                heightInPx: 20,
            });
        });
    }
    /** @inheritdoc */
    getDomNode() {
        return this._domNode;
    }
    /** @inheritdoc */
    dispose() {
        this.editor.changeViewZones(accessor => {
            if (this.viewZoneId) {
                accessor.removeZone(this.viewZoneId);
            }
        });
        this.editor.removeContentWidget(this);
    }
    /** @inheritdoc */
    getPosition() {
        return {
            position: { column: 0, lineNumber: 0 },
            preference: [1 /* ContentWidgetPositionPreference.ABOVE */],
        };
    }
}
class ExpectedLensContentWidget extends TitleLensContentWidget {
    getId() {
        return 'expectedTestingLens';
    }
    getText() {
        return localize('expected.title', 'Expected');
    }
}
class ActualLensContentWidget extends TitleLensContentWidget {
    getId() {
        return 'actualTestingLens';
    }
    getText() {
        return localize('actual.title', 'Actual');
    }
}
let RunTestDecoration = class RunTestDecoration {
    get line() {
        return this.editorDecoration.range.startLineNumber;
    }
    get testIds() {
        return this.tests.map(t => t.test.item.extId);
    }
    constructor(tests, visible, model, codeEditorService, testService, contextMenuService, commandService, configurationService, testProfileService, contextKeyService, menuService) {
        this.tests = tests;
        this.visible = visible;
        this.model = model;
        this.codeEditorService = codeEditorService;
        this.testService = testService;
        this.contextMenuService = contextMenuService;
        this.commandService = commandService;
        this.configurationService = configurationService;
        this.testProfileService = testProfileService;
        this.contextKeyService = contextKeyService;
        this.menuService = menuService;
        /** @inheritdoc */
        this.id = '';
        this.displayedStates = tests.map(t => t.resultItem?.computedState);
        this.editorDecoration = createRunTestDecoration(tests.map(t => t.test), tests.map(t => t.resultItem), visible, getTestingConfiguration(this.configurationService, "testing.defaultGutterClickAction" /* TestingConfigKeys.DefaultGutterClickAction */));
        this.editorDecoration.options.glyphMarginHoverMessage = new MarkdownString().appendText(this.getGutterLabel());
    }
    /** @inheritdoc */
    click(e) {
        if (e.target.type !== 2 /* MouseTargetType.GUTTER_GLYPH_MARGIN */
            || e.target.detail.glyphMarginLane !== GLYPH_MARGIN_LANE
            // handled by editor gutter context menu
            || e.event.rightButton
            || isMacintosh && e.event.leftButton && e.event.ctrlKey) {
            return false;
        }
        const alternateAction = e.event.altKey;
        switch (getTestingConfiguration(this.configurationService, "testing.defaultGutterClickAction" /* TestingConfigKeys.DefaultGutterClickAction */)) {
            case "contextMenu" /* DefaultGutterClickAction.ContextMenu */:
                this.showContextMenu(e);
                break;
            case "debug" /* DefaultGutterClickAction.Debug */:
                this.runWith(alternateAction ? 2 /* TestRunProfileBitset.Run */ : 4 /* TestRunProfileBitset.Debug */);
                break;
            case "runWithCoverage" /* DefaultGutterClickAction.Coverage */:
                this.runWith(alternateAction ? 4 /* TestRunProfileBitset.Debug */ : 8 /* TestRunProfileBitset.Coverage */);
                break;
            case "run" /* DefaultGutterClickAction.Run */:
            default:
                this.runWith(alternateAction ? 4 /* TestRunProfileBitset.Debug */ : 2 /* TestRunProfileBitset.Run */);
                break;
        }
        return true;
    }
    /**
     * Updates the decoration to match the new set of tests.
     * @returns true if options were changed, false otherwise
     */
    replaceOptions(newTests, visible) {
        const displayedStates = newTests.map(t => t.resultItem?.computedState);
        if (visible === this.visible && equals(this.displayedStates, displayedStates)) {
            return false;
        }
        this.tests = newTests;
        this.displayedStates = displayedStates;
        this.visible = visible;
        const { options, alternate } = createRunTestDecoration(newTests.map(t => t.test), newTests.map(t => t.resultItem), visible, getTestingConfiguration(this.configurationService, "testing.defaultGutterClickAction" /* TestingConfigKeys.DefaultGutterClickAction */));
        this.editorDecoration.options = options;
        this.editorDecoration.alternate = alternate;
        this.editorDecoration.options.glyphMarginHoverMessage = new MarkdownString().appendText(this.getGutterLabel());
        return true;
    }
    /**
     * Gets whether this decoration serves as the run button for the given test ID.
     */
    isForTest(testId) {
        return this.tests.some(t => t.test.item.extId === testId);
    }
    runWith(profile) {
        return this.testService.runTests({
            tests: simplifyTestsToExecute(this.testService.collection, this.tests.map(({ test }) => test)),
            group: profile,
        });
    }
    showContextMenu(e) {
        const editor = this.codeEditorService.listCodeEditors().find(e => e.getModel() === this.model);
        editor?.getContribution(EditorLineNumberContextMenu.ID)?.show(e);
    }
    getGutterLabel() {
        switch (getTestingConfiguration(this.configurationService, "testing.defaultGutterClickAction" /* TestingConfigKeys.DefaultGutterClickAction */)) {
            case "contextMenu" /* DefaultGutterClickAction.ContextMenu */:
                return localize('testing.gutterMsg.contextMenu', 'Click for test options');
            case "debug" /* DefaultGutterClickAction.Debug */:
                return localize('testing.gutterMsg.debug', 'Click to debug tests, right click for more options');
            case "runWithCoverage" /* DefaultGutterClickAction.Coverage */:
                return localize('testing.gutterMsg.coverage', 'Click to run tests with coverage, right click for more options');
            case "run" /* DefaultGutterClickAction.Run */:
            default:
                return localize('testing.gutterMsg.run', 'Click to run tests, right click for more options');
        }
    }
    /**
     * Gets context menu actions relevant for a singel test.
     */
    getTestContextMenuActions(test, resultItem) {
        const testActions = [];
        const capabilities = this.testProfileService.capabilitiesForTest(test.item);
        [
            { bitset: 2 /* TestRunProfileBitset.Run */, label: localize('run test', 'Run Test') },
            { bitset: 4 /* TestRunProfileBitset.Debug */, label: localize('debug test', 'Debug Test') },
            { bitset: 8 /* TestRunProfileBitset.Coverage */, label: localize('coverage test', 'Run with Coverage') },
        ].forEach(({ bitset, label }) => {
            if (capabilities & bitset) {
                testActions.push(new Action(`testing.gutter.${bitset}`, label, undefined, undefined, () => this.testService.runTests({ group: bitset, tests: [test] })));
            }
        });
        if (capabilities & 16 /* TestRunProfileBitset.HasNonDefaultProfile */) {
            testActions.push(new Action('testing.runUsing', localize('testing.runUsing', 'Execute Using Profile...'), undefined, undefined, async () => {
                const profile = await this.commandService.executeCommand('vscode.pickTestProfile', { onlyForTest: test });
                if (!profile) {
                    return;
                }
                this.testService.runResolvedTests({
                    group: profile.group,
                    targets: [{
                            profileId: profile.profileId,
                            controllerId: profile.controllerId,
                            testIds: [test.item.extId]
                        }]
                });
            }));
        }
        if (resultItem && isFailedState(resultItem.computedState)) {
            testActions.push(new Action('testing.gutter.peekFailure', localize('peek failure', 'Peek Error'), undefined, undefined, () => this.commandService.executeCommand('vscode.peekTestError', test.item.extId)));
        }
        if (resultItem?.computedState === 2 /* TestResultState.Running */) {
            testActions.push(new Action('testing.gutter.cancel', localize('testing.cancelRun', 'Cancel Test Run'), undefined, undefined, () => this.commandService.executeCommand("testing.cancelRun" /* TestCommandId.CancelTestRunAction */)));
        }
        testActions.push(new Action('testing.gutter.reveal', localize('reveal test', 'Reveal in Test Explorer'), undefined, undefined, () => this.commandService.executeCommand('_revealTestInExplorer', test.item.extId)));
        const contributed = this.getContributedTestActions(test, capabilities);
        return { object: Separator.join(testActions, contributed), dispose() { testActions.forEach(a => a.dispose()); } };
    }
    getContributedTestActions(test, capabilities) {
        const contextOverlay = this.contextKeyService.createOverlay(getTestItemContextOverlay(test, capabilities));
        const arg = getContextForTestItem(this.testService.collection, test.item.extId);
        const menu = this.menuService.getMenuActions(MenuId.TestItemGutter, contextOverlay, { shouldForwardArgs: true, arg });
        return getFlatContextMenuActions(menu);
    }
};
RunTestDecoration = __decorate([
    __param(3, ICodeEditorService),
    __param(4, ITestService),
    __param(5, IContextMenuService),
    __param(6, ICommandService),
    __param(7, IConfigurationService),
    __param(8, ITestProfileService),
    __param(9, IContextKeyService),
    __param(10, IMenuService)
], RunTestDecoration);
let MultiRunTestDecoration = class MultiRunTestDecoration extends RunTestDecoration {
    constructor(tests, visible, model, codeEditorService, testService, contextMenuService, commandService, configurationService, testProfileService, contextKeyService, menuService, quickInputService) {
        super(tests, visible, model, codeEditorService, testService, contextMenuService, commandService, configurationService, testProfileService, contextKeyService, menuService);
        this.quickInputService = quickInputService;
    }
    getContextMenuActions() {
        const disposable = new DisposableStore();
        const allActions = [];
        [
            { bitset: 2 /* TestRunProfileBitset.Run */, label: localize('run all test', 'Run All Tests') },
            { bitset: 8 /* TestRunProfileBitset.Coverage */, label: localize('run all test with coverage', 'Run All Tests with Coverage') },
            { bitset: 4 /* TestRunProfileBitset.Debug */, label: localize('debug all test', 'Debug All Tests') },
        ].forEach(({ bitset, label }, i) => {
            const canRun = this.tests.some(({ test }) => this.testProfileService.capabilitiesForTest(test.item) & bitset);
            if (canRun) {
                allActions.push(new Action(`testing.gutter.run${i}`, label, undefined, undefined, () => this.runWith(bitset)));
            }
        });
        disposable.add(toDisposable(() => allActions.forEach(a => a.dispose())));
        const testItems = this.tests.map((testItem) => ({
            currentLabel: testItem.test.item.label,
            testItem,
            parent: TestId.fromString(testItem.test.item.extId).parentId,
        }));
        const getLabelConflicts = (tests) => {
            const labelCount = new Map();
            for (const test of tests) {
                labelCount.set(test.currentLabel, (labelCount.get(test.currentLabel) || 0) + 1);
            }
            return tests.filter(e => labelCount.get(e.currentLabel) > 1);
        };
        let conflicts, hasParent = true;
        while ((conflicts = getLabelConflicts(testItems)).length && hasParent) {
            for (const conflict of conflicts) {
                if (conflict.parent) {
                    const parent = this.testService.collection.getNodeById(conflict.parent.toString());
                    conflict.currentLabel = parent?.item.label + ' > ' + conflict.currentLabel;
                    conflict.parent = conflict.parent.parentId;
                }
                else {
                    hasParent = false;
                }
            }
        }
        testItems.sort((a, b) => {
            const ai = a.testItem.test.item;
            const bi = b.testItem.test.item;
            return (ai.sortText || ai.label).localeCompare(bi.sortText || bi.label);
        });
        let testSubmenus = testItems.map(({ currentLabel, testItem }) => {
            const actions = this.getTestContextMenuActions(testItem.test, testItem.resultItem);
            disposable.add(actions);
            let label = stripIcons(currentLabel);
            const lf = label.indexOf('\n');
            if (lf !== -1) {
                label = label.slice(0, lf);
            }
            return new SubmenuAction(testItem.test.item.extId, label, actions.object);
        });
        const overflow = testSubmenus.length - MAX_TESTS_IN_SUBMENU;
        if (overflow > 0) {
            testSubmenus = testSubmenus.slice(0, MAX_TESTS_IN_SUBMENU);
            testSubmenus.push(new Action('testing.gutter.overflow', localize('testOverflowItems', '{0} more tests...', overflow), undefined, undefined, () => this.pickAndRun(testItems)));
        }
        return { object: Separator.join(allActions, testSubmenus), dispose: () => disposable.dispose() };
    }
    async pickAndRun(testItems) {
        const doPick = (items, title) => new Promise(resolve => {
            const disposables = new DisposableStore();
            const pick = disposables.add(this.quickInputService.createQuickPick());
            pick.placeholder = title;
            pick.items = items;
            disposables.add(pick.onDidHide(() => {
                resolve(undefined);
                disposables.dispose();
            }));
            disposables.add(pick.onDidAccept(() => {
                resolve(pick.selectedItems[0]);
                disposables.dispose();
            }));
            pick.show();
        });
        const item = await doPick(testItems.map(({ currentLabel, testItem }) => ({ label: currentLabel, test: testItem.test, result: testItem.resultItem })), localize('selectTestToRun', 'Select a test to run'));
        if (!item) {
            return;
        }
        const actions = this.getTestContextMenuActions(item.test, item.result);
        try {
            (await doPick(actions.object, item.label))?.run();
        }
        finally {
            actions.dispose();
        }
    }
};
MultiRunTestDecoration = __decorate([
    __param(3, ICodeEditorService),
    __param(4, ITestService),
    __param(5, IContextMenuService),
    __param(6, ICommandService),
    __param(7, IConfigurationService),
    __param(8, ITestProfileService),
    __param(9, IContextKeyService),
    __param(10, IMenuService),
    __param(11, IQuickInputService)
], MultiRunTestDecoration);
let RunSingleTestDecoration = class RunSingleTestDecoration extends RunTestDecoration {
    constructor(test, resultItem, model, visible, codeEditorService, testService, commandService, contextMenuService, configurationService, testProfiles, contextKeyService, menuService) {
        super([{ test, resultItem }], visible, model, codeEditorService, testService, contextMenuService, commandService, configurationService, testProfiles, contextKeyService, menuService);
    }
    getContextMenuActions() {
        return this.getTestContextMenuActions(this.tests[0].test, this.tests[0].resultItem);
    }
};
RunSingleTestDecoration = __decorate([
    __param(4, ICodeEditorService),
    __param(5, ITestService),
    __param(6, ICommandService),
    __param(7, IContextMenuService),
    __param(8, IConfigurationService),
    __param(9, ITestProfileService),
    __param(10, IContextKeyService),
    __param(11, IMenuService)
], RunSingleTestDecoration);
const lineBreakRe = /\r?\n\s*/g;
let TestMessageDecoration = class TestMessageDecoration {
    static { TestMessageDecoration_1 = this; }
    static { this.inlineClassName = 'test-message-inline-content'; }
    static { this.decorationId = `testmessage-${generateUuid()}`; }
    constructor(testMessage, messageUri, textModel, peekOpener, editorService) {
        this.testMessage = testMessage;
        this.messageUri = messageUri;
        this.peekOpener = peekOpener;
        this.id = '';
        this.contentIdClass = `test-message-inline-content-id${generateUuid()}`;
        const location = testMessage.location;
        this.line = clamp(location.range.startLineNumber, 0, textModel.getLineCount());
        const severity = testMessage.type;
        const message = testMessage.message;
        const options = editorService.resolveDecorationOptions(TestMessageDecoration_1.decorationId, true);
        options.hoverMessage = typeof message === 'string' ? new MarkdownString().appendText(message) : message;
        options.zIndex = 10; // todo: in spite of the z-index, this appears behind gitlens
        options.className = `testing-inline-message-severity-${severity}`;
        options.isWholeLine = true;
        options.stickiness = 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */;
        options.collapseOnReplaceEdit = true;
        let inlineText = renderTestMessageAsText(message).replace(lineBreakRe, ' ');
        if (inlineText.length > MAX_INLINE_MESSAGE_LENGTH) {
            inlineText = inlineText.slice(0, MAX_INLINE_MESSAGE_LENGTH - 1) + '…';
        }
        options.after = {
            content: inlineText,
            inlineClassName: `test-message-inline-content test-message-inline-content-s${severity} ${this.contentIdClass} ${messageUri ? 'test-message-inline-content-clickable' : ''}`
        };
        options.showIfCollapsed = true;
        const rulerColor = severity === 0 /* TestMessageType.Error */
            ? overviewRulerError
            : overviewRulerInfo;
        if (rulerColor) {
            options.overviewRuler = { color: themeColorFromId(rulerColor), position: OverviewRulerLane.Right };
        }
        const lineLength = textModel.getLineLength(this.line);
        const column = lineLength ? (lineLength + 1) : location.range.endColumn;
        this.editorDecoration = {
            options,
            range: {
                startLineNumber: this.line,
                startColumn: column,
                endColumn: column,
                endLineNumber: this.line,
            }
        };
    }
    click(e) {
        if (e.event.rightButton) {
            return false;
        }
        if (!this.messageUri) {
            return false;
        }
        if (e.target.element?.className.includes(this.contentIdClass)) {
            this.peekOpener.peekUri(this.messageUri);
        }
        return false;
    }
    getContextMenuActions() {
        return { object: [], dispose: () => { } };
    }
};
TestMessageDecoration = TestMessageDecoration_1 = __decorate([
    __param(3, ITestingPeekOpener),
    __param(4, ICodeEditorService)
], TestMessageDecoration);
const ERROR_CONTENT_WIDGET_HEIGHT = 20;
let TestErrorContentWidget = class TestErrorContentWidget extends Disposable {
    get line() {
        return this.position.lineNumber;
    }
    constructor(editor, position, message, resultItem, uri, peekOpener) {
        super();
        this.editor = editor;
        this.position = position;
        this.message = message;
        this.resultItem = resultItem;
        this.peekOpener = peekOpener;
        this.id = generateUuid();
        /** @inheritdoc */
        this.allowEditorOverflow = false;
        this.node = dom.h('div.test-error-content-widget', [
            dom.h('div.inner@inner', [
                dom.h('div.arrow@arrow'),
                dom.h(`span${ThemeIcon.asCSSSelector(testingStatesToIcons.get(4 /* TestResultState.Failed */))}`),
                dom.h('span.content@name'),
            ]),
        ]);
        const setMarginTop = () => {
            const lineHeight = editor.getLineHeightForPosition(position);
            this.node.root.style.marginTop = (lineHeight - ERROR_CONTENT_WIDGET_HEIGHT) / 2 + 'px';
        };
        setMarginTop();
        this._register(editor.onDidChangeLineHeight(e => {
            if (e.affects(position)) {
                setMarginTop();
            }
        }));
        this._register(editor.onDidChangeConfiguration(e => {
            if (e.hasChanged(75 /* EditorOption.lineHeight */)) {
                setMarginTop();
            }
        }));
        let text;
        if (message.expected !== undefined && message.actual !== undefined) {
            text = `${truncateMiddle(message.actual.replace(/\s+/g, ' '), 30)} != ${truncateMiddle(message.expected.replace(/\s+/g, ' '), 30)}`;
        }
        else {
            const msg = renderAsPlaintext(message.message);
            const lf = msg.indexOf('\n');
            text = lf === -1 ? msg : msg.slice(0, lf);
        }
        this._register(dom.addDisposableListener(this.node.root, dom.EventType.CLICK, e => {
            this.peekOpener.peekUri(uri);
            e.preventDefault();
        }));
        const ctrl = TestingOutputPeekController.get(editor);
        if (ctrl) {
            this._register(autorun(reader => {
                const subject = ctrl.subject.read(reader);
                const isCurrent = subject instanceof MessageSubject && subject.message === message;
                this.node.root.classList.toggle('is-current', isCurrent);
            }));
        }
        this.node.name.innerText = text || 'Test Failed';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '15');
        svg.setAttribute('height', '10');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('viewBox', '0 0 15 10');
        const leftArrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        leftArrow.setAttribute('d', 'M15 0 L10 0 L0 5 L10 10 L15 10 Z');
        svg.append(leftArrow);
        this.node.arrow.appendChild(svg);
        this._register(editor.onDidChangeModelContent(e => {
            for (const c of e.changes) {
                if (c.range.startLineNumber > this.line) {
                    continue;
                }
                if (c.range.startLineNumber <= this.line && c.range.endLineNumber >= this.line
                    || (resultItem.item.range && resultItem.item.range.startLineNumber <= c.range.startLineNumber && resultItem.item.range.endLineNumber >= c.range.endLineNumber)) {
                    TestingDecorations.invalidatedTests.add(this.resultItem);
                    this.dispose(); // todo
                }
                const adjust = count(c.text, '\n') - (c.range.endLineNumber - c.range.startLineNumber);
                if (adjust !== 0) {
                    this.position = this.position.delta(adjust);
                    this.editor.layoutContentWidget(this);
                }
            }
        }));
        editor.addContentWidget(this);
        this._register(toDisposable(() => editor.removeContentWidget(this)));
    }
    getId() {
        return this.id;
    }
    getDomNode() {
        return this.node.root;
    }
    getPosition() {
        return {
            position: this.position,
            preference: [0 /* ContentWidgetPositionPreference.EXACT */],
        };
    }
    afterRender(_position, coordinate) {
        if (coordinate) {
            const { verticalScrollbarWidth } = this.editor.getLayoutInfo();
            const scrollWidth = this.editor.getScrollWidth();
            this.node.inner.style.maxWidth = `${scrollWidth - verticalScrollbarWidth - coordinate.left - 20}px`;
        }
    }
};
TestErrorContentWidget = __decorate([
    __param(5, ITestingPeekOpener)
], TestErrorContentWidget);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdGluZ0RlY29yYXRpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVzdGluZy9icm93c2VyL3Rlc3RpbmdEZWNvcmF0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNsRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNqRixPQUFPLEVBQUUsTUFBTSxFQUFXLFNBQVMsRUFBRSxhQUFhLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMvRixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDM0QsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDeEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQW1CLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFL0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFjLGlCQUFpQixFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQy9JLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1B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