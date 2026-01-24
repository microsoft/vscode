/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { McpBundleService, McpBundleServiceError } from '../../node/mcpBundleService.js';
import { IMcpServerPackage, RegistryType, TransportType } from '../../common/mcpManagement.js';
import { IFileService, IFileStatWithMetadata } from '../../../files/common/files.js';
import { IDownloadService } from '../../../download/common/download.js';
import { NullLogService } from '../../../log/common/log.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { newWriteableStream } from '../../../../base/common/stream.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { FileService } from '../../../files/common/fileService.js';
import { DiskFileSystemProvider } from '../../../files/node/diskFileSystemProvider.js';
import { FileAccess, Schemas } from '../../../../base/common/network.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { basename, join } from '../../../../base/common/path.js';

// Test MCPB file checksum (created during test setup)
const TEST_MCPB_CHECKSUM = '01a15fd1e53d6dfe8585d41dda484c163a53fe9b658fb6414dc998333f653634';

/**
 * Creates a mock file service for testing.
 */
function createMockFileService(files: Map<string, VSBuffer>): Partial<IFileService> {
	const baseStat = {
		mtime: Date.now(),
		ctime: Date.now(),
		etag: '',
		readonly: false,
		locked: false,
		executable: false,
	};

	return {
		exists: async (resource: URI) => files.has(resource.fsPath),
		readFile: async (resource: URI) => {
			const content = files.get(resource.fsPath);
			if (!content) {
				throw new Error(`File not found: ${resource.fsPath}`);
			}
			return { value: content, name: basename(resource.fsPath), resource, size: content.byteLength, ...baseStat };
		},
		readFileStream: async (resource: URI) => {
			const content = files.get(resource.fsPath);
			if (!content) {
				throw new Error(`File not found: ${resource.fsPath}`);
			}
			const stream = newWriteableStream<VSBuffer>(data => VSBuffer.concat(data.map(d => d)));
			stream.end(content);
			return { value: stream, name: basename(resource.fsPath), resource, size: content.byteLength, ...baseStat };
		},
		createFolder: async (resource: URI): Promise<IFileStatWithMetadata> => ({
			resource,
			name: basename(resource.fsPath),
			isFile: false,
			isDirectory: true,
			isSymbolicLink: false,
			size: 0,
			children: undefined,
			...baseStat
		}),
		del: async () => { },
		writeFile: async (resource: URI, content: VSBuffer): Promise<IFileStatWithMetadata> => {
			files.set(resource.fsPath, content);
			return {
				resource,
				name: basename(resource.fsPath),
				isFile: true,
				isDirectory: false,
				isSymbolicLink: false,
				size: content.byteLength,
				children: undefined,
				...baseStat
			};
		},
	};
}

/**
 * Creates a mock download service for testing.
 */
function createMockDownloadService(downloadContent: VSBuffer): Partial<IDownloadService> {
	return {
		download: async (uri: URI, to: URI) => {
			// Simulate writing the downloaded content to the destination
			fs.writeFileSync(to.fsPath, downloadContent.buffer);
		}
	};
}

/**
 * Helper to access private methods for testing
 */
interface McpBundleServiceTestable {
	getBundleUrl(serverPackage: IMcpServerPackage): URI | undefined;
	verifyChecksum(filePath: URI, expectedSha256: string): Promise<void>;
}

