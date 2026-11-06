/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { useFakeTimers } from 'sinon';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { CopilotForkTiming } from '../../node/copilot/copilotForkTiming.js';

suite('CopilotForkTiming', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const messages: string[] = [];
		const warnings: string[] = [];
		const log = new class extends NullLogService {
			override info(message: string): void { messages.push(message); }
			override warn(message: string): void { warnings.push(message); }
		}();
		const timing = disposables.add(new CopilotForkTiming(log, URI.parse('test:///target'), URI.parse('test:///source'), 'turn-1'));
		const normalized = () => messages.map(message => message
			.replaceAll(timing.attemptId, '<attempt>')
			.replace(/(?<field>elapsedMs|totalElapsedMs)=\d+/g, '$<field>=<ms>'));
		return { timing, messages, warnings, normalized };
	}

	test('pairs every stage and the total with one attempt id', () => {
		const { timing, normalized } = setup();
		timing.startStage('sdkFork');
		timing.startStage('copyDatabase');
		timing.complete('success');
		timing.dispose();

		assert.deepStrictEqual(normalized(), [
			'[CopilotFork] Started: attemptId=<attempt>, chat=test:/target, sourceChat=test:/source, sourceTurnId=turn-1',
			'[CopilotFork] Stage started: attemptId=<attempt>, stage=queue, totalElapsedMs=<ms>',
			'[CopilotFork] Stage settled: attemptId=<attempt>, stage=queue, outcome=success, elapsedMs=<ms>, totalElapsedMs=<ms>',
			'[CopilotFork] Stage started: attemptId=<attempt>, stage=sdkFork, totalElapsedMs=<ms>',
			'[CopilotFork] Stage settled: attemptId=<attempt>, stage=sdkFork, outcome=success, elapsedMs=<ms>, totalElapsedMs=<ms>',
			'[CopilotFork] Stage started: attemptId=<attempt>, stage=copyDatabase, totalElapsedMs=<ms>',
			'[CopilotFork] Stage settled: attemptId=<attempt>, stage=copyDatabase, outcome=success, elapsedMs=<ms>, totalElapsedMs=<ms>',
			'[CopilotFork] Settled: attemptId=<attempt>, outcome=success, failedStages=0, elapsedMs=<ms>',
		]);
	});

	test('records a failed active stage when creation throws and disposes its timing', () => {
		const { timing, normalized } = setup();
		timing.startStage('forkBoundary');
		timing.dispose();

		assert.deepStrictEqual(normalized().slice(-2), [
			'[CopilotFork] Stage settled: attemptId=<attempt>, stage=forkBoundary, outcome=error, elapsedMs=<ms>, totalElapsedMs=<ms>',
			'[CopilotFork] Settled: attemptId=<attempt>, outcome=error, failedStages=1, elapsedMs=<ms>',
		]);
	});

	test('keeps best-effort copy failures distinct from a fully successful fork', () => {
		const { timing, normalized } = setup();
		timing.startStage('copyDatabase');
		timing.finishStage('error');
		timing.startStage('runtimeInitialization');
		timing.complete('success');

		assert.deepStrictEqual(normalized().slice(-3), [
			'[CopilotFork] Stage started: attemptId=<attempt>, stage=runtimeInitialization, totalElapsedMs=<ms>',
			'[CopilotFork] Stage settled: attemptId=<attempt>, stage=runtimeInitialization, outcome=success, elapsedMs=<ms>, totalElapsedMs=<ms>',
			'[CopilotFork] Settled: attemptId=<attempt>, outcome=successWithWarnings, failedStages=1, elapsedMs=<ms>',
		]);
	});

	test('reports the current stage after 60 seconds and cancels obsolete stall warnings', () => {
		const clock = useFakeTimers();
		disposables.add(toDisposable(() => clock.restore()));
		const { timing, warnings } = setup();
		clock.tick(59_999);
		assert.strictEqual(warnings.length, 0);
		timing.startStage('sdkFork');
		clock.tick(59_999);
		assert.strictEqual(warnings.length, 0);
		clock.tick(1);
		const stalled = warnings.map(message => message.includes(`attemptId=${timing.attemptId}, stage=sdkFork, elapsedMs=`));
		timing.complete('success');
		clock.tick(60_000);

		assert.deepStrictEqual({ stalled, warningCount: warnings.length, timers: clock.countTimers() }, { stalled: [true], warningCount: 1, timers: 0 });
	});
});
