/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestNotificationService } from '../../../../platform/notification/test/common/testNotificationService.js';
import { NullOpenerService } from '../../../../platform/opener/test/common/nullOpenerService.js';
import { TestStorageService } from '../../../test/common/workbenchTestServices.js';
import { MainThreadUriOpeners } from '../../browser/mainThreadUriOpeners.js';
import { IExternalOpenerProvider, IExternalUriOpener, IExternalUriOpenerService } from '../../../contrib/externalUriOpener/common/externalUriOpenerService.js';
import { ActivationKind, IExtensionService, NullExtensionService } from '../../../services/extensions/common/extensions.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

class TestExternalUriOpenerService implements Partial<IExternalUriOpenerService> {
	declare readonly _serviceBrand: undefined;
	public provider: IExternalOpenerProvider | undefined;
	registerExternalOpenerProvider(provider: IExternalOpenerProvider) {
		this.provider = provider;
		return { dispose: () => { this.provider = undefined; } };
	}
}

class RecordingExtensionService extends NullExtensionService {
	public readonly activateByEventCalls: Array<{ event: string; kind: ActivationKind | undefined }> = [];
	public readonly normalBlocker = new DeferredPromise<void>();

	override activateByEvent(activationEvent: string, activationKind?: ActivationKind): Promise<void> {
		this.activateByEventCalls.push({ event: activationEvent, kind: activationKind });
		// Simulate the real abstractExtensionService behavior: `Normal` waits for the
		// `_installedExtensionsReady` barrier (which stays closed while a remote
		// authority is being resolved). `Immediate` skips that wait. If the production
		// code wrongly passes `Normal`, the test hangs waiting on this promise.
		if (activationKind === ActivationKind.Immediate) {
			return Promise.resolve();
		}
		return this.normalBlocker.p;
	}
}

suite('MainThreadUriOpeners', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createFixture() {
		const instantiationService = store.add(new TestInstantiationService());
		const externalUriOpenerService = new TestExternalUriOpenerService();
		const extensionService = new RecordingExtensionService();

		instantiationService.stub(IExternalUriOpenerService, externalUriOpenerService as unknown as IExternalUriOpenerService);
		instantiationService.stub(IExtensionService, extensionService);
		instantiationService.stub(IStorageService, store.add(new TestStorageService()));
		instantiationService.stub(IOpenerService, NullOpenerService);
		instantiationService.stub(INotificationService, new TestNotificationService());

		const rpcProtocol = SingleProxyRPCProtocol({
			$canOpenUri: async () => 0,
			$openUri: async () => { /* noop */ }
		});
		const main = store.add(instantiationService.createInstance(MainThreadUriOpeners, rpcProtocol));
		return { main, extensionService, externalUriOpenerService };
	}

	test('getOpeners should not block on remote extension host resolution (issue #236398)', async () => {
		const { extensionService, externalUriOpenerService } = createFixture();
		assert.ok(externalUriOpenerService.provider, 'MainThreadUriOpeners must register as an external opener provider');

		const openers: IExternalUriOpener[] = [];
		const iterable = externalUriOpenerService.provider!.getOpeners(URI.parse('https://example.com/2fa'));

		// Iterate the async iterable. If this waits on the extension host (which is
		// still resolving the remote authority), this for-await loop would never
		// complete because `normalBlocker` is never resolved in this test.
		for await (const opener of iterable) {
			openers.push(opener);
		}

		assert.strictEqual(openers.length, 0);
		assert.strictEqual(extensionService.activateByEventCalls.length, 1);
		assert.strictEqual(extensionService.activateByEventCalls[0].event, 'onOpenExternalUri:https');
		assert.strictEqual(
			extensionService.activateByEventCalls[0].kind,
			ActivationKind.Immediate,
			'getOpeners must use ActivationKind.Immediate so terminal URL clicks are not deferred until after the remote connection completes'
		);
	});

	test('getOpeners returns nothing for non-http(s) schemes without activating extensions', async () => {
		const { extensionService, externalUriOpenerService } = createFixture();

		const openers: IExternalUriOpener[] = [];
		for await (const opener of externalUriOpenerService.provider!.getOpeners(URI.parse('mailto:test@example.com'))) {
			openers.push(opener);
		}

		assert.strictEqual(openers.length, 0);
		assert.strictEqual(extensionService.activateByEventCalls.length, 0);
	});
});
