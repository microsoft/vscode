/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeKeybinding } from '../../../../../base/common/keybindings.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { OS } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { hasUnsubmittedAgentFeedback, registerAgentFeedbackEditorActions, submitActiveSessionFeedbackActionId, submitFeedbackActionId } from '../../browser/agentFeedbackEditorActions.js';
import { URI } from '../../../../../base/common/uri.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IListService } from '../../../../../platform/list/browser/listService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IEditorGroupsService, IEditorGroup } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IChatEditingService } from '../../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { ChatRequestQueueKind } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IAgentFeedbackService } from '../../../../../workbench/contrib/sessions/browser/agentFeedback.js';
import { AgentFeedbackState } from '../../../../../workbench/contrib/sessions/browser/agentFeedbackModel.js';
import { ICodeReviewService, IPRReviewState, PRReviewStateKind } from '../../../../../workbench/contrib/sessions/browser/codeReviewService.js';
import { IPlanReviewFeedbackService } from '../../../../../workbench/contrib/chat/browser/planReviewFeedback/planReviewFeedbackService.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISendRequestOptions } from '../../../../../workbench/contrib/sessions/common/sessionsProvider.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { IChat, ISession, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { ISessionHostService } from '../../../../../workbench/services/sessions/browser/sessionHost.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { ITestShownChat, stubFocusedSessionHostFromSessionsService } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';
import { AgentFeedbackService } from '../../browser/agentFeedbackService.js';

// Fill the global registries the way the contribution does, so the assertions below
// inspect the rule that ships rather than a copy of its when clause.
registerAgentFeedbackEditorActions();

const CTRL_CMD_ENTER = decodeKeybinding(KeyMod.CtrlCmd | KeyCode.Enter, OS)!.getHashCode();

/** Minimal {@link IContext} over a plain record of context key values. */
function context(values: Record<string, boolean>): IContext {
	return { getValue: <T>(key: string) => values[key] as T | undefined };
}

suite('Agent Feedback - Submit Feedback keybinding', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('takes Ctrl/Cmd+Enter only in a focused editor holding submittable feedback', () => {
		const rule = KeybindingsRegistry.getDefaultKeybindings()
			.find(item => item.command === submitFeedbackActionId && item.keybinding?.getHashCode() === CTRL_CMD_ENTER);
		const submittable = {
			[ChatContextKeys.enabled.key]: true,
			[IsSessionsWindowContext.key]: true,
			[EditorContextKeys.editorTextFocus.key]: true,
			[hasUnsubmittedAgentFeedback.key]: true,
		};
		const evaluate = (overrides: Record<string, boolean> = {}) => rule?.when?.evaluate(context({ ...submittable, ...overrides })) ?? false;

		assert.deepStrictEqual({
			bound: !!rule,
			// A higher weight than the editor's Insert Line After, so this rule is consulted
			// first and that command keeps the chord everywhere the when clause misses.
			winsOverInsertLineAfter: rule?.weight1,
			submittableFeedback: evaluate(),
			normalWindow: evaluate({ [IsSessionsWindowContext.key]: false }),
			unfocusedEditor: evaluate({ [EditorContextKeys.editorTextFocus.key]: false }),
			fileWithoutFeedback: evaluate({ [hasUnsubmittedAgentFeedback.key]: false }),
			chatDisabled: evaluate({ [ChatContextKeys.enabled.key]: false }),
		}, {
			bound: true,
			winsOverInsertLineAfter: KeybindingWeight.SessionsContrib,
			submittableFeedback: true,
			normalWindow: false,
			unfocusedEditor: false,
			fileWithoutFeedback: false,
			chatDisabled: false,
		});
	});
});

