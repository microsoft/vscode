/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ManagedSettingsData } from '../../../../base/common/policy.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY, COPILOT_ENABLED_PLUGINS_KEY, COPILOT_EXTRA_MARKETPLACES_KEY, normalizeManagedSettings } from '../../common/copilotManagedSettings.js';
import { FileManagedSettingsService } from '../../common/fileManagedSettingsService.js';
import { FileManagedSettingsChannelClient } from '../../common/fileManagedSettingsIpc.js';

suite('normalizeManagedSettings', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('flattens scalar leaves to dot-paths', () => {
		const result = normalizeManagedSettings({
			permissions: {
				disableBypassPermissionsMode: 'disable'
			}
		});
		assert.deepStrictEqual(result, {
			'permissions.disableBypassPermissionsMode': 'disable'
		});
	});

	test('JSON-stringifies structured keys (enabledPlugins)', () => {
		const plugins = { 'plugin@marketplace': false };
		const result = normalizeManagedSettings({
			[COPILOT_ENABLED_PLUGINS_KEY]: plugins
		});
		assert.deepStrictEqual(result, {
			[COPILOT_ENABLED_PLUGINS_KEY]: JSON.stringify(plugins)
		});
	});

	test('normalizes extraKnownMarketplaces from schema format to config dict', () => {
		const result = normalizeManagedSettings({
			[COPILOT_EXTRA_MARKETPLACES_KEY]: {
				'a': { source: { source: 'github', repo: 'github/agent-skills' } },
				'b': { source: { source: 'git', url: 'https://example.com/repo.git', ref: 'v1' } },
			}
		});
		assert.deepStrictEqual(result, {
			[COPILOT_EXTRA_MARKETPLACES_KEY]: '{"a":"github/agent-skills","b":"https://example.com/repo.git#v1"}',
		});
	});

	test('drops malformed marketplace entries with warning', () => {
		const warnings: string[] = [];
		const result = normalizeManagedSettings({
			[COPILOT_EXTRA_MARKETPLACES_KEY]: {
				'good': { source: { source: 'github', repo: 'a/b' } },
				'bad': {} as Record<string, unknown>,
			}
		}, msg => warnings.push(msg));
		assert.deepStrictEqual(result, {
			[COPILOT_EXTRA_MARKETPLACES_KEY]: '{"good":"a/b"}',
		});
		assert.strictEqual(warnings.length, 1);
	});

	test('handles mixed scalar and structured keys', () => {
		const result = normalizeManagedSettings({
			permissions: { disableBypassPermissionsMode: 'disable' },
			strictKnownMarketplaces: ['github/foo'],
			[COPILOT_ENABLED_PLUGINS_KEY]: { 'plugin': true },
		});
		assert.deepStrictEqual(result, {
			'permissions.disableBypassPermissionsMode': 'disable',
			'strictKnownMarketplaces': '["github/foo"]',
			[COPILOT_ENABLED_PLUGINS_KEY]: '{"plugin":true}',
		});
	});

	test('handles empty object', () => {
		assert.deepStrictEqual(normalizeManagedSettings({}), {});
	});

	test('drops a structured key whose value is not an object', () => {
		const result = normalizeManagedSettings({
			[COPILOT_ENABLED_PLUGINS_KEY]: 'already-a-string'
		});
		assert.deepStrictEqual(result, {});
	});
});

