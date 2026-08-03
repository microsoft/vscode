/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { IDiffComputeService } from '../../common/diffComputeService.js';
import { createFileEditContentDigest } from '../../common/fileEditAttribution.js';
import { AgentEditAttributionService } from '../../node/shared/agentEditAttributionService.js';
import { computeDiffCounts } from '../../node/diffWorkerMain.js';
import { TestDiffComputeService } from '../common/sessionTestHelpers.js';

suite('Agent Edit Attribution Service', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('emits retained Agent characters from disjoint edits', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const resource = URI.file('/workspace/file.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('aBcdeF'));

		const events: { eventName: string; data: Record<string, string | number | undefined> }[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDiffComputeService, {
			computeDiffCounts: async (original, modified, timeoutMs) => computeDiffCounts(original, modified, timeoutMs ?? 5_000),
		});
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, {
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2(eventName, data) {
				events.push({ eventName, data: data as Record<string, string | number | undefined> });
			},
		});
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, undefined, undefined));

		const marker = await service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'abcdef',
			afterText: 'aBcdeF',
			changes: [
				{ startOffset: 1, endOffsetExclusive: 2, newText: 'B' },
				{ startOffset: 5, endOffsetExclusive: 6, newText: 'F' },
			],
			modelId: 'model',
			toolName: 'edit',
		});
		await service.flushSession('copilot:/session-1');
		const acknowledged = await service.prepareFlush({
			resource,
			trigger: 'closed',
			statsUuid: 'stats-2',
			isDirty: false,
			flushToken: 'flush-standalone',
			languageId: 'typescript',
		});
		const acknowledgedOutcome = await service.commitFlush({
			flushToken: acknowledged!.flushToken,
			totalModifiedCount: 0,
		});

		assert.deepStrictEqual({
			marker: marker?.status !== 'skipped' && marker ? {
				version: marker.version,
				sequence: marker.sequence,
				editIdLength: marker.editId.length,
				beforeDigest: marker.beforeDigest,
				afterDigest: marker.afterDigest,
			} : marker,
			events: events.map(event => ({
				eventName: event.eventName,
				sourceKey: event.data.sourceKey,
				modifiedCount: event.data.modifiedCount,
				deltaModifiedCount: event.data.deltaModifiedCount,
				totalModifiedCount: event.data.totalModifiedCount,
				origin: event.data.origin,
				harness: event.data.harness,
			})),
			acknowledged: acknowledged && {
				agentModifiedCount: acknowledged.agentModifiedCount,
				outcome: acknowledgedOutcome,
			},
		}, {
			marker: {
				version: 1,
				sequence: 1,
				editIdLength: 36,
				beforeDigest: createFileEditContentDigest('abcdef'),
				afterDigest: createFileEditContentDigest('aBcdeF'),
			},
			events: [{
				eventName: 'editTelemetry.editSources.details',
				sourceKey: 'source:Chat.applyEdits-$modelId:model-$harness:copilot-$origin:agentHost',
				modifiedCount: 2,
				deltaModifiedCount: 2,
				totalModifiedCount: 2,
				origin: 'agentHost',
				harness: 'copilot',
			}],
			acknowledged: {
				agentModifiedCount: 2,
				outcome: {
					outcome: 'committed',
					agentModifiedCount: 2,
				},
			},
		});
	});

	test('preserves Agent attribution across later external disk edits', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const resource = URI.file('/workspace/file.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('axb'));

		const events: Record<string, string | number | undefined>[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDiffComputeService, {
			computeDiffCounts: async (original, modified, timeoutMs) => computeDiffCounts(original, modified, timeoutMs ?? 5_000),
		});
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, {
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2(_eventName, data) {
				events.push(data as Record<string, string | number | undefined>);
			},
		});
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, undefined, undefined));

		await service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'a',
			afterText: 'ab',
			changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: 'b' }],
			modelId: 'model',
			toolName: 'edit',
		});
		await service.flushSession('copilot:/session-1');

		assert.deepStrictEqual(events.map(event => ({
			modifiedCount: event.modifiedCount,
			deltaModifiedCount: event.deltaModifiedCount,
			totalModifiedCount: event.totalModifiedCount,
		})), [{
			modifiedCount: 1,
			deltaModifiedCount: 1,
			totalModifiedCount: 1,
		}]);
	});

	test('tracks creates and removes retained attribution after deletion', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const resource = URI.file('/workspace/file.ts');
		await fileService.writeFile(resource, VSBuffer.fromString(''));

		const events: Record<string, string | number | undefined>[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, {
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2(_eventName, data) {
				events.push(data as Record<string, string | number | undefined>);
			},
		});
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, undefined, undefined));
		const baseEdit = {
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-1',
			filePath: resource.fsPath,
			modelId: 'model',
			toolName: 'edit',
		};

		await service.recordEdit({
			...baseEdit,
			toolCallId: 'tool-create',
			beforeText: '',
			afterText: 'abc',
			changes: [{ startOffset: 0, endOffsetExclusive: 0, newText: 'abc' }],
		});
		await service.recordEdit({
			...baseEdit,
			toolCallId: 'tool-delete',
			beforeText: 'abc',
			afterText: '',
			changes: [{ startOffset: 0, endOffsetExclusive: 3, newText: '' }],
		});
		await service.flushSession('copilot:/session-1');

		assert.deepStrictEqual(events.map(event => ({
			modifiedCount: event.modifiedCount,
			deltaModifiedCount: event.deltaModifiedCount,
			totalModifiedCount: event.totalModifiedCount,
		})), [{
			modifiedCount: 0,
			deltaModifiedCount: 3,
			totalModifiedCount: 0,
		}]);
	});

	test('flushes Agent-only resources when HEAD changes', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const resource = URI.file('/workspace/file.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('ab'));

		const triggers: string[] = [];
		let head = 'head-1';
		let branch = 'main';
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, {
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2(_eventName, data) {
				triggers.push((data as { trigger: string }).trigger);
			},
		});
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => ({
			root: '/workspace',
			branch,
			head,
		}), undefined));
		await service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'a',
			afterText: 'ab',
			changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: 'b' }],
			modelId: 'model',
			toolName: 'edit',
		});

		head = 'head-2';
		await service.checkGitState();
		await fileService.writeFile(resource, VSBuffer.fromString('abc'));
		await service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-2',
			toolCallId: 'tool-2',
			filePath: resource.fsPath,
			beforeText: 'ab',
			afterText: 'abc',
			changes: [{ startOffset: 2, endOffsetExclusive: 2, newText: 'c' }],
			modelId: 'model',
			toolName: 'edit',
		});
		branch = 'feature';
		await service.checkGitState();

		assert.deepStrictEqual(triggers, ['hashChange', 'branchChange']);
	});

	test('continues a Git-triggered flush after one resource fails', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		const provider = disposables.add(new class extends InMemoryFileSystemProvider {
			failPath: string | undefined;

			override async readFile(resource: URI): Promise<Uint8Array> {
				if (resource.path === this.failPath) {
					throw new Error('Read failed');
				}
				return super.readFile(resource);
			}
		}());
		disposables.add(fileService.registerProvider('file', provider));
		const failingResource = URI.file('/workspace/failing.ts');
		const successfulResource = URI.file('/workspace/successful.ts');
		await fileService.writeFile(failingResource, VSBuffer.fromString('ab'));
		await fileService.writeFile(successfulResource, VSBuffer.fromString('ab'));

		let branch = 'main';
		let eventCount = 0;
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, {
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2() {
				eventCount++;
			},
		});
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => ({
			root: '/workspace',
			branch,
			head: 'head-1',
		}), undefined));
		for (const [toolCallId, resource] of [['tool-failing', failingResource], ['tool-successful', successfulResource]] as const) {
			await service.recordEdit({
				sessionUri: 'copilot:/session-1',
				turnId: 'turn-1',
				toolCallId,
				filePath: resource.fsPath,
				beforeText: 'a',
				afterText: 'ab',
				changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: 'b' }],
				modelId: 'model',
				toolName: 'edit',
			});
		}
		provider.failPath = failingResource.path;
		branch = 'feature';

		await service.checkGitState();
		const eventCountAfterFailure = eventCount;
		provider.failPath = undefined;
		await service.checkGitState();

		assert.deepStrictEqual({
			eventCountAfterFailure,
			eventCountAfterRetry: eventCount,
		}, {
			eventCountAfterFailure: 1,
			eventCountAfterRetry: 2,
		});
	});

	test('keeps a Git boundary pending while an edit is being recorded', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const resource = URI.file('/workspace/file.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('ab'));

		const bridgeStarted = new DeferredPromise<void>();
		const bridgeResult = new DeferredPromise<ReturnType<typeof computeDiffCounts>>();
		let branch = 'main';
		let eventCount = 0;
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDiffComputeService, {
			async computeDiffCounts(original, modified, timeoutMs) {
				if (original === 'ab' && modified === 'ac') {
					bridgeStarted.complete();
					return bridgeResult.p;
				}
				return computeDiffCounts(original, modified, timeoutMs ?? 5_000);
			},
		});
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, {
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2() {
				eventCount++;
			},
		});
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => ({
			root: '/workspace',
			branch,
			head: 'head-1',
		}), undefined));
		await service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'a',
			afterText: 'ab',
			changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: 'b' }],
			modelId: 'model',
			toolName: 'edit',
		});

		const recording = service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-2',
			toolCallId: 'tool-2',
			filePath: resource.fsPath,
			beforeText: 'ac',
			afterText: 'acd',
			changes: [{ startOffset: 2, endOffsetExclusive: 2, newText: 'd' }],
			modelId: 'model',
			toolName: 'edit',
		});
		await bridgeStarted.p;
		await fileService.writeFile(resource, VSBuffer.fromString('acd'));
		branch = 'feature';
		await service.checkGitState();
		const eventCountWhileRecording = eventCount;
		bridgeResult.complete(computeDiffCounts('ab', 'ac', 5_000));
		await recording;
		await service.checkGitState();

		assert.deepStrictEqual({
			eventCountWhileRecording,
			eventCountAfterRecording: eventCount,
		}, {
			eventCountWhileRecording: 0,
			eventCountAfterRecording: 1,
		});
	});

	test('serializes a new edit behind a failing Git flush', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		const readStarted = new DeferredPromise<void>();
		const readResult = new DeferredPromise<Uint8Array>();
		const provider = disposables.add(new class extends InMemoryFileSystemProvider {
			blockReads = false;

			override async readFile(resource: URI): Promise<Uint8Array> {
				if (this.blockReads) {
					readStarted.complete();
					return readResult.p;
				}
				return super.readFile(resource);
			}
		}());
		disposables.add(fileService.registerProvider('file', provider));
		const resource = URI.file('/workspace/file.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('ab'));

		let branch = 'main';
		const retainedCounts: number[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, {
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2(_eventName, data) {
				retainedCounts.push((data as { modifiedCount: number }).modifiedCount);
			},
		});
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => ({
			root: '/workspace',
			branch,
			head: 'head-1',
		}), undefined));
		await service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'a',
			afterText: 'ab',
			changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: 'b' }],
			modelId: 'model',
			toolName: 'edit',
		});
		provider.blockReads = true;
		branch = 'feature';

		const boundaryFlush = service.checkGitState();
		await readStarted.p;
		await fileService.writeFile(resource, VSBuffer.fromString('abc'));
		const recording = service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-2',
			toolCallId: 'tool-2',
			filePath: resource.fsPath,
			beforeText: 'ab',
			afterText: 'abc',
			changes: [{ startOffset: 2, endOffsetExclusive: 2, newText: 'c' }],
			modelId: 'model',
			toolName: 'edit',
		});
		await readResult.error(new Error('Read failed'));
		await boundaryFlush;
		await recording;
		provider.blockReads = false;
		await service.checkGitState();

		assert.deepStrictEqual(retainedCounts, [2]);
	});

	test('does not retain attribution when usage telemetry is disabled', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, disposables.add(new FileService(new NullLogService())));
		instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, { telemetryLevel: TelemetryLevel.NONE });
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, undefined, undefined));

		const marker = await service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: '/workspace/file.ts',
			beforeText: 'a',
			afterText: 'ab',
			changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: 'b' }],
			modelId: 'model',
			toolName: 'edit',
		});

		assert.strictEqual(marker, undefined);
	});

	test('discards attribution when edit telemetry is disabled', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const resource = URI.file('/workspace/file.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('ab'));

		let eventCount = 0;
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, {
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2() {
				eventCount++;
			},
		});
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => undefined, undefined));
		await service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'a',
			afterText: 'ab',
			changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: 'b' }],
			modelId: 'model',
			toolName: 'edit',
		});

		service.setEnabled(false);
		const marker = await service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-2',
			toolCallId: 'tool-2',
			filePath: resource.fsPath,
			beforeText: 'ab',
			afterText: 'abc',
			changes: [{ startOffset: 2, endOffsetExclusive: 2, newText: 'c' }],
			modelId: 'model',
			toolName: 'edit',
		});
		await service.flushSession('copilot:/session-1');

		assert.deepStrictEqual({ marker, eventCount }, { marker: undefined, eventCount: 0 });
	});

	test('fences in-flight attribution after edit telemetry is disabled', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		const repositoryReadStarted = new DeferredPromise<void>();
		const repositoryRead = new DeferredPromise<undefined>();
		let eventCount = 0;
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, {
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2() {
				eventCount++;
			},
		});
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => {
			repositoryReadStarted.complete();
			return repositoryRead.p;
		}, undefined));

		const recordEdit = service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: '/workspace/file.ts',
			beforeText: 'a',
			afterText: 'ab',
			changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: 'b' }],
			modelId: 'model',
			toolName: 'edit',
		});
		await repositoryReadStarted.p;
		service.setEnabled(false);
		service.setEnabled(true);
		repositoryRead.complete(undefined);

		const marker = await recordEdit;
		await service.flushSession('copilot:/session-1');

		assert.deepStrictEqual({ marker, eventCount }, { marker: undefined, eventCount: 0 });
	});

	test('signals files larger than the five MB attribution limit', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const resource = URI.file('/workspace/large.ts');
		const beforeText = 'a'.repeat(6 * 1024 * 1024);
		const afterText = `${beforeText}b`;
		await fileService.writeFile(resource, VSBuffer.fromString(afterText));

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, {
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2() { },
		});
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => undefined, undefined));

		const marker = await service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText,
			afterText,
			changes: [{ startOffset: beforeText.length, endOffsetExclusive: beforeText.length, newText: 'b' }],
			modelId: 'model',
			toolName: 'edit',
		});
		await service.flushSession('copilot:/session-1');

		assert.deepStrictEqual(marker && {
			status: marker.status,
			reason: marker.status === 'skipped' ? marker.reason : undefined,
			insertedCount: marker.status === 'skipped' ? marker.insertedCount : undefined,
		}, {
			status: 'skipped',
			reason: 'fileTooLarge',
			insertedCount: 1,
		});
	});

	test('returns a marker when the interval safety limit flushes the resource', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const resource = URI.file('/workspace/file.ts');
		const characters = Array.from('a'.repeat(20_001));
		const changes = [];
		for (let offset = 0; offset < characters.length; offset += 2) {
			characters[offset] = 'b';
			changes.push({ startOffset: offset, endOffsetExclusive: offset + 1, newText: 'b' });
		}
		const afterText = characters.join('');
		await fileService.writeFile(resource, VSBuffer.fromString(afterText));

		let eventCount = 0;
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, {
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2() {
				eventCount++;
			},
		});
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => undefined, undefined));

		const marker = await service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'a'.repeat(20_001),
			afterText,
			changes,
			modelId: 'model',
			toolName: 'edit',
		});

		assert.deepStrictEqual({
			status: marker?.status,
			eventCount,
		}, {
			status: undefined,
			eventCount: 1,
		});
	});

	test('retries expired non-repository lookups', async () => {
		let now = 0;
		let repositoryReadCount = 0;
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, disposables.add(new FileService(new NullLogService())));
		instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, { telemetryLevel: TelemetryLevel.USAGE });
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => {
			repositoryReadCount++;
			return undefined;
		}, () => now));

		await service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: '/workspace/file.ts',
			beforeText: 'a',
			afterText: 'ab',
			changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: 'b' }],
			modelId: 'model',
			toolName: 'edit',
		});
		await service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-2',
			toolCallId: 'tool-2',
			filePath: '/workspace/file.ts',
			beforeText: 'ab',
			afterText: 'abc',
			changes: [{ startOffset: 2, endOffsetExclusive: 2, newText: 'c' }],
			modelId: 'model',
			toolName: 'edit',
		});
		now = 10 * 60 * 1000 + 1;
		await service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-3',
			toolCallId: 'tool-3',
			filePath: '/workspace/file.ts',
			beforeText: 'abc',
			afterText: 'abcd',
			changes: [{ startOffset: 3, endOffsetExclusive: 3, newText: 'd' }],
			modelId: 'model',
			toolName: 'edit',
		});

		assert.strictEqual(repositoryReadCount, 2);
	});

	test('flushes only the closing session when sessions edit the same file', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const resource = URI.file('/workspace/file.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('abc'));

		const events: Record<string, string | number | undefined>[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDiffComputeService, {
			computeDiffCounts: async (original, modified, timeoutMs) => computeDiffCounts(original, modified, timeoutMs ?? 5_000),
		});
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, {
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2(_eventName, data) {
				events.push(data as Record<string, string | number | undefined>);
			},
		});
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => undefined, undefined));
		await service.recordEdit({
			sessionUri: 'copilot:/session-a',
			turnId: 'turn-a',
			toolCallId: 'tool-a',
			filePath: resource.fsPath,
			beforeText: 'a',
			afterText: 'ab',
			changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: 'b' }],
			modelId: 'model',
			toolName: 'edit',
		});
		await service.recordEdit({
			sessionUri: 'copilot:/session-b',
			turnId: 'turn-b',
			toolCallId: 'tool-b',
			filePath: resource.fsPath,
			beforeText: 'ab',
			afterText: 'abc',
			changes: [{ startOffset: 2, endOffsetExclusive: 2, newText: 'c' }],
			modelId: 'model',
			toolName: 'edit',
		});

		await service.flushSession('copilot:/session-a');
		const afterFirstFlush = events.map(event => event.conversationId);
		await service.flushSession('copilot:/session-b');

		assert.deepStrictEqual({
			afterFirstFlush,
			allEvents: events.map(event => ({
				conversationId: event.conversationId,
				modifiedCount: event.modifiedCount,
				deltaModifiedCount: event.deltaModifiedCount,
			})),
		}, {
			afterFirstFlush: ['session-a'],
			allEvents: [
				{ conversationId: 'session-a', modifiedCount: 1, deltaModifiedCount: 1 },
				{ conversationId: 'session-b', modifiedCount: 1, deltaModifiedCount: 1 },
			],
		});
	});

	test('coordinates a live session after another session flushed the same file', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const resource = URI.file('/workspace/file.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('abc'));

		const events: Record<string, string | number | undefined>[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, {
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2(_eventName, data) {
				events.push(data as Record<string, string | number | undefined>);
			},
		});
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => undefined, undefined));
		await service.recordEdit({
			sessionUri: 'copilot:/session-a',
			turnId: 'turn-a',
			toolCallId: 'tool-a',
			filePath: resource.fsPath,
			beforeText: 'a',
			afterText: 'ab',
			changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: 'b' }],
			modelId: 'model',
			toolName: 'edit',
		});
		await service.recordEdit({
			sessionUri: 'copilot:/session-b',
			turnId: 'turn-b',
			toolCallId: 'tool-b',
			filePath: resource.fsPath,
			beforeText: 'ab',
			afterText: 'abc',
			changes: [{ startOffset: 2, endOffsetExclusive: 2, newText: 'c' }],
			modelId: 'model',
			toolName: 'edit',
		});
		await service.flushSession('copilot:/session-a');

		const prepared = await service.prepareFlush({
			resource,
			trigger: 'closed',
			statsUuid: 'stats-1',
			isDirty: false,
			flushToken: 'flush-1',
			languageId: 'typescript',
		});
		await service.commitFlush({ flushToken: prepared!.flushToken, totalModifiedCount: prepared!.agentModifiedCount });

		assert.deepStrictEqual(events.map(event => ({
			conversationId: event.conversationId,
			modifiedCount: event.modifiedCount,
		})), [
			{ conversationId: 'session-a', modifiedCount: 0 },
			{ conversationId: 'session-b', modifiedCount: 1 },
		]);
	});

	test('claims a resource once when flush triggers race', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const resource = URI.file('/workspace/file.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('ab'));

		let eventCount = 0;
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, {
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2() {
				eventCount++;
			},
		});
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => undefined, undefined));
		await service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'a',
			afterText: 'ab',
			changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: 'b' }],
			modelId: 'model',
			toolName: 'edit',
		});

		const [_, prepared] = await Promise.all([
			service.flushSession('copilot:/session-1'),
			service.prepareFlush({
				resource,
				trigger: 'closed',
				statsUuid: 'stats-1',
				isDirty: false,
				flushToken: 'flush-1',
				languageId: 'typescript',
			}),
		]);

		assert.deepStrictEqual({
			prepared: prepared && {
				agentModifiedCount: prepared.agentModifiedCount,
				lastSequence: prepared.lastSequence,
			},
			eventCount,
		}, {
			prepared: {
				agentModifiedCount: 1,
				lastSequence: 1,
			},
			eventCount: 1,
		});
	});

	test('coordinates Windows resources when path casing differs', async () => {
		if (!isWindows) {
			return;
		}
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const resource = URI.file('/workspace/file.ts');
		const filePath = URI.file('/Workspace/file.ts').fsPath;
		await fileService.createFolder(URI.file('/Workspace'));
		await fileService.writeFile(URI.file(filePath), VSBuffer.fromString('ab'));

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, {
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2() { },
		});
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => undefined, undefined));
		await service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath,
			beforeText: 'a',
			afterText: 'ab',
			changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: 'b' }],
			modelId: 'model',
			toolName: 'edit',
		});

		const prepared = await service.prepareFlush({
			resource,
			trigger: 'closed',
			statsUuid: 'stats-1',
			isDirty: false,
			flushToken: 'flush-1',
			languageId: 'typescript',
		});

		assert.deepStrictEqual(prepared && {
			flushToken: prepared.flushToken,
			agentModifiedCount: prepared.agentModifiedCount,
		}, {
			flushToken: 'flush-1',
			agentModifiedCount: 1,
		});
	});

	test('restores prepared resources when a coordinated flush is cancelled', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const resource = URI.file('/workspace/file.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('ab'));

		let eventCount = 0;
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, {
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2() {
				eventCount++;
			},
		});
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => undefined, undefined));
		await service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'a',
			afterText: 'ab',
			changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: 'b' }],
			modelId: 'model',
			toolName: 'edit',
		});
		const prepared = await service.prepareFlush({
			resource,
			trigger: 'closed',
			statsUuid: 'stats-1',
			isDirty: false,
			flushToken: 'flush-1',
			languageId: 'typescript',
		});

		await service.cancelFlush({ flushToken: prepared!.flushToken });
		await service.flushSession('copilot:/session-1');

		assert.strictEqual(eventCount, 1);
	});

	test('waits for an in-flight prepare before cancelling it', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		const readStarted = new DeferredPromise<void>();
		const readResult = new DeferredPromise<Uint8Array>();
		const provider = disposables.add(new class extends InMemoryFileSystemProvider {
			blockReads = false;

			override async readFile(resource: URI): Promise<Uint8Array> {
				if (this.blockReads) {
					readStarted.complete();
					return readResult.p;
				}
				return super.readFile(resource);
			}
		}());
		disposables.add(fileService.registerProvider('file', provider));
		const resource = URI.file('/workspace/file.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('ab'));

		let eventCount = 0;
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, {
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2() {
				eventCount++;
			},
		});
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => undefined, undefined));
		await service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'a',
			afterText: 'ab',
			changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: 'b' }],
			modelId: 'model',
			toolName: 'edit',
		});
		provider.blockReads = true;

		const prepare = service.prepareFlush({
			resource,
			trigger: 'closed',
			statsUuid: 'stats-1',
			isDirty: false,
			flushToken: 'flush-1',
			languageId: 'typescript',
		});
		await readStarted.p;
		const cancel = service.cancelFlush({ flushToken: 'flush-1' });
		readResult.complete(VSBuffer.fromString('ab').buffer);
		const [prepared, cancelOutcome] = await Promise.all([prepare, cancel]);
		provider.blockReads = false;
		await service.flushSession('copilot:/session-1');

		assert.deepStrictEqual({
			prepared: prepared?.agentModifiedCount,
			cancelOutcome,
			eventCount,
		}, {
			prepared: 1,
			cancelOutcome: { outcome: 'cancelled', agentModifiedCount: 0 },
			eventCount: 1,
		});
	});

	test('reserves standalone ownership for one prepared flush', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const resource = URI.file('/workspace/file.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('ab'));

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, {
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2() { },
		});
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => undefined, undefined));
		await service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'a',
			afterText: 'ab',
			changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: 'b' }],
			modelId: 'model',
			toolName: 'edit',
		});
		await service.flushSession('copilot:/session-1');

		const first = await service.prepareFlush({
			resource,
			trigger: 'closed',
			statsUuid: 'stats-1',
			isDirty: false,
			flushToken: 'flush-1',
			languageId: 'typescript',
		});
		const duplicate = await service.prepareFlush({
			resource,
			trigger: 'closed',
			statsUuid: 'stats-2',
			isDirty: false,
			flushToken: 'flush-2',
			languageId: 'typescript',
		});
		await service.cancelFlush({ flushToken: 'flush-1' });
		const restored = await service.prepareFlush({
			resource,
			trigger: 'closed',
			statsUuid: 'stats-3',
			isDirty: false,
			flushToken: 'flush-3',
			languageId: 'typescript',
		});
		await service.cancelFlush({ flushToken: 'flush-3' });

		assert.deepStrictEqual({
			first: first?.agentModifiedCount,
			duplicate,
			restored: restored?.agentModifiedCount,
		}, {
			first: 1,
			duplicate: undefined,
			restored: 1,
		});
	});

	test('makes commit and cancellation idempotent after telemetry is emitted', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const resource = URI.file('/workspace/file.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('ab'));

		let eventCount = 0;
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, {
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2() {
				eventCount++;
			},
		});
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => undefined, undefined));
		await service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'a',
			afterText: 'ab',
			changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: 'b' }],
			modelId: 'model',
			toolName: 'edit',
		});
		await service.prepareFlush({
			resource,
			trigger: 'closed',
			statsUuid: 'stats-1',
			isDirty: false,
			flushToken: 'flush-1',
			languageId: 'typescript',
		});

		const outcomes = [
			await service.commitFlush({ flushToken: 'flush-1', totalModifiedCount: 1 }),
			await service.commitFlush({ flushToken: 'flush-1', totalModifiedCount: 1 }),
			await service.cancelFlush({ flushToken: 'flush-1' }),
		];

		assert.deepStrictEqual({ outcomes, eventCount }, {
			outcomes: [
				{ outcome: 'committed', agentModifiedCount: 1 },
				{ outcome: 'committed', agentModifiedCount: 1 },
				{ outcome: 'committed', agentModifiedCount: 1 },
			],
			eventCount: 1,
		});
	});

	test('restores an unclaimed prepared flush after its timeout', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const resource = URI.file('/workspace/file.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('ab'));

		let eventCount = 0;
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, {
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2() {
				eventCount++;
			},
		});
		let now = 0;
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => undefined, () => now));
		await service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'a',
			afterText: 'ab',
			changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: 'b' }],
			modelId: 'model',
			toolName: 'edit',
		});
		await service.prepareFlush({
			resource,
			trigger: 'closed',
			statsUuid: 'stats-1',
			isDirty: false,
			flushToken: 'flush-1',
			languageId: 'typescript',
		});

		now = 5 * 60 * 1000 + 1;
		await service.checkGitState();
		const commitOutcome = await service.commitFlush({ flushToken: 'flush-1', totalModifiedCount: 1 });
		await service.flushSession('copilot:/session-1');

		assert.deepStrictEqual({ commitOutcome, eventCount }, {
			commitOutcome: { outcome: 'cancelled', agentModifiedCount: 0 },
			eventCount: 1,
		});
	});

	test('fences a prepare request that arrives after cancellation', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		const resource = URI.file('/workspace/file.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('ab'));

		let eventCount = 0;
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, {
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2() {
				eventCount++;
			},
		});
		const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => undefined, undefined));
		await service.recordEdit({
			sessionUri: 'copilot:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'a',
			afterText: 'ab',
			changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: 'b' }],
			modelId: 'model',
			toolName: 'edit',
		});

		const cancelOutcome = await service.cancelFlush({ flushToken: 'flush-1' });
		const prepared = await service.prepareFlush({
			resource,
			trigger: 'closed',
			statsUuid: 'stats-1',
			isDirty: false,
			flushToken: 'flush-1',
			languageId: 'typescript',
		});
		await service.flushSession('copilot:/session-1');

		assert.deepStrictEqual({ cancelOutcome, prepared, eventCount }, {
			cancelOutcome: { outcome: 'cancelled', agentModifiedCount: 0 },
			prepared: undefined,
			eventCount: 1,
		});
	});
});