suite('McpBundleService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('getBundleUrl', () => {
		test('should extract URL from identifier when identifier is a full URL', () => {
			const service = new McpBundleService(
				createMockFileService(new Map()) as IFileService,
				createMockDownloadService(VSBuffer.fromString('')) as IDownloadService,
				new NullLogService()
			);

			const serverPackage: IMcpServerPackage = {
				registryType: RegistryType.MCPB,
				identifier: 'https://github.com/example/releases/download/v1.0.0/server.mcpb',
				transport: { type: TransportType.STDIO }
			};

			// Access private method via interface cast
			const url = (service as unknown as McpBundleServiceTestable).getBundleUrl(serverPackage);
			assert.strictEqual(url?.toString(), 'https://github.com/example/releases/download/v1.0.0/server.mcpb');
		});

		test('should construct URL from registryBaseUrl when identifier is not a URL', () => {
			const service = new McpBundleService(
				createMockFileService(new Map()) as IFileService,
				createMockDownloadService(VSBuffer.fromString('')) as IDownloadService,
				new NullLogService()
			);

			const serverPackage: IMcpServerPackage = {
				registryType: RegistryType.MCPB,
				identifier: 'my-server',
				registryBaseUrl: 'https://registry.example.com',
				version: '1.0.0',
				transport: { type: TransportType.STDIO }
			};

			const url = (service as unknown as McpBundleServiceTestable).getBundleUrl(serverPackage);
			assert.strictEqual(url?.toString(), 'https://registry.example.com/my-server/1.0.0/bundle.zip');
		});

		test('should use registryBaseUrl directly if it ends with .zip', () => {
			const service = new McpBundleService(
				createMockFileService(new Map()) as IFileService,
				createMockDownloadService(VSBuffer.fromString('')) as IDownloadService,
				new NullLogService()
			);

			const serverPackage: IMcpServerPackage = {
				registryType: RegistryType.MCPB,
				identifier: 'my-server',
				registryBaseUrl: 'https://example.com/bundles/server.zip',
				transport: { type: TransportType.STDIO }
			};

			const url = (service as unknown as McpBundleServiceTestable).getBundleUrl(serverPackage);
			assert.strictEqual(url?.toString(), 'https://example.com/bundles/server.zip');
		});

		test('should return undefined when no URL source is available', () => {
			const service = new McpBundleService(
				createMockFileService(new Map()) as IFileService,
				createMockDownloadService(VSBuffer.fromString('')) as IDownloadService,
				new NullLogService()
			);

			const serverPackage: IMcpServerPackage = {
				registryType: RegistryType.MCPB,
				identifier: 'my-server', // Not a URL
				transport: { type: TransportType.STDIO }
				// No registryBaseUrl
			};

			const url = (service as unknown as McpBundleServiceTestable).getBundleUrl(serverPackage);
			assert.strictEqual(url, undefined);
		});
	});

	suite('readManifest', () => {
		test('should parse valid manifest.json manifest', async () => {
			const manifest = JSON.stringify({
				command: './bin/server',
				args: ['--port', '8080'],
				env: { NODE_ENV: 'production' },
				cwd: './app'
			});

			const files = new Map<string, VSBuffer>();
			files.set('/test/bundle/manifest.json', VSBuffer.fromString(manifest));

			const service = new McpBundleService(
				createMockFileService(files) as IFileService,
				createMockDownloadService(VSBuffer.fromString('')) as IDownloadService,
				new NullLogService()
			);

			const result = await service.readManifest(URI.file('/test/bundle'));

			assert.strictEqual(result.command, './bin/server');
			assert.deepStrictEqual(result.args, ['--port', '8080']);
			assert.deepStrictEqual(result.env, { NODE_ENV: 'production' });
			assert.strictEqual(result.cwd, './app');
		});

		test('should throw MISSING_MANIFEST when manifest.json does not exist', async () => {
			const files = new Map<string, VSBuffer>();
			// No manifest.json file

			const service = new McpBundleService(
				createMockFileService(files) as IFileService,
				createMockDownloadService(VSBuffer.fromString('')) as IDownloadService,
				new NullLogService()
			);

			try {
				await service.readManifest(URI.file('/test/bundle'));
				assert.fail('Should have thrown');
			} catch (e) {
				assert.ok(e instanceof McpBundleServiceError);
				assert.strictEqual(e.code, 'MISSING_MANIFEST');
			}
		});

		test('should throw INVALID_MANIFEST when command field is missing', async () => {
			const manifest = JSON.stringify({
				args: ['--help']
				// Missing required 'command' field
			});

			const files = new Map<string, VSBuffer>();
			files.set('/test/bundle/manifest.json', VSBuffer.fromString(manifest));

			const service = new McpBundleService(
				createMockFileService(files) as IFileService,
				createMockDownloadService(VSBuffer.fromString('')) as IDownloadService,
				new NullLogService()
			);

			try {
				await service.readManifest(URI.file('/test/bundle'));
				assert.fail('Should have thrown');
			} catch (e) {
				assert.ok(e instanceof McpBundleServiceError);
				assert.strictEqual(e.code, 'INVALID_MANIFEST');
			}
		});

		test('should throw INVALID_MANIFEST when args is not an array', async () => {
			const manifest = JSON.stringify({
				command: './server',
				args: '--help' // Should be an array
			});

			const files = new Map<string, VSBuffer>();
			files.set('/test/bundle/manifest.json', VSBuffer.fromString(manifest));

			const service = new McpBundleService(
				createMockFileService(files) as IFileService,
				createMockDownloadService(VSBuffer.fromString('')) as IDownloadService,
				new NullLogService()
			);

			try {
				await service.readManifest(URI.file('/test/bundle'));
				assert.fail('Should have thrown');
			} catch (e) {
				assert.ok(e instanceof McpBundleServiceError);
				assert.strictEqual(e.code, 'INVALID_MANIFEST');
			}
		});

		test('should throw INVALID_MANIFEST when env is not an object', async () => {
			const manifest = JSON.stringify({
				command: './server',
				env: ['KEY=VALUE'] // Should be an object
			});

			const files = new Map<string, VSBuffer>();
			files.set('/test/bundle/manifest.json', VSBuffer.fromString(manifest));

			const service = new McpBundleService(
				createMockFileService(files) as IFileService,
				createMockDownloadService(VSBuffer.fromString('')) as IDownloadService,
				new NullLogService()
			);

			try {
				await service.readManifest(URI.file('/test/bundle'));
				assert.fail('Should have thrown');
			} catch (e) {
				assert.ok(e instanceof McpBundleServiceError);
				assert.strictEqual(e.code, 'INVALID_MANIFEST');
			}
		});

		test('should throw INVALID_MANIFEST on invalid JSON', async () => {
			const files = new Map<string, VSBuffer>();
			files.set('/test/bundle/manifest.json', VSBuffer.fromString('{ invalid json }'));

			const service = new McpBundleService(
				createMockFileService(files) as IFileService,
				createMockDownloadService(VSBuffer.fromString('')) as IDownloadService,
				new NullLogService()
			);

			try {
				await service.readManifest(URI.file('/test/bundle'));
				assert.fail('Should have thrown');
			} catch (e) {
				assert.ok(e instanceof McpBundleServiceError);
				assert.strictEqual(e.code, 'INVALID_MANIFEST');
			}
		});
	});

	suite('verifyChecksum', () => {
		test('should verify matching checksum', async () => {
			const content = 'test file content';
			const expectedHash = createHash('sha256').update(content).digest('hex');

			const files = new Map<string, VSBuffer>();
			files.set('/test/file.zip', VSBuffer.fromString(content));

			const service = new McpBundleService(
				createMockFileService(files) as IFileService,
				createMockDownloadService(VSBuffer.fromString('')) as IDownloadService,
				new NullLogService()
			);

			// Should not throw
			await (service as unknown as McpBundleServiceTestable).verifyChecksum(URI.file('/test/file.zip'), expectedHash);
		});

		test('should throw CHECKSUM_MISMATCH on non-matching checksum', async () => {
			const content = 'test file content';
			const wrongHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

			const files = new Map<string, VSBuffer>();
			files.set('/test/file.zip', VSBuffer.fromString(content));

			const service = new McpBundleService(
				createMockFileService(files) as IFileService,
				createMockDownloadService(VSBuffer.fromString('')) as IDownloadService,
				new NullLogService()
			);

			try {
				await (service as unknown as McpBundleServiceTestable).verifyChecksum(URI.file('/test/file.zip'), wrongHash);
				assert.fail('Should have thrown');
			} catch (e) {
				assert.ok(e instanceof McpBundleServiceError);
				assert.strictEqual(e.code, 'CHECKSUM_MISMATCH');
			}
		});

		test('should handle uppercase and 0x prefix in expected checksum', async () => {
			const content = 'test file content';
			const expectedHash = createHash('sha256').update(content).digest('hex');
			const uppercaseWithPrefix = '0x' + expectedHash.toUpperCase();

			const files = new Map<string, VSBuffer>();
			files.set('/test/file.zip', VSBuffer.fromString(content));

			const service = new McpBundleService(
				createMockFileService(files) as IFileService,
				createMockDownloadService(VSBuffer.fromString('')) as IDownloadService,
				new NullLogService()
			);

			// Should not throw - normalization should handle this
			await (service as unknown as McpBundleServiceTestable).verifyChecksum(URI.file('/test/file.zip'), uppercaseWithPrefix);
		});
	});

	suite('downloadAndExtract (integration)', () => {
		let disposables: DisposableStore;
		let tempDir: string;
		let fileService: FileService;

		setup(async () => {
			disposables = new DisposableStore();

			// Create a real file service for integration tests
			fileService = disposables.add(new FileService(new NullLogService()));
			const diskFileSystemProvider = disposables.add(new DiskFileSystemProvider(new NullLogService()));
			disposables.add(fileService.registerProvider(Schemas.file, diskFileSystemProvider));

			// Create temp directory for test
			tempDir = fs.mkdtempSync(join(os.tmpdir(), 'mcpb-test-'));
		});

		teardown(async () => {
			disposables.dispose();
			// Clean up temp directory
			if (tempDir && fs.existsSync(tempDir)) {
				fs.rmSync(tempDir, { recursive: true, force: true });
			}
		});

		test('should download, verify checksum, extract, and read manifest', async () => {
			// Read the test MCPB file from fixtures
			const fixturesDir = FileAccess.asFileUri('vs/platform/mcp/test/node/fixtures').fsPath;
			const testMcpbPath = join(fixturesDir, 'test-server.mcpb');

			// Skip if fixtures don't exist (for CI environments)
			if (!fs.existsSync(testMcpbPath)) {
				return;
			}

			const mcpbContent = VSBuffer.wrap(fs.readFileSync(testMcpbPath));

			// Create mock download service that returns the test MCPB file
			const downloadService: Partial<IDownloadService> = {
				download: async (_uri: URI, to: URI) => {
					fs.writeFileSync(to.fsPath, mcpbContent.buffer);
				}
			};

			const service = new McpBundleService(
				fileService,
				downloadService as IDownloadService,
				new NullLogService()
			);

			const serverPackage: IMcpServerPackage = {
				registryType: RegistryType.MCPB,
				identifier: 'https://example.com/test-server.mcpb',
				fileSha256: TEST_MCPB_CHECKSUM,
				transport: { type: TransportType.STDIO }
			};

			const targetDir = URI.file(tempDir);
			const result = await service.downloadAndExtract(serverPackage, targetDir, CancellationToken.None);

			// Verify extraction path
			assert.ok(result.extractedPath.fsPath.includes('test-server'));
			assert.ok(fs.existsSync(result.extractedPath.fsPath));

			// Verify manifest was read correctly
			assert.strictEqual(result.manifest.command, './server.sh');
			assert.deepStrictEqual(result.manifest.args, ['--test']);
			assert.deepStrictEqual(result.manifest.env, { TEST_VAR: 'test-value' });

			// Verify the extracted files exist
			const manifestJsonPath = join(result.extractedPath.fsPath, 'manifest.json');
			const serverShPath = join(result.extractedPath.fsPath, 'server.sh');
			assert.ok(fs.existsSync(manifestJsonPath), 'manifest.json should exist');
			assert.ok(fs.existsSync(serverShPath), 'server.sh should exist');
		});

		test('should fail with CHECKSUM_MISMATCH for wrong checksum', async () => {
			// Read the test MCPB file from fixtures
			const fixturesDir = FileAccess.asFileUri('vs/platform/mcp/test/node/fixtures').fsPath;
			const testMcpbPath = join(fixturesDir, 'test-server.mcpb');

			// Skip if fixtures don't exist
			if (!fs.existsSync(testMcpbPath)) {
				return;
			}

			const mcpbContent = VSBuffer.wrap(fs.readFileSync(testMcpbPath));

			const downloadService: Partial<IDownloadService> = {
				download: async (_uri: URI, to: URI) => {
					fs.writeFileSync(to.fsPath, mcpbContent.buffer);
				}
			};

			const service = new McpBundleService(
				fileService,
				downloadService as IDownloadService,
				new NullLogService()
			);

			const serverPackage: IMcpServerPackage = {
				registryType: RegistryType.MCPB,
				identifier: 'https://example.com/test-server.mcpb',
				fileSha256: 'wrong_checksum_0000000000000000000000000000000000000000000000000000',
				transport: { type: TransportType.STDIO }
			};

			const targetDir = URI.file(tempDir);

			try {
				await service.downloadAndExtract(serverPackage, targetDir, CancellationToken.None);
				assert.fail('Should have thrown CHECKSUM_MISMATCH');
			} catch (e) {
				assert.ok(e instanceof McpBundleServiceError);
				assert.strictEqual(e.code, 'CHECKSUM_MISMATCH');
			}
		});

		test('should succeed without checksum verification when fileSha256 is not provided', async () => {
			// Read the test MCPB file from fixtures
			const fixturesDir = FileAccess.asFileUri('vs/platform/mcp/test/node/fixtures').fsPath;
			const testMcpbPath = join(fixturesDir, 'test-server.mcpb');

			// Skip if fixtures don't exist
			if (!fs.existsSync(testMcpbPath)) {
				return;
			}

			const mcpbContent = VSBuffer.wrap(fs.readFileSync(testMcpbPath));

			const downloadService: Partial<IDownloadService> = {
				download: async (_uri: URI, to: URI) => {
					fs.writeFileSync(to.fsPath, mcpbContent.buffer);
				}
			};

			const service = new McpBundleService(
				fileService,
				downloadService as IDownloadService,
				new NullLogService()
			);

			const serverPackage: IMcpServerPackage = {
				registryType: RegistryType.MCPB,
				identifier: 'https://example.com/test-server.mcpb',
				// No fileSha256 - should skip checksum verification
				transport: { type: TransportType.STDIO }
			};

			const targetDir = URI.file(tempDir);
			const result = await service.downloadAndExtract(serverPackage, targetDir, CancellationToken.None);

			// Should succeed
			assert.ok(result.extractedPath.fsPath.includes('test-server'));
			assert.strictEqual(result.manifest.command, './server.sh');
		});
	});
});
