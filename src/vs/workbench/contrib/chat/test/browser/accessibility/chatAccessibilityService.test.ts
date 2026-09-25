/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
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

	test('stops the progress signal when a request nobody reports a response for completes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const requestInProgress = observableValue('requestInProgress', true);
		const { service, log } = createService(upcastPartial<IChatModel>({ requestInProgress, onDidDispose: Event.None }));

		service.acceptRequest(URI.parse('test://session'), true);
		await timeout(5000);
		requestInProgress.set(false, undefined);
		await timeout(10000);

		assert.deepStrictEqual(log, ['progress started', 'progress stopped']);
	}));

	test('stops the progress signal when the chat model is disposed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const onDidDispose = store.add(new Emitter<void>());
		const { service, log } = createService(upcastPartial<IChatModel>({ requestInProgress: observableValue('requestInProgress', true), onDidDispose: onDidDispose.event }));

		service.acceptRequest(URI.parse('test://session'), true);
		await timeout(5000);
		onDidDispose.fire();

		assert.deepStrictEqual(log, ['progress started', 'progress stopped']);
	}));

	test('keeps the progress signal of a request that has not started yet, and matches equal session resources', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { service, log } = createService(upcastPartial<IChatModel>({ requestInProgress: observableValue('requestInProgress', false), onDidDispose: Event.None }));

		service.acceptRequest(URI.parse('test://session'));
		await timeout(5000);
		log.push('before response');
		service.acceptResponse(undefined, URI.parse('test://session'));

		assert.deepStrictEqual(log, ['progress started', 'before response', 'progress stopped']);
	}));
});
