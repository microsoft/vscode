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
import { IChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IAllowedMcpServersService, IGalleryMcpServer, IMcpGalleryService, IMcpManagementService, IInstallableMcpServer } from '../../../../../platform/mcp/common/mcpManagement.js';
import { McpManagementChannel, McpManagementChannelClient } from '../../../../../platform/mcp/common/mcpManagementIpc.js';
import { McpManagementService } from '../../../../../platform/mcp/common/mcpManagementService.js';
import { IMcpServerConfiguration, McpServerType, McpServerVariableType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IMcpResourceScannerService, McpResourceScannerService } from '../../../../../platform/mcp/common/mcpResourceScannerService.js';
import { McpResourceFormat } from '../../../../../platform/mcp/common/mcpWorkspaceConfiguration.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IUserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService, IWorkspaceFoldersChangeEvent, toWorkspaceFolder, WorkbenchState, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { Workspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestUserDataProfileService } from '../../../../test/common/workbenchTestServices.js';
import { IRemoteAgentConnection, IRemoteAgentService } from '../../../remote/common/remoteAgentService.js';
import { IUserDataProfileService } from '../../../userDataProfile/common/userDataProfile.js';
import { UserDataProfileService } from '../../../userDataProfile/common/userDataProfileService.js';
import { IRemoteUserDataProfilesService } from '../../../userDataProfile/common/remoteUserDataProfiles.js';
import { WorkbenchMcpManagementService, WorkspaceMcpConfigKind } from '../../common/mcpWorkbenchManagementService.js';
import { IMcpWorkspaceInstallTargetService, McpWorkspaceInstallTargetService } from '../../common/mcpWorkspaceInstallTargetService.js';

