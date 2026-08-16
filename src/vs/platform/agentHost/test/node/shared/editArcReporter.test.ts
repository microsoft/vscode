/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, raceTimeout, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../files/common/fileService.js';
import { IFileSystemWatcher, IWatchOptionsWithoutCorrelation } from '../../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../log/common/log.js';
import { TelemetryMeasurements, TelemetryProps } from '../../../node/agentHostRestrictedTelemetry.js';
import { NullTelemetryServiceShape } from '../../../../telemetry/common/telemetryUtils.js';
import { TelemetryLevel } from '../../../../telemetry/common/telemetry.js';
import { EditArcReporterService } from '../../../node/shared/editArcReporter.js';
import { TestDiffComputeService, createNoopGitService } from '../../common/sessionTestHelpers.js';
import { IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { IAgentHostGitService } from '../../../common/agentHostGitService.js';
import { buildSubagentChatUri } from '../../../common/state/sessionState.js';
import { IDetailedDiffResult, IDiffComputeService } from '../../../common/diffComputeService.js';
import { AgentHostClientType } from '../../../common/agentHostClientInfo.js';
import { AgentHostClientConnectionKind, AgentHostLaunchKind, AgentHostTransportKind } from '../../../common/agentHostTelemetry.js';

class CountingFileService extends FileService {
	watcherCount = 0;

	override createWatcher(resource: URI, options: IWatchOptionsWithoutCorrelation & { recursive: false }): IFileSystemWatcher {
		this.watcherCount++;
		return super.createWatcher(resource, options);
	}
}

class RecordingTelemetryService extends NullTelemetryServiceShape {
	readonly events: Array<{ name: string; data: Record<string, unknown> }> = [];
	readonly githubEvents: Array<{ name: string; properties: TelemetryProps | undefined; measurements: TelemetryMeasurements | undefined }> = [];
	onEvent: ((event: { name: string; data: Record<string, unknown> }) => void) | undefined;

	constructor() {
		super();
		Object.defineProperty(this, 'telemetryLevel', { value: TelemetryLevel.USAGE });
	}

	override publicLog2(eventName?: string, data?: Record<string, unknown>): void {
		const event = { name: eventName ?? '', data: data ?? {} };
		this.events.push(event);
		this.onEvent?.(event);
	}

	updateTelemetryLevel(): void { }

	sendGHTelemetryEvent(name: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		this.githubEvents.push({ name, properties, measurements });
	}
}

suite('Agent Host Edit ARC Reporter', () => {
	const disposables = new DisposableStore();
	let fileService: CountingFileService;
	let telemetry: RecordingTelemetryService;
	let config: TestAgentConfigurationService;

	setup(() => {
		fileService = disposables.add(new CountingFileService(new NullLogService()));
		disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		telemetry = new RecordingTelemetryService();
		config = createConfigurationService(true, disposables);
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('emits the locked Microsoft and GitHub event shape', async () => {
		const resource = URI.file('/workspace/file.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('hello AI'));
		const service = disposables.add(new EditArcReporterService([0, 30, 60], fileService, new TestDiffComputeService(), createNoopGitService(), config, new NullLogService(), telemetry));

		await service.reportEdit({
			clientContext: {
				clientType: AgentHostClientType.EditorWindow,
				connectionKind: AgentHostClientConnectionKind.RemoteExtensionHost,
				transportKind: AgentHostTransportKind.MessagePort,
				hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
				machineId: 'client-machine-id',
				devDeviceId: 'client-dev-device-id',
			},
			sessionUri: 'copilotcli:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'hello',
			afterText: 'hello AI',
			initialEdit: { replacements: [{ start: 5, endExclusive: 5, text: ' AI' }] },
			modelId: 'gpt-5',
			toolName: 'edit',
			completionTime: Date.now(),
		});
		await timeout(10);

		const event = telemetry.events[0];
		assert.deepStrictEqual({
			name: event.name,
			data: { ...event.data, uniqueEditId: '<uuid>' },
			githubName: telemetry.githubEvents[0]?.name,
			githubIdentity: {
				initiatorMachineId: telemetry.githubEvents[0]?.properties?.initiatorMachineId,
				initiatorDevDeviceId: telemetry.githubEvents[0]?.properties?.initiatorDevDeviceId,
			},
		}, {
			name: 'editTelemetry.reportEditArc',
			data: {
				initiatorClientType: 'editor_window',
				initiatorConnectionKind: 'remote_extension_host',
				initiatorTransportKind: 'message_port',
				hostLaunchKind: 'vscode_main_process',
				initiatorMachineId: 'client-machine-id',
				initiatorDevDeviceId: 'client-dev-device-id',
				sourceKeyCleaned: 'source:Chat.applyEdits',
				extensionId: undefined,
				extensionVersion: undefined,
				opportunityId: undefined,
				editSessionId: 'session-1',
				requestId: 'turn-1',
				modelId: 'gpt-5',
				languageId: undefined,
				mode: undefined,
				uniqueEditId: '<uuid>',
				provider: 'copilotcli',
				agentSessionId: 'session-1',
				isSubagentSession: 'false',
				didBranchChange: 0,
				timeDelayMs: 0,
				originalCharCount: 3,
				originalLineCount: 1,
				originalDeletedLineCount: 1,
				arc: 3,
				currentLineCount: 1,
				currentDeletedLineCount: 1,
			},
			githubName: 'vscode.editTelemetry.reportEditArc',
			githubIdentity: {
				initiatorMachineId: undefined,
				initiatorDevDeviceId: undefined,
			},
		});
	});

	test('reports edits from subagent chat channels', async () => {
		const resource = URI.file('/workspace/subagent.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('hello AI'));
		const service = disposables.add(new EditArcReporterService([0], fileService, new TestDiffComputeService(), createNoopGitService(), config, new NullLogService(), telemetry));

		await service.reportEdit({
			sessionUri: buildSubagentChatUri('copilotcli:/session-1', 'parent-tool'),
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'hello',
			afterText: 'hello AI',
			initialEdit: { replacements: [{ start: 5, endExclusive: 5, text: ' AI' }] },
			completionTime: Date.now(),
		});
		await timeout(10);

		assert.deepStrictEqual({
			editSessionId: telemetry.events[0].data.editSessionId,
			agentSessionId: telemetry.events[0].data.agentSessionId,
			isSubagentSession: telemetry.events[0].data.isSubagentSession,
		}, {
			editSessionId: 'session-1',
			agentSessionId: 'session-1',
			isSubagentSession: 'true',
		});
	});

	test('updates older reporters before starting the next reporter', async () => {
		const resource = URI.file('/workspace/order.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('AIbase'));
		const service = disposables.add(new EditArcReporterService([0, 30, 60], fileService, new TestDiffComputeService(), createNoopGitService(), config, new NullLogService(), telemetry));
		const completionTime = Date.now();

		await service.reportEdit({
			sessionUri: 'claude:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'base',
			afterText: 'AIbase',
			initialEdit: { replacements: [{ start: 0, endExclusive: 0, text: 'AI' }] },
			completionTime,
		});
		await timeout(10);
		const firstEditId = telemetry.events[0].data.uniqueEditId;
		const finalSampleEmitted = new DeferredPromise<void>();
		telemetry.onEvent = event => {
			if (event.data.uniqueEditId === firstEditId && event.data.timeDelayMs === 60) {
				finalSampleEmitted.complete();
			}
		};

		await fileService.writeFile(resource, VSBuffer.fromString('Abase'));
		await service.reportEdit({
			sessionUri: 'claude:/session-1',
			turnId: 'turn-2',
			toolCallId: 'tool-2',
			filePath: resource.fsPath,
			beforeText: 'AIbase',
			afterText: 'Abase',
			initialEdit: { replacements: [{ start: 1, endExclusive: 2, text: '' }] },
			completionTime: Date.now(),
		});
		const samplingCompleted = await raceTimeout(Promise.all([finalSampleEmitted.p]), 5_000);

		assert.deepStrictEqual({
			samplingCompleted: samplingCompleted !== undefined,
			events: telemetry.events
				.filter(event => event.data.uniqueEditId === firstEditId)
				.map(event => ({ timeDelayMs: event.data.timeDelayMs, arc: event.data.arc })),
		}, {
			samplingCompleted: true,
			events: [
				{ timeDelayMs: 0, arc: 2 },
				{ timeDelayMs: 30, arc: 1 },
				{ timeDelayMs: 60, arc: 1 },
			],
		});
		assert.deepStrictEqual(telemetry.githubEvents, []);
	});

	test('does not create a reporter after reconciliation state is disposed', async () => {
		const detailedStarted = new DeferredPromise<void>();
		const detailedResult = new DeferredPromise<IDetailedDiffResult>();
		const diffComputeService: IDiffComputeService = {
			_serviceBrand: undefined,
			computeDiffCounts: async () => ({ added: 0, removed: 0, changes: [] }),
			computeDetailedDiff: async () => {
				detailedStarted.complete();
				return detailedResult.p;
			},
		};
		const resource = URI.file('/workspace/stale.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('AIbase'));
		const service = disposables.add(new EditArcReporterService([0, 60_000], fileService, diffComputeService, createNoopGitService(), config, new NullLogService(), telemetry));
		await service.reportEdit({
			sessionUri: 'claude:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'base',
			afterText: 'AIbase',
			initialEdit: { replacements: [{ start: 0, endExclusive: 0, text: 'AI' }] },
			completionTime: Date.now(),
		});
		await timeout(10);

		const secondReport = service.reportEdit({
			sessionUri: 'claude:/session-1',
			turnId: 'turn-2',
			toolCallId: 'tool-2',
			filePath: resource.fsPath,
			beforeText: 'unrelated',
			afterText: 'newbase',
			initialEdit: { replacements: [{ start: 0, endExclusive: 9, text: 'newbase' }] },
			completionTime: Date.now(),
		});
		await detailedStarted.p;
		config.setEnabled(false);
		config.setEnabled(true);
		detailedResult.complete({
			added: 1,
			removed: 1,
			replacements: [{ start: 0, endExclusive: 6, text: 'newbase' }],
			hitTimeout: false,
		});
		await secondReport;
		await timeout(10);

		assert.deepStrictEqual(telemetry.events.map(event => event.data.requestId), ['turn-1']);
	});

	test('does not create resource watchers after the host reporter limit is reached', async () => {
		const service = disposables.add(new EditArcReporterService([60_000], fileService, new TestDiffComputeService(), createNoopGitService(), config, new NullLogService(), telemetry));

		for (let index = 0; index <= 200; index++) {
			await service.reportEdit({
				sessionUri: 'claude:/session-1',
				turnId: `turn-${index}`,
				toolCallId: `tool-${index}`,
				filePath: `/workspace/file-${index}.ts`,
				beforeText: '',
				afterText: 'AI',
				initialEdit: { replacements: [{ start: 0, endExclusive: 0, text: 'AI' }] },
				completionTime: Date.now(),
			});
		}

		assert.strictEqual(fileService.watcherCount, 200);
	});

	test('disposes active reporters when edit telemetry is disabled', async () => {
		const resource = URI.file('/workspace/disabled.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('hello AI'));
		const service = disposables.add(new EditArcReporterService([0, 30, 60], fileService, new TestDiffComputeService(), createNoopGitService(), config, new NullLogService(), telemetry));

		await service.reportEdit({
			sessionUri: 'claude:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'hello',
			afterText: 'hello AI',
			initialEdit: { replacements: [{ start: 5, endExclusive: 5, text: ' AI' }] },
			completionTime: Date.now(),
		});
		await timeout(10);
		config.setEnabled(false);
		await timeout(70);

		assert.deepStrictEqual(telemetry.events.map(event => event.data.timeDelayMs), [0]);
	});

	test('continues sampling after a sample fails', async () => {
		const resource = URI.file('/workspace/failure.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('hello AI'));
		const sampleFailed = new DeferredPromise<void>();
		const finalSampleEmitted = new DeferredPromise<void>();
		telemetry.onEvent = event => {
			if (event.data.timeDelayMs === 60) {
				finalSampleEmitted.complete();
			}
		};
		let branchLookupCount = 0;
		const gitService: IAgentHostGitService = {
			...createNoopGitService(),
			getCurrentBranchName: async () => {
				branchLookupCount++;
				if (branchLookupCount === 3) {
					sampleFailed.complete();
					throw new Error('branch lookup failed');
				}
				return 'main';
			},
		};
		const service = disposables.add(new EditArcReporterService([0, 30, 60], fileService, new TestDiffComputeService(), gitService, config, new NullLogService(), telemetry));

		await service.reportEdit({
			sessionUri: 'claude:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'hello',
			afterText: 'hello AI',
			initialEdit: { replacements: [{ start: 5, endExclusive: 5, text: ' AI' }] },
			completionTime: Date.now(),
		});
		const samplingCompleted = await raceTimeout(Promise.all([sampleFailed.p, finalSampleEmitted.p]), 5_000);

		assert.deepStrictEqual({
			samplingCompleted: samplingCompleted !== undefined,
			timeDelays: telemetry.events.map(event => event.data.timeDelayMs),
		}, {
			samplingCompleted: true,
			timeDelays: [0, 60],
		});
	});

	test('reports symbolic branch changes', async () => {
		const resource = URI.file('/workspace/branch.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('hello AI'));
		let branch = 'main';
		const gitService: IAgentHostGitService = {
			...createNoopGitService(),
			getCurrentBranchName: async () => branch,
		};
		const service = disposables.add(new EditArcReporterService([0, 30], fileService, new TestDiffComputeService(), gitService, config, new NullLogService(), telemetry));

		await service.reportEdit({
			sessionUri: 'claude:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'hello',
			afterText: 'hello AI',
			initialEdit: { replacements: [{ start: 5, endExclusive: 5, text: ' AI' }] },
			completionTime: Date.now(),
		});
		await timeout(10);
		branch = 'feature';
		await timeout(40);

		assert.deepStrictEqual(telemetry.events.map(event => ({
			timeDelayMs: event.data.timeDelayMs,
			didBranchChange: event.data.didBranchChange,
		})), [
			{ timeDelayMs: 0, didBranchChange: 0 },
			{ timeDelayMs: 30, didBranchChange: 1 },
		]);
	});

	test('retains the repository root when the edited parent directory is deleted', async () => {
		const resource = URI.file('/workspace/removed/branch.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('hello AI'));
		const repositoryRoot = URI.file('/workspace');
		const fileDirectory = URI.file('/workspace/removed');
		let fileDirectoryExists = true;
		const gitService: IAgentHostGitService = {
			...createNoopGitService(),
			getRepositoryRoot: async () => repositoryRoot,
			getCurrentBranchName: async workingDirectory => {
				if (workingDirectory.toString() === repositoryRoot.toString()) {
					return 'main';
				}
				return fileDirectoryExists && workingDirectory.toString() === fileDirectory.toString() ? 'main' : undefined;
			},
		};
		const service = disposables.add(new EditArcReporterService([0, 30], fileService, new TestDiffComputeService(), gitService, config, new NullLogService(), telemetry));

		await service.reportEdit({
			sessionUri: 'claude:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'hello',
			afterText: 'hello AI',
			initialEdit: { replacements: [{ start: 5, endExclusive: 5, text: ' AI' }] },
			completionTime: Date.now(),
		});
		await timeout(10);
		fileDirectoryExists = false;
		await timeout(40);

		assert.deepStrictEqual(telemetry.events.map(event => ({
			timeDelayMs: event.data.timeDelayMs,
			didBranchChange: event.data.didBranchChange,
		})), [
			{ timeDelayMs: 0, didBranchChange: 0 },
			{ timeDelayMs: 30, didBranchChange: 0 },
		]);
	});

	test('treats deletion as removal of the tracked edit', async () => {
		const resource = URI.file('/workspace/deleted.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('hello AI'));
		const service = disposables.add(new EditArcReporterService([0, 30], fileService, new TestDiffComputeService(), createNoopGitService(), config, new NullLogService(), telemetry));

		await service.reportEdit({
			sessionUri: 'claude:/session-1',
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			filePath: resource.fsPath,
			beforeText: 'hello',
			afterText: 'hello AI',
			initialEdit: { replacements: [{ start: 5, endExclusive: 5, text: ' AI' }] },
			completionTime: Date.now(),
		});
		await timeout(10);
		await fileService.del(resource);
		await timeout(40);

		assert.deepStrictEqual(telemetry.events.map(event => ({
			timeDelayMs: event.data.timeDelayMs,
			arc: event.data.arc,
		})), [
			{ timeDelayMs: 0, arc: 3 },
			{ timeDelayMs: 30, arc: 0 },
		]);
	});
});

interface TestAgentConfigurationService extends IAgentConfigurationService {
	setEnabled(enabled: boolean): void;
}

function createConfigurationService(enabled: boolean, disposables: DisposableStore): TestAgentConfigurationService {
	const rootConfigChange = disposables.add(new Emitter<void>());
	const workingDirectoryPendingChange = disposables.add(new Emitter<string>());
	return {
		_serviceBrand: undefined,
		onDidRootConfigChange: rootConfigChange.event,
		onDidSessionConfigChange: Event.None,
		onDidChangeWorkingDirectoryPending: workingDirectoryPendingChange.event,
		getEffectiveValue: () => undefined,
		getEffectiveWorkingDirectories: () => undefined,
		isWorkingDirectoryPending: () => false,
		resolveWorkingDirectoryForResume: async (_session, workingDirectory) => workingDirectory,
		updateSessionConfig: () => { },
		getSessionConfigValues: () => undefined,
		getRootValue: (schema, key) => schema.validate(key, enabled) ? enabled : undefined,
		updateRootConfig: () => { },
		persistRootConfig: () => { },
		whenIdle: async () => { },
		setEnabled(value) {
			enabled = value;
			rootConfigChange.fire();
		},
	};
}
