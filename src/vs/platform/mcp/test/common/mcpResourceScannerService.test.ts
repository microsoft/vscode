/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../configuration/common/configuration.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryServiceShape } from '../../../telemetry/common/telemetryUtils.js';
import { McpDiscoveryHost } from '../../common/mcpDiscoveryMetadata.js';
import { McpResourceScannerService } from '../../common/mcpResourceScannerService.js';

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: unknown }[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName) {
			this.events.push({ name: eventName, data });
		}
	}
}

class DelayedMcpProvider extends InMemoryFileSystemProvider {
	readonly secondReadBarrier = new DeferredPromise<void>();

	override async readFile(resource: URI): Promise<Uint8Array> {
		const result = await super.readFile(resource);
		if (resource.path.includes('/second/')) {
			await this.secondReadBarrier.p;
		}
		return result;
	}
}

suite('McpResourceScannerService telemetry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reports invalid root shapes and uses explicit host context', async () => {
		const telemetryService = new TestTelemetryService();
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
		const scanner = store.add(new McpResourceScannerService(fileService, telemetryService));
		const resource = URI.from({ scheme: Schemas.inMemory, path: '/mcp.json' });
		store.add(scanner.registerConfigurationResource(resource, ConfigurationTarget.USER, McpDiscoveryHost.Remote));

		await scanner.scanMcpServers(resource, ConfigurationTarget.USER);
		await scanner.scanMcpServers(resource, ConfigurationTarget.USER);
		await fileService.writeFile(resource, VSBuffer.fromString('{}'));
		await scanner.scanMcpServers(resource, ConfigurationTarget.USER);
		await fileService.writeFile(resource, VSBuffer.fromString('{ invalid'));
		await assert.rejects(scanner.scanMcpServers(resource, ConfigurationTarget.USER));
		await fileService.writeFile(resource, VSBuffer.fromString('[]'));
		await assert.rejects(scanner.scanMcpServers(resource, ConfigurationTarget.USER));
		await fileService.writeFile(resource, VSBuffer.fromString('42'));
		await assert.rejects(scanner.scanMcpServers(resource, ConfigurationTarget.USER));

		assert.deepStrictEqual(telemetryService.events.filter(event => event.name === 'mcp/configurationFound').map(event => event.data), [
			{ source: 'all', format: 'all', scope: 'all', host: 'all', configurationPresent: 0, configuredEntryCount: 0, parseErrorCount: 0, unreadableCount: 0 },
			{ source: 'vscodeRemoteUserConfig', format: 'vscodeServers', scope: 'profile', host: 'remote', configurationPresent: 1, configuredEntryCount: 0, parseErrorCount: 0, unreadableCount: 0 },
			{ source: 'vscodeRemoteUserConfig', format: 'vscodeServers', scope: 'profile', host: 'remote', configurationPresent: 1, configuredEntryCount: 0, parseErrorCount: 1, unreadableCount: 0 },
		]);
	});

	test('aggregation follows the active profile', async () => {
		const telemetryService = new TestTelemetryService();
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
		const scanner = store.add(new McpResourceScannerService(fileService, telemetryService));
		const profileA = URI.from({ scheme: Schemas.inMemory, path: '/profile-a/mcp.json' });
		const profileB = URI.from({ scheme: Schemas.inMemory, path: '/profile-b/mcp.json' });
		await fileService.writeFile(profileA, VSBuffer.fromString(JSON.stringify({ servers: { a: { type: 'stdio', command: 'a' } } })));
		await fileService.writeFile(profileB, VSBuffer.fromString(JSON.stringify({ servers: { b: { type: 'stdio', command: 'b' }, c: { type: 'stdio', command: 'c' } } })));

		store.add(scanner.registerConfigurationResource(profileA, ConfigurationTarget.USER, McpDiscoveryHost.Local));
		await scanner.scanMcpServers(profileA, ConfigurationTarget.USER);
		store.add(scanner.registerConfigurationResource(profileB, ConfigurationTarget.USER, McpDiscoveryHost.Local));
		await scanner.scanMcpServers(profileB, ConfigurationTarget.USER);
		store.add(scanner.registerConfigurationResource(profileA, ConfigurationTarget.USER, McpDiscoveryHost.Local));

		assert.deepStrictEqual(telemetryService.events.filter(event => event.name === 'mcp/configurationFound').map(event => event.data), [
			{ source: 'vscodeUserConfig', format: 'vscodeServers', scope: 'profile', host: 'local', configurationPresent: 1, configuredEntryCount: 1, parseErrorCount: 0, unreadableCount: 0 },
			{ source: 'vscodeUserConfig', format: 'vscodeServers', scope: 'profile', host: 'local', configurationPresent: 1, configuredEntryCount: 2, parseErrorCount: 0, unreadableCount: 0 },
			{ source: 'vscodeUserConfig', format: 'vscodeServers', scope: 'profile', host: 'local', configurationPresent: 1, configuredEntryCount: 1, parseErrorCount: 0, unreadableCount: 0 },
		]);
	});

	test('aggregation waits for parallel workspace-folder initialization', async () => {
		const telemetryService = new TestTelemetryService();
		const fileService = store.add(new FileService(new NullLogService()));
		const provider = store.add(new DelayedMcpProvider());
		store.add(fileService.registerProvider(Schemas.inMemory, provider));
		const scanner = store.add(new McpResourceScannerService(fileService, telemetryService));
		const first = URI.from({ scheme: Schemas.inMemory, path: '/first/.vscode/mcp.json' });
		const second = URI.from({ scheme: Schemas.inMemory, path: '/second/.vscode/mcp.json' });
		await fileService.writeFile(first, VSBuffer.fromString(JSON.stringify({ servers: { first: { type: 'stdio', command: 'first' } } })));
		await fileService.writeFile(second, VSBuffer.fromString(JSON.stringify({ servers: { second: { type: 'stdio', command: 'second' } } })));

		store.add(scanner.registerConfigurationResource(first, ConfigurationTarget.WORKSPACE_FOLDER, McpDiscoveryHost.Local));
		store.add(scanner.registerConfigurationResource(second, ConfigurationTarget.WORKSPACE_FOLDER, McpDiscoveryHost.Local));
		const scans = Promise.all([
			scanner.scanMcpServers(first, ConfigurationTarget.WORKSPACE_FOLDER),
			scanner.scanMcpServers(second, ConfigurationTarget.WORKSPACE_FOLDER),
		]);
		await timeout(60);
		assert.strictEqual(telemetryService.events.length, 0);
		provider.secondReadBarrier.complete();
		await scans;

		assert.deepStrictEqual(telemetryService.events.filter(event => event.name === 'mcp/configurationFound').map(event => event.data), [{
			source: 'vscodeWorkspaceFolderConfig',
			format: 'vscodeServers',
			scope: 'workspaceFolder',
			host: 'local',
			configurationPresent: 2,
			configuredEntryCount: 2,
			parseErrorCount: 0,
			unreadableCount: 0,
		}]);
	});

	test('emits a tombstone and all-zero marker when cleared', async () => {
		const telemetryService = new TestTelemetryService();
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
		const scanner = store.add(new McpResourceScannerService(fileService, telemetryService));
		const resource = URI.from({ scheme: Schemas.inMemory, path: '/profile/mcp.json' });
		await fileService.writeFile(resource, VSBuffer.fromString(JSON.stringify({ servers: { server: { type: 'stdio', command: 'server' } } })));

		const registration = scanner.registerConfigurationResource(resource, ConfigurationTarget.USER, McpDiscoveryHost.Local);
		await scanner.scanMcpServers(resource, ConfigurationTarget.USER);
		registration.dispose();

		assert.deepStrictEqual(telemetryService.events.map(event => event.data), [
			{ source: 'vscodeUserConfig', format: 'vscodeServers', scope: 'profile', host: 'local', configurationPresent: 1, configuredEntryCount: 1, parseErrorCount: 0, unreadableCount: 0 },
			{ source: 'all', format: 'all', scope: 'all', host: 'all', configurationPresent: 0, configuredEntryCount: 0, parseErrorCount: 0, unreadableCount: 0 },
			{ source: 'vscodeUserConfig', format: 'vscodeServers', scope: 'profile', host: 'local', configurationPresent: 0, configuredEntryCount: 0, parseErrorCount: 0, unreadableCount: 0 },
		]);
	});
});