suite('WorkbenchMcpManagementService - workspace configurations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const folder = toWorkspaceFolder(URI.from({ scheme: Schemas.inMemory, path: '/workspace' }));
	const rootResource = folder.toResource('.mcp.json');
	const legacyResource = folder.toResource('.vscode/mcp.json');
	const userResource = URI.from({ scheme: Schemas.inMemory, path: '/user/mcp.json' });
	const remoteUserResource = URI.from({ scheme: Schemas.inMemory, path: '/remote-user/mcp.json' });
	const remoteProfileResource = URI.from({ scheme: Schemas.inMemory, path: '/remote-user/profiles/other/mcp.json' });
	const server: IInstallableMcpServer = { name: 'same', config: { type: McpServerType.LOCAL, command: 'node' } };

	async function createFixture(options: { initialScan?: Promise<void>; beforeScan?: (resource: URI) => Promise<void>; allowed?: boolean; rootContent?: string; legacyContent?: string; userContent?: string; remoteUserContent?: string; nonDefaultProfile?: boolean; workspaceConfiguration?: URI; folderTargetsOnly?: boolean } = {}) {
		const logService = store.add(new NullLogService());
		const fileService = store.add(new FileService(logService));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
		const defaultProfile = { ...new TestUserDataProfileService().currentProfile, isDefault: true, mcpResource: userResource };
		const profileService = store.add(new UserDataProfileService(options.nonDefaultProfile
			? { ...defaultProfile, id: 'other', isDefault: false, mcpResource: URI.joinPath(userResource, '..', 'profiles', 'other', 'mcp.json') }
			: defaultProfile));
		await fileService.createFolder(folder.uri);
		if (options.rootContent) {
			await fileService.writeFile(rootResource, VSBuffer.fromString(options.rootContent));
		}
		if (options.legacyContent) {
			await fileService.writeFile(legacyResource, VSBuffer.fromString(options.legacyContent));
		}
		if (options.userContent) {
			await fileService.writeFile(profileService.currentProfile.mcpResource, VSBuffer.fromString(options.userContent));
		}
		if (options.remoteUserContent) {
			await fileService.writeFile(remoteUserResource, VSBuffer.fromString(options.remoteUserContent));
		}
		const uriIdentityService = store.add(new UriIdentityService(fileService));
		const scanner = store.add(new class extends McpResourceScannerService {
			override async scanMcpServers(...args: Parameters<McpResourceScannerService['scanMcpServers']>) {
				await options.initialScan;
				await options.beforeScan?.(args[0]);
				return super.scanMcpServers(...args);
			}
		}(fileService, uriIdentityService));
		const foldersChanged = store.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		let workspace = new Workspace('test', [folder], options.workspaceConfiguration);
		let remoteConnection: IRemoteAgentConnection | null = null;
		const services = new ServiceCollection(
			[IAllowedMcpServersService, upcastPartial<IAllowedMcpServersService>({
				onDidChangeAllowedMcpServers: Event.None,
				isAllowed: () => options.allowed === false ? new MarkdownString('Blocked by policy') : true,
				isServerAllowedBeforeResolution: () => true,
				isServerAllowed: () => true,
			})],
			[ILogService, logService],
			[IFileService, fileService],
			[IUriIdentityService, uriIdentityService],
			[IMcpResourceScannerService, scanner],
			[IEnvironmentService, upcastPartial<IEnvironmentService>({ userRoamingDataHome: URI.joinPath(userResource, '..') })],
			[IMcpGalleryService, upcastPartial<IMcpGalleryService>({ getMcpServersFromGallery: async () => [] })],
			[IUserDataProfileService, profileService],
			[IUserDataProfilesService, upcastPartial<IUserDataProfilesService>({ profiles: options.nonDefaultProfile ? [defaultProfile, profileService.currentProfile] : [defaultProfile], defaultProfile })],
			[IRemoteUserDataProfilesService, upcastPartial<IRemoteUserDataProfilesService>({ getRemoteProfile: async profile => ({ ...profile, mcpResource: profile.isDefault ? remoteUserResource : remoteProfileResource }) })],
			[IRemoteAgentService, upcastPartial<IRemoteAgentService>({ getConnection: () => remoteConnection })],
			[IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
				getWorkspace: () => workspace,
				getWorkbenchState: () => workspace.configuration ? WorkbenchState.WORKSPACE : WorkbenchState.FOLDER,
				onDidChangeWorkspaceFolders: foldersChanged.event,
				onDidChangeWorkbenchState: Event.None,
			})],
		);
		const instantiationService = store.add(new TestInstantiationService(services));
		const createChannel = (managementService: IMcpManagementService): IChannel => {
			const channel = new McpManagementChannel<void>(managementService, () => null);
			return {
				listen: event => channel.listen(undefined, event),
				call: (command, args) => channel.call(undefined, command, args),
			};
		};
		const userManagement = store.add(instantiationService.createInstance(McpManagementService));
		const userManagementClient = store.add(instantiationService.createInstance(McpManagementChannelClient, createChannel(userManagement)));
		if (options.remoteUserContent !== undefined) {
			const remoteInstantiationService = store.add(instantiationService.createChild(new ServiceCollection(
				[IUserDataProfilesService, upcastPartial<IUserDataProfilesService>({ defaultProfile: { ...defaultProfile, mcpResource: remoteUserResource } })],
			)));
			const remoteManagement = store.add(remoteInstantiationService.createInstance(McpManagementService));
			const remoteChannel = createChannel(remoteManagement);
			remoteConnection = upcastPartial<IRemoteAgentConnection>({ getChannel: <T extends IChannel>() => remoteChannel as T });
		}
		const workspaceInstallTargetService = options.folderTargetsOnly
			? upcastPartial<IMcpWorkspaceInstallTargetService>({ getTargets: () => workspace.folders })
			: instantiationService.createInstance(McpWorkspaceInstallTargetService);
		const service = store.add(new WorkbenchMcpManagementService(
			userManagementClient,
			instantiationService.get(IAllowedMcpServersService),
			logService,
			profileService,
			uriIdentityService,
			instantiationService.get(IWorkspaceContextService),
			instantiationService.get(IRemoteAgentService),
			instantiationService.get(IUserDataProfilesService),
			instantiationService.get(IRemoteUserDataProfilesService),
			instantiationService,
			workspaceInstallTargetService,
			scanner,
		));
		return {
			service, fileService, profileService,
			changeWorkspace(next: Workspace, event: IWorkspaceFoldersChangeEvent) {
				workspace = next;
				foldersChanged.fire(event);
			},
		};
	}

	suite('input cleanup across scopes', () => {
		const shared = { id: 'shared', type: McpServerVariableType.PROMPT, description: 'Shared', password: false };
		const exclusive = { ...shared, id: 'exclusive' };
		const removed: IMcpServerConfiguration = { type: McpServerType.LOCAL, command: 'node', args: ['${input:shared}', '${input:exclusive}'] };
		const kept = { type: McpServerType.LOCAL, command: 'node', args: ['${input:shared}'] };

		for (const removeFromUser of [true, false]) {
			test(`preserves cross-scope input references when removing from user: ${removeFromUser}`, async () => {
				const source = { servers: { removed }, inputs: [shared, exclusive] };
				const consumer = { servers: { kept } };
				const { service, fileService } = await createFixture({
					userContent: JSON.stringify(removeFromUser ? source : consumer),
					legacyContent: JSON.stringify(removeFromUser ? consumer : source),
				});
				const local = (await service.getInstalled()).find(server => server.name === 'removed')!;

				await service.uninstall(local);

				assert.deepStrictEqual({
					source: JSON.parse((await fileService.readFile(removeFromUser ? userResource : legacyResource)).value.toString()),
					consumer: JSON.parse((await fileService.readFile(removeFromUser ? legacyResource : userResource)).value.toString()),
				}, { source: { servers: {}, inputs: [shared] }, consumer });
			});
		}

		test('preserves dependencies in another workspace folder and workspace sandbox', async () => {
			const workspaceResource = URI.from({ scheme: Schemas.inMemory, path: '/test.code-workspace' });
			const { service, fileService, changeWorkspace } = await createFixture({
				workspaceConfiguration: workspaceResource,
				userContent: JSON.stringify({ servers: { removed }, inputs: [shared, exclusive] }),
			});
			const second = new WorkspaceFolder({ uri: URI.from({ scheme: Schemas.inMemory, path: '/second' }), name: 'second', index: 1 });
			await fileService.writeFile(second.toResource('.vscode/mcp.json'), VSBuffer.fromString(JSON.stringify({
				servers: { kept },
			})));
			await fileService.writeFile(workspaceResource, VSBuffer.fromString(JSON.stringify({
				settings: { mcp: { sandbox: { filesystem: { allowWrite: ['${input:exclusive}'] } } } },
			})));
			changeWorkspace(new Workspace('test', [folder, second], workspaceResource), { added: [second], removed: [], changed: [] });
			const local = (await service.getInstalled()).find(server => server.name === 'removed')!;

			await service.uninstall(local);

			assert.deepStrictEqual(JSON.parse((await fileService.readFile(userResource)).value.toString()), { servers: {}, inputs: [shared, exclusive] });
		});

		test('cleans up exclusive user inputs when other scopes are empty', async () => {
			const { service, fileService } = await createFixture({ userContent: JSON.stringify({ servers: { removed }, inputs: [shared, exclusive] }) });
			const [local] = await service.getInstalled();

			await service.uninstall(local);

			assert.strictEqual(await fileService.exists(userResource), false);
		});

		for (const removeFromRemote of [true, false]) {
			test(`preserves references across local and remote user scopes when removing from remote: ${removeFromRemote}`, async () => {
				const source = { servers: { removed }, inputs: [shared, exclusive] };
				const consumer = { servers: { kept } };
				const { service, fileService } = await createFixture({
					userContent: JSON.stringify(removeFromRemote ? consumer : source),
					remoteUserContent: JSON.stringify(removeFromRemote ? source : consumer),
				});
				const local = (await service.getInstalled()).find(server => server.name === 'removed')!;

				await service.uninstall(local);

				assert.deepStrictEqual({
					source: JSON.parse((await fileService.readFile(removeFromRemote ? remoteUserResource : userResource)).value.toString()),
					consumer: JSON.parse((await fileService.readFile(removeFromRemote ? userResource : remoteUserResource)).value.toString()),
				}, { source: { servers: {}, inputs: [shared] }, consumer });
			});
		}

		test('uninstalls from a non-default remote profile without changing the default profile', async () => {
			const original = JSON.stringify({ servers: { removed }, inputs: [shared, exclusive] });
			const { service, fileService } = await createFixture({
				nonDefaultProfile: true,
				remoteUserContent: original,
				legacyContent: JSON.stringify({ servers: { kept } }),
			});
			await fileService.writeFile(remoteProfileResource, VSBuffer.fromString(original));
			const local = (await service.getInstalled()).find(server => server.name === 'removed')!;

			await service.uninstall(local);

			assert.deepStrictEqual({
				resource: local.mcpResource.toString(),
				profile: JSON.parse((await fileService.readFile(remoteProfileResource)).value.toString()),
				defaultProfile: (await fileService.readFile(remoteUserResource)).value.toString(),
			}, {
				resource: remoteProfileResource.toString(),
				profile: { servers: {}, inputs: [shared] },
				defaultProfile: original,
			});
		});

		test('preserves workspace inputs inherited by a workspace folder', async () => {
			const workspaceResource = URI.from({ scheme: Schemas.inMemory, path: '/test.code-workspace' });
			const { service, fileService } = await createFixture({
				workspaceConfiguration: workspaceResource,
				legacyContent: JSON.stringify({ servers: { kept } }),
			});
			await fileService.writeFile(workspaceResource, VSBuffer.fromString(JSON.stringify({
				folders: [], settings: { mcp: { servers: { removed }, inputs: [shared, exclusive] }, 'editor.fontSize': 14 },
			})));
			const local = await service.install({ name: 'removed', config: removed }, { target: ConfigurationTarget.WORKSPACE });

			await service.uninstall(local);

			assert.deepStrictEqual(JSON.parse((await fileService.readFile(workspaceResource)).value.toString()), {
				folders: [], settings: { mcp: { servers: {}, inputs: [shared] }, 'editor.fontSize': 14 },
			});
		});

		test('keeps uninstall bound to its original profile while scanning other scopes', async () => {
			const scanning = new DeferredPromise<void>();
			const resumeScan = new DeferredPromise<void>();
			let pauseScan = false;
			const original = JSON.stringify({ servers: { removed }, inputs: [shared, exclusive] });
			const { service, fileService, profileService } = await createFixture({
				userContent: original,
				beforeScan: async resource => {
					if (pauseScan && resource.toString() === legacyResource.toString()) {
						await scanning.complete();
						await resumeScan.p;
					}
				},
			});
			const otherResource = URI.from({ scheme: Schemas.inMemory, path: '/other-profile/mcp.json' });
			await fileService.writeFile(otherResource, VSBuffer.fromString(original));
			const [local] = await service.getInstalled();

			pauseScan = true;
			const uninstall = service.uninstall(local);
			try {
				await scanning.p;
				await profileService.updateCurrentProfile({ ...profileService.currentProfile, id: 'other', isDefault: false, mcpResource: otherResource });
			} finally {
				await resumeScan.complete();
			}
			await uninstall;

			assert.deepStrictEqual({
				originalProfileExists: await fileService.exists(userResource),
				otherProfile: (await fileService.readFile(otherResource)).value.toString(),
			}, { originalProfileExists: false, otherProfile: original });
		});

		const workspaceResource = URI.from({ scheme: Schemas.inMemory, path: '/test.code-workspace' });
		for (const resource of [legacyResource, workspaceResource, remoteUserResource]) {
			test(`identifies the unreadable scope and leaves inputs unchanged: ${resource.path}`, async () => {
				const original = JSON.stringify({ servers: { removed }, inputs: [shared, exclusive] });
				const { service, fileService } = await createFixture({
					userContent: original,
					workspaceConfiguration: resource === workspaceResource ? workspaceResource : undefined,
					remoteUserContent: resource === remoteUserResource ? '{}' : undefined,
				});
				const [local] = await service.getInstalled();
				await fileService.writeFile(resource, VSBuffer.fromString('{'));

				await assert.rejects(service.uninstall(local), error =>
					error instanceof Error
					&& error.message.includes(resource.toString())
					&& error.cause instanceof Error
					&& error.cause.message.includes('Failed to parse scanned MCP servers'));

				assert.strictEqual((await fileService.readFile(userResource)).value.toString(), original);
			});
		}
	});

	test('allows installing in an ordinary workspace configuration that does not exist yet', async () => {
		const resource = URI.from({ scheme: Schemas.inMemory, path: '/test.code-workspace' });
		const { service, fileService } = await createFixture({ workspaceConfiguration: resource });
		const local = await service.install(server, { target: ConfigurationTarget.WORKSPACE });
		assert.deepStrictEqual({
			resource: local.mcpResource.toString(),
			servers: JSON.parse((await fileService.readFile(resource)).value.toString()).settings.mcp.servers,
		}, {
			resource: resource.toString(),
			servers: { same: server.config },
		});
	});

	for (const existing of [false, true]) {
		test(`rejects unsupported workspace configuration targets and explicit resources: existing=${existing}`, async () => {
			const resource = URI.from({ scheme: Schemas.inMemory, path: '/agent-sessions.code-workspace' });
			const { service, fileService } = await createFixture({ workspaceConfiguration: resource, folderTargetsOnly: true });
			const content = '{"settings":{"chat.disableAIFeatures":false}}';
			if (existing) {
				await fileService.writeFile(resource, VSBuffer.fromString(content));
			}
			const gallery = upcastPartial<IGalleryMcpServer>({ name: 'gallery' });
			for (const options of [{ target: ConfigurationTarget.WORKSPACE }, { mcpResource: URI.parse(resource.toString()) }]) {
				await assert.rejects(service.install(server, options), /does not support MCP server installation/);
				await assert.rejects(service.installFromGallery(gallery, options), /does not support MCP server installation/);
			}
			assert.deepStrictEqual({
				installed: await service.getInstalled(),
				content: await fileService.exists(resource) ? (await fileService.readFile(resource)).value.toString() : undefined,
				folderFiles: [await fileService.exists(rootResource), await fileService.exists(legacyResource)],
			}, {
				installed: [],
				content: existing ? content : undefined,
				folderFiles: [false, false],
			});
		});
	}

	test('folder-only targets still accept equivalent folder URIs and reject unavailable folders', async () => {
		const { service, fileService } = await createFixture({ folderTargetsOnly: true });
		const target = toWorkspaceFolder(URI.parse(folder.uri.toString()));
		const local = await service.install(server, { target, workspaceConfig: WorkspaceMcpConfigKind.Root });
		const unavailable = toWorkspaceFolder(URI.from({ scheme: Schemas.inMemory, path: '/removed' }));
		await assert.rejects(service.install(server, { target: unavailable }), /no longer available/);
		await assert.rejects(service.installFromGallery(upcastPartial<IGalleryMcpServer>({ name: 'gallery' }), { target: unavailable }), /no longer available/);
		assert.deepStrictEqual({
			resource: local.mcpResource.toString(),
			rootExists: await fileService.exists(rootResource),
			unavailableExists: await fileService.exists(unavailable.uri),
		}, { resource: rootResource.toString(), rootExists: true, unavailableExists: false });
	});

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