suite('FileManagedSettingsService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const managedSettingsFile = URI.file('managed-settings.json').with({ scheme: 'vscode-tests' });

	test('reads managed-settings.json on startup', () => runWithFakedTimers({}, async () => {
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const inMemoryProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider('vscode-tests', inMemoryProvider));

		await fileService.writeFile(managedSettingsFile, VSBuffer.fromString(JSON.stringify({
			permissions: { disableBypassPermissionsMode: 'disable' },
			strictKnownMarketplaces: ['github/foo']
		})));

		const service = disposables.add(new FileManagedSettingsService(managedSettingsFile, fileService, logService));

		// Wait for the async refresh to complete
		await new Promise<void>(resolve => {
			if (Object.keys(service.managedSettings).length > 0) {
				resolve();
			} else {
				const listener = disposables.add(service.onDidChangeManagedSettings(() => {
					listener.dispose();
					resolve();
				}));
			}
		});

		assert.deepStrictEqual(service.managedSettings, {
			'permissions.disableBypassPermissionsMode': 'disable',
			'strictKnownMarketplaces': '["github/foo"]'
		});
	}));

	test('returns empty object when file does not exist', () => runWithFakedTimers({}, async () => {
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const inMemoryProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider('vscode-tests', inMemoryProvider));

		const service = disposables.add(new FileManagedSettingsService(managedSettingsFile, fileService, logService));

		// Give the async refresh a chance to run
		await new Promise(resolve => setTimeout(resolve, 10));

		assert.deepStrictEqual(service.managedSettings, {});
	}));

	test('fires event when file changes', () => runWithFakedTimers({}, async () => {
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const inMemoryProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider('vscode-tests', inMemoryProvider));

		await fileService.writeFile(managedSettingsFile, VSBuffer.fromString(JSON.stringify({
			permissions: { disableBypassPermissionsMode: 'disable' }
		})));

		const service = disposables.add(new FileManagedSettingsService(managedSettingsFile, fileService, logService));

		// Wait for initial read
		await new Promise<void>(resolve => {
			if (Object.keys(service.managedSettings).length > 0) {
				resolve();
			} else {
				const listener = disposables.add(service.onDidChangeManagedSettings(() => {
					listener.dispose();
					resolve();
				}));
			}
		});

		// Update the file
		const changePromise = new Promise<void>(resolve => {
			const listener = disposables.add(service.onDidChangeManagedSettings(() => {
				listener.dispose();
				resolve();
			}));
		});

		await fileService.writeFile(managedSettingsFile, VSBuffer.fromString(JSON.stringify({
			strictKnownMarketplaces: ['github/foo']
		})));

		await changePromise;

		assert.deepStrictEqual(service.managedSettings, {
			'strictKnownMarketplaces': '["github/foo"]'
		});
	}));

	test('returns empty object when the file is malformed JSON', () => runWithFakedTimers({}, async () => {
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const inMemoryProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider('vscode-tests', inMemoryProvider));

		await fileService.writeFile(managedSettingsFile, VSBuffer.fromString('{ not: valid json'));

		const service = disposables.add(new FileManagedSettingsService(managedSettingsFile, fileService, logService));
		await new Promise(resolve => setTimeout(resolve, 10));

		assert.deepStrictEqual(service.managedSettings, {});
	}));

	test('returns empty object when the file is not a JSON object', () => runWithFakedTimers({}, async () => {
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const inMemoryProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider('vscode-tests', inMemoryProvider));

		await fileService.writeFile(managedSettingsFile, VSBuffer.fromString(JSON.stringify(['not', 'an', 'object'])));

		const service = disposables.add(new FileManagedSettingsService(managedSettingsFile, fileService, logService));
		await new Promise(resolve => setTimeout(resolve, 10));

		assert.deepStrictEqual(service.managedSettings, {});
	}));

	test('clears managed settings and fires when the file is deleted', () => runWithFakedTimers({}, async () => {
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const inMemoryProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider('vscode-tests', inMemoryProvider));

		await fileService.writeFile(managedSettingsFile, VSBuffer.fromString(JSON.stringify({
			permissions: { disableBypassPermissionsMode: 'disable' }
		})));

		const service = disposables.add(new FileManagedSettingsService(managedSettingsFile, fileService, logService));

		// Wait for initial read
		await new Promise<void>(resolve => {
			if (Object.keys(service.managedSettings).length > 0) {
				resolve();
			} else {
				const listener = disposables.add(service.onDidChangeManagedSettings(() => {
					listener.dispose();
					resolve();
				}));
			}
		});

		const changePromise = new Promise<void>(resolve => {
			const listener = disposables.add(service.onDidChangeManagedSettings(() => {
				listener.dispose();
				resolve();
			}));
		});

		await fileService.del(managedSettingsFile);

		await changePromise;

		assert.deepStrictEqual(service.managedSettings, {});
	}));
});

suite('FileManagedSettingsChannelClient', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps newer event state when the initial snapshot resolves later', async () => {
		const channel = disposables.add(new DeferredManagedSettingsChannel());
		const client = disposables.add(new FileManagedSettingsChannelClient(channel));

		// A change event arrives before the initial getManagedSettings call resolves; the later,
		// stale snapshot must not clobber the newer event-delivered state.
		channel.fire({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'disable' });
		channel.resolveInitialSnapshot({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'enable' });
		await channel.initialSnapshot;

		assert.deepStrictEqual(client.managedSettings, { [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'disable' });
	});
});

class DeferredManagedSettingsChannel extends Disposable implements IChannel {
	private readonly _onDidChangeManagedSettings = this._register(new Emitter<ManagedSettingsData>());
	private resolveInitialSnapshotPromise!: (managedSettings: ManagedSettingsData) => void;
	readonly initialSnapshot = new Promise<ManagedSettingsData>(resolve => this.resolveInitialSnapshotPromise = resolve);

	call<T>(command: string): Promise<T> {
		switch (command) {
			case 'getManagedSettings': return this.initialSnapshot as Promise<T>;
		}

		throw new Error(`Call not found: ${command}`);
	}

	listen<T>(event: string): Event<T> {
		assert.strictEqual(event, 'onDidChangeManagedSettings');
		return this._onDidChangeManagedSettings.event as Event<T>;
	}

	fire(managedSettings: ManagedSettingsData): void {
		this._onDidChangeManagedSettings.fire(managedSettings);
	}

	resolveInitialSnapshot(managedSettings: ManagedSettingsData): void {
		this.resolveInitialSnapshotPromise(managedSettings);
	}
}