suite('Agent Feedback - Submission actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const actionId of [submitFeedbackActionId, submitActiveSessionFeedbackActionId]) {
		for (const rejects of [false, true]) {
			test(`${actionId} submits to the authored child after navigation and reports ${rejects ? 'failure' : 'queue acceptance'}`, async () => {
				const instantiationService = store.add(new TestInstantiationService());
				const sessionResource = URI.parse('agent-host-test:/session');
				const file = URI.file('/repo/a.ts');
				const child = upcastPartial<IChat>({ resource: sessionResource.with({ fragment: 'child' }) });
				const main = upcastPartial<IChat>({ resource: sessionResource });
				const session = upcastPartial<ISession>({
					resource: sessionResource, sessionId: 'session', providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
					chats: constObservable([main, child]), mainChat: constObservable(main),
					status: constObservable(SessionStatus.Completed), workspace: constObservable(undefined),
				});
				const shown = observableValue<ITestShownChat | undefined>('shown', { session, chat: child });
				const sends: { chat: IChat; options: ISendRequestOptions }[] = [];
				const acceptance = new DeferredPromise<void>();
				const notifications: { kind: string; message: string }[] = [];
				instantiationService.stub(IChatEditingService, upcastPartial<IChatEditingService>({}));
				instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
					onDidChangeSessions: Event.None, onDidDeleteSession: Event.None,
					getSession: () => session,
					sendRequestInBackground: async (_session, chat, options) => {
						sends.push({ chat, options });
						await acceptance.p;
					},
				}));
				instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({
					onDidChangeProviders: Event.None, getProvider: () => undefined,
				}));
				instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
					readonly activeSession = shown;
					override readonly panes = constObservable([]);
				}());
				const editor = store.add(new class extends EditorInput {
					override readonly resource = file;
					override get typeId(): string { return 'testFeedback'; }
				}());
				const group = upcastPartial<IEditorGroup>({
					id: 7, activeEditor: editor, getEditorByIndex: () => editor, isSelected: () => false,
				});
				instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({ getGroup: () => group }));
				instantiationService.stub(IEditorService, upcastPartial<IEditorService>({
					onDidVisibleEditorsChange: Event.None, visibleEditorPanes: [],
				}));
				instantiationService.stub(IListService, upcastPartial<IListService>({}));
				stubFocusedSessionHostFromSessionsService(instantiationService);
				instantiationService.stub(ISessionHostService, upcastPartial<ISessionHostService>({ getHostOfGroup: () => undefined }));
				instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
					getWidgetBySessionResource: () => { throw new Error('Feedback must not wait for a widget'); },
				}));
				instantiationService.stub(ICodeReviewService, upcastPartial<ICodeReviewService>({ getPRReviewState: () => constObservable<IPRReviewState>({ kind: PRReviewStateKind.None }) }));
				instantiationService.stub(IPlanReviewFeedbackService, upcastPartial<IPlanReviewFeedbackService>({ isActivePlanReview: () => false }));
				instantiationService.stub(INotificationService, upcastPartial<INotificationService>({
					info: message => notifications.push({ kind: 'info', message: String(message) }),
					error: message => notifications.push({ kind: 'error', message: String(message) }),
				}));
				const feedbackService = store.add(instantiationService.createInstance(AgentFeedbackService));
				instantiationService.stub(IAgentFeedbackService, feedbackService);
				const feedback = feedbackService.addFeedback(sessionResource, file, new Range(1, 1, 1, 2), 'Fix child code');
				store.add(feedbackService.registerFeedbackResourceScope(file, sessionResource));
				shown.set({ session, chat: main }, undefined);

				const pending = instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(actionId)!.handler(accessor, { groupId: 7, editorIndex: 0 }));
				const before = feedbackService.getFeedback(sessionResource)[0].state;
				if (rejects) {
					await acceptance.error(new Error('Request rejected'));
				} else {
					await acceptance.complete();
				}
				await pending;

				assert.deepStrictEqual({
					before,
					sends: sends.map(({ chat, options }) => ({
						target: chat.resource.toString(), queue: options.queue,
						ids: options.attachedContext?.flatMap(entry => entry.kind === 'agentFeedback' ? entry.feedbackItems.map(item => item.id) : []),
					})),
					state: feedbackService.getFeedback(sessionResource)[0].state,
					notifications,
				}, {
					before: AgentFeedbackState.Accepted,
					sends: [{ target: child.resource.toString(), queue: ChatRequestQueueKind.Queued, ids: [feedback.id] }],
					state: rejects ? AgentFeedbackState.Accepted : AgentFeedbackState.Submitted,
					notifications: [{
						kind: rejects ? 'error' : 'info',
						message: rejects
							? 'Unable to submit feedback: Request rejected. Unsubmitted comments are available to retry.'
							: 'Feedback accepted for submission. Queued requests will run when the chat is ready.',
					}],
				});
			});
		}
	}
});
