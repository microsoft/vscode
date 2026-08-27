/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { GalleryMcpServerStatus, IAllowedMcpServersService, IGalleryMcpServer, IMcpGalleryServerResolveResult, IMcpGalleryService, IInstallableMcpServer, InstallOptions, McpAccessValue, McpGalleryResolveStatus, mcpAccessConfig, TransportType } from '../../../../../platform/mcp/common/mcpManagement.js';
import { IMcpGalleryManifest, IMcpGalleryManifestService, McpGalleryManifestStatus } from '../../../../../platform/mcp/common/mcpGalleryManifest.js';
import { IMcpServerConfiguration, McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IURLService } from '../../../../../platform/url/common/url.js';
import { IUserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IWorkbenchLocalMcpServer, IWorkbenchMcpManagementService, IWorkbenchMcpServerInstallResult, LocalMcpServerScope } from '../../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { TestProductService } from '../../../../test/common/workbenchTestServices.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { McpServerEditorInput } from '../../browser/mcpServerEditorInput.js';
import { McpWorkbenchService } from '../../browser/mcpWorkbenchService.js';
import { IMcpService, McpLocalDiscoveryState } from '../../common/mcpTypes.js';

interface IResolveRequest {
	readonly infos: readonly { name: string; id?: string }[];
	readonly result: DeferredPromise<Map<string, IMcpGalleryServerResolveResult>>;
}

class TestMcpGalleryService extends mock<IMcpGalleryService>() {

	declare readonly _serviceBrand: undefined;

	private readonly requests: IResolveRequest[] = [];
	private nextRequestIndex = 0;
	private readonly onDidRequestEmitter: Emitter<void>;
	queryItems: IGalleryMcpServer[] = [];
	queryBarrier: DeferredPromise<void> | undefined;
	get requestCount(): number { return this.requests.length; }

	constructor(store: Pick<DisposableStore, 'add'>) {
		super();
		this.onDidRequestEmitter = store.add(new Emitter<void>());
	}

	override isEnabled(): boolean {
		return true;
	}

	override resolveMcpServersFromGallery(infos: { name: string; id?: string }[]): Promise<Map<string, IMcpGalleryServerResolveResult>> {
		const result = new DeferredPromise<Map<string, IMcpGalleryServerResolveResult>>();
		this.requests.push({ infos, result });
		this.onDidRequestEmitter.fire();
		return result.p;
	}

	override async query() {
		await this.queryBarrier?.p;
		return {
			firstPage: { items: this.queryItems, hasMore: false },
			getNextPage: async () => ({ items: [], hasMore: false })
		};
	}

	async nextRequest(): Promise<IResolveRequest> {
		if (this.nextRequestIndex >= this.requests.length) {
			await Event.toPromise(this.onDidRequestEmitter.event);
		}
		return this.requests[this.nextRequestIndex++];
	}
}

class TestMcpGalleryManifestService extends mock<IMcpGalleryManifestService>() {

	declare readonly _serviceBrand: undefined;

	override readonly mcpGalleryManifestStatus = McpGalleryManifestStatus.Available;
	override readonly onDidChangeMcpGalleryManifestStatus = Event.None;
	private readonly onDidChangeMcpGalleryManifestEmitter: Emitter<IMcpGalleryManifest | null>;
	override readonly onDidChangeMcpGalleryManifest: Event<IMcpGalleryManifest | null>;

	constructor(store: Pick<DisposableStore, 'add'>) {
		super();
		this.onDidChangeMcpGalleryManifestEmitter = store.add(new Emitter<IMcpGalleryManifest | null>());
		this.onDidChangeMcpGalleryManifest = this.onDidChangeMcpGalleryManifestEmitter.event;
	}

	fireChange(): void {
		this.onDidChangeMcpGalleryManifestEmitter.fire(null);
	}
}

class TestWorkbenchMcpManagementService extends mock<IWorkbenchMcpManagementService>() {

	declare readonly _serviceBrand: undefined;

