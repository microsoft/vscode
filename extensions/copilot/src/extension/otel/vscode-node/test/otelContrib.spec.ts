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
	override info(message: string): void { this.messages.push(message); }
}

describe('OTelContrib restart notification', () => {
	let settings: TestOTelSettings;
	let contribution: OTelContrib;
	let events: string[];
	let context: TestExtensionContext;
	let log: RecordingLogService;

	function createContribution(sessionId = 'session'): OTelContrib {
		const resolve = () => resolveOTelConfigFromSettings(settings, {}, '1.0.0', sessionId);
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
		ui.showWarningMessage.mockImplementation(async () => { events.push('reload warning'); });
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
		expect(events).toEqual(['progress opened', 'restart requested', 'progress completed', 'reload warning']);
		expect(ui.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('could not be applied automatically'), 'Reload Window');
	});

	it('ends progress when the restart command fails, then offers a manual reload', async () => {
		ui.executeCommand.mockImplementation(async (command: string) => {
			if (command === 'workbench.action.restartExtensionHost') {
				throw new Error('Restart unavailable');
			}
		});
		settings.policy = { enabled: true, otlpEndpoint: 'https://managed.example' };
		await vi.advanceTimersByTimeAsync(500);
		expect(events).toEqual(['progress opened', 'progress completed', 'reload warning']);
		expect(ui.showWarningMessage).toHaveBeenCalledTimes(1);
	});

	it('handles a blocked refresh when only the readiness command completes', async () => {
		contribution.dispose();
		settings.policy = { enabled: true, otlpEndpoint: 'https://managed.example' };
		contribution = createContribution();
		const settled = new DeferredPromise<void>();
		ui.executeCommand.mockImplementation(async (command: string) => {
			if (command === '_workbench.whenAccountPolicySettled') {
				await settled.p;
			}
		});
		settings.policy = {};
		settings.policySlotDefaults = { enabled: false, exporterType: '', otlpEndpoint: '', captureIdentity: false };
		await vi.advanceTimersByTimeAsync(500);
		expect(ui.showInformationMessage).not.toHaveBeenCalled();
		expect(ui.executeCommand).toHaveBeenCalledWith('_workbench.whenAccountPolicySettled');

		await settled.complete();
		await vi.advanceTimersByTimeAsync(0);
		expect(ui.showInformationMessage).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('reload is required'), 'Reload Window');
		expect(ui.withProgress).not.toHaveBeenCalled();
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
		await vi.advanceTimersByTimeAsync(500);
		expect(ui.withProgress).not.toHaveBeenCalled();
		expect(ui.showWarningMessage).not.toHaveBeenCalled();
		expect(ui.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('after reload'), 'Reload Window');
	});

	it.each([false, true])('records a managed reload only after user acceptance: %s', async accept => {
		contribution.dispose();
		settings.policy = { enabled: true, otlpEndpoint: 'https://initial.example' };
		contribution = createContribution();
		settings.policy = { enabled: true, otlpEndpoint: 'https://changed.example' };
		ui.showInformationMessage.mockResolvedValue(accept ? 'Reload Window' : undefined);
		ui.executeCommand.mockImplementation(async (command: string) => {
			if (command === 'workbench.action.reloadWindow') {
				expect(context.workspaceState.get('github.copilot.otel.latePolicyRestart')).toMatchObject({
					sessionId: 'session', reloadRequested: true, acknowledged: false,
				});
			}
		});
		await vi.advanceTimersByTimeAsync(500);
		expect({
			recorded: context.workspaceState.get('github.copilot.otel.latePolicyRestart') !== undefined,
			reloads: ui.executeCommand.mock.calls.filter(([command]) => command === 'workbench.action.reloadWindow').length,
		}).toEqual({ recorded: accept, reloads: accept ? 1 : 0 });
	});

	it('shows an unapplied-policy warning without another reload action after a failed reload', async () => {
		contribution.dispose();
		settings.policy = { enabled: true, otlpEndpoint: 'https://initial.example' };
		contribution = createContribution();
		settings.policy = { enabled: true, otlpEndpoint: 'https://changed.example' };
		ui.showInformationMessage.mockResolvedValue('Reload Window');
		await vi.advanceTimersByTimeAsync(500);
		contribution.dispose();

		settings.policy = { enabled: true, otlpEndpoint: 'https://initial.example' };
		contribution = createContribution('reloaded-session');
		settings.policy = { enabled: true, otlpEndpoint: 'https://changed.example' };
		await vi.advanceTimersByTimeAsync(500);
		expect(ui.showWarningMessage).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('still not applied after reloading'));
		expect(ui.showInformationMessage).toHaveBeenCalledTimes(1);
		expect(ui.executeCommand.mock.calls.filter(([command]) => command === 'workbench.action.reloadWindow')).toHaveLength(1);
	});
});
