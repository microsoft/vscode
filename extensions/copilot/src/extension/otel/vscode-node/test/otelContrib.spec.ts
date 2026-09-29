/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgressLocation, type GlobalEnvironmentVariableCollection, type ProgressOptions } from 'vscode';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { NoopOTelService } from '../../../../platform/otel/common/noopOtelService';
import { IOTelConfigResolver, resolveOTelConfigFromSettings } from '../../../../platform/otel/common/otelConfigResolution';
import { TestOTelSettings } from '../../../../platform/otel/common/test/otelTestSettings';
import { OTelSqliteStore } from '../../../../platform/otel/node/sqlite/otelSqliteStore';
import { NullTelemetryService } from '../../../../platform/telemetry/common/nullTelemetryService';
import { MockExtensionContext } from '../../../../platform/test/node/extensionContext';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { mock } from '../../../../util/common/test/simpleMock';
import { DeferredPromise } from '../../../../util/vs/base/common/async';
import { OTelContrib } from '../otelContrib';

const ui = vi.hoisted(() => ({
	withProgress: vi.fn(),
	showWarningMessage: vi.fn(),
	showInformationMessage: vi.fn(),
	executeCommand: vi.fn(),
}));

vi.mock('vscode', async importOriginal => ({
	...await importOriginal<typeof import('vscode')>(),
	ProgressLocation: { Notification: 15 },
	commands: {
		registerCommand: () => ({ dispose() { } }),
		executeCommand: ui.executeCommand,
	},
	workspace: { onDidChangeConfiguration: () => ({ dispose() { } }) },
	window: {
		withProgress: ui.withProgress,
		showWarningMessage: ui.showWarningMessage,
		showInformationMessage: ui.showInformationMessage,
		createChatStatusItem: () => ({ show() { }, dispose() { } }),
	},
}));

class TestExtensionContext extends mock<IVSCodeExtensionContext>() {
	override readonly workspaceState = new MockExtensionContext().workspaceState;
	override readonly environmentVariableCollection = new class extends mock<GlobalEnvironmentVariableCollection>() {
		override delete(): void { }
		override replace(): void { }
	}();
}

class RecordingLogService extends TestLogService {
	readonly messages: string[] = [];
	readonly errors: string[] = [];
	override info(message: string): void { this.messages.push(message); }
	override error(error: string | Error, message?: string): void { this.errors.push(`${message}: ${error}`); }
}

