/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IAllowedMcpServersService, IGalleryMcpServer, IMcpGalleryService, IMcpManagementService, IInstallableMcpServer } from '../../../../../platform/mcp/common/mcpManagement.js';
import { McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IMcpResourceScannerService, McpResourceScannerService } from '../../../../../platform/mcp/common/mcpResourceScannerService.js';
import { McpResourceFormat } from '../../../../../platform/mcp/common/mcpWorkspaceConfiguration.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IUserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService, IWorkspaceFoldersChangeEvent, toWorkspaceFolder, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { Workspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestUserDataProfileService } from '../../../../test/common/workbenchTestServices.js';
import { IRemoteAgentService } from '../../../remote/common/remoteAgentService.js';
import { IUserDataProfileService } from '../../../userDataProfile/common/userDataProfile.js';
import { IRemoteUserDataProfilesService } from '../../../userDataProfile/common/remoteUserDataProfiles.js';
import { WorkbenchMcpManagementService, WorkspaceMcpConfigKind } from '../../common/mcpWorkbenchManagementService.js';

suite('WorkbenchMcpManagementService - workspace configurations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const folder = toWorkspaceFolder(URI.from({ scheme: Schemas.inMemory, path: '/workspace' }));
	const rootResource = folder.toResource('.mcp.json');
	const legacyResource = folder.toResource('.vscode/mcp.json');
	const server: IInstallableMcpServer = { name: 'same', config: { type: McpServerType.LOCAL, command: 'node' } };

	async function createFixture(options: { initialScan?: Promise<void>; allowed?: boolean; rootContent?: string; legacyContent?: string } = {}) {
		const logService = store.add(new NullLogService());
		const fileService = store.add(new FileService(logService));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
		await fileService.createFolder(folder.uri);
		if (options.rootContent) {
			await fileService.writeFile(rootResource, VSBuffer.fromString(options.rootContent));
		}
		if (options.legacyContent) {
			await fileService.writeFile(legacyResource, VSBuffer.fromString(options.legacyContent));
		}
		const uriIdentityService = store.add(new UriIdentityService(fileService));
		const scanner = store.add(new class extends McpResourceScannerService {
			override async scanMcpServers(...args: Parameters<McpResourceScannerService['scanMcpServers']>) {
				await options.initialScan;
				return super.scanMcpServers(...args);
			}
		}(fileService, uriIdentityService));
		const profileService = new TestUserDataProfileService();
		const foldersChanged = store.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		let workspace = new Workspace('test', [folder]);
		const userManagement = upcastPartial<IMcpManagementService>({
			onInstallMcpServer: Event.None,
			onDidInstallMcpServers: Event.None,
			onDidUpdateMcpServers: Event.None,
			onUninstallMcpServer: Event.None,
			onDidUninstallMcpServer: Event.None,
			getInstalled: async () => [],
		});
		const services = new ServiceCollection(
			[IAllowedMcpServersService, upcastPartial<IAllowedMcpServersService>({
				onDidChangeAllowedMcpServers: Event.None,
				isAllowed: () => options.allowed === false ? new MarkdownString('Blocked by policy') : true,
				isServerAllowed: () => true,
			})],
			[ILogService, logService],
			[IFileService, fileService],
			[IUriIdentityService, uriIdentityService],
			[IMcpResourceScannerService, scanner],
			[IMcpGalleryService, upcastPartial<IMcpGalleryService>({ getMcpServersFromGallery: async () => [] })],
			[IUserDataProfileService, profileService],
			[IUserDataProfilesService, upcastPartial<IUserDataProfilesService>({ profiles: [profileService.currentProfile] })],
			[IRemoteUserDataProfilesService, upcastPartial<IRemoteUserDataProfilesService>({ getRemoteProfile: async profile => profile })],
			[IRemoteAgentService, upcastPartial<IRemoteAgentService>({ getConnection: () => null })],
			[IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
				getWorkspace: () => workspace,
				onDidChangeWorkspaceFolders: foldersChanged.event,
				onDidChangeWorkbenchState: Event.None,
			})],
		);
		const instantiationService = store.add(new TestInstantiationService(services));
		const service = store.add(new WorkbenchMcpManagementService(
			userManagement,
			instantiationService.get(IAllowedMcpServersService),
			logService,
			profileService,
			uriIdentityService,
			instantiationService.get(IWorkspaceContextService),
			instantiationService.get(IRemoteAgentService),
			instantiationService.get(IUserDataProfilesService),
			instantiationService.get(IRemoteUserDataProfilesService),
			instantiationService,
		));
		return {
			service, fileService,
			changeWorkspace(next: Workspace, event: IWorkspaceFoldersChangeEvent) {
				workspace = next;
				foldersChanged.fire(event);
			},
		};
	}

	test('waits for initial root management readiness before installing', async () => {
		const initialScan = new DeferredPromise<void>();
		const { service, fileService } = await createFixture({ initialScan: initialScan.p });
		let settled = false;
		const installing = service.install(server, { target: folder, workspaceConfig: WorkspaceMcpConfigKind.Root }).then(local => {
			settled = true;
			return local;
		});
		await timeout(0);
		const settledBeforeScan = settled;
		await initialScan.complete();
		const local = await installing;
		assert.deepStrictEqual({
			settledBeforeScan,
			id: local.id,
			format: local.format,
			rootExists: await fileService.exists(rootResource),
			legacyExists: await fileService.exists(legacyResource),
		}, {
			settledBeforeScan: false,
			id: 'workspace-dot-mcp.0.same',
			format: McpResourceFormat.WorkspaceRoot,
			rootExists: true,
			legacyExists: false,
		});
	});

	test('defaults to legacy while managing and removing same-name root entries independently', async () => {
		const { service, fileService } = await createFixture();
		const legacy = await service.install(server, { target: folder });
		const root = await service.install(server, { target: folder, workspaceConfig: WorkspaceMcpConfigKind.Root });
		const installed = (await service.getInstalled()).map(local => ({ id: local.id, format: local.format })).sort((a, b) => a.id.localeCompare(b.id));
		await service.uninstall(root);
		assert.deepStrictEqual({
			installed,
			remaining: (await service.getInstalled()).map(local => local.id),
			legacy: JSON.parse((await fileService.readFile(legacyResource)).value.toString()).servers,
			root: JSON.parse((await fileService.readFile(rootResource)).value.toString()).mcpServers,
		}, {
			installed: [{ id: legacy.id, format: McpResourceFormat.Vscode }, { id: root.id, format: McpResourceFormat.WorkspaceRoot }],
			remaining: [legacy.id],
			legacy: { same: server.config },
			root: {},
		});
	});

	test('scans both existing formats and watches root edits without updating legacy entries', async () => {
		const { service, fileService } = await createFixture({
			rootContent: '{"mcpServers":{"same":{"command":"root"}}}',
			legacyContent: '{"servers":{"same":{"type":"stdio","command":"legacy"}}}',
		});
		await service.getInstalled();
		const updated = Event.toPromise(Event.filter(service.onDidUpdateMcpServersInCurrentProfile, results => results.some(result => result.local?.config.type === McpServerType.LOCAL && result.local.config.command === 'changed')));
		await fileService.writeFile(rootResource, VSBuffer.fromString('{"mcpServers":{"same":{"command":"changed"}}}'));
		await updated;
		assert.deepStrictEqual((await service.getInstalled()).map(local => ({
			id: local.id,
			command: local.config.type === McpServerType.LOCAL ? local.config.command : undefined,
		})).sort((a, b) => a.id.localeCompare(b.id)), [
			{ id: 'mcp.config.ws0.same', command: 'legacy' },
			{ id: 'workspace-dot-mcp.0.same', command: 'changed' },
		]);
	});

	test('rejects root gallery and unsupported manual configurations without changing either file', async () => {
		const { service, fileService } = await createFixture();
		await assert.rejects(service.installFromGallery(upcastPartial<IGalleryMcpServer>({ name: 'gallery' }), { target: folder, workspaceConfig: WorkspaceMcpConfigKind.Root }), /Gallery MCP/);
		await assert.rejects(service.installFromGallery(upcastPartial<IGalleryMcpServer>({ name: 'gallery' }), { mcpResource: rootResource }), /Gallery MCP/);
		await assert.rejects(service.install({ ...server, config: { ...server.config, dev: { watch: '**/*.ts' } } }, { target: folder, workspaceConfig: WorkspaceMcpConfigKind.Root }), /not supported/);
		await assert.rejects(service.install(server, { target: ConfigurationTarget.USER, workspaceConfig: WorkspaceMcpConfigKind.Root }), /workspace folder/);
		assert.deepStrictEqual([await fileService.exists(rootResource), await fileService.exists(legacyResource)], [false, false]);
	});

	test('preserves persistence policy enforcement for root installs', async () => {
		const { service, fileService } = await createFixture({ allowed: false });
		await assert.rejects(service.install(server, { target: folder, workspaceConfig: WorkspaceMcpConfigKind.Root }), /Blocked by policy/);
		assert.deepStrictEqual({
			installed: await service.getInstalled(),
			exists: await fileService.exists(rootResource),
		}, { installed: [], exists: false });
	});

	test('waits for newly added folder management before its first root install', async () => {
		const { service, fileService, changeWorkspace } = await createFixture();
		await service.getInstalled();
		const added = new WorkspaceFolder({ uri: URI.from({ scheme: Schemas.inMemory, path: '/added' }), name: 'added', index: 1 });
		await fileService.createFolder(added.uri);
		changeWorkspace(new Workspace('test', [folder, added]), { added: [added], removed: [], changed: [] });
		const local = await service.install(server, { target: added, workspaceConfig: WorkspaceMcpConfigKind.Root });
		assert.deepStrictEqual({
			resource: local.mcpResource.toString(),
			id: local.id,
			exists: await fileService.exists(added.toResource('.mcp.json')),
		}, { resource: added.toResource('.mcp.json').toString(), id: 'workspace-dot-mcp.1.same', exists: true });
	});

	test('updates root identities when a retained workspace folder index changes', async () => {
		const { service, fileService, changeWorkspace } = await createFixture();
		await service.getInstalled();
		const added = new WorkspaceFolder({ uri: URI.from({ scheme: Schemas.inMemory, path: '/added' }), name: 'added', index: 1 });
		await fileService.createFolder(added.uri);
		changeWorkspace(new Workspace('test', [folder, added]), { added: [added], removed: [], changed: [] });
		await service.install(server, { target: added, workspaceConfig: WorkspaceMcpConfigKind.Root });
		const changed = new WorkspaceFolder({ uri: added.uri, name: added.name, index: 0 });
		const updated = Event.toPromise(service.onDidUpdateMcpServersInCurrentProfile);
		changeWorkspace(new Workspace('test', [changed]), { added: [], removed: [folder], changed: [changed] });
		const results = await updated;
		assert.deepStrictEqual({
			updated: results.map(result => result.local?.id),
			installed: (await service.getInstalled()).map(local => local.id),
		}, { updated: ['workspace-dot-mcp.0.same'], installed: ['workspace-dot-mcp.0.same'] });
	});
});
