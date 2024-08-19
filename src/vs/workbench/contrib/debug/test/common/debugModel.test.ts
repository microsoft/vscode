/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from 'vs/base/common/async';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { mockObject } from 'vs/base/test/common/mock';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { NullLogService } from 'vs/platform/log/common/log';
import { DebugModel, ExceptionBreakpoint, FunctionBreakpoint, Thread } from 'vs/workbench/contrib/debug/common/debugModel';
import { MockDebugStorage } from 'vs/workbench/contrib/debug/test/common/mockDebug';
import { TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';

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
});
