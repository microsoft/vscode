/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfirmationOptionKind } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IViewDescriptorService } from '../../../../../workbench/common/views.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IChatAccessibilityService, IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatToolRiskAssessmentService } from '../../../../../workbench/contrib/chat/browser/tools/chatToolRiskAssessmentService.js';
import { ChatErrorLevel, IChatSendRequestOptions, IChatService, IChatToolInvocation, ToolConfirmKind } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ChatModel, IChatRequestModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatToolInvocation } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { ChatAgentService, IChatAgentService } from '../../../../../workbench/contrib/chat/common/participants/chatAgents.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { ILanguageModelToolsConfirmationService } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsConfirmationService.js';
import { MockChatService } from '../../../../../workbench/contrib/chat/test/common/chatService/mockChatService.js';
import { canRunProjectBoardAction, getProjectBoardPendingActions } from '../../common/projectBoardActions.js';
import { ProjectBoardChatActions } from '../../browser/projectBoardChatActions.js';

suite('ProjectBoardChatActions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const instantiation = workbenchInstantiationService(undefined, store);
		instantiation.stub(IViewDescriptorService, { onDidChangeLocation: Event.None });
		instantiation.stub(IConfigurationService, new TestConfigurationService({
			editor: { fontFamily: 'monospace' },
			chat: { editor: { fontSize: 12, fontFamily: 'default', fontWeight: 'normal', wordWrap: 'on' } },
		}));
		instantiation.stub(IChatService, new MockChatService());
		instantiation.stub(IChatAgentService, store.add(instantiation.createInstance(ChatAgentService)));
		const model = store.add(instantiation.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const request = model.addRequest({ text: 'Dedicated action test', parts: [] }, { variables: [] }, Date.now());
		let focusCount = 0;
		instantiation.stub(IChatWidgetService, {
			getWidgetBySessionResource: () => new class extends mock<IChatWidget>() {
				override focusInput() { focusCount++; }
			}(),
		});
		instantiation.stub(IChatAccessibilityService, { acceptRequest() { } });
		instantiation.stub(IChatToolRiskAssessmentService, { isEnabled: () => false });
		instantiation.stub(ILanguageModelToolsService, { getTool: () => undefined });
		instantiation.stub(ILanguageModelToolsConfirmationService, { getPreConfirmActions: () => [], getPostConfirmActions: () => [] });
		let menu: Pick<IContextMenuDelegate, 'getActions'> | undefined;
		instantiation.stub(IContextMenuService, { showContextMenu: delegate => {
			assert.ok(delegate.getActions);
			menu = { getActions: delegate.getActions };
		} });
		const tool = new ChatToolInvocation({
			invocationMessage: 'Read test metadata',
			confirmationMessages: {
				title: 'Approve test tool?', message: 'Read only the dedicated test metadata.',
				customOptions: [
					{ id: 'once', label: 'Approve Once', kind: ConfirmationOptionKind.Approve },
					{ id: 'session', label: 'Approve for Session', kind: ConfirmationOptionKind.Approve },
					{ id: 'deny', label: 'Deny', kind: ConfirmationOptionKind.Deny },
				],
			},
		}, { id: 'test-tool', displayName: 'Test tool', modelDescription: 'Test', source: ToolDataSource.Internal }, 'tool-call', undefined, {});
		const create = (canAct = () => true) => {
			const pending = getProjectBoardPendingActions(model);
			assert.ok(pending);
			const widget = store.add(instantiation.createInstance(ProjectBoardChatActions, pending, canAct));
			mainWindow.document.body.appendChild(widget.element);
			store.add(toDisposable(() => widget.element.remove()));
			return widget;
		};
		return { instantiation, model, request, tool, create, get menu() { return menu; }, get focusCount() { return focusCount; } };
	}

	test('PB-20 tool approvals reuse the shared split button and original backend option IDs', async () => {
		const h = setup();
		h.model.acceptResponseProgress(h.request, h.tool);
		const widget = h.create();
		assert.ok(widget.element.querySelector('.chat-tool-invocation-part'));
		assert.ok(widget.element.querySelector('.monaco-button-dropdown'), 'Use the shared dropdown button');
		widget.element.querySelector<HTMLElement>('.monaco-dropdown-button')!.click();
		const action = h.menu?.getActions().find(action => action.label === 'Approve for Session');
		assert.ok(action);
		await action.run();
		const state = h.tool.state.get();
		assert.notStrictEqual(state.type, IChatToolInvocation.StateKind.WaitingForConfirmation);
		assert.deepStrictEqual(IChatToolInvocation.executionConfirmedOrDenied(h.tool), { type: ToolConfirmKind.UserAction, selectedButton: 'session', selectedButtonKind: ConfirmationOptionKind.Approve });
		assert.strictEqual(h.focusCount, 0, 'Board approval must not focus another chat window');
		assert.strictEqual(canRunProjectBoardAction(widget.source, h.tool), false);
	});

	test('PB-20 stale or ineligible tool actions do not approve and input updates preserve controls', () => {
		const h = setup();
		h.model.acceptResponseProgress(h.request, h.tool);
		let eligible = true;
		const widget = h.create(() => eligible);
		const button = [...widget.element.querySelectorAll<HTMLElement>('.monaco-button')].find(button => button.textContent === 'Approve Once')!;
		assert.ok(button);
		widget.update(getProjectBoardPendingActions(h.model)!);
		assert.ok(widget.element.contains(button), 'Keep the original shared control across unchanged updates');
		eligible = false;
		button.click();
		assert.strictEqual(h.tool.state.get().type, IChatToolInvocation.StateKind.WaitingForConfirmation);
		eligible = true;
		h.model.addRequest({ text: 'Newer request', parts: [] }, { variables: [] }, Date.now());
		button.click();
		assert.strictEqual(h.tool.state.get().type, IChatToolInvocation.StateKind.WaitingForConfirmation);
	});

	test('PB-20 standard approval scope dropdown keeps confirmation-service choices and exact session attribution', async () => {
		const h = setup();
		const tool = new ChatToolInvocation({
			invocationMessage: 'Inspect metadata',
			confirmationMessages: { title: 'Allow inspection?', message: 'Inspect the dedicated fixture only.' },
		}, { id: 'inspect', displayName: 'Inspect', modelDescription: 'Inspect', source: ToolDataSource.Internal }, 'inspect-call', undefined, {});
		let scopeSelected = 0;
		h.instantiation.stub(ILanguageModelToolsConfirmationService, {
			getPreConfirmActions: request => {
				assert.strictEqual(request.chatSessionResource?.toString(), h.model.sessionResource.toString());
				return [{ label: 'Allow for this Session', scope: 'session', select: async () => { scopeSelected++; return true; } }];
			},
			getPostConfirmActions: () => [],
		});
		h.model.acceptResponseProgress(h.request, tool);
		const widget = h.create();
		assert.ok(widget.element.textContent?.includes('Allow for this Session'));
		widget.element.querySelector<HTMLElement>('.monaco-dropdown-button')!.click();
		const once = h.menu?.getActions().find(action => action.label === 'Allow Once');
		assert.ok(once);
		await once.run();
		assert.strictEqual(scopeSelected, 0, 'Allow Once must not persist wider approval');
		assert.strictEqual(IChatToolInvocation.executionConfirmedOrDenied(tool)?.type, ToolConfirmKind.UserAction);
	});

	test('PB-20 post-execution approvals use the same result-review component', async () => {
		const h = setup();
		const tool = new ChatToolInvocation({
			invocationMessage: 'Read metadata',
			confirmationMessages: { title: 'Read metadata?', message: 'Read the fixture.', confirmResults: true },
		}, { id: 'review', displayName: 'Review', modelDescription: 'Review', source: ToolDataSource.Internal }, 'review-call', undefined, {});
		h.model.acceptResponseProgress(h.request, tool);
		IChatToolInvocation.confirmWith(tool, { type: ToolConfirmKind.UserAction });
		await tool.didExecuteTool({ content: [] });
		assert.strictEqual(tool.state.get().type, IChatToolInvocation.StateKind.WaitingForPostApproval);
		const widget = h.create();
		assert.ok(widget.element.textContent?.includes('Approve Tool Result'));
		const skip = [...widget.element.querySelectorAll<HTMLElement>('.monaco-button')].find(button => button.textContent === 'Skip')!;
		skip.click();
		assert.notStrictEqual(tool.state.get().type, IChatToolInvocation.StateKind.WaitingForPostApproval);
	});

	test('PB-20 canceled responses and superseded interrupted requests never retain actionable controls', () => {
		const h = setup();
		h.model.acceptResponseProgress(h.request, h.tool);
		const pending = getProjectBoardPendingActions(h.model)!;
		h.request.response!.cancel();
		assert.strictEqual(getProjectBoardPendingActions(h.model), undefined);
		assert.strictEqual(canRunProjectBoardAction(pending, h.tool), false);
	});

	test('PB-20 pending tool rendering is bounded without an implicit approve-all action', () => {
		const h = setup();
		for (let index = 0; index < 9; index++) {
			const tool = new ChatToolInvocation({
				invocationMessage: 'Pending test',
				confirmationMessages: { title: 'Allow?', message: 'Dedicated fixture' },
			}, { id: 'fixture', displayName: 'Fixture', modelDescription: 'Fixture', source: ToolDataSource.Internal }, `call-${index}`, undefined, {});
			h.model.acceptResponseProgress(h.request, tool);
		}
		const snapshot = getProjectBoardPendingActions(h.model)!;
		assert.strictEqual(snapshot.tools.length, 8);
		assert.strictEqual(snapshot.limited, true);
		assert.ok(snapshot.tools.every(tool => tool.state.get().type === IChatToolInvocation.StateKind.WaitingForConfirmation));
	});

	test('PB-20 continuation errors are surfaced and the same control can retry', async () => {
		const h = setup();
		h.model.setResponse(h.request, { errorDetails: {
			message: 'Interrupted',
			confirmationButtons: [{ label: 'Keep Going', data: { agentHostResumeTurn: true }, resend: true, preserveRequestId: true }],
		} });
		h.request.response!.complete();
		const notified = new DeferredPromise<void>();
		const retried = new DeferredPromise<void>();
		let calls = 0;
		h.instantiation.stub(INotificationService, { error: () => { notified.complete(); } });
		h.instantiation.stub(IChatWidgetService, { getWidgetBySessionResource: () => undefined });
		h.instantiation.stub(IChatService, new class extends mock<IChatService>() {
			override getSession() { return h.model; }
			override async resendRequest() {
				if (++calls === 1) {
					throw new Error('Expected retry failure');
				}
				retried.complete();
			}
		}());
		const widget = h.create();
		const button = widget.element.querySelector<HTMLElement>('.chat-error-confirmation .monaco-button')!;
		button.click();
		await notified.p;
		assert.strictEqual(button.getAttribute('aria-disabled'), 'false');
		button.click();
		await retried.p;
		assert.strictEqual(calls, 2);
	});

	test('PB-20 Keep Going reuses the error confirmation and prevents duplicate cross-surface retries', async () => {
		const h = setup();
		h.model.setResponse(h.request, { errorDetails: {
			message: 'Execution interrupted', level: ChatErrorLevel.Warning,
			confirmationButtons: [{ label: 'Keep Going', data: { agentHostResumeTurn: true }, resend: true, preserveRequestId: true }],
		} });
		h.request.response!.complete();
		const pending = new DeferredPromise<void>();
		let calls = 0;
		h.instantiation.stub(IChatWidgetService, { getWidgetBySessionResource: () => undefined });
		h.instantiation.stub(IChatService, new class extends mock<IChatService>() {
			override getSession() { return h.model; }
			override async resendRequest(request: IChatRequestModel, options?: IChatSendRequestOptions, preserveRequestId?: boolean) {
				assert.strictEqual(request, h.request);
				assert.deepStrictEqual(options?.acceptedConfirmationData, [{ agentHostResumeTurn: true }]);
				assert.strictEqual(preserveRequestId, true);
				calls++;
				await pending.p;
			}
		}());
		const first = h.create();
		const second = h.create();
		first.element.querySelector<HTMLElement>('.chat-error-confirmation .monaco-button')!.click();
		second.element.querySelector<HTMLElement>('.chat-error-confirmation .monaco-button')!.click();
		assert.strictEqual(calls, 1);
		await pending.complete();
	});
});
