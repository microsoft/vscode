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
var TestResultsViewContent_1;
import * as dom from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Sizing, SplitView } from '../../../../../base/browser/ui/splitview/splitview.js';
import { findAsync } from '../../../../../base/common/arrays.js';
import { Limiter } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event, Relay } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../nls.js';
import { FloatingClickMenu } from '../../../../../platform/actions/browser/floatingMenu.js';
import { createActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { CallStackFrame, CallStackWidget, CustomStackFrame } from '../../../debug/browser/callStackWidget.js';
import { getTestingConfiguration } from '../../common/configuration.js';
import { capabilityContextKeys, ITestProfileService } from '../../common/testProfileService.js';
import { LiveTestResult } from '../../common/testResult.js';
import { ITestService } from '../../common/testService.js';
import { TestingContextKeys } from '../../common/testingContextKeys.js';
import * as icons from '../icons.js';
import { DiffContentProvider, MarkdownTestMessagePeek, PlainTextMessagePeek, TerminalMessagePeek } from './testResultsOutput.js';
import { equalsSubject, getSubjectTestItem, MessageSubject, TaskSubject, TestOutputSubject } from './testResultsSubject.js';
import { OutputPeekTree } from './testResultsTree.js';
import './testResultsViewContent.css';
let MessageStackFrame = class MessageStackFrame extends CustomStackFrame {
    constructor(message, followup, subject, instantiationService, contextKeyService, profileService) {
        super();
        this.message = message;
        this.followup = followup;
        this.subject = subject;
        this.instantiationService = instantiationService;
        this.contextKeyService = contextKeyService;
        this.profileService = profileService;
        this.height = observableValue('MessageStackFrame.height', 100);
        this.icon = icons.testingViewIcon;
        this.label = subject instanceof MessageSubject
            ? subject.test.label
            : subject instanceof TestOutputSubject
                ? subject.test.item.label
                : subject.result.name;
    }
    render(container) {
        this.message.style.visibility = 'visible';
        container.appendChild(this.message);
        return toDisposable(() => this.message.remove());
    }
    renderActions(container) {
        const store = new DisposableStore();
        container.appendChild(this.followup.domNode);
        store.add(toDisposable(() => this.followup.domNode.remove()));
        const test = getSubjectTestItem(this.subject);
        const capabilities = test && this.profileService.capabilitiesForTest(test);
        let contextKeyService;
        if (capabilities) {
            contextKeyService = this.contextKeyService.createOverlay(capabilityContextKeys(capabilities));
        }
        else {
            const profiles = this.profileService.getControllerProfiles(this.subject.controllerId);
            contextKeyService = this.contextKeyService.createOverlay([
                [TestingContextKeys.hasRunnableTests.key, profiles.some(p => p.group & 2 /* TestRunProfileBitset.Run */)],
                [TestingContextKeys.hasDebuggableTests.key, profiles.some(p => p.group & 4 /* TestRunProfileBitset.Debug */)],
            ]);
        }
        const instaService = store.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
        const toolbar = store.add(instaService.createInstance(MenuWorkbenchToolBar, container, MenuId.TestCallStack, {
            menuOptions: { shouldForwardArgs: true },
            actionViewItemProvider: (action, options) => createActionViewItem(this.instantiationService, action, options),
        }));
        toolbar.context = this.subject;
        store.add(toolbar);
        return store;
    }
};
MessageStackFrame = __decorate([
    __param(3, IInstantiationService),
    __param(4, IContextKeyService),
    __param(5, ITestProfileService)
], MessageStackFrame);
function runInLast(accessor, bitset, subject) {
    // Let the full command do its thing if we want to run the whole set of tests
    if (subject instanceof TaskSubject) {
        return accessor.get(ICommandService).executeCommand(bitset === 4 /* TestRunProfileBitset.Debug */ ? "testing.debugLastRun" /* TestCommandId.DebugLastRun */ : "testing.reRunLastRun" /* TestCommandId.ReRunLastRun */, subject.result.id);
    }
    const testService = accessor.get(ITestService);
    const plainTest = subject instanceof MessageSubject ? subject.test : subject.test.item;
    const currentTest = testService.collection.getNodeById(plainTest.extId);
    if (!currentTest) {
        return;
    }
    return testService.runTests({
        group: bitset,
        tests: [currentTest],
    });
}
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'testing.callStack.run',
            title: localize('testing.callStack.run', "Rerun Test"),
            icon: icons.testingRunIcon,
            menu: {
                id: MenuId.TestCallStack,
                when: TestingContextKeys.hasRunnableTests,
                group: 'navigation',
            },
        });
    }
    run(accessor, subject) {
        runInLast(accessor, 2 /* TestRunProfileBitset.Run */, subject);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'testing.callStack.debug',
            title: localize('testing.callStack.debug', "Debug Test"),
            icon: icons.testingDebugIcon,
            menu: {
                id: MenuId.TestCallStack,
                when: TestingContextKeys.hasDebuggableTests,
                group: 'navigation',
            },
        });
    }
    run(accessor, subject) {
        runInLast(accessor, 4 /* TestRunProfileBitset.Debug */, subject);
    }
});
let TestResultsViewContent = class TestResultsViewContent extends Disposable {
    static { TestResultsViewContent_1 = this; }
    get uiState() {
        return {
            splitViewWidths: Array.from({ length: this.splitView.length }, (_, i) => this.splitView.getViewSize(i)),
        };
    }
    get onDidChangeContentHeight() {
        return this.callStackWidget.onDidChangeContentHeight;
    }
    get contentHeight() {
        return this.callStackWidget?.contentHeight || 0;
    }
    get diffViewIndex() {
        return this.isTreeLeft ? 1 : 0; // Content view index
    }
    get historyViewIndex() {
        return this.isTreeLeft ? 0 : 1; // Tree view index
    }
    constructor(editor, options, instantiationService, modelService, contextKeyService, uriIdentityService, configurationService) {
        super();
        this.editor = editor;
        this.options = options;
        this.instantiationService = instantiationService;
        this.modelService = modelService;
        this.contextKeyService = contextKeyService;
        this.uriIdentityService = uriIdentityService;
        this.configurationService = configurationService;
        this.didReveal = this._register(new Emitter());
        this.currentSubjectStore = this._register(new DisposableStore());
        this.onCloseEmitter = this._register(new Relay());
        this.contentProvidersUpdateLimiter = this._register(new Limiter(1));
        this.isTreeLeft = false; // Track layout setting
        this.onClose = this.onCloseEmitter.event;
    }
    swapViews() {
        const leftSize = this.splitView.getViewSize(0);
        const rightSize = this.splitView.getViewSize(1);
        const leftView = this.splitView.removeView(1);
        const rightView = this.splitView.removeView(0);
        this.splitView.addView(leftView, rightSize);
        this.splitView.addView(rightView, leftSize);
    }
    fillBody(containerElement) {
        const initialSpitWidth = TestResultsViewContent_1.lastSplitWidth;
        this.splitView = new SplitView(containerElement, { orientation: 1 /* Orientation.HORIZONTAL */ });
        const { historyVisible, showRevealLocationOnMessages } = this.options;
        const isInPeekView = this.editor !== undefined;
        const layout = getTestingConfiguration(this.configurationService, "testing.resultsView.layout" /* TestingConfigKeys.ResultsViewLayout */);
        this.isTreeLeft = layout === "treeLeft" /* TestingResultsViewLayout.TreeLeft */;
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("testing.resultsView.layout" /* TestingConfigKeys.ResultsViewLayout */)) {
                const newLayout = getTestingConfiguration(this.configurationService, "testing.resultsView.layout" /* TestingConfigKeys.ResultsViewLayout */);
                const newIsTreeLeft = newLayout === "treeLeft" /* TestingResultsViewLayout.TreeLeft */;
                if (newIsTreeLeft !== this.isTreeLeft) {
                    this.isTreeLeft = newIsTreeLeft;
                    this.swapViews();
                }
            }
        }));
        const messageContainer = this.messageContainer = dom.$('.test-output-peek-message-container');
        this.stackContainer = dom.append(containerElement, dom.$('.test-output-call-stack-container'));
        this.callStackWidget = this._register(this.instantiationService.createInstance(CallStackWidget, this.stackContainer, this.editor));
        this.followupWidget = this._register(this.instantiationService.createInstance(FollowupActionWidget, this.editor));
        this.onCloseEmitter.input = this.followupWidget.onClose;
        this.contentProviders = [
            this._register(this.instantiationService.createInstance(DiffContentProvider, this.editor, messageContainer)),
            this._register(this.instantiationService.createInstance(MarkdownTestMessagePeek, messageContainer)),
            this._register(this.instantiationService.createInstance(TerminalMessagePeek, messageContainer, isInPeekView)),
            this._register(this.instantiationService.createInstance(PlainTextMessagePeek, this.editor, messageContainer)),
        ];
        this.messageContextKeyService = this._register(this.contextKeyService.createScoped(containerElement));
        this.contextKeyTestMessage = TestingContextKeys.testMessageContext.bindTo(this.messageContextKeyService);
        this.contextKeyResultOutdated = TestingContextKeys.testResultOutdated.bindTo(this.messageContextKeyService);
        const treeContainer = dom.append(containerElement, dom.$('.test-output-peek-tree.testing-stdtree'));
        const tree = this._register(this.instantiationService.createInstance(OutputPeekTree, treeContainer, this.didReveal.event, { showRevealLocationOnMessages, locationForProgress: this.options.locationForProgress }));
        this.onDidRequestReveal = tree.onDidRequestReview;
        // Add views in the correct order based on layout setting
        const stackView = {
            onDidChange: Event.None,
            element: this.stackContainer,
            minimumSize: 200,
            maximumSize: Number.MAX_VALUE,
            layout: (width) => {
                TestResultsViewContent_1.lastSplitWidth = width;
                if (this.dimension) {
                    this.callStackWidget?.layout(this.dimension.height, width);
                    this.layoutContentWidgets(this.dimension, width);
                }
            },
        };
        const treeView = {
            onDidChange: Event.None,
            element: treeContainer,
            minimumSize: 100,
            maximumSize: Number.MAX_VALUE,
            layout: (width) => {
                if (this.dimension) {
                    tree.layout(this.dimension.height, width);
                }
            },
        };
        this.splitView.addView(stackView, Sizing.Distribute);
        this.splitView.addView(treeView, Sizing.Distribute);
        if (this.isTreeLeft) {
            this.swapViews();
        }
        // Configure visibility for the tree view
        this.splitView.setViewVisible(this.historyViewIndex, historyVisible.value);
        this._register(historyVisible.onDidChange(visible => {
            this.splitView.setViewVisible(this.historyViewIndex, visible);
        }));
        if (initialSpitWidth) {
            queueMicrotask(() => this.splitView.resizeView(this.diffViewIndex, initialSpitWidth));
        }
    }
    /**
     * Shows a message in-place without showing or changing the peek location.
     * This is mostly used if peeking a message without a location.
     */
    reveal(opts) {
        this.didReveal.fire(opts);
        if (this.current && equalsSubject(this.current, opts.subject)) {
            return Promise.resolve();
        }
        this.current = opts.subject;
        return this.contentProvidersUpdateLimiter.queue(async () => {
            this.currentSubjectStore.clear();
            const callFrames = this.getCallFrames(opts.subject) || [];
            const topFrame = await this.prepareTopFrame(opts.subject, callFrames);
            this.setCallStackFrames(topFrame, callFrames);
            this.followupWidget.show(opts.subject);
            this.populateFloatingClick(opts.subject);
        });
    }
    setCallStackFrames(messageFrame, stack) {
        this.callStackWidget.setFrames([messageFrame, ...stack.map(frame => new CallStackFrame(frame.label, frame.uri, frame.position?.lineNumber, frame.position?.column))]);
    }
    /**
     * Collapses all displayed stack frames.
     */
    collapseStack() {
        this.callStackWidget.collapseAll();
    }
    getCallFrames(subject) {
        if (!(subject instanceof MessageSubject)) {
            return undefined;
        }
        const frames = subject.stack;
        if (!frames?.length || !this.editor) {
            return frames;
        }
        // If the test extension just sets the top frame as the same location
        // where the message is displayed, in the case of a peek in an editor,
        // don't show it again because it's just a duplicate
        const topFrame = frames[0];
        const peekLocation = subject.revealLocation;
        const isTopFrameSame = peekLocation && topFrame.position && topFrame.uri
            && topFrame.position.lineNumber === peekLocation.range.startLineNumber
            && topFrame.position.column === peekLocation.range.startColumn
            && this.uriIdentityService.extUri.isEqual(topFrame.uri, peekLocation.uri);
        return isTopFrameSame ? frames.slice(1) : frames;
    }
    async prepareTopFrame(subject, callFrames) {
        // ensure the messageContainer is in the DOM so renderers can calculate the
        // dimensions before it's rendered in the list.
        this.messageContainer.style.visibility = 'hidden';
        this.stackContainer.appendChild(this.messageContainer);
        const topFrame = this.currentTopFrame = this.instantiationService.createInstance(MessageStackFrame, this.messageContainer, this.followupWidget, subject);
        const hasMultipleFrames = callFrames.length > 0;
        topFrame.showHeader.set(hasMultipleFrames, undefined);
        const provider = await findAsync(this.contentProviders, p => p.update(subject));
        if (provider) {
            const width = this.splitView.getViewSize(this.diffViewIndex);
            if (width !== -1 && this.dimension) {
                topFrame.height.set(provider.layout({ width, height: this.dimension?.height }, hasMultipleFrames), undefined);
            }
            if (provider.onScrolled) {
                this.currentSubjectStore.add(this.callStackWidget.onDidScroll(evt => {
                    provider.onScrolled(evt);
                }));
            }
            if (provider.onDidContentSizeChange) {
                this.currentSubjectStore.add(provider.onDidContentSizeChange(() => {
                    const width = this.splitView.getViewSize(this.diffViewIndex);
                    if (this.dimension && !this.isDoingLayoutUpdate && width !== -1) {
                        this.isDoingLayoutUpdate = true;
                        topFrame.height.set(provider.layout({ width, height: this.dimension.height }, hasMultipleFrames), undefined);
                        this.isDoingLayoutUpdate = false;
                    }
                }));
            }
        }
        return topFrame;
    }
    layoutContentWidgets(dimension, width = this.splitView.getViewSize(this.diffViewIndex)) {
        this.isDoingLayoutUpdate = true;
        for (const provider of this.contentProviders) {
            const frameHeight = provider.layout({ height: dimension.height, width }, !!this.currentTopFrame?.showHeader.get());
            if (frameHeight) {
                this.currentTopFrame?.height.set(frameHeight, undefined);
            }
        }
        this.isDoingLayoutUpdate = false;
    }
    populateFloatingClick(subject) {
        if (!(subject instanceof MessageSubject)) {
            return;
        }
        this.currentSubjectStore.add(toDisposable(() => {
            this.contextKeyResultOutdated.reset();
            this.contextKeyTestMessage.reset();
        }));
        this.contextKeyTestMessage.set(subject.contextValue || '');
        if (subject.result instanceof LiveTestResult) {
            this.contextKeyResultOutdated.set(subject.result.getStateById(subject.test.extId)?.retired ?? false);
            this.currentSubjectStore.add(subject.result.onChange(ev => {
                if (ev.item.item.extId === subject.test.extId) {
                    this.contextKeyResultOutdated.set(ev.item.retired ?? false);
                }
            }));
        }
        else {
            this.contextKeyResultOutdated.set(true);
        }
        const instaService = this.currentSubjectStore.add(this.instantiationService
            .createChild(new ServiceCollection([IContextKeyService, this.messageContextKeyService])));
        this.currentSubjectStore.add(instaService.createInstance(FloatingClickMenu, {
            container: this.messageContainer,
            menuId: MenuId.TestMessageContent,
            getActionArg: () => subject.context,
        }));
    }
    onLayoutBody(height, width) {
        this.dimension = new dom.Dimension(width, height);
        this.splitView.layout(width);
    }
    onWidth(width) {
        this.splitView.layout(width);
    }
};
TestResultsViewContent = TestResultsViewContent_1 = __decorate([
    __param(2, IInstantiationService),
    __param(3, ITextModelService),
    __param(4, IContextKeyService),
    __param(5, IUriIdentityService),
    __param(6, IConfigurationService)
], TestResultsViewContent);
export { TestResultsViewContent };
const FOLLOWUP_ANIMATION_MIN_TIME = 500;
let FollowupActionWidget = class FollowupActionWidget extends Disposable {
    get domNode() {
        return this.el.root;
    }
    constructor(editor, testService, quickInput) {
        super();
        this.editor = editor;
        this.testService = testService;
        this.quickInput = quickInput;
        this.el = dom.h('div.testing-followup-action', []);
        this.visibleStore = this._register(new DisposableStore());
        this.onCloseEmitter = this._register(new Emitter());
        this.onClose = this.onCloseEmitter.event;
    }
    show(subject) {
        this.visibleStore.clear();
        if (subject instanceof MessageSubject) {
            this.showMessage(subject);
        }
    }
    async showMessage(subject) {
        const cts = this.visibleStore.add(new CancellationTokenSource());
        const start = Date.now();
        // Wait for completion otherwise results will not be available to the ext host:
        if (subject.result instanceof LiveTestResult && !subject.result.completedAt) {
            await new Promise(r => Event.once(subject.result.onComplete)(r));
        }
        const followups = await this.testService.provideTestFollowups({
            extId: subject.test.extId,
            messageIndex: subject.messageIndex,
            resultId: subject.result.id,
            taskIndex: subject.taskIndex,
        }, cts.token);
        if (!followups.followups.length || cts.token.isCancellationRequested) {
            followups.dispose();
            return;
        }
        this.visibleStore.add(followups);
        dom.clearNode(this.el.root);
        this.el.root.classList.toggle('animated', Date.now() - start > FOLLOWUP_ANIMATION_MIN_TIME);
        this.el.root.appendChild(this.makeFollowupLink(followups.followups[0]));
        if (followups.followups.length > 1) {
            this.el.root.appendChild(this.makeMoreLink(followups.followups));
        }
        this.visibleStore.add(toDisposable(() => {
            this.el.root.remove();
        }));
    }
    makeFollowupLink(first) {
        const link = this.makeLink(() => this.actionFollowup(link, first));
        dom.reset(link, ...renderLabelWithIcons(first.message));
        return link;
    }
    makeMoreLink(followups) {
        const link = this.makeLink(() => this.quickInput.pick(followups.map((f, i) => ({
            label: f.message,
            index: i
        }))).then(picked => {
            if (picked?.length) {
                followups[picked[0].index].execute();
            }
        }));
        link.innerText = localize('testFollowup.more', '+{0} More...', followups.length - 1);
        return link;
    }
    makeLink(onClick) {
        const link = document.createElement('a');
        link.tabIndex = 0;
        this.visibleStore.add(dom.addDisposableListener(link, 'click', onClick));
        this.visibleStore.add(dom.addDisposableListener(link, 'keydown', e => {
            const event = new StandardKeyboardEvent(e);
            if (event.equals(10 /* KeyCode.Space */) || event.equals(3 /* KeyCode.Enter */)) {
                onClick();
            }
        }));
        return link;
    }
    actionFollowup(link, fu) {
        if (link.ariaDisabled !== 'true') {
            link.ariaDisabled = 'true';
            fu.execute();
            if (this.editor) {
                this.onCloseEmitter.fire();
            }
        }
    }
};
FollowupActionWidget = __decorate([
    __param(1, ITestService),
    __param(2, IQuickInputService)
], FollowupActionWidget);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdFJlc3VsdHNWaWV3Q29udGVudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvYnJvd3Nlci90ZXN0UmVzdWx0c1ZpZXcvdGVzdFJlc3VsdHNWaWV3Q29udGVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNyRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM5RixPQUFPLEVBQWUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDckYsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFNUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDakgsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRTNFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM1RixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxvRUFBb0UsQ0FB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