/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockState } = vi.hoisted(() => ({
	mockState: {
		extension: null as { id: string } | null,
		getExtensionImpl: null as (() => { id: string } | undefined) | null,
		executeCommand: vi.fn<(command: string, ...args: unknown[]) => Promise<unknown>>().mockResolvedValue(undefined),
		changeListeners: [] as Array<() => void>,
	},
}));

vi.mock('vscode', async (importOriginal) => {
	const actual = await importOriginal() as Record<string, unknown>;
	return {
		...actual,
		commands: {
			executeCommand: (command: string, ...args: unknown[]) => mockState.executeCommand(command, ...args),
		},
		extensions: {
			getExtension: (_id: string) => mockState.getExtensionImpl ? mockState.getExtensionImpl() : (mockState.extension ?? undefined),
			onDidChange: (listener: () => void) => {
				mockState.changeListeners.push(listener);
				return { dispose: () => { const i = mockState.changeListeners.indexOf(listener); if (i >= 0) { mockState.changeListeners.splice(i, 1); } } };
			},
		},
	};
});

import { ConfigKey, IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { ILogService, LogServiceImpl } from '../../../../../platform/log/common/logService';
import { CancellationTokenSource } from '../../../../../util/vs/base/common/cancellation';
import { CLAUDE_SDK_EXTENSION_ID } from '../../common/claudeAgentSdkLoaderService';
import { VsCodeClaudeAgentSdkLoaderService } from '../claudeAgentSdkLoaderService';

function fireOnDidChange(): void {
	for (const listener of mockState.changeListeners.slice()) {
		listener();
	}
}

async function waitForListener(): Promise<void> {
	for (let i = 0; i < 50; i++) {
		if (mockState.changeListeners.length > 0) { return; }
		await new Promise(resolve => setTimeout(resolve, 0));
	}
	throw new Error('listener was never registered');
}

describe('VsCodeClaudeAgentSdkLoaderService', () => {
	let configurationService: InMemoryConfigurationService;
	let loader: VsCodeClaudeAgentSdkLoaderService;

	beforeEach(async () => {
		mockState.extension = null;
		mockState.getExtensionImpl = null;
		mockState.executeCommand.mockReset().mockResolvedValue(undefined);
		mockState.changeListeners.length = 0;

		configurationService = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService());
		await configurationService.setConfig(ConfigKey.ClaudeAgentSdkExtensionInstallTimeout, 50);

		loader = new VsCodeClaudeAgentSdkLoaderService(configurationService as IConfigurationService, new LogServiceImpl([]) as ILogService);
	});

	describe('isAvailable', () => {
		it('returns false when the SDK extension is not installed', () => {
			expect(loader.isAvailable).toBe(false);
		});

		it('returns true when the SDK extension is present', () => {
			mockState.extension = { id: CLAUDE_SDK_EXTENSION_ID };
			expect(loader.isAvailable).toBe(true);
		});
	});

	describe('install', () => {
		it('returns true immediately when the extension is already available after the install command', async () => {
			mockState.executeCommand.mockImplementation(async () => {
				mockState.extension = { id: CLAUDE_SDK_EXTENSION_ID };
			});

			const cts = new CancellationTokenSource();
			const result = await loader.install(cts.token);

			expect(result).toBe(true);
			expect(mockState.executeCommand).toHaveBeenCalledWith('workbench.extensions.installExtension', CLAUDE_SDK_EXTENSION_ID);
		});

		it('resolves true when onDidChange fires with the extension present', async () => {
			const cts = new CancellationTokenSource();
			const installPromise = loader.install(cts.token);

			await waitForListener();
			mockState.extension = { id: CLAUDE_SDK_EXTENSION_ID };
			fireOnDidChange();

			expect(await installPromise).toBe(true);
			expect(mockState.changeListeners).toHaveLength(0);
		});

		it('ignores onDidChange events while the extension is still missing', async () => {
			const cts = new CancellationTokenSource();
			const installPromise = loader.install(cts.token);

			await waitForListener();
			fireOnDidChange();
			fireOnDidChange();

			const result = await installPromise;
			expect(result).toBe(false);
			expect(mockState.changeListeners).toHaveLength(0);
		});

		it('returns false when the configured timeout elapses before the extension appears', async () => {
			const cts = new CancellationTokenSource();
			const result = await loader.install(cts.token);

			expect(result).toBe(false);
			expect(mockState.changeListeners).toHaveLength(0);
		});

		it('uses the configured timeout from ClaudeAgentSdkExtensionInstallTimeout', async () => {
			await configurationService.setConfig(ConfigKey.ClaudeAgentSdkExtensionInstallTimeout, 10);
			const cts = new CancellationTokenSource();
			const start = Date.now();
			const result = await loader.install(cts.token);

			expect(result).toBe(false);
			expect(Date.now() - start).toBeLessThan(2000);
		});

		it('returns false and stops waiting when the cancellation token fires', async () => {
			await configurationService.setConfig(ConfigKey.ClaudeAgentSdkExtensionInstallTimeout, 60_000);
			const cts = new CancellationTokenSource();
			const installPromise = loader.install(cts.token);

			await waitForListener();
			cts.cancel();

			const result = await installPromise;
			expect(result).toBe(false);
			expect(mockState.changeListeners).toHaveLength(0);
		});

		it('swallows errors from the install command and still waits for the extension', async () => {
			mockState.executeCommand.mockRejectedValue(new Error('install failed'));
			const cts = new CancellationTokenSource();
			const installPromise = loader.install(cts.token);

			await waitForListener();
			mockState.extension = { id: CLAUDE_SDK_EXTENSION_ID };
			fireOnDidChange();

			expect(await installPromise).toBe(true);
		});

		it('returns false without invoking the install command when the token is already cancelled', async () => {
			const cts = new CancellationTokenSource();
			cts.cancel();

			const result = await loader.install(cts.token);

			expect(result).toBe(false);
			expect(mockState.executeCommand).not.toHaveBeenCalled();
			expect(mockState.changeListeners).toHaveLength(0);
		});

		it('returns true without waiting when the extension becomes available between the pre-check and listener registration', async () => {
			await configurationService.setConfig(ConfigKey.ClaudeAgentSdkExtensionInstallTimeout, 60_000);
			// First isAvailable check (line 46) sees no extension. By the time the
			// listener is hooked up and the post-registration re-check runs, the
			// extension has appeared — but no onDidChange event will fire to wake
			// the waiter. The post-registration re-check must catch it.
			let lookupCount = 0;
			mockState.getExtensionImpl = () => {
				lookupCount++;
				return lookupCount <= 1 ? undefined : { id: CLAUDE_SDK_EXTENSION_ID };
			};

			const cts = new CancellationTokenSource();
			const start = Date.now();
			const result = await loader.install(cts.token);

			expect(result).toBe(true);
			expect(Date.now() - start).toBeLessThan(2000);
			expect(mockState.changeListeners).toHaveLength(0);
		});
	});
});
