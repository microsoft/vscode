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
import { IDebugSession, IInstructionBreakpoint } from '../../common/debug.js';
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

	suite('InstructionBreakpoint', () => {
		function createModel(disposable: DisposableStore): DebugModel {
			const storage = disposable.add(new TestStorageService());
			const model = new DebugModel(
				disposable.add(new MockDebugStorage(storage)),
				upcastPartial<ITextFileService>({ isDirty: (_: unknown) => false }),
				undefined!,
				new NullLogService()
			);
			disposable.add(model);
			return model;
		}

		// Regression test for microsoft/vscode#289678: if the debug adapter hands
		// out a new `instructionReference` for the same memory location (e.g.
		// after a symbol reload or certain stepping operations), removal by
		// reference+offset must still succeed when the caller supplies the
		// resolved address.
		test('removeInstructionBreakpoints prefers address match when instructionReference has changed', () => {
			const disposable = new DisposableStore();
			try {
				const model = createModel(disposable);
				const address = BigInt(0x1000);
				model.addInstructionBreakpoint({
					instructionReference: 'oldRef',
					offset: 0,
					address,
					canPersist: false,
					enabled: true,
					hitCondition: undefined,
					condition: undefined,
					logMessage: undefined,
				});

				assert.strictEqual(model.getInstructionBreakpoints().length, 1);

				// Simulate the disassembly view asking for removal after the
				// debug adapter handed out a new instruction reference.
				model.removeInstructionBreakpoints('newRef', 0, address);

				assert.strictEqual(model.getInstructionBreakpoints().length, 0);
			} finally {
				disposable.dispose();
			}
		});

		test('removeInstructionBreakpoints falls back to instructionReference+offset when address not supplied', () => {
			const disposable = new DisposableStore();
			try {
				const model = createModel(disposable);
				model.addInstructionBreakpoint({
					instructionReference: 'ref',
					offset: 4,
					address: BigInt(0x2000),
					canPersist: false,
					enabled: true,
					hitCondition: undefined,
					condition: undefined,
					logMessage: undefined,
				});

				// Non-matching reference leaves the breakpoint in place.
				model.removeInstructionBreakpoints('other', 4);
				assert.strictEqual(model.getInstructionBreakpoints().length, 1);

				// Matching reference+offset removes it.
				model.removeInstructionBreakpoints('ref', 4);
				assert.strictEqual(model.getInstructionBreakpoints().length, 0);
			} finally {
				disposable.dispose();
			}
		});

		test('removeInstructionBreakpoints with only address removes the matching entry and leaves others', () => {
			const disposable = new DisposableStore();
			try {
				const model = createModel(disposable);
				const keep: IInstructionBreakpoint[] = [];

				model.addInstructionBreakpoint({
					instructionReference: 'refA',
					offset: 0,
					address: BigInt(0x3000),
					canPersist: false,
					enabled: true,
					hitCondition: undefined,
					condition: undefined,
					logMessage: undefined,
				});
				model.addInstructionBreakpoint({
					instructionReference: 'refB',
					offset: 0,
					address: BigInt(0x4000),
					canPersist: false,
					enabled: true,
					hitCondition: undefined,
					condition: undefined,
					logMessage: undefined,
				});

				model.removeInstructionBreakpoints(undefined, undefined, BigInt(0x3000));

				const remaining = model.getInstructionBreakpoints();
				assert.strictEqual(remaining.length, 1);
				assert.strictEqual(remaining[0].address, BigInt(0x4000));
				keep.push(...remaining);
				assert.strictEqual(keep.length, 1);
			} finally {
				disposable.dispose();
			}
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
