/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue, transaction } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/runWithFakedTimers.js';
import { IAccessibilitySignalService } from '../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ChatAccessibilityService } from '../../../browser/accessibility/chatAccessibilityService.js';
import { IChatWidgetService } from '../../../browser/chat.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatModel } from '../../../common/model/chatModel.js';

suite('ChatAccessibilityService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(model: IChatModel | undefined) {
		const log: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() {
			override async playSignal() { }
			override playSignalLoop() {
				log.push('progress started');
				return toDisposable(() => log.push('progress stopped'));
			}
		});
		instantiationService.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() {
			override readonly onDidBackgroundSession = Event.None;
		});
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override getSession() { return model; }
		});
		const service = store.add(instantiationService.createInstance(ChatAccessibilityService));
		return { service, log };
	}

	function createModel(options: { inProgress: boolean; onDidDispose?: Event<void> }) {
		const requestInProgress = observableValue('requestInProgress', options.inProgress);
		const hasActiveRequest = observableValue('hasActiveRequest', options.inProgress);
		const model = upcastPartial<IChatModel>({ requestInProgress, hasActiveRequest, onDidDispose: options.onDidDispose ?? Event.None });
		const setRequestState = (active: boolean) => transaction(tx => {
			requestInProgress.set(active, tx);
			hasActiveRequest.set(active, tx);
		});
		return { model, requestInProgress, hasActiveRequest, setRequestState };
	}

	test('stops the progress signal when a request nobody reports a response for completes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { model, setRequestState } = createModel({ inProgress: true });
		const { service, log } = createService(model);

		service.acceptRequest(URI.parse('test://session'), true);
		await timeout(5000);
		setRequestState(false);
		await timeout(10);
		log.push('unrelated request');
		setRequestState(true);
		await timeout(10000);

		assert.deepStrictEqual(log, ['progress started', 'progress stopped', 'unrelated request']);
	}));

	test('keeps tracking a rerun that cancels the active request before sending its replacement', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { model, setRequestState } = createModel({ inProgress: true });
		const { service, log } = createService(model);

		service.acceptRequest(URI.parse('test://session'));
		setRequestState(false);
		setRequestState(true);
		await timeout(5000);
		setRequestState(false);

		assert.deepStrictEqual(log, ['progress started', 'progress stopped']);
	}));

	test('stops the progress signal when a displayed model that is not registered with the chat service is disposed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const onDidDispose = store.add(new Emitter<void>());
		const { model } = createModel({ inProgress: true, onDidDispose: onDidDispose.event });
		const { service, log } = createService(undefined);

		service.acceptRequest(URI.parse('test://preparation'), true, model);
		await timeout(5000);
		onDidDispose.fire();

		assert.deepStrictEqual(log, ['progress started', 'progress stopped']);
	}));

	test('pauses the progress signal while the request waits for input and resumes it afterwards', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { model, requestInProgress, setRequestState } = createModel({ inProgress: true });
		const { service, log } = createService(model);

		service.acceptRequest(URI.parse('test://session'), true);
		await timeout(5000);
		requestInProgress.set(false, undefined);
		log.push('waiting for input');
		await timeout(10000);
		requestInProgress.set(true, undefined);
		await timeout(5000);
		setRequestState(false);

		assert.deepStrictEqual(log, ['progress started', 'progress stopped', 'waiting for input', 'progress started', 'progress stopped']);
	}));

	test('stops the progress signal when the chat model is disposed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const onDidDispose = store.add(new Emitter<void>());
		const { model } = createModel({ inProgress: true, onDidDispose: onDidDispose.event });
		const { service, log } = createService(model);

		service.acceptRequest(URI.parse('test://session'), true);
		await timeout(5000);
		onDidDispose.fire();

		assert.deepStrictEqual(log, ['progress started', 'progress stopped']);
	}));

	test('keeps the progress signal of a request that has not started yet, and matches equal session resources', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { model } = createModel({ inProgress: false });
		const { service, log } = createService(model);

		service.acceptRequest(URI.parse('test://session'));
		await timeout(5000);
		log.push('before response');
		service.acceptResponse(undefined, URI.parse('test://session'));

		assert.deepStrictEqual(log, ['progress started', 'before response', 'progress stopped']);
	}));
});
