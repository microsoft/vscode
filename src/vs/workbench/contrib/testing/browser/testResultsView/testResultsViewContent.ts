/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { Orientation, Sizing, SplitView } from 'vs/base/browser/ui/splitview/splitview';
import { Limiter } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event, Relay } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./testResultsViewContent';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { localize } from 'vs/nls';
import { FloatingClickMenu } from 'vs/platform/actions/browser/floatingMenu';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { TestResultStackWidget } from 'vs/workbench/contrib/testing/browser/testResultsView/testMessageStack';
import { DiffContentProvider, IPeekOutputRenderer, MarkdownTestMessagePeek, PlainTextMessagePeek, TerminalMessagePeek } from 'vs/workbench/contrib/testing/browser/testResultsView/testResultsOutput';
import { InspectSubject, MessageSubject, equalsSubject } from 'vs/workbench/contrib/testing/browser/testResultsView/testResultsSubject';
import { OutputPeekTree } from 'vs/workbench/contrib/testing/browser/testResultsView/testResultsTree';
import { IObservableValue } from 'vs/workbench/contrib/testing/common/observableValue';
import { LiveTestResult } from 'vs/workbench/contrib/testing/common/testResult';
import { ITestFollowup, ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { ITestMessageStackFrame } from 'vs/workbench/contrib/testing/common/testTypes';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestingPeekOpener } from 'vs/workbench/contrib/testing/common/testingPeekOpener';

const enum SubView {
	CallStack = 0,
	Diff = 1,
	History = 2,
}

/** UI state that can be saved/restored, used to give a nice experience when switching stack frames */
export interface ITestResultsViewContentUiState {
	splitViewWidths: number[];
}

export class TestResultsViewContent extends Disposable {
	private static lastSplitWidth?: number;

	private readonly didReveal = this._register(new Emitter<{ subject: InspectSubject; preserveFocus: boolean }>());
	private readonly currentSubjectStore = this._register(new DisposableStore());
	private readonly onCloseEmitter = this._register(new Relay<void>());
	private readonly onDidChangeStackFrameEmitter = this._register(new Relay<ITestMessageStackFrame>());
	private followupWidget!: FollowupActionWidget;
	private messageContextKeyService!: IContextKeyService;
	private contextKeyTestMessage!: IContextKey<string>;
	private contextKeyResultOutdated!: IContextKey<boolean>;
	private callStackEl!: HTMLElement;
	private readonly callStackWidget = this._register(new MutableDisposable<TestResultStackWidget>());

	private dimension?: dom.Dimension;
	private splitView!: SplitView;
	private messageContainer!: HTMLElement;
	private contentProviders!: IPeekOutputRenderer[];
	private contentProvidersUpdateLimiter = this._register(new Limiter(1));

	public current?: InspectSubject;

	/** Fired when a tree item is selected. Populated only on .fillBody() */
	public onDidRequestReveal!: Event<InspectSubject>;

	public readonly onClose = this.onCloseEmitter.event;
	public readonly onDidChangeStackFrame = this.onDidChangeStackFrameEmitter.event;

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
		@ITestingPeekOpener private readonly peekOpener: ITestingPeekOpener,
	) {
		super();
	}

	public fillBody(containerElement: HTMLElement): void {
		const initialSpitWidth = TestResultsViewContent.lastSplitWidth;
		this.splitView = new SplitView(containerElement, { orientation: Orientation.HORIZONTAL });
		this.callStackEl = dom.append(containerElement, dom.$('.test-output-call-stack'));

		const { historyVisible, showRevealLocationOnMessages } = this.options;
		const isInPeekView = this.editor !== undefined;
		const messageContainer = this.messageContainer = dom.append(containerElement, dom.$('.test-output-peek-message-container'));
		this.followupWidget = this._register(this.instantiationService.createInstance(FollowupActionWidget, messageContainer, this.editor));
		this.onCloseEmitter.input = this.followupWidget.onClose;

		this.contentProviders = [
			this._register(this.instantiationService.createInstance(DiffContentProvider, this.editor, messageContainer)),
			this._register(this.instantiationService.createInstance(MarkdownTestMessagePeek, messageContainer)),
			this._register(this.instantiationService.createInstance(TerminalMessagePeek, messageContainer, isInPeekView)),
			this._register(this.instantiationService.createInstance(PlainTextMessagePeek, this.editor, messageContainer)),
		];

		this._register(this.peekOpener.callStackVisible.onDidChange(() => {
			if (this.current) {
				this.updateVisiblityOfStackView(this.current);
			}
		}));

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
			element: messageContainer,
			minimumSize: 200,
			maximumSize: Number.MAX_VALUE,
			layout: width => {
				TestResultsViewContent.lastSplitWidth = width;
				if (this.dimension) {
					for (const provider of this.contentProviders) {
						provider.layout({ height: this.dimension.height, width });
					}
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


		this.splitView.setViewVisible(this.viewIndex(SubView.History), historyVisible.value);
		this._register(historyVisible.onDidChange(visible => {
			this.splitView.setViewVisible(this.viewIndex(SubView.History), visible);
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
		frame?: ITestMessageStackFrame;
		uiState?: ITestResultsViewContentUiState;
	}) {
		this.didReveal.fire(opts);

		if (this.current && equalsSubject(this.current, opts.subject)) {
			return Promise.resolve();
		}

		this.current = opts.subject;
		return this.contentProvidersUpdateLimiter.queue(async () => {
			await Promise.all(this.contentProviders.map(p => p.update(opts.subject)));
			this.followupWidget.show(opts.subject);
			this.currentSubjectStore.clear();
			this.updateVisiblityOfStackView(opts.subject, opts.frame);
			this.populateFloatingClick(opts.subject);

			if (opts.uiState) {
				opts.uiState.splitViewWidths.forEach((width, i) => this.splitView.resizeView(i, width));
			}
		});
	}

	private updateVisiblityOfStackView(subject: InspectSubject, frame?: ITestMessageStackFrame) {
		const stack = this.peekOpener.callStackVisible.value && subject instanceof MessageSubject && subject.stack;

		if (stack) {
			if (!this.callStackWidget.value) {
				const widget = this.callStackWidget.value = this.instantiationService.createInstance(TestResultStackWidget, this.callStackEl);
				this.splitView.addView({
					onDidChange: Event.None,
					element: this.callStackEl,
					minimumSize: 100,
					maximumSize: Number.MAX_VALUE,
					layout: width => widget.layout(undefined, width),
				}, 150, 0);
				this.onDidChangeStackFrameEmitter.input = widget.onDidChangeStackFrame;
			}

			this.callStackWidget.value.update(stack, frame);
		} else if (this.callStackWidget.value) {
			this.splitView.removeView(0);
			this.onDidChangeStackFrameEmitter.input = Event.None;
			this.callStackWidget.clear();
		}
	}

	private viewIndex(subView: SubView) {
		// the call stack view is index 0, if it's not visible then all indicies are shifted by one
		if (!this.callStackWidget.value) {
			return subView - 1;
		}

		return subView;
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

	constructor(
		private readonly container: HTMLElement,
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

		this.container.appendChild(this.el.root);
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
