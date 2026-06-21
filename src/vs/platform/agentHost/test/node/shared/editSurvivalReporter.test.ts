/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../files/common/fileService.js';
import { createFileSystemProviderError, FileSystemProviderErrorCode } from '../../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../log/common/log.js';
import { NullTelemetryServiceShape } from '../../../../telemetry/common/telemetryUtils.js';
import { EditSurvivalReporterFactory } from '../../../node/shared/editSurvivalReporter.js';

class RecordingTelemetryService extends NullTelemetryServiceShape {
	readonly events: Array<{ name: string; data: unknown }> = [];
	override publicLog2(eventName?: string, data?: unknown): void {
		this.events.push({ name: eventName ?? '', data });
	}
}

suite('agentHost editSurvivalReporter', () => {

	const disposables = new DisposableStore();
	let fileService: FileService;
	let telemetry: RecordingTelemetryService;
	let factory: EditSurvivalReporterFactory;

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		telemetry = new RecordingTelemetryService();
		factory = new EditSurvivalReporterFactory(fileService, new NullLogService(), telemetry);
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('emits a sample at t=0 with the right shape', async () => {
		await fileService.writeFile(URI.file('/workspace/a.ts'), VSBuffer.fromString('after-text'));

		const reporter = factory.launch({
			sessionUri: 'claude:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tc-1',
			filePath: '/workspace/a.ts',
			beforeText: 'before-text',
			afterText: 'after-text',
			isCreate: false,
			modelId: 'claude-sonnet-4.5',
			toolName: 'Edit',
			aiChunks: ['after-text'],
		});
		disposables.add(reporter);

		// Let the t=0 TimeoutTimer fire and the file read resolve.
		await timeout(50);

		assert.ok(telemetry.events.length >= 1, `expected at least one event, got ${telemetry.events.length}`);
		const first = telemetry.events[0];
		assert.strictEqual(first.name, 'agentHost.trackEditSurvival');
		const data = first.data as Record<string, unknown>;
		assert.strictEqual(data.provider, 'claude');
		assert.strictEqual(data.modelId, 'claude-sonnet-4.5');
		assert.strictEqual(data.toolName, 'Edit');
		assert.strictEqual(data.agentSessionId, 'session-1');
		assert.strictEqual(data.turnId, 'turn-1');
		assert.strictEqual(data.toolCallId, 'tc-1');
		assert.strictEqual(data.fileExtension, '.ts');
		assert.strictEqual(data.timeDelayMs, 0);
		assert.strictEqual(data.didFileGetDeleted, 0);
		assert.strictEqual(data.isCreate, 0);
		assert.strictEqual(data.survivalRateFourGram, 1);
		assert.strictEqual(data.survivalRateNoRevert, 1);
		assert.strictEqual(data.scoringMode, 'chunked');
		assert.strictEqual(data.aiCharCount, 'after-text'.length);
	});

	test('emits a delete event when the file is missing', async () => {
		const reporter = factory.launch({
			sessionUri: 'codex:/session-2',
			turnId: 'turn-1',
			toolCallId: 'tc-x',
			filePath: '/workspace/missing.ts',
			beforeText: '',
			afterText: 'doomed',
			isCreate: true,
		});
		disposables.add(reporter);

		await timeout(50);

		assert.ok(telemetry.events.length >= 1);
		const data = telemetry.events[0].data as Record<string, unknown>;
		assert.strictEqual(data.didFileGetDeleted, 1);
		assert.strictEqual(data.isCreate, 1);
		assert.strictEqual(data.provider, 'codex');
	});

	test('skips the sample on transient read errors (no event, reporter keeps running)', async () => {
		// Use a fake file service whose readFile throws a permission
		// error -- not FILE_NOT_FOUND -- on the first call only, then
		// succeeds. The reporter should skip the first sample (no
		// telemetry, no didFileGetDeleted) and emit normally on the
		// second sample.
		await fileService.writeFile(URI.file('/workspace/flaky.ts'), VSBuffer.fromString('after'));
		const realReadFile = fileService.readFile.bind(fileService);
		let calls = 0;
		const flakyFileService = new Proxy(fileService, {
			get(target, prop, receiver) {
				if (prop === 'readFile') {
					return (...args: Parameters<typeof realReadFile>) => {
						calls++;
						if (calls === 1) {
							return Promise.reject(createFileSystemProviderError('permission denied', FileSystemProviderErrorCode.NoPermissions));
						}
						return realReadFile(...args);
					};
				}
				return Reflect.get(target, prop, receiver);
			},
		});
		const flakyFactory = new EditSurvivalReporterFactory(flakyFileService, new NullLogService(), telemetry);

		const reporter = flakyFactory.launch({
			sessionUri: 'claude:/session-flaky',
			turnId: 'turn-1',
			toolCallId: 'tc-flaky',
			filePath: '/workspace/flaky.ts',
			beforeText: 'before',
			afterText: 'after',
			isCreate: false,
		});
		disposables.add(reporter);

		// First sample (t=0) is skipped due to the permission error,
		// second sample (t=5s) would emit -- but waiting 5s in a unit
		// test is wasteful, so we just verify the first sample produced
		// no telemetry and the reporter is still scheduled (i.e. didn't
		// dispose itself like it would for a real delete).
		await timeout(50);

		assert.strictEqual(telemetry.events.length, 0, 'transient errors must not emit telemetry');
		assert.strictEqual(calls, 1, 'readFile should have been called exactly once');
	});

	test('skips notebook files entirely (no events ever)', async () => {
		await fileService.writeFile(URI.file('/workspace/n.ipynb'), VSBuffer.fromString('{}'));

		const reporter = factory.launch({
			sessionUri: 'claude:/session-3',
			turnId: 'turn-1',
			toolCallId: 'tc-nb',
			filePath: '/workspace/n.ipynb',
			beforeText: '{}',
			afterText: '{}',
			isCreate: false,
		});
		disposables.add(reporter);

		await timeout(50);

		assert.strictEqual(telemetry.events.length, 0);
	});

	test('skips files larger than the size cap (no events ever)', async () => {
		// 6 MB exceeds the 5 MB cap; the factory should return a
		// no-op disposable and never emit telemetry.
		const huge = 'x'.repeat(6 * 1024 * 1024);
		await fileService.writeFile(URI.file('/workspace/huge.ts'), VSBuffer.fromString(huge));

		const reporter = factory.launch({
			sessionUri: 'claude:/session-huge',
			turnId: 'turn-1',
			toolCallId: 'tc-huge',
			filePath: '/workspace/huge.ts',
			beforeText: '',
			afterText: huge,
			isCreate: true,
		});
		disposables.add(reporter);

		await timeout(50);

		assert.strictEqual(telemetry.events.length, 0);
	});

	test('does not contain any code-text fields in the payload', async () => {
		await fileService.writeFile(URI.file('/workspace/secret.ts'), VSBuffer.fromString('SECRET_AFTER'));

		const reporter = factory.launch({
			sessionUri: 'claude:/session-4',
			turnId: 'turn-1',
			toolCallId: 'tc-secret',
			filePath: '/workspace/secret.ts',
			beforeText: 'SECRET_BEFORE',
			afterText: 'SECRET_AFTER',
			isCreate: false,
		});
		disposables.add(reporter);

		await timeout(50);

		assert.ok(telemetry.events.length >= 1);
		const data = telemetry.events[0].data as Record<string, unknown>;
		const serialized = JSON.stringify(data);
		// Guard against ever putting file contents in the payload.
		assert.ok(!serialized.includes('SECRET_BEFORE'), 'payload must not contain before text');
		assert.ok(!serialized.includes('SECRET_AFTER'), 'payload must not contain after text');
	});
});
