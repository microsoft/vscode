/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { Orientation, Sizing, SplitView } from 'vs/base/browser/ui/splitview/splitview';
import { findAsync } from 'vs/base/common/arrays';
import { Limiter } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event, Relay } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { observableValue } from 'vs/base/common/observable';
import 'vs/css!./testResultsViewContent';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { localize } from 'vs/nls';
import { FloatingClickMenu } from 'vs/platform/actions/browser/floatingMenu';
import { createActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { CustomStackFrame } from 'vs/workbench/contrib/debug/browser/callStackWidget';
import * as icons from 'vs/workbench/contrib/testing/browser/icons';
import { TestResultStackWidget } from 'vs/workbench/contrib/testing/browser/testResultsView/testMessageStack';
import { DiffContentProvider, IPeekOutputRenderer, MarkdownTestMessagePeek, PlainTextMessagePeek, TerminalMessagePeek } from 'vs/workbench/contrib/testing/browser/testResultsView/testResultsOutput';
import { equalsSubject, getSubjectTestItem, InspectSubject, MessageSubject, TaskSubject, TestOutputSubject } from 'vs/workbench/contrib/testing/browser/testResultsView/testResultsSubject';
import { OutputPeekTree } from 'vs/workbench/contrib/testing/browser/testResultsView/testResultsTree';
import { TestCommandId } from 'vs/workbench/contrib/testing/common/constants';
import { IObservableValue } from 'vs/workbench/contrib/testing/common/observableValue';
import { capabilityContextKeys, ITestProfileService } from 'vs/workbench/contrib/testing/common/testProfileService';
import { LiveTestResult } from 'vs/workbench/contrib/testing/common/testResult';
import { ITestFollowup, ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { ITestMessageStackFrame, TestRunProfileBitset } from 'vs/workbench/contrib/testing/common/testTypes';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';

const enum SubView {
	Diff = 0,
	History = 1,
}

/** UI state that can be saved/restored, used to give a nice experience when switching stack frames */
export interface ITestResultsViewContentUiState {
	splitViewWidths: number[];
}

class MessageStackFrame extends CustomStackFrame {
	public override height = observableValue('MessageStackFrame.height', 100);
	public override label: string;
	public override icon = icons.testingViewIcon;

	constructor(
		private readonly message: HTMLElement,
		private readonly followup: FollowupActionWidget,
		private readonly subject: InspectSubject,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ITestProfileService private readonly profileService: ITestProfileService,
	) {
		super();

		this.label = subject instanceof MessageSubject
			? subject.test.label
			: subject instanceof TestOutputSubject
				? subject.test.item.label
				: subject.result.name;
	}

	public override render(container: HTMLElement): IDisposable {
		container.appendChild(this.message);
		return toDisposable(() => this.message.remove());
	}

	public override renderActions(container: HTMLElement): IDisposable {
		const store = new DisposableStore();

		container.appendChild(this.followup.domNode);
		store.add(toDisposable(() => this.followup.domNode.remove()));

		const test = getSubjectTestItem(this.subject);
		const capabilities = test && this.profileService.capabilitiesForTest(test);
		let contextKeyService: IContextKeyService;
		if (capabilities) {
			contextKeyService = this.contextKeyService.createOverlay(capabilityContextKeys(capabilities));
		} else {
			const profiles = this.profileService.getControllerProfiles(this.subject.controllerId);
			contextKeyService = this.contextKeyService.createOverlay([
				[TestingContextKeys.hasRunnableTests.key, profiles.some(p => p.group & TestRunProfileBitset.Run)],
				[TestingContextKeys.hasDebuggableTests.key, profiles.some(p => p.group & TestRunProfileBitset.Debug)],
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
}

function runInLast(accessor: ServicesAccessor, bitset: TestRunProfileBitset, subject: InspectSubject) {
	// Let the full command do its thing if we want to run the whole set of tests
	if (subject instanceof TaskSubject) {
		return accessor.get(ICommandService).executeCommand(
			bitset === TestRunProfileBitset.Debug ? TestCommandId.DebugLastRun : TestCommandId.ReRunLastRun,
			subject.result.id,
		);
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

	override run(accessor: ServicesAccessor, subject: InspectSubject): void {
		runInLast(accessor, TestRunProfileBitset.Run, subject);
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

	override run(accessor: ServicesAccessor, subject: InspectSubject): void {
		runInLast(accessor, TestRunProfileBitset.Debug, subject);
	}
});

export class TestResultsViewContent extends Disposable {
	private static lastSplitWidth?: number;

	private readonly didReveal = this._register(new Emitter<{ subject: InspectSubject; preserveFocus: boolean }>());
	private readonly currentSubjectStore = this._register(new DisposableStore());
	private readonly onCloseEmitter = this._register(new Relay<void>());
	private followupWidget!: FollowupActionWidget;
	private messageContextKeyService!: IContextKeyService;
	private contextKeyTestMessage!: IContextKey<string>;
	private contextKeyResultOutdated!: IContextKey<boolean>;
	private stackContainer!: HTMLElement;
	private callStackWidget!: TestResultStackWidget;
	private currentTopFrame?: MessageStackFrame;
	private isDoingLayoutUpdate?: boolean;

	private dimension?: dom.Dimension;
	private splitView!: SplitView;
	private messageContainer!: HTMLElement;
	private contentProviders!: IPeekOutputRenderer[];
	private contentProvidersUpdateLimiter = this._register(new Limiter(1));

	public current?: InspectSubject;

	/** Fired when a tree item is selected. Populated only on .fillBody() */
	public onDidRequestReveal!: Event<InspectSubject>;

	public readonly onClose = this.onCloseEmitter.event;

	public get uiState(): ITestResultsViewContentUiState {
		return {
			splitViewWidths: Array.from(
				{ length: this.splitView.length },
				(_, i) => this.splitView.getViewSize(i)
			),
		};
	}

	constructor(
		private readonly editor: ICodeEditor | undefined,
		private readonly options: {
			historyVisible: IObservableValue<boolean>;
			showRevealLocationOnMessages: boolean;
			locationForProgress: string;
		},
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextModelService protected readonly modelService: ITextModelService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();
	}

	public fillBody(containerElement: HTMLElement): void {
		const initialSpitWidth = TestResultsViewContent.lastSplitWidth;
		this.splitView = new SplitView(containerElement, { orientation: Orientation.HORIZONTAL });

		const { historyVisible, showRevealLocationOnMessages } = this.options;
		const isInPeekView = this.editor !== undefined;

		const messageContainer = this.messageContainer = dom.$('.test-output-peek-message-container');
		this.stackContainer = dom.append(containerElement, dom.$('.test-output-call-stack-container'));
		this.callStackWidget = this._register(this.instantiationService.createInstance(TestResultStackWidget, this.stackContainer, this.editor));
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

		const treeContainer = dom.append(containerElement, dom.$('.test-output-peek-tree'));
		const tree = this._register(this.instantiationService.createInstance(
			OutputPeekTree,
			treeContainer,
			this.didReveal.event,
			{ showRevealLocationOnMessages, locationForProgress: this.options.locationForProgress },
		));

		this.onDidRequestReveal = tree.onDidRequestReview;

		this.splitView.addView({
			onDidChange: Event.None,
			element: this.stackContainer,
			minimumSize: 200,
			maximumSize: Number.MAX_VALUE,
			layout: width => {
				TestResultsViewContent.lastSplitWidth = width;

				if (this.dimension) {
					this.callStackWidget?.layout(this.dimension.height, width);
					this.layoutContentWidgets(this.dimension, width);
				}
			},
		}, Sizing.Distribute);

		this.splitView.addView({
			onDidChange: Event.None,
			element: treeContainer,
			minimumSize: 100,
			maximumSize: Number.MAX_VALUE,
			layout: width => {
				if (this.dimension) {
					tree.layout(this.dimension.height, width);
				}
			},
		}, Sizing.Distribute);


		this.splitView.setViewVisible(SubView.History, historyVisible.value);
		this._register(historyVisible.onDidChange(visible => {
			this.splitView.setViewVisible(SubView.History, visible);
		}));

		if (initialSpitWidth) {
			queueMicrotask(() => this.splitView.resizeView(0, initialSpitWidth));
		}
	}

	/**
	 * Shows a message in-place without showing or changing the peek location.
	 * This is mostly used if peeking a message without a location.
	 */
	public reveal(opts: {
		subject: InspectSubject;
		preserveFocus: boolean;
	}) {
		this.didReveal.fire(opts);

		if (this.current && equalsSubject(this.current, opts.subject)) {
			return Promise.resolve();
		}

		this.current = opts.subject;
		return this.contentProvidersUpdateLimiter.queue(async () => {
			this.currentSubjectStore.clear();
			const callFrames = (opts.subject instanceof MessageSubject && opts.subject.stack) || [];
			const topFrame = await this.prepareTopFrame(opts.subject, callFrames);
			this.callStackWidget.update(topFrame, callFrames);

			this.followupWidget.show(opts.subject);
			this.populateFloatingClick(opts.subject);
		});
	}

	private async prepareTopFrame(subject: InspectSubject, callFrames: ITestMessageStackFrame[]) {
		const topFrame = this.currentTopFrame = this.instantiationService.createInstance(MessageStackFrame, this.messageContainer, this.followupWidget, subject);
		topFrame.showHeader.set(callFrames.length > 0, undefined);

		const provider = await findAsync(this.contentProviders, p => p.update(subject));
		if (provider) {
			if (this.dimension) {
				topFrame.height.set(provider.layout(this.dimension)!, undefined);
			}
			if (provider.onDidContentSizeChange) {
				this.currentSubjectStore.add(provider.onDidContentSizeChange(() => {
					if (this.dimension && !this.isDoingLayoutUpdate) {
						this.isDoingLayoutUpdate = true;
						topFrame.height.set(provider.layout(this.dimension)!, undefined);
						this.isDoingLayoutUpdate = false;
					}
				}));
			}
		}

		return topFrame;
	}

	private layoutContentWidgets(dimension: dom.Dimension, width = this.splitView.getViewSize(SubView.Diff)) {
		this.isDoingLayoutUpdate = true;
		for (const provider of this.contentProviders) {
			const frameHeight = provider.layout({ height: dimension.height, width });
			if (frameHeight) {
				this.currentTopFrame?.height.set(frameHeight, undefined);
			}
		}
		this.isDoingLayoutUpdate = false;
	}

	private populateFloatingClick(subject: InspectSubject) {
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
		} else {
			this.contextKeyResultOutdated.set(true);
		}

		const instaService = this.currentSubjectStore.add(this.instantiationService
			.createChild(new ServiceCollection([IContextKeyService, this.messageContextKeyService])));

		this.currentSubjectStore.add(instaService.createInstance(FloatingClickMenu, {
			container: this.messageContainer,
			menuId: MenuId.TestMessageContent,
			getActionArg: () => (subject as MessageSubject).context,
		}));
	}

	public onLayoutBody(height: number, width: number) {
		this.dimension = new dom.Dimension(width, height);
		this.splitView.layout(width);
	}

	public onWidth(width: number) {
		this.splitView.layout(width);
	}
}

const FOLLOWUP_ANIMATION_MIN_TIME = 500;

class FollowupActionWidget extends Disposable {
	private readonly el = dom.h('div.testing-followup-action', []);
	private readonly visibleStore = this._register(new DisposableStore());
	private readonly onCloseEmitter = this._register(new Emitter<void>());
	public readonly onClose = this.onCloseEmitter.event;

	public get domNode() {
		return this.el.root;
	}

	constructor(
		private readonly editor: ICodeEditor | undefined,
		@ITestService private readonly testService: ITestService,
		@IQuickInputService private readonly quickInput: IQuickInputService,
	) {
		super();
	}

	public show(subject: InspectSubject) {
		this.visibleStore.clear();
		if (subject instanceof MessageSubject) {
			this.showMessage(subject);
		}
	}

	private async showMessage(subject: MessageSubject) {
		const cts = this.visibleStore.add(new CancellationTokenSource());
		const start = Date.now();

		// Wait for completion otherwise results will not be available to the ext host:
		if (subject.result instanceof LiveTestResult && !subject.result.completedAt) {
			await new Promise(r => Event.once((subject.result as LiveTestResult).onComplete)(r));
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

	private makeFollowupLink(first: ITestFollowup) {
		const link = this.makeLink(() => this.actionFollowup(link, first));
		dom.reset(link, ...renderLabelWithIcons(first.message));
		return link;
	}

	private makeMoreLink(followups: ITestFollowup[]) {
		const link = this.makeLink(() =>
			this.quickInput.pick(followups.map((f, i) => ({
				label: f.message,
				index: i
			}))).then(picked => {
				if (picked?.length) {
					followups[picked[0].index].execute();
				}
			})
		);

		link.innerText = localize('testFollowup.more', '+{0} More...', followups.length - 1);
		return link;
	}

	private makeLink(onClick: () => void) {
		const link = document.createElement('a');
		link.tabIndex = 0;
		this.visibleStore.add(dom.addDisposableListener(link, 'click', onClick));
		this.visibleStore.add(dom.addDisposableListener(link, 'keydown', e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Space) || event.equals(KeyCode.Enter)) {
				onClick();
			}
		}));

		return link;
	}

	private actionFollowup(link: HTMLAnchorElement, fu: ITestFollowup) {
		if (link.ariaDisabled !== 'true') {
			link.ariaDisabled = 'true';
			fu.execute();

			if (this.editor) {
				this.onCloseEmitter.fire();
			}
		}
	}
}
