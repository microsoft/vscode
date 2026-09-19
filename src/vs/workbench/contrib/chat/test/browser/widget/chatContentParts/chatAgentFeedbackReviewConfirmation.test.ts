/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { setARIAContainer } from '../../../../../../../base/browser/ui/aria/aria.js';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { Event } from '../../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IChatWidgetService } from '../../../../browser/chat.js';
import { IChatToolRiskAssessmentService } from '../../../../browser/tools/chatToolRiskAssessmentService.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { ChatAgentFeedbackReviewConfirmationSubPart } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatAgentFeedbackReviewConfirmationSubPart.js';
import { IChatAgentFeedbackReviewComment } from '../../../../common/chatService/chatService.js';
import { ChatToolInvocation } from '../../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { IChatResponseViewModel } from '../../../../common/model/chatViewModel.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';

suite('ChatAgentFeedbackReviewConfirmation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createPart(result: Promise<IChatAgentFeedbackReviewComment[]>) {
		const instantiation = workbenchInstantiationService(undefined, store);
		instantiation.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T>(): Promise<T> { return await result as T; }
		});
		instantiation.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() {});
		instantiation.stub(IChatToolRiskAssessmentService, new class extends mock<IChatToolRiskAssessmentService>() {});
		instantiation.stub(ILanguageModelToolsService, new class extends mock<ILanguageModelToolsService>() {});
		const invocation = new ChatToolInvocation({
			confirmationMessages: { title: 'Reveal unreviewed comments?', message: 'Choose comments' },
			toolSpecificData: { kind: 'agentFeedbackReviewConfirmation', options: ['Reveal Selected'] },
		}, { id: 'viewUnreviewedComments', displayName: 'View Unreviewed Comments', modelDescription: '', source: ToolDataSource.Internal }, 'call', undefined, undefined);
		const context = new class extends mock<IChatContentPartRenderContext>() {
			override readonly element = new class extends mock<IChatResponseViewModel>() {
				override readonly sessionResource = URI.parse('agent-host-codex:/session');
			}();
			override readonly currentWidth = observableValue('width', 480);
			override readonly onDidChangeVisibility = Event.None;
		}();
		return store.add(instantiation.createInstance(ChatAgentFeedbackReviewConfirmationSubPart, invocation, context));
	}

	test('a command failure is not presented as no unreviewed comments', async () => {
		const result = new DeferredPromise<IChatAgentFeedbackReviewComment[]>();
		const aria = document.createElement('div');
		setARIAContainer(aria);
		const part = createPart(result.p);
		await result.error(new Error('command not found'));
		await Promise.resolve();
		assert.deepStrictEqual({
			failed: part.domNode.textContent?.includes('Could not load review comments.'),
			empty: part.domNode.textContent?.includes('No unreviewed comments.'),
		}, { failed: true, empty: false });
		assert.strictEqual(aria.querySelector('[role=alert]')?.textContent, 'Could not load review comments. Cancel this request and try again.');
	});

	test('a successful empty result remains distinguishable from a failure', async () => {
		const result = new DeferredPromise<IChatAgentFeedbackReviewComment[]>();
		const part = createPart(result.p);
		await result.complete([]);
		await Promise.resolve();
		assert.deepStrictEqual({
			failed: part.domNode.textContent?.includes('Could not load review comments.'),
			empty: part.domNode.textContent?.includes('No unreviewed comments.'),
		}, { failed: false, empty: true });
	});

	test('a late failure does not update a disposed confirmation', async () => {
		const result = new DeferredPromise<IChatAgentFeedbackReviewComment[]>();
		const aria = document.createElement('div');
		setARIAContainer(aria);
		const part = createPart(result.p);
		part.dispose();
		const before = part.domNode.textContent;
		await result.error(new Error('disconnected'));
		await Promise.resolve();
		assert.strictEqual(part.domNode.textContent, before);
		assert.strictEqual(aria.textContent, '');
	});
});