	override readonly onInstallMcpServer = Event.None;
	override readonly onDidInstallMcpServers = Event.None;
	override readonly onDidUpdateMcpServers = Event.None;
	override readonly onUninstallMcpServer = Event.None;
	override readonly onDidUninstallMcpServer = Event.None;
	override readonly onInstallMcpServerInCurrentProfile = Event.None;
	override readonly onUninstallMcpServerInCurrentProfile = Event.None;
	override readonly onDidUninstallMcpServerInCurrentProfile = Event.None;
	private readonly onDidChangeProfileEmitter: Emitter<void>;
	override readonly onDidChangeProfile: Event<void>;
	private readonly onDidInstallMcpServersInCurrentProfileEmitter: Emitter<readonly IWorkbenchMcpServerInstallResult[]>;
	override readonly onDidInstallMcpServersInCurrentProfile: Event<readonly IWorkbenchMcpServerInstallResult[]>;
	private readonly onDidUpdateMcpServersInCurrentProfileEmitter: Emitter<readonly IWorkbenchMcpServerInstallResult[]>;
	override readonly onDidUpdateMcpServersInCurrentProfile: Event<readonly IWorkbenchMcpServerInstallResult[]>;
	installed: IWorkbenchLocalMcpServer[] = [];
	installFromGalleryResult: IWorkbenchLocalMcpServer | undefined;
	installFromGalleryBarrier: DeferredPromise<void> | undefined;
	private readonly installedResults: Promise<IWorkbenchLocalMcpServer[]>[] = [];

	constructor(store: Pick<DisposableStore, 'add'>) {
		super();
		this.onDidInstallMcpServersInCurrentProfileEmitter = store.add(new Emitter<readonly IWorkbenchMcpServerInstallResult[]>());
		this.onDidInstallMcpServersInCurrentProfile = this.onDidInstallMcpServersInCurrentProfileEmitter.event;
		this.onDidUpdateMcpServersInCurrentProfileEmitter = store.add(new Emitter<readonly IWorkbenchMcpServerInstallResult[]>());
		this.onDidUpdateMcpServersInCurrentProfile = this.onDidUpdateMcpServersInCurrentProfileEmitter.event;
		this.onDidChangeProfileEmitter = store.add(new Emitter<void>());
		this.onDidChangeProfile = this.onDidChangeProfileEmitter.event;
	}

	override async getInstalled(): Promise<IWorkbenchLocalMcpServer[]> {
		return this.installedResults.shift() ?? this.installed;
	}

	override canInstall(): true {
		return true;
	}

	override async install(_server: IInstallableMcpServer): Promise<IWorkbenchLocalMcpServer> {
		throw new Error('Not supported');
	}

	override async installFromGallery(server: IGalleryMcpServer, _options?: InstallOptions): Promise<IWorkbenchLocalMcpServer> {
		const local = this.installFromGalleryResult;
		if (!local) {
			throw new Error('No gallery install result configured');
		}
		await this.installFromGalleryBarrier?.p;
		this.installed.push(local);
		this.fireInstall([{ name: server.name, local, source: server, mcpResource: local.mcpResource }]);
		return local;
	}

	override async updateMetadata(): Promise<IWorkbenchLocalMcpServer> {
		throw new Error('Not supported');
	}

	override async uninstall(): Promise<void> { }

	fireInstall(results: readonly IWorkbenchMcpServerInstallResult[]): void {
		this.onDidInstallMcpServersInCurrentProfileEmitter.fire(results);
	}

	fireUpdate(results: readonly IWorkbenchMcpServerInstallResult[]): void {
		this.onDidUpdateMcpServersInCurrentProfileEmitter.fire(results);
	}

	fireProfileChange(): void {
		this.onDidChangeProfileEmitter.fire();
	}

	queueInstalledResult(result: Promise<IWorkbenchLocalMcpServer[]>): void {
		this.installedResults.push(result);
	}
}