describe('OTelContrib restart notification', () => {
	let settings: TestOTelSettings;
	let contribution: OTelContrib;
	let events: string[];
	let context: TestExtensionContext;
	let log: RecordingLogService;

	function createContribution(): OTelContrib {
		const resolve = () => resolveOTelConfigFromSettings(settings, {}, '1.0.0', 'session');
		const resolver: IOTelConfigResolver = { _serviceBrand: undefined, activeResolution: resolve(), resolve };
		return new OTelContrib(
			new NoopOTelService(resolver.activeResolution.config),
			new OTelSqliteStore('/unused-otel-test.db'),
			log,
			new NullTelemetryService(),
			context,
			resolver,
		);
	}

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		events = [];
		ui.withProgress.mockImplementation(async (_options: ProgressOptions, task: () => Promise<void>) => {
			events.push('progress opened');
			try {
				return await task();
			} finally {
				events.push('progress completed');
			}
		});
		ui.showWarningMessage.mockImplementation(async () => { events.push('restart warning'); });
		ui.showInformationMessage.mockResolvedValue(undefined);
		ui.executeCommand.mockImplementation(async (command: string) => {
			if (command === 'workbench.action.restartExtensionHost') {
				events.push('restart requested');
			}
		});
		settings = new TestOTelSettings();
		context = new TestExtensionContext();
		log = new RecordingLogService();
		contribution = createContribution();
	});

	afterEach(async () => {
		contribution.dispose();
		await vi.runAllTimersAsync();
		vi.useRealTimers();
	});

	it('shows lifecycle-bound progress instead of a persistent warning and ends it before fallback', async () => {
		settings.policy = { enabled: true, otlpEndpoint: 'https://managed.example' };
		await vi.advanceTimersByTimeAsync(500);
		expect(ui.withProgress).toHaveBeenCalledWith(expect.objectContaining({
			location: ProgressLocation.Notification,
			title: expect.stringContaining('Restarting extensions'),
			cancellable: false,
		}), expect.any(Function));
		expect(events).toEqual(['progress opened', 'restart requested']);
		expect(ui.showWarningMessage).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(15_000);
		expect(events).toEqual(['progress opened', 'restart requested', 'progress completed', 'restart warning']);
		expect(ui.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('could not be applied automatically'), 'Restart Extensions');
	});

	it('ends progress when the restart command fails, then offers a manual extension restart', async () => {
		ui.executeCommand.mockRejectedValue(new Error('Restart unavailable'));
		settings.policy = { enabled: true, otlpEndpoint: 'https://managed.example' };
		await vi.advanceTimersByTimeAsync(500);
		expect(events).toEqual(['progress opened', 'progress completed', 'restart warning']);
		expect(ui.showWarningMessage).toHaveBeenCalledTimes(1);
	});

	it('acknowledges successful recovery and logs it once without a success toast', async () => {
		settings.policy = { enabled: true, otlpEndpoint: 'https://managed.example' };
		await vi.advanceTimersByTimeAsync(500);
		contribution.dispose();
		// Simulate the old host ending while its restart task is still pending.
		vi.clearAllTimers();
		vi.clearAllMocks();
		contribution = createContribution();
		await vi.advanceTimersByTimeAsync(500);
		expect(context.workspaceState.get('github.copilot.otel.latePolicyRestart')).toMatchObject({ acknowledged: true });
		contribution.dispose();
		contribution = createContribution();
		await vi.advanceTimersByTimeAsync(500);
		expect(log.messages.filter(message => message === '[OTel] Extensions were restarted to apply enterprise telemetry policy.')).toHaveLength(1);
		expect(ui.withProgress).not.toHaveBeenCalled();
		expect(ui.showInformationMessage).not.toHaveBeenCalled();
		expect(ui.showWarningMessage).not.toHaveBeenCalled();
	});

	it('does not show automatic restart progress for personal settings changes', async () => {
		settings.user = { enabled: true, otlpEndpoint: 'https://personal.example' };
		ui.showInformationMessage.mockResolvedValue('Reload Window');
		await vi.advanceTimersByTimeAsync(500);
		expect(ui.withProgress).not.toHaveBeenCalled();
		expect(ui.showWarningMessage).not.toHaveBeenCalled();
		expect(ui.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('after reload'), 'Reload Window');
		expect(ui.executeCommand).toHaveBeenCalledWith('workbench.action.reloadWindow');
	});

	it.each([false, true])('offers an opt-in restart after restricted startup values clear (personal OTel enabled: %s)', async enabled => {
		contribution.dispose();
		settings.user = { enabled, otlpEndpoint: 'https://personal.example' };
		settings.policy = { enabled: false, exporterType: '', otlpEndpoint: '', captureIdentity: false };
		contribution = createContribution();
		settings.policy = { enabled: true, otlpEndpoint: 'https://managed.example', headers: { authorization: 'private-value' } };

		await vi.advanceTimersByTimeAsync(500);

		expect(ui.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('Local Copilot Chat'), 'Restart Extensions');
		expect({
			progress: ui.withProgress.mock.calls,
			restarts: ui.executeCommand.mock.calls.filter(([command]) => command === 'workbench.action.restartExtensionHost'),
			reloads: ui.executeCommand.mock.calls.filter(([command]) => command === 'workbench.action.reloadWindow'),
			restartRecord: context.workspaceState.get('github.copilot.otel.latePolicyRestart'),
		}).toEqual({ progress: [], restarts: [], reloads: [], restartRecord: undefined });
		const diagnostic = log.messages.find(message => message.includes('Offering an extension host restart'));
		expect(diagnostic).toContain('headers');
		expect(diagnostic).not.toContain('private-value');
		expect(diagnostic).not.toContain('managed.example');
	});

	function startWithPersonalExport(): void {
		contribution.dispose();
		settings.user = { enabled: true, otlpEndpoint: 'https://personal.example' };
		contribution = createContribution();
		settings.policy = { enabled: true, otlpEndpoint: 'https://managed.example' };
	}

	it('restarts extensions rather than the window when the user accepts policy recovery', async () => {
		startWithPersonalExport();
		ui.showInformationMessage.mockResolvedValue('Restart Extensions');
		await vi.advanceTimersByTimeAsync(500);
		expect(events).toEqual(['progress opened', 'restart requested']);
		expect(ui.executeCommand).not.toHaveBeenCalledWith('workbench.action.reloadWindow');
		expect(context.workspaceState.get('github.copilot.otel.latePolicyRestart')).toBeUndefined();

		contribution.dispose();
		vi.clearAllTimers();
		ui.showInformationMessage.mockClear();
		contribution = createContribution();
		await vi.advanceTimersByTimeAsync(500);
		expect(ui.showInformationMessage).not.toHaveBeenCalled();
	});

	it('reports a manual restart that does not stop the host without retrying or reloading', async () => {
		startWithPersonalExport();
		ui.showInformationMessage.mockResolvedValue('Restart Extensions');
		await vi.advanceTimersByTimeAsync(15_500);
		expect(events).toEqual(['progress opened', 'restart requested', 'progress completed', 'restart warning']);
		expect(ui.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('Extensions did not restart'));
		expect(ui.executeCommand).not.toHaveBeenCalledWith('workbench.action.reloadWindow');
	});

	it('logs a failed manual restart and tells the user that settings are still pending', async () => {
		startWithPersonalExport();
		ui.showInformationMessage.mockResolvedValue('Restart Extensions');
		ui.executeCommand.mockRejectedValue(new Error('Restart unavailable'));
		await vi.advanceTimersByTimeAsync(500);
		expect({
			events,
			errors: log.errors,
		}).toEqual({
			events: ['progress opened', 'progress completed', 'restart warning'],
			errors: ['[OTel] Failed to restart extensions for Local Copilot Chat telemetry settings: Error: Restart unavailable'],
		});
		expect(ui.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('settings are still pending'));
	});

	it('allows an explicit retry after automatic recovery without resetting its guard', async () => {
		settings.policy = { enabled: true, otlpEndpoint: 'https://managed.example' };
		ui.showWarningMessage.mockResolvedValueOnce('Restart Extensions');
		await vi.advanceTimersByTimeAsync(500);
		const record = context.workspaceState.get('github.copilot.otel.latePolicyRestart');
		await vi.advanceTimersByTimeAsync(15_000);
		expect({
			restarts: ui.executeCommand.mock.calls.filter(([command]) => command === 'workbench.action.restartExtensionHost').length,
			restartRecord: context.workspaceState.get('github.copilot.otel.latePolicyRestart'),
		}).toEqual({ restarts: 2, restartRecord: record });
		expect(record).toBeDefined();
		expect(ui.executeCommand).not.toHaveBeenCalledWith('workbench.action.reloadWindow');
	});

	it.each(['configuration restored', 'contribution disposed'])('ignores a pending restart choice after %s', async change => {
		startWithPersonalExport();
		const selection = new DeferredPromise<string | undefined>();
		ui.showInformationMessage.mockReturnValue(selection.p);
		await vi.advanceTimersByTimeAsync(500);
		if (change === 'configuration restored') {
			settings.policy = {};
		} else {
			contribution.dispose();
		}
		await selection.complete('Restart Extensions');
		await vi.runAllTimersAsync();
		expect(ui.withProgress).not.toHaveBeenCalled();
		expect(ui.executeCommand).not.toHaveBeenCalledWith('workbench.action.restartExtensionHost');
	});

	it('keeps policy withdrawal on the existing window reload action', async () => {
		contribution.dispose();
		settings.policy = { enabled: true, otlpEndpoint: 'https://managed.example' };
		contribution = createContribution();
		settings.policy = {};
		ui.showInformationMessage.mockResolvedValue('Reload Window');
		await vi.advanceTimersByTimeAsync(500);
		expect(ui.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('reload is required'), 'Reload Window');
		expect(ui.executeCommand).toHaveBeenCalledWith('workbench.action.reloadWindow');
		expect(ui.withProgress).not.toHaveBeenCalled();
	});
});
