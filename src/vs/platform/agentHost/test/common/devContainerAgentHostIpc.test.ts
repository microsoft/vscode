/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IDevContainerAgentHostMainService, IDevContainerAgentHostSandboxSupport } from '../../common/devContainerAgentHost.js';
import { createDevContainerAgentHostChannel } from '../../common/devContainerAgentHostIpc.js';

suite('Dev Container Agent Host IPC', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves unbuffered sandbox support events', () => {
		const events = store.add(new Emitter<{ connectionId: string; supported: boolean }>());
		const service = new class extends mock<IDevContainerAgentHostMainService>() {
			override readonly onDidChangeSandboxSupport = events.event;
		}();
		const channel = createDevContainerAgentHostChannel(service, store.add(new DisposableStore()));
		events.fire({ connectionId: 'before', supported: false });
		const seen: IDevContainerAgentHostSandboxSupport[] = [];
		store.add(channel.listen<IDevContainerAgentHostSandboxSupport>('', 'onDidChangeSandboxSupport')(event => seen.push(event)));
		events.fire({ connectionId: 'after', supported: true });
		assert.deepStrictEqual(seen, [{ connectionId: 'after', supported: true }]);
	});
});
