/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IRemoteExplorerService } from '../../../../../workbench/services/remote/common/remoteExplorerService.js';
import type { Tunnel, TunnelModel } from '../../../../../workbench/services/remote/common/tunnelModel.js';
import { HasForwardedPortContext } from '../../../../common/contextkeys.js';
import { OpenForwardedPortContribution } from '../../browser/openForwardedPortAction.js';

interface IFakeTunnelModel {
	readonly forwarded: Map<string, Tunnel>;
	readonly onForwardPort: Emitter<Tunnel | void>['event'];
	readonly onClosePort: Emitter<{ host: string; port: number }>['event'];
	fireForward(tunnel: Tunnel): void;
	fireClose(host: string, port: number): void;
}

function createFakeTunnelModel(store: Pick<DisposableStore, 'add'>): IFakeTunnelModel {
	const forwarded = new Map<string, Tunnel>();
	const onForwardPort = store.add(new Emitter<Tunnel | void>());
	const onClosePort = store.add(new Emitter<{ host: string; port: number }>());
	return {
		forwarded,
		onForwardPort: onForwardPort.event,
		onClosePort: onClosePort.event,
		fireForward(tunnel) {
			forwarded.set(`${tunnel.remoteHost}:${tunnel.remotePort}`, tunnel);
			onForwardPort.fire(tunnel);
		},
		fireClose(host, port) {
			forwarded.delete(`${host}:${port}`);
			onClosePort.fire({ host, port });
		}
	};
}

suite('OpenForwardedPortContribution', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('reflects tunnelModel.forwarded into HasForwardedPortContext', () => {
		const fakeModel = createFakeTunnelModel(disposables);
		const remoteExplorer: Partial<IRemoteExplorerService> = {
			tunnelModel: fakeModel as unknown as TunnelModel
		};

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		const contextKeyService = disposables.add(instantiationService.createInstance(ContextKeyService));
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IRemoteExplorerService, remoteExplorer as IRemoteExplorerService);

		disposables.add(instantiationService.createInstance(OpenForwardedPortContribution));

		const key = HasForwardedPortContext.bindTo(contextKeyService);
		assert.strictEqual(key.get(), false, 'starts off when no ports are forwarded');

		fakeModel.fireForward({
			remoteHost: 'localhost',
			remotePort: 3000,
			localAddress: 'https://example.devtunnels.ms',
		} as Tunnel);
		assert.strictEqual(key.get(), true, 'flips on once a port is forwarded');

		fakeModel.fireClose('localhost', 3000);
		assert.strictEqual(key.get(), false, 'flips off when the last port closes');
	});

	test('picks up tunnels populated by the constructor restore (no onForwardPort fired)', async () => {
		// `TunnelModel`'s real constructor seeds `forwarded` from
		// `tunnelService.tunnels.then(...)` *without* firing
		// `onForwardPort`. Simulate that here by populating the map
		// before constructing the contribution.
		const fakeModel = createFakeTunnelModel(disposables);
		fakeModel.forwarded.set('localhost:3000', {
			remoteHost: 'localhost',
			remotePort: 3000,
			localAddress: 'https://restored.devtunnels.ms',
		} as Tunnel);

		const remoteExplorer: Partial<IRemoteExplorerService> = {
			tunnelModel: fakeModel as unknown as TunnelModel
		};

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		const contextKeyService = disposables.add(instantiationService.createInstance(ContextKeyService));
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IRemoteExplorerService, remoteExplorer as IRemoteExplorerService);

		disposables.add(instantiationService.createInstance(OpenForwardedPortContribution));

		assert.strictEqual(HasForwardedPortContext.getValue(contextKeyService), true, 'reflects the restored entry on construction');

		// Yield once so the macrotask-scheduled re-evaluation runs and
		// confirms the value remains correct.
		await timeout(0);
		assert.strictEqual(HasForwardedPortContext.getValue(contextKeyService), true, 'still true after the deferred re-evaluation');
	});
});
