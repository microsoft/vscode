/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mockObject, upcastDeepPartial, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IDebugSession } from '../../common/debug.js';
import { DebugModel, ExceptionBreakpoint, FunctionBreakpoint, Thread } from '../../common/debugModel.js';
import { MockDebugStorage } from './mockDebug.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';

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
			return runWithFakedTimers({}, async () => {
				const topFrameDeferred = new DeferredPromise<void>();
				const wholeStackDeferred = new DeferredPromise<void>();
				const fakeThread = mockObject<Thread>()({
					session: upcastDeepPartial<IDebugSession>({ capabilities: { supportsDelayedStackTraceLoading: true } }),
					getCallStack: () => [],
					getStaleCallStack: () => [],
				});
				fakeThread.fetchCallStack.callsFake((levels: number) => {
					return levels === 1 ? topFrameDeferred.p : wholeStackDeferred.p;
				});
				fakeThread.getId.returns(1);

				const disposable = new DisposableStore();
				const storage = disposable.add(new TestStorageService());
				const model = new DebugModel(disposable.add(new MockDebugStorage(storage)), upcastPartial<ITextFileService>({ isDirty: (e: unknown) => false }), undefined!, new NullLogService());
				disposable.add(model);

				let top1Resolved = false;
				let whole1Resolved = false;
				let top2Resolved = false;
				let whole2Resolved = false;
				// eslint-disable-next-line local/code-no-any-casts
				const result1 = model.refreshTopOfCallstack(fakeThread as any);
				result1.topCallStack.then(() => top1Resolved = true);
				result1.wholeCallStack.then(() => whole1Resolved = true);

				// eslint-disable-next-line local/code-no-any-casts
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
});
