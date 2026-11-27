/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentsModeWorkspaceService } from '../../../configuration/browser/agents/agentsModeWorkspaceService.js';
import { AgentsModeService } from '../../browser/agentsModeService.js';
import { NullAgentsModeService } from '../../common/agentsMode.js';

suite('AgentsModeService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('switches the workspace service it wraps and reports its state', async () => {
		const onDidChangeAgentsMode = disposables.add(new Emitter<boolean>());
		const calls: [boolean, string | undefined][] = [];
		const folder = URI.file('/folder');
		const workspaceService = new class extends mock<AgentsModeWorkspaceService>() {
			private enabled = false;
			override get isAgentsMode() { return this.enabled; }
			override get windowFolders() { return [folder]; }
			override readonly onDidChangeAgentsMode = onDidChangeAgentsMode.event;
			override async setAgentsMode(enabled: boolean, workspaceId?: string): Promise<void> {
				calls.push([enabled, workspaceId]);
				this.enabled = enabled;
				onDidChangeAgentsMode.fire(enabled);
			}
		};
		const testObject = new AgentsModeService(workspaceService);
		const changes: boolean[] = [];
		disposables.add(testObject.onDidChange(active => changes.push(active)));

		await testObject.setActive(true, 'session');

		assert.deepStrictEqual({
			isSupported: testObject.isSupported,
			isActive: testObject.isActive,
			windowFolders: testObject.windowFolders.map(uri => uri.toString()),
			calls,
			changes,
		}, {
			isSupported: true,
			isActive: true,
			windowFolders: [folder.toString()],
			calls: [[true, 'session']],
			changes: [true],
		});
	});

	test('is unsupported and inert in windows that cannot switch, as in the Agents window', async () => {
		const testObject = new NullAgentsModeService();

		await testObject.setActive();

		assert.deepStrictEqual({
			isSupported: testObject.isSupported,
			isActive: testObject.isActive,
			windowFolders: testObject.windowFolders,
			onDidChange: testObject.onDidChange === Event.None,
		}, {
			isSupported: false,
			isActive: false,
			windowFolders: [],
			onDidChange: true,
		});
	});
});