function createGallery(name: string, remoteUrls: readonly string[] = []): IGalleryMcpServer {
	return {
		name,
		displayName: name,
		description: '',
		version: '1.0.0',
		isLatest: true,
		status: GalleryMcpServerStatus.Active,
		configuration: {
			remotes: remoteUrls.map(url => ({ type: TransportType.STREAMABLE_HTTP, url }))
		},
		publisher: 'test'
	};
}

function createLocal(name: string, scope: LocalMcpServerScope = LocalMcpServerScope.User, config?: IMcpServerConfiguration): IWorkbenchLocalMcpServer {
	return {
		id: `${scope}/${name}`,
		name,
		config: config ?? { type: McpServerType.LOCAL, command: 'node' },
		mcpResource: URI.parse(`test://${scope}/mcp.json`),
		scope,
		source: 'local'
	};
}

function found(server: IGalleryMcpServer): IMcpGalleryServerResolveResult {
	return { status: McpGalleryResolveStatus.Found, server };
}

function failed(): IMcpGalleryServerResolveResult {
	return { status: McpGalleryResolveStatus.Failed };
}

function notFound(): IMcpGalleryServerResolveResult {
	return { status: McpGalleryResolveStatus.NotFound };
}

suite('McpWorkbenchService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function createFixture(installed: IWorkbenchLocalMcpServer[], accessValue: McpAccessValue = McpAccessValue.Registry, initialInstalledResult?: Promise<IWorkbenchLocalMcpServer[]>) {
		const galleryService = new TestMcpGalleryService(store);
		const manifestService = new TestMcpGalleryManifestService(store);
		const managementService = new TestWorkbenchMcpManagementService(store);
		managementService.installed = [...installed];
		if (initialInstalledResult) {
			managementService.queueInstalledResult(initialInstalledResult);
		}
		const configurationService = new TestConfigurationService({ [mcpAccessConfig]: accessValue });
		const allowedMcpServersEmitter = store.add(new Emitter<void>());
		const openedEditors: McpServerEditorInput[] = [];
		const services = new ServiceCollection(
			[IMcpGalleryManifestService, manifestService],
			[IMcpGalleryService, galleryService],
			[IWorkbenchMcpManagementService, managementService],
			[IEditorService, upcastPartial<IEditorService>({
				openEditor: async editor => {
					if (editor instanceof McpServerEditorInput) {
						openedEditors.push(store.add(editor));
					}
					return undefined;
				}
			})],
			[IUserDataProfilesService, upcastPartial<IUserDataProfilesService>({ profiles: [] })],
			[IUriIdentityService, upcastPartial<IUriIdentityService>({})],
			[IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({})],
			[IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({})],
			[ILabelService, upcastPartial<ILabelService>({})],
			[IProductService, TestProductService],
			[IRemoteAgentService, upcastPartial<IRemoteAgentService>({})],
			[IConfigurationService, configurationService],
			[ITelemetryService, NullTelemetryService],
			[ILogService, store.add(new NullLogService())],
			[IExtensionsWorkbenchService, upcastPartial<IExtensionsWorkbenchService>({})],
			[IAllowedMcpServersService, upcastPartial<IAllowedMcpServersService>({ onDidChangeAllowedMcpServers: allowedMcpServersEmitter.event })],
			[IMcpService, upcastPartial<IMcpService>({ servers: constObservable([]) })],
			[IURLService, upcastPartial<IURLService>({ registerHandler: () => Disposable.None })],
			[IFileService, upcastPartial<IFileService>({})],
		);
		const instantiationService = store.add(new TestInstantiationService(services));
		const service = store.add(instantiationService.createInstance(McpWorkbenchService));
		if (initialInstalledResult) {
			await waitForState(service.localDiscoveryState, state => state !== McpLocalDiscoveryState.Pending);
		} else {
			await Event.toPromise(service.onChange);
		}
		return { service, galleryService, manifestService, managementService, allowedMcpServersEmitter, openedEditors };
	}

	async function complete(request: IResolveRequest, result: Map<string, IMcpGalleryServerResolveResult>): Promise<void> {
		await request.result.complete(result);
		await timeout(0);
		await timeout(0);
	}

	test('sanitizes local MCP server configurations from install URIs', async () => {
		const { service, openedEditors } = await createFixture([]);
		const uri = URI.parse(`vscode:mcp/install?${encodeURIComponent(JSON.stringify({
			name: 'local-server',
			type: 'invalid',
			command: '/bin/sh',
			args: ['-c', 'open -a Calculator'],
			unknown: 'value',
			url: 'https://example.com/mcp',
		}))}`);

		const handled = await service.handleURL(uri);

		assert.deepStrictEqual({
			handled,
			config: openedEditors[0]?.mcpServer.config,
		}, {
			handled: true,
			config: {
				type: McpServerType.LOCAL,
				command: '/bin/sh',
				args: ['-c', 'open -a Calculator'],
			},
		});
	});

	test('strips local and unknown properties from remote MCP server install URIs', async () => {
		const { service, openedEditors } = await createFixture([]);
		const uri = URI.parse(`vscode:mcp/install?${encodeURIComponent(JSON.stringify({
			name: 'remote-server',
			type: McpServerType.REMOTE,
			url: 'https://example.com/mcp',
			headers: { Authorization: 'Bearer token' },
			command: '/bin/sh',
			args: ['-c', 'open -a Calculator'],
			unknown: 'value',
		}))}`);

		const handled = await service.handleURL(uri);

		assert.deepStrictEqual({
			handled,
			config: openedEditors[0]?.mcpServer.config,
		}, {
			handled: true,
			config: {
				type: McpServerType.REMOTE,
				url: 'https://example.com/mcp',
				headers: { Authorization: 'Bearer token' },
			},
		});
	});

	test('enables only manually configured servers found in the registry', async () => {
		const foundLocal = createLocal('found');
		const missingLocal = createLocal('missing');
		const failedLocal = createLocal('failed');
		const { service, galleryService } = await createFixture([foundLocal, missingLocal, failedLocal]);
		const request = await galleryService.nextRequest();

		await complete(request, new Map([
			['found', found(createGallery('found'))],
			['missing', notFound()],
			['failed', failed()],
		]));

		assert.deepStrictEqual({
			requested: request.infos.map(info => info.name).sort(),
			enabled: service.getEnabledLocalMcpServers().map(server => server.name),
			verified: service.local.map(server => [server.name, !!server.gallery]),
		}, {
			requested: ['failed', 'found', 'missing'],
			enabled: ['found'],
			verified: [['failed', false], ['found', true], ['missing', false]],
		});

	});

	test('settles local discovery as failed when the initial scan rejects', async () => {
		const { service, manifestService } = await createFixture([], McpAccessValue.All, Promise.reject(new Error('scan failed')));
		manifestService.fireChange();
		await timeout(0);

		assert.deepStrictEqual({
			state: service.localDiscoveryState.get(),
			local: service.local,
		}, {
			state: McpLocalDiscoveryState.Failed,
			local: [],
		});
	});

	test('continues registry reconciliation for installs after an initial scan failure', async () => {
		const { service, galleryService, managementService } = await createFixture([], McpAccessValue.All, Promise.reject(new Error('scan failed')));
		const added = createLocal('post-failure');

		managementService.fireInstall([{ name: added.name, local: added, mcpResource: added.mcpResource }]);
		const request = await galleryService.nextRequest();
		await complete(request, new Map([[added.name, found(createGallery(added.name))]]));

		assert.deepStrictEqual({
			state: service.localDiscoveryState.get(),
			requested: request.infos.map(info => info.name),
			local: service.local.map(server => server.name),
		}, {
			state: McpLocalDiscoveryState.Failed,
			requested: ['post-failure'],
			local: ['post-failure'],
		});
	});

	test('preserves verified membership on transient failure and clears it on not found', async () => {
		const verified = createLocal('verified');
		const removed = createLocal('removed');
		const { service, galleryService, managementService } = await createFixture([verified, removed]);
		await complete(await galleryService.nextRequest(), new Map([
			['verified', found(createGallery('verified'))],
			['removed', found(createGallery('removed'))],
		]));

		const added = createLocal('added');
		managementService.fireInstall([{ name: added.name, local: added, mcpResource: added.mcpResource }]);
		await complete(await galleryService.nextRequest(), new Map([
			['verified', failed()],
			['removed', notFound()],
			['added', failed()],
		]));

		assert.deepStrictEqual({
			enabled: service.getEnabledLocalMcpServers().map(server => server.name),
			verified: service.local.map(server => [server.name, !!server.gallery]),
		}, {
			enabled: ['verified'],
			verified: [['added', false], ['removed', false], ['verified', true]],
		});
	});

	test('invalidates membership immediately when the active registry changes', async () => {
		const local = createLocal('server');
		const { service, galleryService, manifestService } = await createFixture([local]);
		await complete(await galleryService.nextRequest(), new Map([
			[local.name, found(createGallery(local.name))],
		]));

		manifestService.fireChange();
		const enabledAfterInvalidation = service.getEnabledLocalMcpServers().map(server => server.name);
		await complete(await galleryService.nextRequest(), new Map([
			[local.name, failed()],
		]));

		assert.deepStrictEqual({
			enabledAfterInvalidation,
			enabledAfterFailure: service.getEnabledLocalMcpServers().map(server => server.name),
			hasGallery: !!service.local[0].gallery,
		}, {
			enabledAfterInvalidation: [],
			enabledAfterFailure: [],
			hasGallery: false,
		});
	});

	test('replaces and re-verifies installed servers when the profile changes', async () => {
		const oldLocal = createLocal('old-profile');
		const newLocal = createLocal('new-profile');
		const { service, galleryService, managementService } = await createFixture([oldLocal]);
		await complete(await galleryService.nextRequest(), new Map([
			[oldLocal.name, found(createGallery(oldLocal.name))],
		]));
		const resetPromise = Event.toPromise(service.onReset);
		managementService.installed = [newLocal];

		managementService.fireProfileChange();
		const enabledAfterInvalidation = service.getEnabledLocalMcpServers().map(server => server.name);
		await resetPromise;
		const request = await galleryService.nextRequest();
		await complete(request, new Map([
			[newLocal.name, found(createGallery(newLocal.name))],
		]));

		assert.deepStrictEqual({
			enabledAfterInvalidation,
			requested: request.infos.map(info => info.name),
			local: service.local.map(server => server.name),
			enabled: service.getEnabledLocalMcpServers().map(server => server.name),
		}, {
			enabledAfterInvalidation: [],
			requested: [newLocal.name],
			local: [newLocal.name],
			enabled: [newLocal.name],
		});
	});

	test('ignores an older profile query that completes after a newer profile query', async () => {
		const initial = createLocal('initial-profile');
		const older = createLocal('older-profile');
		const newer = createLocal('newer-profile');
		const { service, galleryService, managementService } = await createFixture([initial]);
		await complete(await galleryService.nextRequest(), new Map([
			[initial.name, found(createGallery(initial.name))],
		]));
		const olderResult = new DeferredPromise<IWorkbenchLocalMcpServer[]>();
		const newerResult = new DeferredPromise<IWorkbenchLocalMcpServer[]>();
		managementService.queueInstalledResult(olderResult.p);
		managementService.queueInstalledResult(newerResult.p);
		let resetCount = 0;
		store.add(service.onReset(() => resetCount++));
		const resetPromise = Event.toPromise(service.onReset);

		managementService.fireProfileChange();
		managementService.fireProfileChange();
		await newerResult.complete([newer]);
		await resetPromise;
		const request = await galleryService.nextRequest();
		await complete(request, new Map([
			[newer.name, found(createGallery(newer.name))],
		]));
		await olderResult.complete([older]);
		await timeout(0);

		assert.deepStrictEqual({
			requested: request.infos.map(info => info.name),
			local: service.local.map(server => server.name),
			enabled: service.getEnabledLocalMcpServers().map(server => server.name),
			resetCount,
		}, {
			requested: [newer.name],
			local: [newer.name],
			enabled: [newer.name],
			resetCount: 1,
		});
	});

	test('re-verifies the current profile when a public local query supersedes its profile query', async () => {
		const initial = createLocal('initial-profile');
		const current = createLocal('current-profile');
		const { service, galleryService, managementService } = await createFixture([initial]);
		await complete(await galleryService.nextRequest(), new Map([
			[initial.name, found(createGallery(initial.name))],
		]));
		const profileResult = new DeferredPromise<IWorkbenchLocalMcpServer[]>();
		const publicResult = new DeferredPromise<IWorkbenchLocalMcpServer[]>();
		managementService.queueInstalledResult(profileResult.p);
		managementService.queueInstalledResult(publicResult.p);
		const resetPromise = Event.toPromise(service.onReset);

		managementService.fireProfileChange();
		const publicQuery = service.queryLocal();
		await publicResult.complete([current]);
		await publicQuery;
		await profileResult.complete([initial]);
		await resetPromise;
		const request = await galleryService.nextRequest();
		await complete(request, new Map([
			[current.name, found(createGallery(current.name))],
		]));

		assert.deepStrictEqual({
			requested: request.infos.map(info => info.name),
			local: service.local.map(server => server.name),
			enabled: service.getEnabledLocalMcpServers().map(server => server.name),
		}, {
			requested: [current.name],
			local: [current.name],
			enabled: [current.name],
		});
	});

	test('ignores stale lookup results after a local configuration update', async () => {
		const local = createLocal('server');
		const { service, galleryService, managementService } = await createFixture([local]);
		const staleRequest = await galleryService.nextRequest();

		managementService.fireUpdate([{ name: local.name, local, mcpResource: local.mcpResource }]);
		managementService.fireUpdate([{ name: local.name, local, mcpResource: local.mcpResource }]);
		managementService.fireUpdate([{ name: local.name, local, mcpResource: local.mcpResource }]);
		await complete(staleRequest, new Map([
			[local.name, found(createGallery(local.name))],
		]));
		const currentRequest = await galleryService.nextRequest();
		const staleResultApplied = !!service.local[0].gallery;
		await complete(currentRequest, new Map([
			[local.name, notFound()],
		]));

		assert.deepStrictEqual({
			staleResultApplied,
			enabled: service.getEnabledLocalMcpServers().map(server => server.name),
			requestCount: galleryService.requestCount,
		}, {
			staleResultApplied: false,
			enabled: [],
			requestCount: 2,
		});
	});

	test('preserves matching trusted update sources and rejects mismatched sources', async () => {
		const local = createLocal('updated');
		const { service, galleryService, managementService } = await createFixture([local]);
		await complete(await galleryService.nextRequest(), new Map([
			[local.name, found(createGallery(local.name))],
		]));
		const trustedUpdate = createGallery(local.name);
		galleryService.queryItems = [trustedUpdate];
		await service.queryGallery();

		managementService.fireUpdate([{ name: local.name, local, source: trustedUpdate, mcpResource: local.mcpResource }]);
		const trustedUpdateApplied = service.local[0].gallery === trustedUpdate;
		await complete(await galleryService.nextRequest(), new Map([
			[local.name, failed()],
		]));
		const mismatchedUpdate = createGallery('different-name');

		managementService.fireUpdate([{ name: local.name, local, source: mismatchedUpdate, mcpResource: local.mcpResource }]);
		const mismatchedUpdateApplied = service.local[0].gallery === mismatchedUpdate;
		const enabledAfterMismatch = service.getEnabledLocalMcpServers().map(server => server.name);
		await complete(await galleryService.nextRequest(), new Map([
			[local.name, failed()],
		]));

		assert.deepStrictEqual({
			trustedUpdateApplied,
			mismatchedUpdateApplied,
			enabledAfterMismatch,
			enabledAfterFailure: service.getEnabledLocalMcpServers().map(server => server.name),
		}, {
			trustedUpdateApplied: true,
			mismatchedUpdateApplied: false,
			enabledAfterMismatch: [local.name],
			enabledAfterFailure: [local.name],
		});
	});

	test('deduplicates registry lookups for the same server name across scopes', async () => {
		const user = createLocal('duplicate', LocalMcpServerScope.User);
		const workspace = { ...createLocal('duplicate', LocalMcpServerScope.Workspace), galleryId: 'registry-id' };
		const { service, galleryService } = await createFixture([user, workspace]);
		const request = await galleryService.nextRequest();
		await complete(request, new Map([
			['duplicate', found(createGallery('duplicate'))],
		]));

		assert.deepStrictEqual({
			requested: request.infos,
			verified: service.local.map(server => !!server.gallery),
			enabledScopes: service.getEnabledLocalMcpServers().map(server => server.scope),
		}, {
			requested: [{ name: 'duplicate', id: 'registry-id' }],
			verified: [true, true],
			enabledScopes: [LocalMcpServerScope.Workspace],
		});
	});

	test('keeps trusted gallery metadata while an install is revalidated', async () => {
		const { service, galleryService, managementService } = await createFixture([]);
		const gallery = createGallery('gallery-install');
		const local = createLocal(gallery.name);
		galleryService.queryItems = [gallery];
		managementService.installFromGalleryResult = local;
		const pager = await service.queryGallery();

		const installed = await service.install(pager.firstPage.items[0]);
		const enabledBeforeRevalidation = service.getEnabledLocalMcpServers().map(server => server.name);
		await complete(await galleryService.nextRequest(), new Map([
			[local.name, failed()],
		]));

		assert.deepStrictEqual({
			trustedGalleryPreserved: installed.gallery === gallery,
			enabledBeforeRevalidation,
			enabledAfterFailure: service.getEnabledLocalMcpServers().map(server => server.name),
		}, {
			trustedGalleryPreserved: true,
			enabledBeforeRevalidation: [local.name],
			enabledAfterFailure: [local.name],
		});
	});

	test('rejects gallery metadata from an install that completes after a registry change', async () => {
		const { service, galleryService, manifestService, managementService } = await createFixture([]);
		const gallery = createGallery('stale-gallery-install');
		const local = createLocal(gallery.name);
		const installBarrier = new DeferredPromise<void>();
		galleryService.queryItems = [gallery];
		managementService.installFromGalleryResult = local;
		managementService.installFromGalleryBarrier = installBarrier;
		const pager = await service.queryGallery();

		const installPromise = service.install(pager.firstPage.items[0]);
		await timeout(0);
		manifestService.fireChange();
		await installBarrier.complete();
		const installed = await installPromise;
		const request = await galleryService.nextRequest();
		await complete(request, new Map([
			[local.name, failed()],
		]));

		assert.deepStrictEqual({
			staleGalleryApplied: installed.gallery === gallery,
			enabled: service.getEnabledLocalMcpServers().map(server => server.name),
		}, {
			staleGalleryApplied: false,
			enabled: [],
		});
	});

	test('rejects gallery metadata returned by a query that completes after a registry change', async () => {
		const { service, galleryService, manifestService, managementService } = await createFixture([]);
		const gallery = createGallery('stale-gallery-query');
		const local = createLocal(gallery.name);
		const queryBarrier = new DeferredPromise<void>();
		galleryService.queryItems = [gallery];
		galleryService.queryBarrier = queryBarrier;

		const queryPromise = service.queryGallery();
		await timeout(0);
		manifestService.fireChange();
		await queryBarrier.complete();
		const pager = await queryPromise;
		managementService.fireInstall([{ name: local.name, local, source: pager.firstPage.items[0].gallery, mcpResource: local.mcpResource }]);
		const request = await galleryService.nextRequest();
		await complete(request, new Map([
			[local.name, failed()],
		]));

		assert.deepStrictEqual({
			staleGalleryApplied: service.local[0].gallery === gallery,
			enabled: service.getEnabledLocalMcpServers().map(server => server.name),
		}, {
			staleGalleryApplied: false,
			enabled: [],
		});
	});

	test('trusts gallery metadata propagated by an external gallery install', async () => {
		const { service, galleryService, managementService } = await createFixture([]);
		const gallery = createGallery('external-gallery-install');
		const local = createLocal(gallery.name);
		galleryService.queryItems = [gallery];
		await service.queryGallery();

		managementService.fireInstall([{ name: local.name, local, source: gallery, mcpResource: local.mcpResource }]);
		const enabledBeforeRevalidation = service.getEnabledLocalMcpServers().map(server => server.name);
		await complete(await galleryService.nextRequest(), new Map([
			[local.name, failed()],
		]));

		assert.deepStrictEqual({
			galleryPreserved: service.local[0].gallery === gallery,
			enabledBeforeRevalidation,
			enabledAfterFailure: service.getEnabledLocalMcpServers().map(server => server.name),
		}, {
			galleryPreserved: true,
			enabledBeforeRevalidation: [local.name],
			enabledAfterFailure: [local.name],
		});
	});

	test('rejects gallery metadata from an update that completes after a registry change', async () => {
		const local = createLocal('stale-gallery-update');
		const { service, galleryService, manifestService, managementService } = await createFixture([local]);
		await complete(await galleryService.nextRequest(), new Map([
			[local.name, found(createGallery(local.name))],
		]));
		const staleGallery = createGallery(local.name);
		galleryService.queryItems = [staleGallery];
		await service.queryGallery();

		manifestService.fireChange();
		managementService.fireUpdate([{ name: local.name, local, source: staleGallery, mcpResource: local.mcpResource }]);
		const request = await galleryService.nextRequest();
		await complete(request, new Map([
			[local.name, failed()],
		]));

		assert.deepStrictEqual({
			staleGalleryApplied: service.local[0].gallery === staleGallery,
			enabled: service.getEnabledLocalMcpServers().map(server => server.name),
		}, {
			staleGalleryApplied: false,
			enabled: [],
		});
	});

	test('requires remote URLs to match the registry entry exactly', async () => {
		const allowed = createLocal('allowed', LocalMcpServerScope.User, { type: McpServerType.REMOTE, url: 'https://allowed.test/mcp' });
		const blocked = createLocal('blocked', LocalMcpServerScope.User, { type: McpServerType.REMOTE, url: 'https://blocked.test/mcp' });
		const { service, galleryService } = await createFixture([allowed, blocked]);
		await complete(await galleryService.nextRequest(), new Map([
			[allowed.name, found(createGallery(allowed.name, ['https://allowed.test/mcp']))],
			[blocked.name, found(createGallery(blocked.name, ['https://different.test/mcp']))],
		]));

		assert.deepStrictEqual(service.getEnabledLocalMcpServers().map(server => server.name), ['allowed']);
	});

	test('keeps a stable order for duplicate server names across repeated sorts', async () => {
		const user = createLocal('duplicate', LocalMcpServerScope.User);
		const workspaceA = { ...createLocal('duplicate', LocalMcpServerScope.Workspace), id: 'workspace/a/duplicate' };
		const workspaceB = { ...createLocal('duplicate', LocalMcpServerScope.Workspace), id: 'workspace/b/duplicate' };
		const { service, galleryService, allowedMcpServersEmitter } = await createFixture([user, workspaceA, workspaceB], McpAccessValue.All);
		await complete(await galleryService.nextRequest(), new Map([
			[user.name, notFound()],
		]));

		const orderBefore = service.local.map(server => server.id);
		const winnerBefore = service.getEnabledLocalMcpServers().map(server => server.id);
		for (let i = 0; i < 10; i++) {
			allowedMcpServersEmitter.fire();
			assert.deepStrictEqual(service.local.map(server => server.id), orderBefore);
			assert.deepStrictEqual(service.getEnabledLocalMcpServers().map(server => server.id), winnerBefore);
		}
	});
});
