/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IDelayedHoverOptions, IHoverLifecycleOptions } from '../../../../../base/browser/ui/hover/hover.js';
import { Event } from '../../../../../base/common/event.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IContextViewDelegate, IContextViewService, IOpenContextView } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentFeedbackAttachmentContribution } from '../../browser/agentFeedbackAttachment.js';
import { AgentFeedbackAttachmentWidget } from '../../browser/agentFeedbackAttachmentWidget.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback, IAgentFeedbackChangeEvent, IAgentFeedbackService } from '../../browser/agentFeedbackService.js';
import { buildNewSessionPrompt } from '../../browser/agentFeedbackAttachmentEntry.js';
import { IAgentFeedbackVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';

class TestHoverService extends mock<IHoverService>() {
	hoverOptions: (() => IDelayedHoverOptions) | IDelayedHoverOptions | undefined;

	override hideHover(): void { }

	override setupDelayedHover(
		_target: HTMLElement,
		hoverOptions: (() => IDelayedHoverOptions) | IDelayedHoverOptions,
		_lifecycleOptions?: IHoverLifecycleOptions,
	): IDisposable {
		this.hoverOptions = hoverOptions;
		return Disposable.None;
	}
}

class TestContextViewService extends mock<IContextViewService>() {
	showCount = 0;
	closeCount = 0;
	delegate: IContextViewDelegate | undefined;

	override showContextView(delegate: IContextViewDelegate): IOpenContextView {
		this.showCount++;
		this.delegate = delegate;
		let closed = false;
		return {
			close: () => {
				if (closed) {
					return;
				}
				closed = true;
				this.closeCount++;
				delegate.onHide?.();
				this.delegate = undefined;
			}
		};
	}
}

suite('AgentFeedbackAttachmentContribution', () => {
	const store = new DisposableStore();

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('skips chat widget attachments for agent host sessions', () => {
		const sessionResource = URI.parse('agent-host-copilot:/session-1');
		const feedback: IAgentFeedback = {
			id: 'feedback-1',
			text: 'Check this',
			resourceUri: URI.file('/workspace/a.ts'),
			range: new Range(1, 1, 1, 5),
			sessionResource,
			kind: AgentFeedbackKind.UserReview,
			state: AgentFeedbackState.Accepted,
		};
		let getWidgetCallCount = 0;
		let listener: ((event: IAgentFeedbackChangeEvent) => void) | undefined;

		const feedbackService = new class extends mock<IAgentFeedbackService>() {
			override onDidChangeFeedback = (callback: (event: IAgentFeedbackChangeEvent) => void) => {
				listener = callback;
				return { dispose: () => { listener = undefined; } };
			};
			override getFeedback(): readonly IAgentFeedback[] { return [feedback]; }
		};
		const widgetService = new class extends mock<IChatWidgetService>() {
			override getWidgetBySessionResource(_sessionResource: URI): IChatWidget | undefined {
				getWidgetCallCount++;
				throw new Error('attachments should not be read for agent host sessions');
			}
		};
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override onDidChangeSessions = Event.None;
			override getSession(resource: URI): ISession | undefined {
				return resource.toString() === sessionResource.toString()
					? { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, status: observableValue('status', SessionStatus.InProgress) } as unknown as ISession
					: undefined;
			}
		};

		store.add(new AgentFeedbackAttachmentContribution(feedbackService, widgetService, sessionsManagementService));
		assert.ok(listener, 'expected feedback listener to be registered');

		listener!({ sessionResource, feedbackItems: [feedback] });

		assert.strictEqual(getWidgetCallCount, 0);
	});

	test('formats new-session prompts with comment locations and nested replies', () => {
		const sessionResource = URI.parse('agent-feedback:/new-session');
		const feedback = (id: string, text: string, path: string, range: Range, replies?: readonly string[]): IAgentFeedback => ({
			id,
			text,
			resourceUri: URI.file(path),
			range,
			sessionResource,
			kind: AgentFeedbackKind.UserReview,
			state: AgentFeedbackState.Accepted,
			replies: replies?.map(text => ({ text, author: 'user' as const })),
		});
		const roots = [URI.file('/workspace'), URI.file('/second-root')];
		const first = feedback('one', 'Fix this', '/workspace/src/a.ts', new Range(10, 2, 12, 4), ['Also cover null', 'Keep the\nerror detail']);
		const second = feedback('two', 'Rename this', '/workspace/src/b.ts', new Range(3, 1, 3, 8));
		const inSecondRoot = feedback('three', 'Update this', '/second-root/lib/c.ts', new Range(7, 1, 7, 5));
		const outsideWorkspace = feedback('four', 'Check this', '/elsewhere/d.ts', new Range(1, 1, 1, 2));

		assert.deepStrictEqual({
			promptAndComments: buildNewSessionPrompt('Implement the change', [first, second], roots),
			singleComment: buildNewSessionPrompt('', [first], roots),
			multipleComments: buildNewSessionPrompt('', [first, second], roots),
			multiRoot: buildNewSessionPrompt('', [second, inSecondRoot, outsideWorkspace], roots),
		}, {
			promptAndComments: 'Implement the change\n- Fix this (src/a.ts:10:2-12:4)\n  - reply: Also cover null\n  - reply: Keep the\n    error detail\n- Rename this (src/b.ts:3:1-3:8)',
			singleComment: 'Fix this (src/a.ts:10:2-12:4)\n  - reply: Also cover null\n  - reply: Keep the\n    error detail',
			multipleComments: '- Fix this (src/a.ts:10:2-12:4)\n  - reply: Also cover null\n  - reply: Keep the\n    error detail\n- Rename this (src/b.ts:3:1-3:8)',
			multiRoot: '- Rename this (src/b.ts:3:1-3:8)\n- Update this (lib/c.ts:7:1-7:5)\n- Check this (/elsewhere/d.ts:1:1-1:2)',
		});
	});

	test('single comment uses a preview label and reveals directly', () => {
		const instantiationService = store.add(new TestInstantiationService());
		const sessionResource = URI.parse('agent-host-copilot:/session-1');
		const revealedFeedbackIds: string[] = [];
		const feedbackService = new class extends mock<IAgentFeedbackService>() {
			override async revealFeedback(_sessionResource: URI, feedbackId: string): Promise<void> {
				revealedFeedbackIds.push(feedbackId);
			}
		};
		const hoverService = new TestHoverService();
		const contextViewService = new TestContextViewService();
		instantiationService.stub(IAgentFeedbackService, feedbackService);
		instantiationService.stub(IHoverService, hoverService);
		instantiationService.stub(IContextViewService, contextViewService);
		instantiationService.stub(ILanguageService, new class extends mock<ILanguageService>() { });
		instantiationService.stub(IThemeService, new class extends mock<IThemeService>() { });

		const attachment: IAgentFeedbackVariableEntry = {
			kind: 'agentFeedback',
			id: 'attachment-1',
			name: '1 comment',
			value: '1 comment',
			sessionResource,
			feedbackItems: [
				{ id: 'comment-1', text: 'abcdefghijklmnopqrstuvwxyz', resourceUri: URI.file('/workspace/a.ts'), range: new Range(1, 1, 1, 1) },
			],
		};
		const container = document.createElement('div');
		const widget = store.add(instantiationService.createInstance(
			AgentFeedbackAttachmentWidget,
			attachment,
			{ shouldFocusClearButton: false, supportsDeletion: false },
			container,
		));

		widget.element.click();
		widget.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

		const hoverOptions = typeof hoverService.hoverOptions === 'function' ? hoverService.hoverOptions() : hoverService.hoverOptions;
		assert.deepStrictEqual({
			label: widget.element.textContent,
			hoverContent: hoverOptions?.content,
			contextViewShowCount: contextViewService.showCount,
			revealedFeedbackIds,
		}, {
			label: 'abcdefghijklmnopqrstuvwxy…',
			hoverContent: 'View comments',
			contextViewShowCount: 0,
			revealedFeedbackIds: ['comment-1', 'comment-1'],
		});
	});

	test('multiple comments toggle a context view without revealing a comment', () => {
		const instantiationService = store.add(new TestInstantiationService());
		const sessionResource = URI.parse('agent-host-copilot:/session-1');
		const revealedFeedbackIds: string[] = [];
		const feedbackService = new class extends mock<IAgentFeedbackService>() {
			override async revealFeedback(_sessionResource: URI, feedbackId: string): Promise<void> {
				revealedFeedbackIds.push(feedbackId);
			}
		};
		const contextViewService = new TestContextViewService();
		instantiationService.stub(IAgentFeedbackService, feedbackService);
		instantiationService.stub(IHoverService, new TestHoverService());
		instantiationService.stub(IContextViewService, contextViewService);
		instantiationService.stub(ILanguageService, new class extends mock<ILanguageService>() { });
		instantiationService.stub(IThemeService, new class extends mock<IThemeService>() { });

		const attachment: IAgentFeedbackVariableEntry = {
			kind: 'agentFeedback',
			id: 'attachment-1',
			name: '2 comments',
			value: '2 comments',
			sessionResource,
			feedbackItems: [
				{ id: 'comment-1', text: 'First', resourceUri: URI.file('/workspace/a.ts'), range: new Range(1, 1, 1, 1) },
				{ id: 'comment-2', text: 'Second', resourceUri: URI.file('/workspace/b.ts'), range: new Range(2, 1, 2, 1) },
			],
		};
		const container = document.createElement('div');
		const widget = store.add(instantiationService.createInstance(
			AgentFeedbackAttachmentWidget,
			attachment,
			{ shouldFocusClearButton: false, supportsDeletion: false },
			container,
		));

		widget.element.click();
		const expandedAfterOpen = widget.element.ariaExpanded;
		let escapePrevented = false;
		let escapePropagationStopped = false;
		contextViewService.delegate?.onDOMEvent?.({
			browserEvent: { type: 'keydown' },
			keyCode: KeyCode.Escape,
			preventDefault: () => { escapePrevented = true; },
			stopPropagation: () => { escapePropagationStopped = true; },
		}, widget.element);
		const expandedAfterEscape = widget.element.ariaExpanded;
		widget.element.click();
		widget.element.click();

		assert.deepStrictEqual({
			label: widget.element.textContent,
			ariaHasPopup: widget.element.ariaHasPopup,
			expandedAfterOpen,
			expandedAfterEscape,
			expandedAfterClose: widget.element.ariaExpanded,
			escapePrevented,
			escapePropagationStopped,
			contextViewShowCount: contextViewService.showCount,
			contextViewCloseCount: contextViewService.closeCount,
			revealedFeedbackIds,
		}, {
			label: '2 comments',
			ariaHasPopup: 'tree',
			expandedAfterOpen: 'true',
			expandedAfterEscape: 'false',
			expandedAfterClose: 'false',
			escapePrevented: true,
			escapePropagationStopped: true,
			contextViewShowCount: 2,
			contextViewCloseCount: 2,
			revealedFeedbackIds: [],
		});
	});
});
