/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../log/common/log.js';
import { TelemetryMeasurements, TelemetryProps } from '../../../node/agentHostRestrictedTelemetry.js';
import { NullTelemetryServiceShape } from '../../../../telemetry/common/telemetryUtils.js';
import { TelemetryLevel } from '../../../../telemetry/common/telemetry.js';
import { EditArcReporterService } from '../../../node/shared/editArcReporter.js';
import { TestDiffComputeService, createNoopGitService } from '../../common/sessionTestHelpers.js';
import { IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { IAgentHostGitService } from '../../../common/agentHostGitService.js';

class RecordingTelemetryService extends NullTelemetryServiceShape {
	readonly events: Array<{ name: string; data: Record<string, unknown> }> = [];
	readonly githubEvents: Array<{ name: string; properties: TelemetryProps | undefined; measurements: TelemetryMeasurements | undefined }> = [];

	constructor() {
		super();
		Object.defineProperty(this, 'telemetryLevel', { value: TelemetryLevel.USAGE });
	}

	override publicLog2(eventName?: string, data?: Record<string, unknown>): void {
		this.events.push({ name: eventName ?? '', data: data ?? {} });
	}

	updateTelemetryLevel(): void { }

	sendGHTelemetryEvent(name: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		this.githubEvents.push({ name, properties, measurements });
	}
}

suite('Agent Host Edit ARC Reporter', () => {
	const disposables = new DisposableStore();
	let fileService: FileService;
	let telemetry: RecordingTelemetryService;
	let config: TestAgentConfigurationService;

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
		telemetry = new RecordingTelemetryService();
		config = createConfigurationService(true);
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('emits the locked Microsoft and GitHub event shape', async () => {
		const resource = URI.file('/workspace/file.ts');
		await fileService.writeFile(resource, VSBuffer.fromString('hello AI'));
		const service = disposables.add(new EditArcReporterService([0, 30, 60], fileService, new TestDiffComputeService(), createNoopGitService(), config, new NullLogService(), telemetry));

		await service.reportEdit({
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
		}, {
			name: 'editTelemetry.reportEditArc',
			data: {
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
		await timeout(70);

		assert.deepStrictEqual(telemetry.events
			.filter(event => event.data.uniqueEditId === firstEditId)
			.map(event => ({ timeDelayMs: event.data.timeDelayMs, arc: event.data.arc })), [
			{ timeDelayMs: 0, arc: 2 },
			{ timeDelayMs: 30, arc: 1 },
			{ timeDelayMs: 60, arc: 1 },
		]);
		assert.deepStrictEqual(telemetry.githubEvents, []);
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

function createConfigurationService(enabled: boolean): TestAgentConfigurationService {
	const rootConfigChange = new Emitter<void>();
	return {
		_serviceBrand: undefined,
		onDidRootConfigChange: rootConfigChange.event,
		onDidSessionConfigChange: Event.None,
		getEffectiveValue: () => undefined,
		getEffectiveWorkingDirectory: () => undefined,
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
