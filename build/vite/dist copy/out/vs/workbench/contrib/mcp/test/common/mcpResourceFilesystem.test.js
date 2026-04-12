/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { Barrier, timeout } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileSystemProviderErrorCode, FileType, IFileService, toFileSystemProviderErrorCode } from '../../../../../platform/files/common/files.js';
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
import { TestMcpMessageTransport, TestMcpRegistry } from './mcpRegistryTypes.js';
suite('Workbench - MCP - ResourceFilesystem', () => {
    const ds = ensureNoDisposablesAreLeakedInTestSuite();
    let transport;
    let fs;
    setup(() => {
        const storageService = ds.add(new TestStorageService());
        const services = new ServiceCollection([IFileService, { registerProvider: () => { } }], [IStorageService, storageService], [ILoggerService, ds.add(new TestLoggerService())], [IWorkspaceContextService, new TestContextService()], [IWorkbenchEnvironmentService, {}], [ITelemetryService, NullTelemetryService], [IProductService, TestProductService]);
        const parentInsta1 = ds.add(new TestInstantiationService(services));
        const registry = new TestMcpRegistry(parentInsta1);
        const parentInsta2 = ds.add(parentInsta1.createChild(new ServiceCollection([IMcpRegistry, registry])));
        const mcpService = ds.add(new McpService(parentInsta2, registry, new NullLogService(), new TestConfigurationService(), storageService));
        mcpService.updateCollectedServers();
        const instaService = ds.add(parentInsta2.createChild(new ServiceCollection([IMcpRegistry, registry], [IMcpService, mcpService])));
        fs = ds.add(instaService.createInstance(McpResourceFilesystem));
        transport = ds.add(new TestMcpMessageTransport());
        registry.makeTestTransport = () => transport;
    });
    test('reads a basic file', async () => {
        transport.setResponder('resources/read', msg => {
            const request = msg;
            assert.strictEqual(request.params.uri, 'custom://hello/world.txt');
            return {
                id: request.id,
                jsonrpc: '2.0',
                result: {
                    contents: [{ uri: request.params.uri, text: 'Hello World' }],
                }
            };
        });
        const response = await fs.readFile(URI.parse('mcp-resource://746573742D736572766572/custom/hello/world.txt'));
        assert.strictEqual(new TextDecoder().decode(response), 'Hello World');
    });
    test('stat returns file information', async () => {
        transport.setResponder('resources/read', msg => {
            const request = msg;
            assert.strictEqual(request.params.uri, 'custom://hello/world.txt');
            return {
                id: request.id,
                jsonrpc: '2.0',
                result: {
                    contents: [{ uri: request.params.uri, text: 'Hello World' }],
                }
            };
        });
        const fileStats = await fs.stat(URI.parse('mcp-resource://746573742D736572766572/custom/hello/world.txt'));
        assert.strictEqual(fileStats.type, FileType.File);
        assert.strictEqual(fileStats.size, 'Hello World'.length);
    });
    test('stat returns directory information', async () => {
        transport.setResponder('resources/read', msg => {
            const request = msg;
            assert.strictEqual(request.params.uri, 'custom://hello');
            return {
                id: request.id,
                jsonrpc: '2.0',
                result: {
                    contents: [
                        { uri: 'custom://hello/file1.txt', text: 'File 1' },
                        { uri: 'custom://hello/file2.txt', text: 'File 2' },
                    ],
                }
            };
        });
        const dirStats = await fs.stat(URI.parse('mcp-resource://746573742D736572766572/custom/hello/'));
        assert.strictEqual(dirStats.type, FileType.Directory);
        // Size should be sum of all file contents in the directory
        assert.strictEqual(dirStats.size, 'File 1'.length + 'File 2'.length);
    });
    test('stat throws FileNotFound for nonexistent resources', async () => {
        transport.setResponder('resources/read', msg => {
            const request = msg;
            return {
                id: request.id,
                jsonrpc: '2.0',
                result: {
                    contents: [],
                }
            };
        });
        await assert.rejects(() => fs.stat(URI.parse('mcp-resource://746573742D736572766572/custom/nonexistent.txt')), (err) => toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.FileNotFound);
    });
    test('readdir returns directory contents', async () => {
        transport.setResponder('resources/read', msg => {
            const request = msg;
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
                }
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
            const request = msg;
            return {
                id: request.id,
                jsonrpc: '2.0',
                result: {
                    contents: [{ uri: request.params.uri, text: 'This is a file' }],
                }
            };
        });
        await assert.rejects(() => fs.readdir(URI.parse('mcp-resource://746573742D736572766572/custom/hello/file.txt')), (err) => toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.FileNotADirectory);
    });
    test('watch file emits change events', async () => {
        // Set up the responder for resource reading
        transport.setResponder('resources/read', msg => {
            const request = msg;
            return {
                id: request.id,
                jsonrpc: '2.0',
                result: {
                    contents: [{ uri: request.params.uri, text: 'File content' }],
                }
            };
        });
        const didSubscribe = new Barrier();
        // Set up the responder for resource subscription
        transport.setResponder('resources/subscribe', msg => {
            const request = msg;
            didSubscribe.open();
            return {
                id: request.id,
                jsonrpc: '2.0',
                result: {},
            };
        });
        const uri = URI.parse('mcp-resource://746573742D736572766572/custom/hello/file.txt');
        const fileChanges = [];
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
        assert.strictEqual(fileChanges[0].type, 0 /* FileChangeType.UPDATED */);
        assert.strictEqual(fileChanges[0].resource.toString(), uri.toString());
        // Clean up
        disposable.dispose();
        watchDisposable.dispose();
    });
    test('read blob resource', async () => {
        const blobBase64 = 'SGVsbG8gV29ybGQgYXMgQmxvYg=='; // "Hello World as Blob" in base64
        transport.setResponder('resources/read', msg => {
            const params = msg;
            assert.strictEqual(params.params.uri, 'custom://hello/blob.bin');
            return {
                id: params.id,
                jsonrpc: '2.0',
                result: {
                    contents: [{ uri: params.params.uri, blob: blobBase64 }],
                }
            };
        });
        const response = await fs.readFile(URI.parse('mcp-resource://746573742D736572766572/custom/hello/blob.bin'));
        assert.strictEqual(new TextDecoder().decode(response), 'Hello World as Blob');
    });
    test('throws error for write operations', async () => {
        const uri = URI.parse('mcp-resource://746573742D736572766572/custom/hello/file.txt');
        await assert.rejects(async () => fs.writeFile(uri, new Uint8Array(), { create: true, overwrite: true, atomic: false, unlock: false }), (err) => toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.NoPermissions);
        await assert.rejects(async () => fs.delete(uri, { recursive: false, useTrash: false, atomic: false }), (err) => toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.NoPermissions);
        await assert.rejects(async () => fs.mkdir(uri), (err) => toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.NoPermissions);
        await assert.rejects(async () => fs.rename(uri, URI.parse('mcp-resource://746573742D736572766572/custom/hello/newfile.txt'), { overwrite: false }), (err) => toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.NoPermissions);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwUmVzb3VyY2VGaWxlc3lzdGVtLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tY3AvdGVzdC9jb21tb24vbWNwUmVzb3VyY2VGaWxlc3lzdGVtLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDakMsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFrQiwyQkFBMkIsRUFBRSxRQUFRLEVBQWUsWUFBWSxFQUFFLDZCQUE2QixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDaEwsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFDdEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFFLGNBQWMsRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDM0YsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ2pHLE9BQU8s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