/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { SpeechService } from '../../browser/speechService.js';

suite('Voice live session bridge', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('enforces extension identity, cancellation and provider unregistration', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const extensionService = new class extends mock<IExtensionService>() {
			activation: Promise<void> | undefined;
			override async activateByEvent(): Promise<void> { await this.activation; }
		}();
		instantiationService.stub(IExtensionService, extensionService);
		const service = store.add(instantiationService.createInstance(SpeechService));
		const extension = new ExtensionIdentifier('GitHub.Copilot');
		const source = store.add(new CancellationTokenSource());
		const offers: (string | undefined)[] = [];
		const registration = store.add(service.registerVoiceLiveSessionProvider('live', {
			metadata: { extension, displayName: 'Copilot' },
			createVoiceLiveSession: async (sdp, token) => {
				assert.strictEqual(token, source.token);
				offers.push(sdp);
				return { available: true, session: { sessionId: 'live-1', sdp: 'answer' } };
			},
		}));

		const rejected = await service.createVoiceLiveSession('live', new ExtensionIdentifier('untrusted.extension'), 'offer', source.token);
		const accepted = await service.createVoiceLiveSession('live', new ExtensionIdentifier('github.copilot'), 'offer\r\n', source.token);

		const activation = new DeferredPromise<void>();
		extensionService.activation = activation.p;
		const cancelled = service.createVoiceLiveSession('live', extension, 'late offer', source.token);
		source.cancel();
		activation.complete();
		const cancelledResult = await cancelled;
		registration.dispose();
		const unregistered = await service.createVoiceLiveSession('live', extension, 'offer', CancellationToken.None);

		assert.deepStrictEqual({ rejected, accepted, cancelledResult, unregistered, offers }, {
			rejected: undefined,
			accepted: { available: true, session: { sessionId: 'live-1', sdp: 'answer' } },
			cancelledResult: undefined,
			unregistered: undefined,
			offers: ['offer\r\n'],
		});
	});
});
