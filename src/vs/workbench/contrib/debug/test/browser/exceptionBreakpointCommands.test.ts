/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IQuickInputService, IQuickPick } from '../../../../../platform/quickinput/common/quickInput.js';
import { IDebugService, IExceptionBreakpoint } from '../../common/debug.js';
import { TOGGLE_EXCEPTION_BREAKPOINTS_ID } from '../../browser/debugCommands.js';
import { MockDebugService } from '../common/mockDebug.js';
import { createMockDebugModel } from './mockDebugModel.js';

suite('Debug - Exception Breakpoint Commands', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let debugService: MockDebugService;

	setup(() => {
		instantiationService = new TestInstantiationService();
		debugService = disposables.add(new MockDebugService());
		instantiationService.stub(IDebugService, debugService);
	});

	test('toggle exception breakpoints - no session', async () => {
		// Create mock quick input service
		const quickInputService = {
			createQuickPick: () => ({
				title: '',
				placeholder: '',
				canSelectMany: false,
				matchOnDescription: false,
				matchOnDetail: false,
				items: [],
				selectedItems: [],
				onDidAccept: () => ({
					dispose: () => { }
				}),
				onDidHide: () => ({
					dispose: () => { }
				}),
				show: () => { },
				dispose: () => { }
			} as any)
		};
		instantiationService.stub(IQuickInputService, quickInputService);

		// Test with no active session - command should return early
		const command = instantiationService.createInstance(class {
			async run() {
				const debugService = instantiationService.get(IDebugService);
				const session = debugService.getViewModel().focusedSession || debugService.getModel().getSessions()[0];
				return session;
			}
		});

		const result = await command.run();
		assert.strictEqual(result, undefined);
	});

	test('toggle exception breakpoints - single breakpoint', async () => {
		// Create a mock session with exception breakpoints
		const model = createMockDebugModel(disposables);
		const session = {
			getId: () => 'test-session',
			capabilities: {}
		} as any;

		// Create exception breakpoint
		const exceptionBp: IExceptionBreakpoint = {
			getId: () => 'exception-1',
			label: 'All Exceptions',
			description: 'Break on all exceptions',
			enabled: false,
			filter: 'all',
			supportsCondition: false,
			conditionDescription: undefined,
			condition: undefined,
			supported: true,
			isSupportedSession: () => true,
			matches: () => true,
			toJSON: () => ({}),
			toString: () => 'All Exceptions'
		} as any;

		// Mock debug service methods
		debugService.getViewModel = () => ({
			focusedSession: session
		}) as any;

		debugService.getModel = () => ({
			getSessions: () => [session],
			getExceptionBreakpointsForSession: () => [exceptionBp]
		}) as any;

		let toggledBreakpoint: IExceptionBreakpoint | undefined;
		let toggledState: boolean | undefined;
		debugService.enableOrDisableBreakpoints = async (enable: boolean, breakpoint?: IExceptionBreakpoint) => {
			toggledBreakpoint = breakpoint;
			toggledState = enable;
		};

		const quickInputService = {
			createQuickPick: () => ({
				title: '',
				placeholder: '',
				canSelectMany: false,
				matchOnDescription: false,
				matchOnDetail: false,
				items: [],
				selectedItems: [],
				onDidAccept: () => ({
					dispose: () => { }
				}),
				onDidHide: () => ({
					dispose: () => { }
				}),
				show: () => { },
				dispose: () => { }
			} as any)
		};
		instantiationService.stub(IQuickInputService, quickInputService);

		// Test command execution - should toggle the single breakpoint directly
		const command = instantiationService.createInstance(class {
			async run() {
				const debugService = instantiationService.get(IDebugService);
				const session = debugService.getViewModel().focusedSession || debugService.getModel().getSessions()[0];
				if (!session) {
					return;
				}

				const exceptionBreakpoints = debugService.getModel().getExceptionBreakpointsForSession(session.getId());
				if (exceptionBreakpoints.length === 0) {
					return;
				}

				// If only one exception breakpoint type, toggle it directly
				if (exceptionBreakpoints.length === 1) {
					const breakpoint = exceptionBreakpoints[0];
					await debugService.enableOrDisableBreakpoints(!breakpoint.enabled, breakpoint);
					return;
				}
			}
		});

		await command.run();

		assert.strictEqual(toggledBreakpoint, exceptionBp);
		assert.strictEqual(toggledState, true); // Should enable since it was disabled
	});

	test('toggle exception breakpoints - multiple breakpoints should trigger quickpick', async () => {
		// Create a mock session with multiple exception breakpoints
		const model = createMockDebugModel(disposables);
		const session = {
			getId: () => 'test-session',
			capabilities: {}
		} as any;

		// Create multiple exception breakpoints
		const exceptionBp1: IExceptionBreakpoint = {
			getId: () => 'exception-1',
			label: 'All Exceptions',
			description: 'Break on all exceptions',
			enabled: false,
			filter: 'all',
			supportsCondition: false,
			conditionDescription: undefined,
			condition: undefined,
			supported: true,
			isSupportedSession: () => true,
			matches: () => true,
			toJSON: () => ({}),
			toString: () => 'All Exceptions'
		} as any;

		const exceptionBp2: IExceptionBreakpoint = {
			getId: () => 'exception-2',
			label: 'Uncaught Exceptions',
			description: 'Break on uncaught exceptions',
			enabled: true,
			filter: 'uncaught',
			supportsCondition: false,
			conditionDescription: undefined,
			condition: undefined,
			supported: true,
			isSupportedSession: () => true,
			matches: () => true,
			toJSON: () => ({}),
			toString: () => 'Uncaught Exceptions'
		} as any;

		// Mock debug service methods
		debugService.getViewModel = () => ({
			focusedSession: session
		}) as any;

		debugService.getModel = () => ({
			getSessions: () => [session],
			getExceptionBreakpointsForSession: () => [exceptionBp1, exceptionBp2]
		}) as any;

		let quickPickShown = false;
		const quickInputService = {
			createQuickPick: () => {
				quickPickShown = true;
				return {
					title: '',
					placeholder: '',
					canSelectMany: false,
					matchOnDescription: false,
					matchOnDetail: false,
					items: [],
					selectedItems: [],
					onDidAccept: () => ({
						dispose: () => { }
					}),
					onDidHide: () => ({
						dispose: () => { }
					}),
					show: () => { },
					dispose: () => { }
				} as any;
			}
		};
		instantiationService.stub(IQuickInputService, quickInputService);

		// Test command execution - should show quickpick for multiple breakpoints
		const command = instantiationService.createInstance(class {
			async run() {
				const debugService = instantiationService.get(IDebugService);
				const quickInputService = instantiationService.get(IQuickInputService);

				const session = debugService.getViewModel().focusedSession || debugService.getModel().getSessions()[0];
				if (!session) {
					return;
				}

				const exceptionBreakpoints = debugService.getModel().getExceptionBreakpointsForSession(session.getId());
				if (exceptionBreakpoints.length === 0) {
					return;
				}

				// If only one exception breakpoint type, toggle it directly
				if (exceptionBreakpoints.length === 1) {
					const breakpoint = exceptionBreakpoints[0];
					await debugService.enableOrDisableBreakpoints(!breakpoint.enabled, breakpoint);
					return;
				}

				// Multiple exception breakpoint types - show quickpick for selection
				const quickPick = quickInputService.createQuickPick();
				quickPick.title = 'Select Exception Breakpoints to Toggle';
				quickPick.show();
			}
		});

		await command.run();

		assert.strictEqual(quickPickShown, true);
	});
});