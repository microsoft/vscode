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
import * as dom from '../../../../../base/browser/dom.js';
import { Delayer } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { Disposable, DisposableStore, MutableDisposable, combinedDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EmbeddedCodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { DiffEditorWidget } from '../../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { EmbeddedDiffEditorWidget } from '../../../../../editor/browser/widget/diffEditor/embeddedDiffEditorWidget.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { peekViewResultsBackground } from '../../../../../editor/contrib/peekView/browser/peekView.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TerminalCapabilityStore } from '../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { formatMessageForTerminal } from '../../../../../platform/terminal/common/terminalStrings.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { EditorModel } from '../../../../common/editor/editorModel.js';
import { PANEL_BACKGROUND, SIDE_BAR_BACKGROUND } from '../../../../common/theme.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { CALL_STACK_WIDGET_HEADER_HEIGHT } from '../../../debug/browser/callStackWidget.js';
import { DetachedProcessInfo } from '../../../terminal/browser/detachedTerminal.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { getXtermScaledDimensions } from '../../../terminal/browser/xterm/xtermTerminal.js';
import { TERMINAL_BACKGROUND_COLOR } from '../../../terminal/common/terminalColorRegistry.js';
import { MutableObservableValue } from '../../common/observableValue.js';
import { LiveTestResult } from '../../common/testResult.js';
import { ITestMessage, getMarkId } from '../../common/testTypes.js';
import { colorizeTestMessageInEditor } from '../testMessageColorizer.js';
import { MessageSubject, TaskSubject, TestOutputSubject } from './testResultsSubject.js';
class SimpleDiffEditorModel extends EditorModel {
    constructor(_original, _modified) {
        super();
        this._original = _original;
        this._modified = _modified;
        this.original = this._original.object.textEditorModel;
        this.modified = this._modified.object.textEditorModel;
    }
    dispose() {
        super.dispose();
        this._original.dispose();
        this._modified.dispose();
    }
}
const commonEditorOptions = {
    scrollBeyondLastLine: false,
    links: true,
    lineNumbers: 'off',
    glyphMargin: false,
    scrollbar: {
        vertical: 'hidden',
        horizontal: 'auto',
        useShadows: false,
        verticalHasArrows: false,
        horizontalHasArrows: false,
        handleMouseWheel: false,
    },
    overviewRulerLanes: 0,
    fixedOverflowWidgets: true,
    readOnly: true,
    stickyScroll: { enabled: false },
    minimap: { enabled: false },
    automaticLayout: false,
};
const diffEditorOptions = {
    ...commonEditorOptions,
    enableSplitViewResizing: true,
    isInEmbeddedEditor: true,
    renderOverviewRuler: false,
    ignoreTrimWhitespace: false,
    renderSideBySide: true,
    useInlineViewWhenSpaceIsLimited: false,
    originalAriaLabel: localize('testingOutputExpected', 'Expected result'),
    modifiedAriaLabel: localize('testingOutputActual', 'Actual result'),
    diffAlgorithm: 'advanced',
};
function applyEditorMirrorOptions(base, cfg, update) {
    const immutable = new Set(Object.keys(base));
    function applyCurrent() {
        const configuration = cfg.getValue('editor');
        let changed = false;
        const patch = {};
        for (const [key, value] of Object.entries(configuration)) {
            if (!immutable.has(key) && base[key] !== value) {
                patch[key] = value;
                changed = true;
            }
        }
        return changed ? patch : undefined;
    }
    Object.assign(base, applyCurrent());
    return cfg.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('editor')) {
            const patch = applyCurrent();
            if (patch) {
                update(patch);
                Object.assign(base, patch);
            }
        }
    });
}
let DiffContentProvider = class DiffContentProvider extends Disposable {
    get onDidContentSizeChange() {
        return this.widget.value?.onDidContentSizeChange || Event.None;
    }
    constructor(editor, container, instantiationService, modelService, configurationService) {
        super();
        this.editor = editor;
        this.container = container;
        this.instantiationService = instantiationService;
        this.modelService = modelService;
        this.configurationService = configurationService;
        this.widget = this._register(new MutableDisposable());
        this.model = this._register(new MutableDisposable());
    }
    async update(subject) {
        if (!(subject instanceof MessageSubject)) {
            this.clear();
            return false;
        }
        const message = subject.message;
        if (!ITestMessage.isDiffable(message)) {
            this.clear();
            return false;
        }
        const [original, modified] = await Promise.all([
            this.modelService.createModelReference(subject.expectedUri),
            this.modelService.createModelReference(subject.actualUri),
        ]);
        const model = this.model.value = new SimpleDiffEditorModel(original, modified);
        if (!this.widget.value) {
            const options = { ...diffEditorOptions };
            const listener = applyEditorMirrorOptions(options, this.configurationService, u => editor.updateOptions(u));
            const editor = this.widget.value = this.editor ? this.instantiationService.createInstance(EmbeddedDiffEditorWidget, this.container, options, {}, this.editor) : this.instantiationService.createInstance(DiffEditorWidget, this.container, options, {});
            Event.once(editor.onDidDispose)(() => {
                listener.dispose();
            });
            if (this.dimension) {
                editor.layout(this.dimension);
            }
        }
        this.widget.value.setModel(model);
        this.widget.value.updateOptions(this.getOptions(isMultiline(message.expected) || isMultiline(message.actual)));
        return true;
    }
    clear() {
        this.model.clear();
        this.widget.clear();
    }
    layout(dimensions, hasMultipleFrames) {
        this.dimension = dimensions;
        const editor = this.widget.value;
        if (!editor) {
            return;
        }
        editor.layout(dimensions);
        const height = Math.max(editor.getOriginalEditor().getContentHeight(), editor.getModifiedEditor().getContentHeight());
        editor.updateOptions({ scrollbar: { ...commonEditorOptions.scrollbar, handleMouseWheel: !hasMultipleFrames } });
        this.helper = new ScrollHelper(hasMultipleFrames, height, dimensions.height);
        return height;
    }
    onScrolled(evt) {
        this.helper?.onScrolled(evt, this.widget.value?.getDomNode(), this.widget.value?.getOriginalEditor());
    }
    getOptions(isMultiline) {
        return isMultiline
            ? { ...diffEditorOptions, lineNumbers: 'on' }
            : { ...diffEditorOptions, lineNumbers: 'off' };
    }
};
DiffContentProvider = __decorate([
    __param(2, IInstantiationService),
    __param(3, ITextModelService),
    __param(4, IConfigurationService)
], DiffContentProvider);
export { DiffContentProvider };
let MarkdownTestMessagePeek = class MarkdownTestMessagePeek extends Disposable {
    constructor(container, markdownRendererService) {
        super();
        this.container = container;
        this.markdownRendererService = markdownRendererService;
        this.rendered = this._register(new DisposableStore());
        this._register(toDisposable(() => this.clear()));
    }
    async update(subject) {
        this.clear();
        if (!(subject instanceof MessageSubject)) {
            return false;
        }
        const message = subject.message;
        if (ITestMessage.isDiffable(message) || typeof message.message === 'string') {
            return false;
        }
        const rendered = this.rendered.add(this.markdownRendererService.render(message.message, {}));
        rendered.element.style.userSelect = 'text';
        rendered.element.classList.add('preview-text');
        this.container.appendChild(rendered.element);
        this.element = rendered.element;
        this.rendered.add(toDisposable(() => rendered.element.remove()));
        return true;
    }
    layout(dimension) {
        if (!this.element) {
            return undefined;
        }
        this.element.style.width = `${dimension.width - 32}px`;
        return this.element.clientHeight;
    }
    clear() {
        this.rendered.clear();
        this.element = undefined;
    }
};
MarkdownTestMessagePeek = __decorate([
    __param(1, IMarkdownRendererService)
], MarkdownTestMessagePeek);
export { MarkdownTestMessagePeek };
class ScrollHelper {
    constructor(hasMultipleFrames, contentHeight, viewHeight) {
        this.hasMultipleFrames = hasMultipleFrames;
        this.contentHeight = contentHeight;
        this.viewHeight = viewHeight;
    }
    onScrolled(evt, container, editor) {
        if (!editor || !container) {
            return;
        }
        let delta = Math.max(0, evt.scrollTop - (this.hasMultipleFrames ? CALL_STACK_WIDGET_HEADER_HEIGHT : 0));
        delta = Math.min(Math.max(0, this.contentHeight - this.viewHeight), delta);
        editor.setScrollTop(delta);
        container.style.transform = `translateY(${delta}px)`;
    }
}
let PlainTextMessagePeek = class PlainTextMessagePeek extends Disposable {
    get onDidContentSizeChange() {
        return this.widget.value?.onDidContentSizeChange || Event.None;
    }
    constructor(editor, container, instantiationService, modelService, configurationService) {
        super();
        this.editor = editor;
        this.container = container;
        this.instantiationService = instantiationService;
        this.modelService = modelService;
        this.configurationService = configurationService;
        this.widgetDecorations = this._register(new MutableDisposable());
        this.widget = this._register(new MutableDisposable());
        this.model = this._register(new MutableDisposable());
    }
    async update(subject) {
        if (!(subject instanceof MessageSubject)) {
            this.clear();
            return false;
        }
        const message = subject.message;
        if (ITestMessage.isDiffable(message) || message.type === 1 /* TestMessageType.Output */ || typeof message.message !== 'string') {
            this.clear();
            return false;
        }
        const modelRef = this.model.value = await this.modelService.createModelReference(subject.messageUri);
        if (!this.widget.value) {
            const options = { ...commonEditorOptions };
            const listener = applyEditorMirrorOptions(options, this.configurationService, u => editor.updateOptions(u));
            const editor = this.widget.value = this.editor ? this.instantiationService.createInstance(EmbeddedCodeEditorWidget, this.container, options, {}, this.editor) : this.instantiationService.createInstance(CodeEditorWidget, this.container, options, { isSimpleWidget: true });
            Event.once(editor.onDidDispose)(() => {
                listener.dispose();
            });
            if (this.dimension) {
                editor.layout(this.dimension);
            }
        }
        this.widget.value.setModel(modelRef.object.textEditorModel);
        this.widget.value.updateOptions(commonEditorOptions);
        this.widgetDecorations.value = colorizeTestMessageInEditor(message.message, this.widget.value);
        return true;
    }
    clear() {
        this.widgetDecorations.clear();
        this.widget.clear();
        this.model.clear();
    }
    onScrolled(evt) {
        this.helper?.onScrolled(evt, this.widget.value?.getDomNode(), this.widget.value);
    }
    layout(dimensions, hasMultipleFrames) {
        this.dimension = dimensions;
        const editor = this.widget.value;
        if (!editor) {
            return;
        }
        editor.layout(dimensions);
        const height = editor.getContentHeight();
        this.helper = new ScrollHelper(hasMultipleFrames, height, dimensions.height);
        editor.updateOptions({ scrollbar: { ...commonEditorOptions.scrollbar, handleMouseWheel: !hasMultipleFrames } });
        return height;
    }
};
PlainTextMessagePeek = __decorate([
    __param(2, IInstantiationService),
    __param(3, ITextModelService),
    __param(4, IConfigurationService)
], PlainTextMessagePeek);
export { PlainTextMessagePeek };
let TerminalMessagePeek = class TerminalMessagePeek extends Disposable {
    constructor(container, isInPeekView, terminalService, viewDescriptorService, workspaceContext) {
        super();
        this.container = container;
        this.isInPeekView = isInPeekView;
        this.terminalService = terminalService;
        this.viewDescriptorService = viewDescriptorService;
        this.workspaceContext = workspaceContext;
        this.terminalCwd = this._register(new MutableObservableValue(''));
        this.xtermLayoutDelayer = this._register(new Delayer(50));
        /** Active terminal instance. */
        this.terminal = this._register(new MutableDisposable());
        /** Listener for streaming result data */
        this.outputDataListener = this._register(new MutableDisposable());
    }
    async makeTerminal() {
        const prev = this.terminal.value;
        if (prev) {
            prev.xterm.clearBuffer();
            prev.xterm.clearSearchDecorations();
            // clearBuffer tries to retain the prompt. Reset prompt, scrolling state, etc.
            prev.xterm.write(`\x1bc`);
            return prev;
        }
        const capabilities = new TerminalCapabilityStore();
        const cwd = this.terminalCwd;
        capabilities.add(0 /* TerminalCapability.CwdDetection */, {
            type: 0 /* TerminalCapability.CwdDetection */,
            get cwds() { return [cwd.value]; },
            onDidChangeCwd: cwd.onDidChange,
            getCwd: () => cwd.value,
            updateCwd: () => { },
        });
        return this.terminal.value = await this.terminalService.createDetachedTerminal({
            rows: 10,
            cols: 80,
            readonly: true,
            capabilities,
            processInfo: new DetachedProcessInfo({ initialCwd: cwd.value }),
            colorProvider: {
                getBackgroundColor: theme => {
                    const terminalBackground = theme.getColor(TERMINAL_BACKGROUND_COLOR);
                    if (terminalBackground) {
                        return terminalBackground;
                    }
                    if (this.isInPeekView) {
                        return theme.getColor(peekViewResultsBackground);
                    }
                    const location = this.viewDescriptorService.getViewLocationById("workbench.panel.testResults.view" /* Testing.ResultsViewId */);
                    return location === 1 /* ViewContainerLocation.Panel */
                        ? theme.getColor(PANEL_BACKGROUND)
                        : theme.getColor(SIDE_BAR_BACKGROUND);
                },
            }
        });
    }
    async update(subject) {
        this.outputDataListener.clear();
        if (subject instanceof TaskSubject) {
            await this.updateForTaskSubject(subject);
        }
        else if (subject instanceof TestOutputSubject || (subject instanceof MessageSubject && subject.message.type === 1 /* TestMessageType.Output */)) {
            await this.updateForTestSubject(subject);
        }
        else {
            this.clear();
            return false;
        }
        return true;
    }
    async updateForTestSubject(subject) {
        const that = this;
        const testItem = subject instanceof TestOutputSubject ? subject.test.item : subject.test;
        const terminal = await this.updateGenerically({
            subject,
            noOutputMessage: localize('caseNoOutput', 'The test case did not report any output.'),
            getTarget: result => result?.tasks[subject.taskIndex].output,
            *doInitialWrite(output, results) {
                that.updateCwd(testItem.uri);
                const state = subject instanceof TestOutputSubject ? subject.test : results.getStateById(testItem.extId);
                if (!state) {
                    return;
                }
                for (const message of state.tasks[subject.taskIndex].messages) {
                    if (message.type === 1 /* TestMessageType.Output */) {
                        yield* output.getRangeIter(message.offset, message.length);
                    }
                }
            },
            doListenForMoreData: (output, result, write) => result.onChange(e => {
                if (e.reason === 2 /* TestResultItemChangeReason.NewMessage */ && e.item.item.extId === testItem.extId && e.message.type === 1 /* TestMessageType.Output */) {
                    for (const chunk of output.getRangeIter(e.message.offset, e.message.length)) {
                        write(chunk.buffer);
                    }
                }
            }),
        });
        if (subject instanceof MessageSubject && subject.message.type === 1 /* TestMessageType.Output */ && subject.message.marker !== undefined) {
            terminal?.xterm.selectMarkedRange(getMarkId(subject.message.marker, true), getMarkId(subject.message.marker, false), /* scrollIntoView= */ true);
        }
    }
    updateForTaskSubject(subject) {
        return this.updateGenerically({
            subject,
            noOutputMessage: localize('runNoOutput', 'The test run did not record any output.'),
            getTarget: result => result?.tasks[subject.taskIndex],
            doInitialWrite: (task, result) => {
                // Update the cwd and use the first test to try to hint at the correct cwd,
                // but often this will fall back to the first workspace folder.
                this.updateCwd(Iterable.find(result.tests, t => !!t.item.uri)?.item.uri);
                return task.output.buffers;
            },
            doListenForMoreData: (task, _result, write) => task.output.onDidWriteData(e => write(e.buffer)),
        });
    }
    async updateGenerically(opts) {
        const result = opts.subject.result;
        const target = opts.getTarget(result);
        if (!target) {
            return this.clear();
        }
        const terminal = await this.makeTerminal();
        let didWriteData = false;
        const pendingWrites = new MutableObservableValue(0);
        if (result instanceof LiveTestResult) {
            for (const chunk of opts.doInitialWrite(target, result)) {
                didWriteData ||= chunk.byteLength > 0;
                pendingWrites.value++;
                terminal.xterm.write(chunk.buffer, () => pendingWrites.value--);
            }
        }
        else {
            didWriteData = true;
            this.writeNotice(terminal, localize('runNoOutputForPast', 'Test output is only available for new test runs.'));
        }
        this.attachTerminalToDom(terminal);
        this.outputDataListener.clear();
        if (result instanceof LiveTestResult && !result.completedAt) {
            const l1 = result.onComplete(() => {
                if (!didWriteData) {
                    this.writeNotice(terminal, opts.noOutputMessage);
                }
            });
            const l2 = opts.doListenForMoreData(target, result, data => {
                terminal.xterm.write(data);
                didWriteData ||= data.byteLength > 0;
            });
            this.outputDataListener.value = combinedDisposable(l1, l2);
        }
        if (!this.outputDataListener.value && !didWriteData) {
            this.writeNotice(terminal, opts.noOutputMessage);
        }
        // Ensure pending writes finish, otherwise the selection in `updateForTestSubject`
        // can happen before the markers are processed.
        if (pendingWrites.value > 0) {
            await new Promise(resolve => {
                const l = pendingWrites.onDidChange(() => {
                    if (pendingWrites.value === 0) {
                        l.dispose();
                        resolve();
                    }
                });
            });
        }
        return terminal;
    }
    updateCwd(testUri) {
        const wf = (testUri && this.workspaceContext.getWorkspaceFolder(testUri))
            || this.workspaceContext.getWorkspace().folders[0];
        if (wf) {
            this.terminalCwd.value = wf.uri.fsPath;
        }
    }
    writeNotice(terminal, str) {
        terminal.xterm.write(formatMessageForTerminal(str));
    }
    attachTerminalToDom(terminal) {
        terminal.xterm.write('\x1b[?25l'); // hide cursor
        dom.scheduleAtNextAnimationFrame(dom.getWindow(this.container), () => this.layoutTerminal(terminal));
        terminal.attachToElement(this.container, { enableGpu: false });
    }
    clear() {
        this.outputDataListener.clear();
        this.xtermLayoutDelayer.cancel();
        this.terminal.clear();
    }
    layout(dimensions) {
        this.dimensions = dimensions;
        if (this.terminal.value) {
            this.layoutTerminal(this.terminal.value, dimensions.width, dimensions.height);
            return dimensions.height;
        }
        return undefined;
    }
    layoutTerminal({ xterm }, width = this.dimensions?.width ?? this.container.clientWidth, height = this.dimensions?.height ?? this.container.clientHeight) {
        width -= 10 + 20; // scrollbar width + margin
        this.xtermLayoutDelayer.trigger(() => {
            const scaled = getXtermScaledDimensions(dom.getWindow(this.container), xterm.getFont(), width, height);
            if (scaled) {
                xterm.resize(scaled.cols, scaled.rows);
            }
        });
    }
};
TerminalMessagePeek = __decorate([
    __param(2, ITerminalService),
    __param(3, IViewDescriptorService),
    __param(4, IWorkspaceContextService)
], TerminalMessagePeek);
export { TerminalMessagePeek };
const isMultiline = (str) => !!str && str.includes('\n');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdFJlc3VsdHNPdXRwdXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXN0aW5nL2Jyb3dzZXIvdGVzdFJlc3VsdHNWaWV3L3Rlc3RSZXN1bHRzT3V0cHV0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRTlELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQTJCLGlCQUFpQixFQUFFLGtCQUFrQixFQUFFLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBSXBLLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDZFQUE2RSxDQUFDO0FBQ3ZILE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDZFQUE2RSxDQUFDO0FBQ3ZILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBR3hHLE9BQU8sRUFBNEIsaUJBQWlCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUN2SCxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUN2RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FB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