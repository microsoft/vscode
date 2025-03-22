/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mockObject } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { DebugModel, ExceptionBreakpoint, FunctionBreakpoint, Thread } from '../../common/debugModel.js';
import { MockDebugStorage } from './mockDebug.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';

suite('DebugModel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('FunctionBreakpoint', () => {
		test('Id is saved', () => {
			const fbp = new FunctionBreakpoint({ name: 'function', enabled: true, hitCondition: 'hit condition', condition: 'condition', logMessage: 'log message' });
			const strigified = JSON.stringify(fbp);
			const parsed = JSON.parse(strigified);
			assert.equal(parsed.id, fbp.getId());
		});
	});

	suite('ExceptionBreakpoint', () => {
		test('Restored matches new', () => {
			const ebp = new ExceptionBreakpoint({
				conditionDescription: 'condition description',
				description: 'description',
				filter: 'condition',
				label: 'label',
				supportsCondition: true,
				enabled: true,
			}, 'id');
			const strigified = JSON.stringify(ebp);
			const parsed = JSON.parse(strigified);
			const newEbp = new ExceptionBreakpoint(parsed);
			assert.ok(ebp.matches(newEbp));
		});
	});

	suite('DebugModel', () => {
		test('refreshTopOfCallstack resolves all returned promises when called multiple times', async () => {
			const topFrameDeferred = new DeferredPromise<void>();
			const wholeStackDeferred = new DeferredPromise<void>();
			const fakeThread = mockObject<Thread>()({
				session: { capabilities: { supportsDelayedStackTraceLoading: true } } as any,
				getCallStack: () => [],
				getStaleCallStack: () => [],
			});
			fakeThread.fetchCallStack.callsFake((levels: number) => {
				return levels === 1 ? topFrameDeferred.p : wholeStackDeferred.p;
			});
			fakeThread.getId.returns(1);

			const disposable = new DisposableStore();
			const storage = disposable.add(new TestStorageService());
			const model = new DebugModel(disposable.add(new MockDebugStorage(storage)), <any>{ isDirty: (e: any) => false }, undefined!, new NullLogService());
			disposable.add(model);

			let top1Resolved = false;
			let whole1Resolved = false;
			let top2Resolved = false;
			let whole2Resolved = false;
			const result1 = model.refreshTopOfCallstack(fakeThread as any);
			result1.topCallStack.then(() => top1Resolved = true);
			result1.wholeCallStack.then(() => whole1Resolved = true);

			const result2 = model.refreshTopOfCallstack(fakeThread as any);
			result2.topCallStack.then(() => top2Resolved = true);
			result2.wholeCallStack.then(() => whole2Resolved = true);

			assert.ok(!top1Resolved);
			assert.ok(!whole1Resolved);
			assert.ok(!top2Resolved);
			assert.ok(!whole2Resolved);

			await topFrameDeferred.complete();
			await result1.topCallStack;
			await result2.topCallStack;
			assert.ok(!whole1Resolved);
			assert.ok(!whole2Resolved);

			await wholeStackDeferred.complete();
			await result1.wholeCallStack;
			await result2.wholeCallStack;

			disposable.dispose();
		});
	});

	suite('Breakpoints', () => {
		test('updateBreakpoints should preserve properties when updating', async () => {
			const disposable = new DisposableStore();

			try {
				const storage = disposable.add(new TestStorageService());
				const model = new DebugModel(
					disposable.add(new MockDebugStorage(storage)),
					<any>{ isDirty: () => false },
					{ getUriIdentity: (uri: any) => uri.toString() } as any,
					new NullLogService()
				);
				disposable.add(model);

				const uri = { toString: () => 'file:///test.js' } as any;
				model.addBreakpoints(uri, [{
					lineNumber: 10,
					column: undefined,
					enabled: true,
				}]);

				let breakpoints = model.getBreakpoints();
				assert.strictEqual(breakpoints.length, 1);
				const breakpointId = breakpoints[0].getId();
				assert.strictEqual(breakpoints[0].logMessage, undefined);
				assert.strictEqual(breakpoints[0].condition, undefined);

				const updateDataLogMessage = new Map<string, { logMessage: string }>();
				updateDataLogMessage.set(breakpointId, { logMessage: 'Initial log message' });
				model.updateBreakpoints(updateDataLogMessage);

				breakpoints = model.getBreakpoints();
				assert.strictEqual(breakpoints[0].logMessage, 'Initial log message');
				assert.strictEqual(breakpoints[0].condition, undefined);

				const updateDataCondition = new Map<string, {
					condition: string;
					hitCondition: undefined;
					logMessage: undefined;
				}>();
				updateDataCondition.set(breakpointId, {
					condition: 'x === 42',
					hitCondition: undefined,
					logMessage: undefined
				});
				model.updateBreakpoints(updateDataCondition);

				breakpoints = model.getBreakpoints();
				assert.strictEqual(breakpoints[0].condition, 'x === 42');
				assert.strictEqual(breakpoints[0].logMessage, 'Initial log message');

				const updateSecondDataCondition = new Map<string, {
					condition: string;
					hitCondition: undefined;
					logMessage: undefined;
				}>();
				updateSecondDataCondition.set(breakpointId, {
					condition: 'x === 43',
					hitCondition: undefined,
					logMessage: undefined
				});
				model.updateBreakpoints(updateSecondDataCondition);

				breakpoints = model.getBreakpoints();
				assert.strictEqual(breakpoints[0].condition, 'x === 43');
				assert.strictEqual(breakpoints[0].logMessage, 'Initial log message');

			} finally {
				disposable.dispose();
			}
		});
	});
});
