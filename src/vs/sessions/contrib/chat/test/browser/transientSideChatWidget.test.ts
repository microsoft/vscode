/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ContextKeyValue, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatWidget } from '../../../../../workbench/contrib/chat/browser/widget/chatWidget.js';
import { ChatCollapsibleContentPart } from '../../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatCollapsibleContentPart.js';
import { ChatToolInvocation } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { ToolDataSource } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { ChatViewModel, IChatResponseViewModel } from '../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { TransientSideChatDismissibleContext, TransientSideChatFocusedContext, TransientSideChatSourceContext } from '../../../../common/contextkeys.js';
import { IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IResolvedTransientSideChatState, ITransientSideChatService, ITransientSideChatState } from '../../browser/transientSideChatService.js';
import { CloseTransientSideChatAction, getTransientSideChatModelActivity, getTransientSideChatPinnedResponseHeight, getTransientSideChatPresentation, getTransientSideChatResponse, getTransientSideChatResponseHeight, getTransientSideChatResponseWidth, getTransientSideChatStatusAnnouncement, shouldShowTransientSideChatProgress, TransientSideChatWidget } from '../../browser/transientSideChatWidget.js';

suite('TransientSideChatWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class RecordingNotificationService extends TestNotificationService {
		readonly errors: string[] = [];

		override error(error: string | Error) {
			this.errors.push(error instanceof Error ? error.message : error);
			return super.error(error);
		}
	}

	function createWidget(options: {
		chatService: IChatService;
		transientSideChatService: ITransientSideChatService;
		notificationService?: INotificationService;
		onFocusInput?: () => void;
	}): TransientSideChatWidget {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
		instantiationService.stub(IChatService, options.chatService);
		instantiationService.stub(ITransientSideChatService, options.transientSideChatService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(INotificationService, options.notificationService ?? new TestNotificationService());
		instantiationService.stub(IHoverService, upcastPartial<IHoverService>({
			setupManagedHover: () => ({
				dispose: () => undefined,
				show: () => undefined,
				hide: () => undefined,
				update: () => undefined,
			}),
		}));

		const document = dom.getActiveDocument();
		const composer = dom.append(document.body, dom.$('.source-composer'));
		disposables.add(toDisposable(() => composer.remove()));
		const persistentContent = dom.append(composer, dom.$('.source-persistent-content'));
		const sourceEditor = dom.append(composer, dom.$('.source-editor'));
		const sourceWidget = {
			inputEditor: upcastPartial<ICodeEditor>({
				getDomNode: () => sourceEditor,
				hasTextFocus: () => false,
			}),
			inputPart: { hasActiveToolConfirmationCarousel: false },
			focusInput: () => options.onFocusInput?.(),
		};
		return disposables.add(instantiationService.createInstance(TransientSideChatWidget, persistentContent, sourceWidget));
	}

	test('explains how to continue from visible input-needed and error states', () => {
		const needsInput = getTransientSideChatPresentation(SessionStatus.NeedsInput);
		const error = getTransientSideChatPresentation(SessionStatus.Error);

		assert.deepStrictEqual({ needsInput, error }, {
			needsInput: {
				statusLabel: 'Input needed. Open the full chat to continue.',
				promoteLabel: 'Open Full Chat to Continue',
				className: 'needs-input',
			},
			error: {
				statusLabel: 'The side question failed. Open the full chat for details.',
				promoteLabel: 'Open Full Chat for Details',
				className: 'error',
			},
		});
	});

	test('uses natural response height up to a view-relative cap', () => {
		assert.deepStrictEqual({
			shortAnswer: getTransientSideChatResponseHeight(1000, 28, 50),
			tallAnswer: getTransientSideChatResponseHeight(1000, 700, 50),
			shortView: getTransientSideChatResponseHeight(400, 500, 50),
			empty: getTransientSideChatResponseHeight(1000, 0, 50),
			measuredMinimum: getTransientSideChatResponseHeight(1000, 10, 50, 38),
			renderedHeightWins: getTransientSideChatPinnedResponseHeight(173, 77),
			viewportFallback: getTransientSideChatPinnedResponseHeight(0, 77),
			layoutHeightWins: getTransientSideChatPinnedResponseHeight(173, 77, 172),
			measuredWidth: getTransientSideChatResponseWidth(1200, 800),
			wideFallbackWidth: getTransientSideChatResponseWidth(1200, 0),
			narrowFallbackWidth: getTransientSideChatResponseWidth(800, 0),
		}, {
			shortAnswer: 28,
			tallAnswer: 550,
			shortView: 190,
			empty: 1,
			measuredMinimum: 38,
			renderedHeightWins: 173,
			viewportFallback: 77,
			layoutHeightWins: 172,
			measuredWidth: 800,
			wideFallbackWidth: 886,
			narrowFallbackWidth: 736,
		});
	});

	test('keeps fallback progress through pre-answer activity', () => {
		assert.deepStrictEqual({
			initialCompleted: shouldShowTransientSideChatProgress(SessionStatus.Completed, true),
			working: shouldShowTransientSideChatProgress(SessionStatus.InProgress, true),
			contentAlreadyObserved: shouldShowTransientSideChatProgress(SessionStatus.InProgress, false),
			needsInput: shouldShowTransientSideChatProgress(SessionStatus.NeedsInput, true),
		}, {
			initialCompleted: true,
			working: true,
			contentAlreadyObserved: false,
			needsInput: false,
		});
	});

	test('stops waiting when the completed response has no markdown', () => {
		const resource = URI.parse('test:///side');
		const response = upcastPartial<IChatResponseViewModel>({
			isComplete: true,
			setVote: () => undefined,
		});
		const widget = upcastPartial<ChatWidget>({
			viewModel: upcastPartial<ChatViewModel>({
				sessionResource: resource,
				getItems: () => [response],
			}),
		});

		assert.deepStrictEqual({
			matching: getTransientSideChatResponse(widget, resource)?.isComplete,
			stale: getTransientSideChatResponse(widget, URI.parse('test:///other'))?.isComplete,
		}, {
			matching: true,
			stale: undefined,
		});
	});

	test('uses progress messages and tool calls as activity text', () => {
		const tool = new ChatToolInvocation({
			invocationMessage: 'Inspecting the current directory',
			pastTenseMessage: 'Inspected the current directory',
		}, {
			id: 'test-tool',
			displayName: 'Test Tool',
			modelDescription: 'Test tool',
			source: ToolDataSource.Internal,
		}, 'tool-call', undefined, {}, {}, 'request');

		assert.deepStrictEqual({
			progress: getTransientSideChatModelActivity([{ kind: 'progressMessage', content: new MarkdownString('Starting services') }]),
			tool: getTransientSideChatModelActivity([tool]),
		}, {
			progress: 'Starting services',
			tool: 'Inspecting the current directory',
		});
	});

	test('announces side-question creation and terminal answer transitions once', () => {
		assert.deepStrictEqual({
			created: getTransientSideChatStatusAnnouncement(undefined, SessionStatus.InProgress, true, false),
			replaced: getTransientSideChatStatusAnnouncement(undefined, SessionStatus.InProgress, true, true),
			completed: getTransientSideChatStatusAnnouncement(SessionStatus.InProgress, SessionStatus.Completed, false, false),
			needsInput: getTransientSideChatStatusAnnouncement(SessionStatus.InProgress, SessionStatus.NeedsInput, false, false),
			failed: getTransientSideChatStatusAnnouncement(SessionStatus.InProgress, SessionStatus.Error, false, false),
			failedBeforeStart: getTransientSideChatStatusAnnouncement(SessionStatus.Completed, SessionStatus.Error, false, false),
			stillWorking: getTransientSideChatStatusAnnouncement(SessionStatus.InProgress, SessionStatus.InProgress, false, false),
			alreadyNeedsInput: getTransientSideChatStatusAnnouncement(SessionStatus.NeedsInput, SessionStatus.NeedsInput, false, false),
			alreadyComplete: getTransientSideChatStatusAnnouncement(SessionStatus.Completed, SessionStatus.Completed, false, false),
		}, {
			created: 'Side question asked',
			replaced: 'New side question shown. The previous answer remains in Closed chats.',
			completed: 'Side question answered',
			needsInput: 'Side question needs input. Open the full chat to continue.',
			failed: 'Side question failed',
			failedBeforeStart: 'Side question failed',
			stillWorking: undefined,
			alreadyNeedsInput: undefined,
			alreadyComplete: undefined,
		});
	});

	test('marks the current card failed when its chat model is unavailable', async () => {
		const failures: string[] = [];
		const resources = [URI.parse('test:///missing-model'), URI.parse('test:///rejected-model')];
		const loads = [
			async () => undefined,
			async () => { throw new Error('load failed'); },
		];

		for (let index = 0; index < loads.length; index++) {
			const markedFailed = new DeferredPromise<string>();
			const widget = createWidget({
				chatService: upcastPartial<IChatService>({ acquireOrLoadSession: loads[index] }),
				transientSideChatService: upcastPartial<ITransientSideChatService>({
					states: constObservable([]),
					markFailed: resource => {
						markedFailed.complete(resource.toString());
						return true;
					},
				}),
			});
			const nestedWidget = upcastPartial<ChatWidget>({
				getInput: () => '',
				setModel: () => undefined,
				setVisible: () => undefined,
				dispose: () => undefined,
			});
			(Reflect.get(widget, '_widget') as { value: ChatWidget | undefined }).value = nestedWidget;
			const state = upcastPartial<IResolvedTransientSideChatState>({
				sideChatResource: resources[index],
				sideChat: upcastPartial<IChat>({ resource: resources[index] }),
			});

			(Reflect.get(widget, '_ensureSideModel') as (state: IResolvedTransientSideChatState) => void).call(widget, state);
			failures.push(await markedFailed.p);
		}

		assert.deepStrictEqual(failures, resources.map(resource => resource.toString()));
	});

	test('notifies when promotion to a full chat fails', async () => {
		const notificationService = new RecordingNotificationService();
		const sourceChat = upcastPartial<IChat>({ resource: URI.parse('test:///source') });
		const widget = createWidget({
			chatService: upcastPartial<IChatService>({}),
			transientSideChatService: upcastPartial<ITransientSideChatService>({
				states: constObservable([]),
				registerHost: () => toDisposable(() => undefined),
				removeBySideChat: () => undefined,
				promote: async () => { throw new Error('open failed'); },
			}),
			notificationService,
		});
		widget.setSource(sourceChat, upcastPartial<ISession>({ sessionId: 'session' }));

		await (Reflect.get(widget, '_promote') as () => Promise<void>).call(widget);

		assert.deepStrictEqual(notificationService.errors, ['The side question could not be opened as a full chat.']);
	});

	test('focuses the promoted full chat input', async () => {
		let focusCount = 0;
		const sourceChat = upcastPartial<IChat>({ resource: URI.parse('test:///source') });
		const widget = createWidget({
			chatService: upcastPartial<IChatService>({}),
			transientSideChatService: upcastPartial<ITransientSideChatService>({
				states: constObservable([]),
				registerHost: () => toDisposable(() => undefined),
				removeBySideChat: () => undefined,
				promote: async () => true,
			}),
			onFocusInput: () => focusCount++,
		});
		widget.setSource(sourceChat, upcastPartial<ISession>({ sessionId: 'session' }));

		await (Reflect.get(widget, '_promote') as () => Promise<void>).call(widget);

		assert.strictEqual(focusCount, 1);
	});

	test('dismisses through a scoped Escape command', () => {
		const source = URI.parse('test:///source');
		const dismissed: string[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IContextKeyService, upcastPartial<IContextKeyService>({
			getContext: () => ({
				getValue: <T extends ContextKeyValue>(key: string) => (key === TransientSideChatSourceContext.key ? source.toString() : undefined) as T | undefined,
			}),
		}));
		instantiationService.stub(ITransientSideChatService, upcastPartial<ITransientSideChatService>({
			dismiss: resource => dismissed.push(resource.toString()),
		}));

		const action = new CloseTransientSideChatAction();
		action.run(instantiationService);
		const keybindings = Array.isArray(action.desc.keybinding) ? action.desc.keybinding : [action.desc.keybinding];
		const [cardKeybinding, inputKeybinding] = keybindings;
		const cardWhen = cardKeybinding?.when?.serialize() ?? '';
		const inputWhen = inputKeybinding?.when?.serialize() ?? '';

		assert.deepStrictEqual({
			dismissed,
			cardFocus: cardWhen.includes(TransientSideChatFocusedContext.key),
			cardAllowsActiveRequest: !cardWhen.includes('!chatSessionRequestInProgress'),
			cardSuggestionPrecedence: cardWhen.includes('!suggestWidgetVisible'),
			cardSelectionPrecedence: cardWhen.includes('!editorHasSelection') && cardWhen.includes('!editorHasMultipleSelections'),
			inputFocus: inputWhen.includes('chatInputHasFocus'),
			inputRequestPrecedence: inputWhen.includes('!chatSessionRequestInProgress'),
			inputConfirmationPrecedence: inputWhen.includes('!chatHasToolConfirmation'),
			inputElicitationPrecedence: inputWhen.includes('!chatHasElicitationRequest'),
			inputQuestionPrecedence: inputWhen.includes('!chatHasQuestionCarousel'),
		}, {
			dismissed: [source.toString()],
			cardFocus: true,
			cardAllowsActiveRequest: true,
			cardSuggestionPrecedence: true,
			cardSelectionPrecedence: true,
			inputFocus: true,
			inputRequestPrecedence: true,
			inputConfirmationPrecedence: true,
			inputElicitationPrecedence: true,
			inputQuestionPrecedence: true,
		});
	});

	test('does not replay the creation announcement after revisiting the source chat', () => {
		const sourceChat = upcastPartial<IChat>({ resource: URI.parse('test:///source') });
		const otherChat = upcastPartial<IChat>({ resource: URI.parse('test:///other') });
		const sideChat = upcastPartial<IChat>({
			resource: URI.parse('test:///side'),
			status: constObservable(SessionStatus.Completed),
			description: constObservable(undefined),
		});
		const session = upcastPartial<ISession>({ sessionId: 'session', resource: URI.parse('test:///session') });
		const state: ITransientSideChatState = {
			sessionResource: session.resource,
			sourceChatResource: sourceChat.resource,
			sideChatResource: sideChat.resource,
			question: 'What changed?',
			promoting: false,
			failed: false,
			replacedExisting: false,
		};
		const states = observableValue<readonly ITransientSideChatState[]>(disposables, [state]);
		const widget = createWidget({
			chatService: upcastPartial<IChatService>({}),
			transientSideChatService: upcastPartial<ITransientSideChatService>({
				states,
				registerHost: () => toDisposable(() => undefined),
				removeBySideChat: () => undefined,
				resolveState: transient => ({ ...transient, session, sourceChat, sideChat }),
			}),
		});
		Reflect.set(widget, '_ensureSideModel', () => undefined);

		widget.setSource(sourceChat, session);
		widget.setSource(otherChat, session);
		const announcedWhileAway = [...(Reflect.get(widget, '_announcedSideChatResources') as Set<string>)];
		widget.setSource(sourceChat, session);

		assert.deepStrictEqual({
			announcedWhileAway,
			announcedAfterReturn: [...(Reflect.get(widget, '_announcedSideChatResources') as Set<string>)],
		}, {
			announcedWhileAway: [sideChat.resource.toString()],
			announcedAfterReturn: [sideChat.resource.toString()],
		});
	});

	test('renders accessible state and dismisses the source-scoped card', () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const contextKeyService = disposables.add(new MockContextKeyService());
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IChatService, upcastPartial<IChatService>({}));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(INotificationService, new TestNotificationService());
		instantiationService.stub(IHoverService, upcastPartial<IHoverService>({
			setupManagedHover: () => ({
				dispose: () => undefined,
				show: () => undefined,
				hide: () => undefined,
				update: () => undefined,
			}),
		}));

		const states = observableValue<readonly ITransientSideChatState[]>(disposables, []);
		const dismissedSources: string[] = [];
		const sourceChat = upcastPartial<IChat>({ resource: URI.parse('test:///source') });
		const sideChatDescription = observableValue<MarkdownString | undefined>(disposables, undefined);
		const sideChat = upcastPartial<IChat>({
			resource: URI.parse('test:///side'),
			status: constObservable(SessionStatus.Completed),
			description: sideChatDescription,
		});
		const session = upcastPartial<ISession>({ sessionId: 'session', resource: URI.parse('test:///session') });
		instantiationService.stub(ITransientSideChatService, upcastPartial<ITransientSideChatService>({
			states,
			registerHost: () => toDisposable(() => undefined),
			resolveState: state => ({
				...state,
				session,
				sourceChat,
				sideChat,
			}),
			dismiss: resource => {
				dismissedSources.push(resource.toString());
				if (states.get().some(state => state.sourceChatResource.toString() === resource.toString())) {
					states.set([], undefined);
				}
			},
			removeBySideChat: resource => {
				if (states.get().some(state => state.sideChatResource.toString() === resource.toString())) {
					states.set([], undefined);
				}
			},
		}));

		const document = dom.getActiveDocument();
		const composer = dom.append(document.body, dom.$('.source-composer'));
		disposables.add(toDisposable(() => composer.remove()));
		const persistentContent = dom.append(composer, dom.$('.source-persistent-content'));
		const sourceEditor = dom.append(composer, dom.$('.source-editor'));
		const sourceWidget = {
			inputEditor: upcastPartial<ICodeEditor>({
				getDomNode: () => sourceEditor,
				hasTextFocus: () => false,
			}),
			inputPart: { hasActiveToolConfirmationCarousel: false },
			focusInput: () => undefined,
		};
		const widget = disposables.add(instantiationService.createInstance(TransientSideChatWidget, persistentContent, sourceWidget));
		Reflect.set(widget, '_ensureSideModel', () => undefined);

		widget.setSource(sourceChat, session);
		const state: ITransientSideChatState = {
			sessionResource: session.resource,
			sourceChatResource: sourceChat.resource,
			sideChatResource: sideChat.resource,
			question: 'What changed?',
			promoting: false,
			failed: false,
			replacedExisting: false,
		};
		states.set([state], undefined);

		const card = persistentContent.querySelector<HTMLElement>('.transient-side-chat-card');
		const actionLabels = [...persistentContent.querySelectorAll<HTMLElement>('.transient-side-chat-actions [aria-label]')]
			.map(element => element.getAttribute('aria-label'));
		const expandedCardHidden = card?.classList.contains('hidden');
		const progress = persistentContent.querySelector('.transient-side-chat-progress');
		const progressVisibleWhileWorking = !progress?.classList.contains('hidden');
		sideChatDescription.set(new MarkdownString('Starting MCP servers'), undefined);
		const progressActivity = progress?.querySelector('.transient-side-chat-progress-label')?.textContent;
		const sourceContext = contextKeyService.getContextKeyValue(TransientSideChatSourceContext.key);
		const dismissibleContext = contextKeyService.getContextKeyValue(TransientSideChatDismissibleContext.key);
		states.set([{ ...state, promoting: true }], undefined);
		const dismissibleWhilePromoting = contextKeyService.getContextKeyValue(TransientSideChatDismissibleContext.key);
		states.set([{ ...state, failed: true }], undefined);
		const progressHiddenAfterFailure = persistentContent.querySelector('.transient-side-chat-progress')?.classList.contains('hidden');
		const status = persistentContent.querySelector<HTMLElement>('.transient-side-chat-status');
		const describedBy = card?.getAttribute('aria-describedby')?.split(' ') ?? [];
		const pinnedLayoutCalls: [number, number][] = [];
		let nestedWidgetDisposeCount = 0;
		const nestedWidget = upcastPartial<ChatWidget>({
			viewportHeight: 77,
			scrollHeight: 77,
			layout: (height, width) => pinnedLayoutCalls.push([height, width]),
			setModel: () => undefined,
			setVisible: () => undefined,
			dispose: () => nestedWidgetDisposeCount++,
		});
		const nestedWidgetSlot = Reflect.get(widget, '_widget') as { value: ChatWidget | undefined };
		nestedWidgetSlot.value = nestedWidget;
		Reflect.set(widget, '_lastLayout', { height: 1000, width: 900 });
		Reflect.set(widget, '_lastResponseLayoutHeight', 172);
		const widgetHost = persistentContent.querySelector<HTMLElement>('.transient-side-chat-widget');
		assert.ok(widgetHost);
		Object.defineProperty(widgetHost, 'clientHeight', { configurable: true, value: 173 });
		Object.defineProperty(widgetHost, 'clientWidth', { configurable: true, value: 800 });
		widgetHost.dispatchEvent(new CustomEvent(ChatCollapsibleContentPart.userToggleEvent, { bubbles: true }));
		widget.layout(1000, 900);
		persistentContent.querySelector<HTMLElement>('.transient-side-chat-actions [aria-label="Close Side Question"]')?.click();

		assert.deepStrictEqual({
			expandedCardHidden,
			question: card?.querySelector('.transient-side-chat-question')?.textContent,
			actionLabels,
			progressVisibleWhileWorking,
			progressActivity,
			progressHiddenAfterFailure,
			describesStatus: !!status?.id && describedBy.includes(status.id),
			sourceContext,
			dismissibleContext,
			dismissibleWhilePromoting,
			pinnedLayoutCalls,
			nestedWidgetDisposeCount,
			dismissedSource: dismissedSources.at(-1),
			hostHiddenAfterClose: persistentContent.querySelector('.transient-side-chat-host')?.classList.contains('hidden'),
		}, {
			expandedCardHidden: false,
			question: 'What changed?',
			actionLabels: ['Side question actions', 'Open Full Chat', 'Close Side Question'],
			progressVisibleWhileWorking: true,
			progressActivity: 'Starting MCP servers',
			progressHiddenAfterFailure: true,
			describesStatus: true,
			sourceContext: sourceChat.resource.toString(),
			dismissibleContext: true,
			dismissibleWhilePromoting: false,
			pinnedLayoutCalls: [[172, 800]],
			nestedWidgetDisposeCount: 1,
			dismissedSource: sourceChat.resource.toString(),
			hostHiddenAfterClose: true,
		});
	});
});
