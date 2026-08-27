/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { waitForState } from '../../../../../../base/common/observable.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { NullTelemetryServiceShape } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { testWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { WorkspacePluginSettingsFileKind, WorkspacePluginSettingsService } from '../../../common/plugins/workspacePluginSettingsService.js';

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: unknown }[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName) {
			this.events.push({ name: eventName, data });
		}
	}
}

interface IConfigurationRow {
	readonly settingsFileKind: string;
	readonly configurationPresent: number;
	readonly configuredEntryCount: number;
	readonly enabledEntryCount: number;
	readonly disabledEntryCount: number;
	readonly parseErrorCount: number;
	readonly unreadableCount: number;
}

function isConfigurationRow(value: unknown): value is IConfigurationRow {
	return typeof value === 'object' && value !== null && 'settingsFileKind' in value && 'configuredEntryCount' in value;
}

suite('WorkspacePluginSettingsService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const logService = new NullLogService();

	let fileService: FileService;
	let workspaceContextService: TestContextService;
	let telemetryService: TestTelemetryService;
	const workspaceRoot = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });

	setup(() => {
		workspaceContextService = new TestContextService(testWorkspace(workspaceRoot));
		fileService = store.add(new FileService(logService));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
		telemetryService = new TestTelemetryService();
	});

	function createService(): WorkspacePluginSettingsService {
		return store.add(new WorkspacePluginSettingsService(
			fileService,
			workspaceContextService,
			logService,
			telemetryService,
		));
	}

	async function writeClaudeSettings(content: string): Promise<void> {
		const uri = URI.from({ scheme: Schemas.inMemory, path: '/workspace/.claude/settings.json' });
		await fileService.writeFile(uri, VSBuffer.fromString(content));
	}

	async function writeClaudeLocalSettings(content: string): Promise<void> {
		const uri = URI.from({ scheme: Schemas.inMemory, path: '/workspace/.claude/settings.local.json' });
		await fileService.writeFile(uri, VSBuffer.fromString(content));
	}

	async function writeCopilotSettings(content: string): Promise<void> {
		const uri = URI.from({ scheme: Schemas.inMemory, path: '/workspace/.github/copilot/settings.json' });
		await fileService.writeFile(uri, VSBuffer.fromString(content));
	}

	async function writeCopilotLocalSettings(content: string): Promise<void> {
		const uri = URI.from({ scheme: Schemas.inMemory, path: '/workspace/.github/copilot/settings.local.json' });
		await fileService.writeFile(uri, VSBuffer.fromString(content));
	}

	// --- enabledPlugins parsing ---

	test('parses enabledPlugins from Claude settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		await writeClaudeSettings(JSON.stringify({
			enabledPlugins: {
				'my-plugin@my-marketplace': true,
				'disabled-plugin@my-marketplace': false,
			}
		}));

		const service = createService();
		await waitForState(service.enabledPlugins, v => v.size > 0);

		const enabled = service.enabledPlugins.get();
		assert.strictEqual(enabled.get('my-plugin@my-marketplace'), true);
		assert.strictEqual(enabled.get('disabled-plugin@my-marketplace'), false);
		assert.strictEqual(enabled.size, 2);
	}));

	test('settings.local.json overrides settings.json for enabledPlugins', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		await writeClaudeSettings(JSON.stringify({
			enabledPlugins: {
				'my-plugin@mp': true,
				'other-plugin@mp': true,
			}
		}));
		await writeClaudeLocalSettings(JSON.stringify({
			enabledPlugins: {
				'my-plugin@mp': false,
			}
		}));

		const service = createService();
		await waitForState(service.enabledPlugins, v => v.size > 0);

		const enabled = service.enabledPlugins.get();
		assert.strictEqual(enabled.get('my-plugin@mp'), false, 'local should override shared');
		assert.strictEqual(enabled.get('other-plugin@mp'), true, 'non-overridden key preserved');
	}));

	test('merges enabledPlugins from Claude and Copilot settings', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		await writeClaudeSettings(JSON.stringify({
			enabledPlugins: { 'from-claude@mp': true }
		}));
		await writeCopilotSettings(JSON.stringify({
			enabledPlugins: { 'from-copilot@mp': true }
		}));

		const service = createService();
		await waitForState(service.enabledPlugins, v => v.size >= 2);

		const enabled = service.enabledPlugins.get();
		assert.strictEqual(enabled.get('from-claude@mp'), true);
		assert.strictEqual(enabled.get('from-copilot@mp'), true);
	}));

	test('Claude enabledPlugins take precedence over Copilot for same key', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		await writeClaudeSettings(JSON.stringify({
			enabledPlugins: { 'shared-plugin@mp': false }
		}));
		await writeCopilotSettings(JSON.stringify({
			enabledPlugins: { 'shared-plugin@mp': true }
		}));

		const service = createService();
		await waitForState(service.enabledPlugins, v => v.size > 0);

		const enabled = service.enabledPlugins.get();
		assert.strictEqual(enabled.get('shared-plugin@mp'), false, 'Claude should win');
	}));

	// --- extraKnownMarketplaces parsing ---

	test('parses GitHub shorthand from extraKnownMarketplaces', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		await writeClaudeSettings(JSON.stringify({
			extraKnownMarketplaces: {
				'my-marketplace': {
					source: 'github',
					repo: 'owner/repo',
				}
			}
		}));

		const service = createService();
		await waitForState(service.extraMarketplaces, v => v.length > 0);

		const marketplaces = service.extraMarketplaces.get();
		assert.strictEqual(marketplaces.length, 1);
		assert.strictEqual(marketplaces[0].name, 'my-marketplace');
		assert.strictEqual(marketplaces[0].reference.displayLabel, 'my-marketplace');
		assert.strictEqual(marketplaces[0].reference.githubRepo, 'owner/repo');
	}));

	test('parses marketplace refs from extraKnownMarketplaces', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		await writeClaudeSettings(JSON.stringify({
			extraKnownMarketplaces: {
				'my-marketplace': {
					source: 'github',
					repo: 'owner/repo',
					ref: 'marketplace',
				}
			}
		}));

		const service = createService();
		await waitForState(service.extraMarketplaces, v => v.length > 0);

		const marketplaces = service.extraMarketplaces.get();
		assert.strictEqual(marketplaces[0].reference.ref, 'marketplace');
		assert.strictEqual(marketplaces[0].reference.canonicalId, 'github:owner/repo#marketplace');
	}));

	test('parses nested source object from extraKnownMarketplaces', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		await writeClaudeSettings(JSON.stringify({
			extraKnownMarketplaces: {
				'nested-mp': {
					source: {
						source: 'github',
						repo: 'nested-owner/nested-repo',
					}
				}
			}
		}));

		const service = createService();
		await waitForState(service.extraMarketplaces, v => v.length > 0);

		const marketplaces = service.extraMarketplaces.get();
		assert.strictEqual(marketplaces.length, 1);
		assert.strictEqual(marketplaces[0].reference.githubRepo, 'nested-owner/nested-repo');
		assert.strictEqual(marketplaces[0].reference.displayLabel, 'nested-mp');
	}));

	test('deduplicates marketplaces across Claude and Copilot by canonical ID', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		await writeClaudeSettings(JSON.stringify({
			extraKnownMarketplaces: {
				'claude-name': { source: 'github', repo: 'owner/repo' }
			}
		}));
		await writeCopilotSettings(JSON.stringify({
			extraKnownMarketplaces: {
				'copilot-name': { source: 'github', repo: 'owner/repo' }
			}
		}));

		const service = createService();
		await waitForState(service.extraMarketplaces, v => v.length > 0);

		const marketplaces = service.extraMarketplaces.get();
		assert.strictEqual(marketplaces.length, 1, 'should deduplicate by canonical ID');
		assert.strictEqual(marketplaces[0].name, 'claude-name', 'Claude entry should win');
	}));

	// --- Invalid input handling ---

	test('ignores invalid enabledPlugins shapes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		await writeClaudeSettings(JSON.stringify({
			enabledPlugins: 'not-an-object'
		}));

		const service = createService();
		// Give the async read a chance to complete with faked timers.
		await new Promise<void>(r => queueMicrotask(r));

		assert.strictEqual(service.enabledPlugins.get().size, 0);
	}));

	test('ignores non-boolean values in enabledPlugins', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		await writeClaudeSettings(JSON.stringify({
			enabledPlugins: {
				'valid@mp': true,
				'number@mp': 42,
				'string@mp': 'yes',
			}
		}));

		const service = createService();
		await waitForState(service.enabledPlugins, v => v.size > 0);

		const enabled = service.enabledPlugins.get();
		assert.strictEqual(enabled.size, 1);
		assert.strictEqual(enabled.get('valid@mp'), true);
	}));

	test('ignores non-object marketplace entries', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		await writeClaudeSettings(JSON.stringify({
			extraKnownMarketplaces: {
				'valid': { source: 'github', repo: 'owner/repo' },
				'invalid-string': 'not-valid',
				'invalid-number': 42,
			}
		}));

		const service = createService();
		await waitForState(service.extraMarketplaces, v => v.length > 0);

		const marketplaces = service.extraMarketplaces.get();
		assert.strictEqual(marketplaces.length, 1);
		assert.strictEqual(marketplaces[0].name, 'valid');
	}));

	test('returns empty observables when no settings files exist', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const service = createService();
		await new Promise<void>(r => queueMicrotask(r));

		assert.strictEqual(service.enabledPlugins.get().size, 0);
		assert.strictEqual(service.extraMarketplaces.get().length, 0);
		assert.deepStrictEqual(telemetryService.events, []);
	}));

	test('reports all settings-file kinds including empty and malformed files', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		await writeClaudeSettings(JSON.stringify({
			extraKnownMarketplaces: { private: { source: 'github', repo: 'owner/repository' } },
			enabledPlugins: { 'enabled@private': true },
		}));
		await writeClaudeLocalSettings('{ invalid');
		await writeCopilotSettings(JSON.stringify({ enabledPlugins: { 'disabled@private': false } }));
		await writeCopilotLocalSettings('{}');

		const service = createService();
		await waitForState(service.enabledPlugins, value => value.size === 2);

		const latestRows = new Map<string, IConfigurationRow>();
		for (const event of telemetryService.events) {
			if ((event.name === 'agentPluginMarketplacesConfigured' || event.name === 'agentPluginEnablementConfigured') && isConfigurationRow(event.data)) {
				latestRows.set(`${event.name}/${event.data.settingsFileKind}`, event.data);
			}
		}
		const summarize = (eventName: string, kind: WorkspacePluginSettingsFileKind) => {
			const row = latestRows.get(`${eventName}/${kind}`);
			return row && [row.configurationPresent, row.configuredEntryCount, row.enabledEntryCount, row.disabledEntryCount, row.parseErrorCount, row.unreadableCount];
		};
		assert.deepStrictEqual({
			claudeSharedMarketplaces: summarize('agentPluginMarketplacesConfigured', WorkspacePluginSettingsFileKind.ClaudeShared),
			claudeSharedEnablement: summarize('agentPluginEnablementConfigured', WorkspacePluginSettingsFileKind.ClaudeShared),
			claudeLocal: summarize('agentPluginEnablementConfigured', WorkspacePluginSettingsFileKind.ClaudeLocal),
			copilotShared: summarize('agentPluginEnablementConfigured', WorkspacePluginSettingsFileKind.CopilotShared),
			copilotLocal: summarize('agentPluginEnablementConfigured', WorkspacePluginSettingsFileKind.CopilotLocal),
		}, {
			claudeSharedMarketplaces: [1, 1, 1, 0, 0, 0],
			claudeSharedEnablement: [1, 1, 1, 0, 0, 0],
			claudeLocal: [1, 0, 0, 0, 1, 0],
			copilotShared: [1, 1, 0, 1, 0, 0],
			copilotLocal: [1, 0, 0, 0, 0, 0],
		});
	}));
});
