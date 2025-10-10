/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Barrier, timeout } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileChangeType, FileSystemProviderErrorCode, FileType, IFileChange, IFileService, toFileSystemProviderErrorCode } from '../../../../../platform/files/common/files.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILoggerService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { TestContextService, TestLoggerService, TestProductService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IMcpRegistry } from '../../common/mcpRegistryTypes.js';
import { McpResourceFilesystem } from '../../common/mcpResourceFilesystem.js';
import { McpService } from '../../common/mcpService.js';
import { IMcpService } from '../../common/mcpTypes.js';
import { MCP } from '../../common/modelContextProtocol.js';
import { TestMcpMessageTransport, TestMcpRegistry } from './mcpRegistryTypes.js';


suite('Workbench - MCP - ResourceFilesystem', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	let transport: TestMcpMessageTransport;
	let fs: McpResourceFilesystem;

	setup(() => {
		const services = new ServiceCollection(
			[IFileService, { registerProvider: () => { } }],
			[IStorageService, ds.add(new TestStorageService())],
			[ILoggerService, ds.add(new TestLoggerService())],
			[IWorkspaceContextService, new TestContextService()],
			[IWorkbenchEnvironmentService, {}],
			[ITelemetryService, NullTelemetryService],
			[IProductService, TestProductService],
		);

		const parentInsta1 = ds.add(new TestInstantiationService(services));
		const registry = new TestMcpRegistry(parentInsta1);

		const parentInsta2 = ds.add(parentInsta1.createChild(new ServiceCollection([IMcpRegistry, registry])));
		const mcpService = ds.add(new McpService(parentInsta2, registry, new NullLogService(), new TestConfigurationService()));
		mcpService.updateCollectedServers();

		const instaService = ds.add(parentInsta2.createChild(new ServiceCollection(
			[IMcpRegistry, registry],
			[IMcpService, mcpService],
		)));

		fs = ds.add(instaService.createInstance(McpResourceFilesystem));

		transport = ds.add(new TestMcpMessageTransport());
		registry.makeTestTransport = () => transport;
	});

	test('reads a basic file', async () => {
		transport.setResponder('resources/read', msg => {
			const request = msg as { id: string | number; params: { uri: string } };
			assert.strictEqual(request.params.uri, 'custom://hello/world.txt');
			return {
				id: request.id,
				jsonrpc: '2.0',
				result: {
					contents: [{ uri: request.params.uri, text: 'Hello World' }],
				} satisfies MCP.ReadResourceResult
			};
		});

		const response = await fs.readFile(URI.parse('mcp-resource://746573742D736572766572/custom/hello/world.txt'));
		assert.strictEqual(new TextDecoder().decode(response), 'Hello World');
	});

	test('stat returns file information', async () => {
		transport.setResponder('resources/read', msg => {
			const request = msg as { id: string | number; params: { uri: string } };
			assert.strictEqual(request.params.uri, 'custom://hello/world.txt');
			return {
				id: request.id,
				jsonrpc: '2.0',
				result: {
					contents: [{ uri: request.params.uri, text: 'Hello World' }],
				} satisfies MCP.ReadResourceResult
			};
		});

		const fileStats = await fs.stat(URI.parse('mcp-resource://746573742D736572766572/custom/hello/world.txt'));
		assert.strictEqual(fileStats.type, FileType.File);
		assert.strictEqual(fileStats.size, 'Hello World'.length);
	});

	test('stat returns directory information', async () => {
		transport.setResponder('resources/read', msg => {
			const request = msg as { id: string | number; params: { uri: string } };
			assert.strictEqual(request.params.uri, 'custom://hello');
			return {
				id: request.id,
				jsonrpc: '2.0',
				result: {
					contents: [
						{ uri: 'custom://hello/file1.txt', text: 'File 1' },
						{ uri: 'custom://hello/file2.txt', text: 'File 2' },
					],
				} satisfies MCP.ReadResourceResult
			};
		});

		const dirStats = await fs.stat(URI.parse('mcp-resource://746573742D736572766572/custom/hello/'));
		assert.strictEqual(dirStats.type, FileType.Directory);
		// Size should be sum of all file contents in the directory
		assert.strictEqual(dirStats.size, 'File 1'.length + 'File 2'.length);
	});

	test('stat throws FileNotFound for nonexistent resources', async () => {
		transport.setResponder('resources/read', msg => {
			const request = msg as { id: string | number };
			return {
				id: request.id,
				jsonrpc: '2.0',
				result: {
					contents: [],
				} satisfies MCP.ReadResourceResult
			};
		});

		await assert.rejects(
			() => fs.stat(URI.parse('mcp-resource://746573742D736572766572/custom/nonexistent.txt')),
			(err: Error) => toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.FileNotFound
		);
	});

	test('readdir returns directory contents', async () => {
		transport.setResponder('resources/read', msg => {
			const request = msg as { id: string | number; params: { uri: string } };
			assert.strictEqual(request.params.uri, 'custom://hello/dir');
			return {
				id: request.id,
				jsonrpc: '2.0',
				result: {
					contents: [
						{ uri: 'custom://hello/dir/file1.txt', text: 'File 1' },
						{ uri: 'custom://hello/dir/file2.txt', text: 'File 2' },
						{ uri: 'custom://hello/dir/subdir/file3.txt', text: 'File 3' },
					],
				} satisfies MCP.ReadResourceResult
			};
		});

		const dirEntries = await fs.readdir(URI.parse('mcp-resource://746573742D736572766572/custom/hello/dir/'));
		assert.deepStrictEqual(dirEntries, [
			['file1.txt', FileType.File],
			['file2.txt', FileType.File],
			['subdir', FileType.Directory],
		]);
	});

	test('readdir throws when reading a file as directory', async () => {
		transport.setResponder('resources/read', msg => {
			const request = msg as { id: string | number; params: { uri: string } };
			return {
				id: request.id,
				jsonrpc: '2.0',
				result: {
					contents: [{ uri: request.params.uri, text: 'This is a file' }],
				} satisfies MCP.ReadResourceResult
			};
		});

		await assert.rejects(
			() => fs.readdir(URI.parse('mcp-resource://746573742D736572766572/custom/hello/file.txt')),
			(err: Error) => toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.FileNotADirectory
		);
	});

	test('watch file emits change events', async () => {
		// Set up the responder for resource reading
		transport.setResponder('resources/read', msg => {
			const request = msg as { id: string | number; params: { uri: string } };
			return {
				id: request.id,
				jsonrpc: '2.0',
				result: {
					contents: [{ uri: request.params.uri, text: 'File content' }],
				} satisfies MCP.ReadResourceResult
			};
		});

		const didSubscribe = new Barrier();

		// Set up the responder for resource subscription
		transport.setResponder('resources/subscribe', msg => {
			const request = msg as { id: string | number };
			didSubscribe.open();
			return {
				id: request.id,
				jsonrpc: '2.0',
				result: {},
			};
		});

		const uri = URI.parse('mcp-resource://746573742D736572766572/custom/hello/file.txt');
		const fileChanges: IFileChange[] = [];

		// Create a listener for file change events
		const disposable = fs.onDidChangeFile(events => {
			fileChanges.push(...events);
		});

		// Start watching the file
		const watchDisposable = fs.watch(uri, { excludes: [], recursive: false });

		// Simulate a file update notification from the server
		await didSubscribe.wait();
		await timeout(10); // wait for listeners to attach

		transport.simulateReceiveMessage({
			jsonrpc: '2.0',
			method: 'notifications/resources/updated',
			params: {
				uri: 'custom://hello/file.txt',
			},
		});
		transport.simulateReceiveMessage({
			jsonrpc: '2.0',
			method: 'notifications/resources/updated',
			params: {
				uri: 'custom://hello/unrelated.txt',
			},
		});

		// Check that we received a file change event
		assert.strictEqual(fileChanges.length, 1);
		assert.strictEqual(fileChanges[0].type, FileChangeType.UPDATED);
		assert.strictEqual(fileChanges[0].resource.toString(), uri.toString());

		// Clean up
		disposable.dispose();
		watchDisposable.dispose();
	});

	test('read blob resource', async () => {
		const blobBase64 = 'SGVsbG8gV29ybGQgYXMgQmxvYg=='; // "Hello World as Blob" in base64

		transport.setResponder('resources/read', msg => {
			const params = (msg as { id: string | number; params: { uri: string } });
			assert.strictEqual(params.params.uri, 'custom://hello/blob.bin');
			return {
				id: params.id,
				jsonrpc: '2.0',
				result: {
					contents: [{ uri: params.params.uri, blob: blobBase64 }],
				} satisfies MCP.ReadResourceResult
			};
		});

		const response = await fs.readFile(URI.parse('mcp-resource://746573742D736572766572/custom/hello/blob.bin'));
		assert.strictEqual(new TextDecoder().decode(response), 'Hello World as Blob');
	});

	test('throws error for write operations', async () => {
		const uri = URI.parse('mcp-resource://746573742D736572766572/custom/hello/file.txt');

		await assert.rejects(
			async () => fs.writeFile(uri, new Uint8Array(), { create: true, overwrite: true, atomic: false, unlock: false }),
			(err: Error) => toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.NoPermissions
		);

		await assert.rejects(
			async () => fs.delete(uri, { recursive: false, useTrash: false, atomic: false }),
			(err: Error) => toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.NoPermissions
		);

		await assert.rejects(
			async () => fs.mkdir(uri),
			(err: Error) => toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.NoPermissions
		);

		await assert.rejects(
			async () => fs.rename(uri, URI.parse('mcp-resource://746573742D736572766572/custom/hello/newfile.txt'), { overwrite: false }),
			(err: Error) => toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.NoPermissions
		);
	});
});
