/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IDevContainerAgentHostConnectFailure, IDevContainerAgentHostMainService, IDevContainerAgentHostSandboxSupport, IDevContainerAgentHostUserStateReport } from '../../common/devContainerAgentHost.js';
import { createDevContainerAgentHostChannel } from '../../common/devContainerAgentHostIpc.js';

suite('Dev Container Agent Host IPC', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves unbuffered sandbox support, user state and connect failure events', () => {
		const events = store.add(new Emitter<{ connectionId: string; supported: boolean }>());
		const userState = store.add(new Emitter<IDevContainerAgentHostUserStateReport>());
		const connectFailure = store.add(new Emitter<IDevContainerAgentHostConnectFailure>());
		const service = new class extends mock<IDevContainerAgentHostMainService>() {
			override readonly onDidChangeSandboxSupport = events.event;
			override readonly onDidReportUserState = userState.event;
			override readonly onDidFailConnect = connectFailure.event;
		}();
		const channel = createDevContainerAgentHostChannel(service, store.add(new DisposableStore()));
		events.fire({ connectionId: 'before', supported: false });
		userState.fire({ connectionId: 'before', stage: 'mount', outcome: 'added' });
		connectFailure.fire({ connectionId: 'before', stage: 'up' });
		const seen: (IDevContainerAgentHostSandboxSupport | IDevContainerAgentHostUserStateReport | IDevContainerAgentHostConnectFailure)[] = [];
		store.add(channel.listen<IDevContainerAgentHostSandboxSupport>('', 'onDidChangeSandboxSupport')(event => seen.push(event)));
		store.add(channel.listen<IDevContainerAgentHostUserStateReport>('', 'onDidReportUserState')(event => seen.push(event)));
		store.add(channel.listen<IDevContainerAgentHostConnectFailure>('', 'onDidFailConnect')(event => seen.push(event)));
		events.fire({ connectionId: 'after', supported: true });
		userState.fire({ connectionId: 'after', stage: 'link', outcome: 'failed', reason: 'script' });
		connectFailure.fire({ connectionId: 'after', stage: 'timeout' });
		assert.deepStrictEqual(seen, [{ connectionId: 'after', supported: true }, { connectionId: 'after', stage: 'link', outcome: 'failed', reason: 'script' }, { connectionId: 'after', stage: 'timeout' }]);
	});
});
