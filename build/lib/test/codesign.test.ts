/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test, type TestContext } from 'node:test';
import { $, ProcessOutput } from 'zx';
import { monitorCodesignProcess, streamProcessOutputAndCheckResult } from '../../azure-pipelines/common/codesign.ts';

const minute = 60 * 1000;

function createDiagnostics(context: TestContext) {
	let elapsed = 1000;
	const messages: string[] = [];
	context.mock.timers.enable({ apis: ['setTimeout'] });
	context.mock.method(console, 'log', (message: string) => { messages.push(message); });
	return {
		messages,
		now: () => elapsed,
		tick: (duration: number) => {
			elapsed += duration;
			context.mock.timers.tick(duration);
		}
	};
}

suite('Codesign diagnostics', () => {
	test('reports completion time and clears the warning timer on success', async context => {
		const clock = createDiagnostics(context);
		const process = Promise.withResolvers<void>();
		const monitored = monitorCodesignProcess('Codesign deb package', process.promise, clock.now);

		clock.tick(10 * minute);
		process.resolve();
		await monitored;
		clock.tick(30 * minute);

		assert.deepStrictEqual({
			originalPromise: monitored === process.promise,
			messages: clock.messages,
		}, {
			originalPromise: true,
			messages: ['\nCodesign deb package process completed. Elapsed process time: 600000 ms'],
		});
	});

	test('warns once at twenty minutes without interrupting signing', async context => {
		const clock = createDiagnostics(context);
		const process = Promise.withResolvers<void>();
		const monitored = monitorCodesignProcess('Codesign deb package', process.promise, clock.now);

		clock.tick(20 * minute - 1);
		const beforeThreshold = [...clock.messages];
		clock.tick(1);
		const atThreshold = [...clock.messages];
		clock.tick(10 * minute);
		process.resolve();
		await monitored;
		clock.tick(30 * minute);

		const warning = '##vso[task.logissue type=warning]Codesign deb package has been running for at least 20 minutes. Inspect the ESRP logs for upload, sign/wait, and download timings. Signing will continue.';
		assert.deepStrictEqual({ beforeThreshold, atThreshold, messages: clock.messages }, {
			beforeThreshold: [],
			atThreshold: [warning],
			messages: [warning, '\nCodesign deb package process completed. Elapsed process time: 1800000 ms'],
		});
	});

	test('does not include time spent awaiting deb in rpm timing or warnings', async context => {
		const clock = createDiagnostics(context);
		const deb = Promise.withResolvers<void>();
		const rpm = Promise.withResolvers<void>();
		const monitoredDeb = monitorCodesignProcess('Codesign deb package', deb.promise, clock.now);
		const monitoredRpm = monitorCodesignProcess('Codesign rpm package', rpm.promise, clock.now);
		const consumeInOrder = async () => {
			await monitoredDeb;
			await monitoredRpm;
		};
		const consumed = consumeInOrder();

		clock.tick(10 * minute);
		rpm.resolve();
		await Promise.resolve();
		clock.tick(55 * minute);
		deb.resolve();
		await consumed;
		clock.tick(30 * minute);

		assert.deepStrictEqual(clock.messages, [
			'\nCodesign rpm package process completed. Elapsed process time: 600000 ms',
			'##vso[task.logissue type=warning]Codesign deb package has been running for at least 20 minutes. Inspect the ESRP logs for upload, sign/wait, and download timings. Signing will continue.',
			'\nCodesign deb package process completed. Elapsed process time: 3900000 ms',
		]);
	});

	test('preserves failures, clears the timer, and does not log error details', async context => {
		const clock = createDiagnostics(context);
		const process = Promise.withResolvers<void>();
		const error = new Error('Synthetic signing credential: do not log');
		const monitored = monitorCodesignProcess('Codesign rpm package', process.promise, clock.now);

		clock.tick(minute);
		process.reject(error);
		await assert.rejects(monitored, actual => actual === error);
		clock.tick(30 * minute);

		assert.deepStrictEqual(clock.messages, [
			'\nCodesign rpm package process failed. Elapsed process time: 60000 ms',
		]);
	});

	test('cleans up and preserves a failure after the warning', async context => {
		const clock = createDiagnostics(context);
		const process = Promise.withResolvers<void>();
		const error = new Error('Synthetic signing failure');
		const monitored = monitorCodesignProcess('Codesign rpm package', process.promise, clock.now);

		clock.tick(25 * minute);
		process.reject(error);
		await assert.rejects(monitored, actual => actual === error);
		clock.tick(30 * minute);

		assert.deepStrictEqual(clock.messages, [
			'##vso[task.logissue type=warning]Codesign rpm package has been running for at least 20 minutes. Inspect the ESRP logs for upload, sign/wait, and download timings. Signing will continue.',
			'\nCodesign rpm package process failed. Elapsed process time: 1500000 ms',
		]);
	});

	test('retains an early rpm failure until deb has been awaited', async context => {
		const clock = createDiagnostics(context);
		const deb = Promise.withResolvers<void>();
		const rpm = Promise.withResolvers<void>();
		const error = new Error('Synthetic rpm signing failure');
		const monitoredDeb = monitorCodesignProcess('Codesign deb package', deb.promise, clock.now);
		const monitoredRpm = monitorCodesignProcess('Codesign rpm package', rpm.promise, clock.now);

		clock.tick(minute);
		rpm.reject(error);
		await Promise.resolve();
		clock.tick(9 * minute);
		deb.resolve();
		await monitoredDeb;
		await assert.rejects(monitoredRpm, actual => actual === error);
		clock.tick(30 * minute);

		assert.deepStrictEqual(clock.messages, [
			'\nCodesign rpm package process failed. Elapsed process time: 60000 ms',
			'\nCodesign deb package process completed. Elapsed process time: 600000 ms',
		]);
	});
});

suite('Codesign output streaming', () => {
	test('uses each original process duration when reusing stdout', async context => {
		const messages: string[] = [];
		context.mock.method(console, 'log', (message: string) => { messages.push(message); });
		const deb = $({ quiet: true })`${process.execPath} -e ${''}`;
		const rpm = $({ quiet: true })`${process.execPath} -e ${''}`;
		const [debOutput, rpmOutput] = await Promise.all([deb, rpm]);
		context.mock.getter(debOutput, 'duration', () => 65 * minute);
		context.mock.getter(rpmOutput, 'duration', () => 10 * minute);

		await streamProcessOutputAndCheckResult('Codesign deb package', deb);
		await streamProcessOutputAndCheckResult('Codesign rpm package', rpm);

		assert.deepStrictEqual(messages, [
			'\nCodesign deb package completed successfully. Duration: 3900000 ms',
			'\nCodesign rpm package completed successfully. Duration: 600000 ms',
		]);
	});

	test('checks a failed result even after streaming a successful process', async () => {
		const success = $({ quiet: true })`${process.execPath} -e ${''}`;
		await streamProcessOutputAndCheckResult('Codesign deb package', success);
		const failure = $({ quiet: true, nothrow: true })`${process.execPath} -e ${'process.stderr.write("Synthetic signing failure"); process.exitCode = 1;'}`;

		await assert.rejects(streamProcessOutputAndCheckResult('Codesign rpm package', failure), {
			message: 'Codesign rpm package failed: Synthetic signing failure',
		});
	});

	test('propagates rejection from the original process', async () => {
		const failure = $({ quiet: true })`${process.execPath} -e ${'process.exitCode = 1;'}`;
		await assert.rejects(streamProcessOutputAndCheckResult('Codesign rpm package', failure), error =>
			error instanceof ProcessOutput && error.exitCode === 1
		);
	});
});
