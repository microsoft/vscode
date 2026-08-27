/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IChatAccessibilityService, IChatWidgetService } from '../../../../browser/chat.js';
import { ChatErrorConfirmationContentPart } from '../../../../browser/widget/chatContentParts/chatErrorConfirmationPart.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { ChatErrorLevel, IChatSendRequestOptions, IChatService } from '../../../../common/chatService/chatService.js';
import { IChatModel, IChatRequestModel } from '../../../../common/model/chatModel.js';
import { IChatErrorDetailsPart, IChatResponseViewModel } from '../../../../common/model/chatViewModel.js';
import { IChatAgentData } from '../../../../common/participants/chatAgents.js';

suite('ChatErrorConfirmationContentPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('Try Again resends the same request through its selected agent', async () => {
		const sessionResource = URI.parse('test://session');
		const request = upcastPartial<IChatRequestModel>({ id: 'turn-1' });
		const resend = new DeferredPromise<void>();
		let resendCallCount = 0;
		let resendCall: { requestId: string; options: IChatSendRequestOptions | undefined; preserveRequestId: boolean | undefined } | undefined;
		let acceptedSession: URI | undefined;
		const chatService = new class extends mock<IChatService>() {
			override getSession(): IChatModel {
				return upcastPartial<IChatModel>({ getRequests: () => [request] });
			}

			override async resendRequest(request: IChatRequestModel, options?: IChatSendRequestOptions, preserveRequestId?: boolean): Promise<void> {
				resendCallCount++;
				resendCall = { requestId: request.id, options, preserveRequestId };
				resend.complete();
			}
		};
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IChatService, chatService);
		instantiationService.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() {
			override getWidgetBySessionResource() {
				return undefined;
			}
		});
		instantiationService.stub(IChatAccessibilityService, new class extends mock<IChatAccessibilityService>() {
			override acceptRequest(resource: URI): void {
				acceptedSession = resource;
			}
		});
		const renderer = upcastPartial<IMarkdownRenderer>({
			render: markdown => {
				const element = mainWindow.document.createElement('div');
				element.textContent = markdown.value;
				return { element, dispose() { } };
			},
		});
		const element = upcastPartial<IChatResponseViewModel>({
			setVote() { },
			sessionResource,
			requestId: request.id,
			agent: upcastPartial<IChatAgentData>({ id: 'agent-host-copilot' }),
		});
		const errorDetails = upcastPartial<IChatErrorDetailsPart>({
			kind: 'errorDetails',
			errorDetails: { message: 'Failed' },
			isLast: true,
		});
		const part = store.add(instantiationService.createInstance(
			ChatErrorConfirmationContentPart,
			ChatErrorLevel.Error,
			new MarkdownString('Failed'),
			errorDetails,
			[{
				label: 'Try Again',
				data: { agentHostResumeTurn: true },
				resend: true,
				preserveRequestId: true,
			}, {
				label: 'Try Another Way',
				data: { agentHostResumeTurn: true },
				resend: true,
				preserveRequestId: true,
			}],
			renderer,
			upcastPartial<IChatContentPartRenderContext>({ element }),
		));
		mainWindow.document.body.appendChild(part.domNode);
		store.add(toDisposable(() => part.domNode.remove()));

		const buttons = [...part.domNode.querySelectorAll<HTMLElement>('.monaco-button')];
		assert.strictEqual(buttons.length, 2);
		buttons[0].click();
		buttons[0].click();
		buttons[1].click();
		await resend.p;

		assert.deepStrictEqual({
			labels: buttons.map(button => button.textContent),
			roles: buttons.map(button => button.getAttribute('role')),
			acceptedSession: acceptedSession?.toString(),
			resendCallCount,
			resendCall,
		}, {
			labels: ['Try Again', 'Try Another Way'],
			roles: ['button', 'button'],
			acceptedSession: sessionResource.toString(),
			resendCallCount: 1,
			resendCall: {
				requestId: request.id,
				options: {
					acceptedConfirmationData: [{ agentHostResumeTurn: true }],
					agentId: 'agent-host-copilot',
					slashCommand: undefined,
				},
				preserveRequestId: true,
			},
		});
	});
});
