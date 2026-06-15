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
import { InMemoryFileSystemProvider } from '../../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../log/common/log.js';
import { NullTelemetryServiceShape } from '../../../../telemetry/common/telemetryUtils.js';
import type { ClassifiedEvent, IGDPRProperty, OmitMetadata, StrictPropertyCheck } from '../../../../telemetry/common/gdprTypings.js';
import { EditSurvivalReporterFactory } from '../../../node/shared/editSurvivalReporter.js';

class RecordingTelemetryService extends NullTelemetryServiceShape {
	readonly events: Array<{ name: string; data: unknown }> = [];
	override publicLog2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>): void {
		this.events.push({ name: eventName, data });
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
		});
		disposables.add(reporter);

		// Let the t=0 TimeoutTimer fire and the file read resolve.
		await timeout(50);

		assert.ok(telemetry.events.length >= 1, `expected at least one event, got ${telemetry.events.length}`);
		const first = telemetry.events[0];
		assert.strictEqual(first.name, 'agentHost.trackEditSurvival');
		const data = first.data as Record<string, unknown>;
		assert.strictEqual(data.provider, 'claude');
		assert.strictEqual(data.agentSessionId, 'session-1');
		assert.strictEqual(data.turnId, 'turn-1');
		assert.strictEqual(data.toolCallId, 'tc-1');
		assert.strictEqual(data.fileExtension, '.ts');
		assert.strictEqual(data.timeDelayMs, 0);
		assert.strictEqual(data.didFileGetDeleted, 0);
		assert.strictEqual(data.isCreate, 0);
		assert.strictEqual(data.survivalRateFourGram, 1);
		assert.strictEqual(data.survivalRateNoRevert, 1);
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
