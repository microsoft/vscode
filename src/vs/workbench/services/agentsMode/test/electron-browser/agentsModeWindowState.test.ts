/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { INativeWorkbenchEnvironmentService } from '../../../environment/electron-browser/environmentService.js';
import { IAgentsModeService } from '../../common/agentsMode.js';
import { AgentsModeWindowStateContribution } from '../../electron-browser/agentsMode.contribution.js';

suite('AgentsModeWindowStateContribution', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createNativeHostService(calls: boolean[]): INativeHostService {
		return new class extends mock<INativeHostService>() {
			override async setWindowAgentsMode(active: boolean): Promise<void> { calls.push(active); }
		};
	}

	function createEnvironmentService(agentsMode: boolean | undefined): INativeWorkbenchEnvironmentService {
		return new class extends mock<INativeWorkbenchEnvironmentService>() {
			override readonly window = { id: 1, colorScheme: { dark: false, highContrast: false }, perfMarks: [], agentsMode };
		};
	}

	function createAgentsModeService(isActive: boolean): { service: IAgentsModeService; change(active: boolean): void } {
		const onDidChange = disposables.add(new Emitter<boolean>());
		const service = new class extends mock<IAgentsModeService>() {
			override isActive = isActive;
			override readonly onDidChange = onDidChange.event;
		};
		return { service, change: active => { service.isActive = active; onDidChange.fire(active); } };
	}

	test('tells main every change of the mode, also one that does not go through setActive', () => {
		const calls: boolean[] = [];
		const agentsMode = createAgentsModeService(false);
		disposables.add(new AgentsModeWindowStateContribution(agentsMode.service, createNativeHostService(calls), createEnvironmentService(undefined)));

		agentsMode.change(true);
		agentsMode.change(false); // for example the configuration service initializing for another workspace

		assert.deepStrictEqual(calls, [true, false]);
	});

	test('clears main\'s record when the window started in the mode but cannot apply it', () => {
		const calls: boolean[] = [];
		disposables.add(new AgentsModeWindowStateContribution(createAgentsModeService(false).service, createNativeHostService(calls), createEnvironmentService(true)));

		assert.deepStrictEqual(calls, [false]);
	});

	test('tells main nothing at startup when the window restored in its mode or never entered it', () => {
		const calls: boolean[] = [];
		disposables.add(new AgentsModeWindowStateContribution(createAgentsModeService(true).service, createNativeHostService(calls), createEnvironmentService(true)));
		disposables.add(new AgentsModeWindowStateContribution(createAgentsModeService(false).service, createNativeHostService(calls), createEnvironmentService(undefined)));

		assert.deepStrictEqual(calls, []);
	});

	test('reports a failure to tell main as an unexpected error', async () => {
		const errors: string[] = [];
		const previousHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(error => errors.push(error.message));
		try {
			const nativeHostService = new class extends mock<INativeHostService>() {
				override async setWindowAgentsMode(): Promise<void> { throw new Error('window closed'); }
			};
			const agentsMode = createAgentsModeService(false);
			disposables.add(new AgentsModeWindowStateContribution(agentsMode.service, nativeHostService, createEnvironmentService(undefined)));

			agentsMode.change(true);
			await Promise.resolve();
			await Promise.resolve();

			assert.deepStrictEqual(errors, ['window closed']);
		} finally {
			setUnexpectedErrorHandler(previousHandler);
		}
	});
});
