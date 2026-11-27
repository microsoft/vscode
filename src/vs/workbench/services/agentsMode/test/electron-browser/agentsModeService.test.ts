/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { AgentsModeWorkspaceService } from '../../../configuration/browser/agents/agentsModeWorkspaceService.js';
import { IWorkbenchConfigurationService } from '../../../configuration/common/configuration.js';
import { NativeAgentsModeService } from '../../electron-browser/agentsModeService.js';

suite('NativeAgentsModeService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createNativeHostService(calls: boolean[]): INativeHostService {
		return new class extends mock<INativeHostService>() {
			override async setWindowAgentsMode(active: boolean): Promise<void> { calls.push(active); }
		};
	}

	function createAgentsModeWorkspaceService(): IWorkbenchConfigurationService {
		let isAgentsMode = false;
		const service = Object.create(AgentsModeWorkspaceService.prototype);
		Object.defineProperty(service, 'isAgentsMode', { get: () => isAgentsMode });
		Object.defineProperty(service, 'onDidChangeAgentsMode', { value: Event.None });
		Object.defineProperty(service, 'setAgentsMode', { value: async (enabled: boolean) => { isAgentsMode = enabled; } });
		return service;
	}

	test('tells main the mode of a window that switches, so that it restores the window in it', async () => {
		const calls: boolean[] = [];
		const testObject = new NativeAgentsModeService(createAgentsModeWorkspaceService(), createNativeHostService(calls));

		await testObject.setActive(true);
		await testObject.setActive(false);

		assert.deepStrictEqual(calls, [true, false]);
	});

	test('tells main nothing for a window that never supports the mode', async () => {
		const calls: boolean[] = [];
		const testObject = new NativeAgentsModeService(new class extends mock<IWorkbenchConfigurationService>() { }, createNativeHostService(calls));

		await testObject.setActive(true);

		assert.deepStrictEqual(calls, []);
	});
});
