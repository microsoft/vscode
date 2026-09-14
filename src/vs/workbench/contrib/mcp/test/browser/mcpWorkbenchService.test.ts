/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, observableValue, waitForState } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILoggerService, ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { GalleryMcpServerStatus, IAllowedMcpServersService, IGalleryMcpServer, IMcpGalleryServerResolveResult, IMcpGalleryService, IInstallableMcpServer, InstallOptions, McpAccessValue, McpGalleryResolveStatus, mcpAccessConfig, TransportType } from '../../../../../platform/mcp/common/mcpManagement.js';
import { IMcpGalleryManifest, IMcpGalleryManifestService, McpGalleryManifestStatus } from '../../../../../platform/mcp/common/mcpGalleryManifest.js';
import { IMcpServerConfiguration, McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { McpResourceFormat } from '../../../../../platform/mcp/common/mcpWorkspaceConfiguration.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IURLService } from '../../../../../platform/url/common/url.js';
import { IUserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService, toWorkspaceFolder, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { DidUninstallWorkbenchMcpServerEvent, IWorkbenchLocalMcpServer, IWorkbenchMcpManagementService, IWorkbenchMcpServerInstallResult, LocalMcpServerScope } from '../../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { TestContextService, TestLoggerService, TestProductService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { ContributionEnablementState } from '../../../chat/common/enablement.js';
import { McpServerEditorInput } from '../../browser/mcpServerEditorInput.js';
import { McpWorkbenchService } from '../../browser/mcpWorkbenchService.js';
import { IMcpServer, IMcpService, McpCollectionDefinition, McpCollectionProvenance, McpServerDefinition, McpServerEnablementState, McpServerInstallState, McpServerLaunch } from '../../common/mcpTypes.js';
import { InstalledMcpServersDiscovery } from '../../common/discovery/installedMcpServersDiscovery.js';
import { IMcpRegistry } from '../../common/mcpRegistryTypes.js';
import { McpRegistry } from '../../common/mcpRegistry.js';
import { McpService } from '../../common/mcpService.js';

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

	override async getMcpServersFromGallery(infos: Parameters<IMcpGalleryService['getMcpServersFromGallery']>[0]): Promise<IGalleryMcpServer[]> {
		return this.queryItems.filter(server => infos.some(info => info.name === server.name));
	}

	override async getMcpServer(url: string): Promise<IGalleryMcpServer | undefined> {
		return this.queryItems.find(server => server.galleryUrl === url);
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
	private readonly onDidUninstallMcpServerInCurrentProfileEmitter: Emitter<DidUninstallWorkbenchMcpServerEvent>;
	override readonly onDidUninstallMcpServerInCurrentProfile: Event<DidUninstallWorkbenchMcpServerEvent>;
	private readonly onDidChangeProfileEmitter: Emitter<void>;
	override readonly onDidChangeProfile: Event<void>;
	private readonly onDidInstallMcpServersInCurrentProfileEmitter: Emitter<readonly IWorkbenchMcpServerInstallResult[]>;
	override readonly onDidInstallMcpServersInCurrentProfile: Event<readonly IWorkbenchMcpServerInstallResult[]>;
	private readonly onDidUpdateMcpServersInCurrentProfileEmitter: Emitter<readonly IWorkbenchMcpServerInstallResult[]>;
	override readonly onDidUpdateMcpServersInCurrentProfile: Event<readonly IWorkbenchMcpServerInstallResult[]>;
	installed: IWorkbenchLocalMcpServer[] = [];
	installResult: IWorkbenchLocalMcpServer | undefined;
	installFromGalleryResult: IWorkbenchLocalMcpServer | undefined;
	installFromGalleryBarrier: DeferredPromise<void> | undefined;
	private readonly installedResults: Promise<IWorkbenchLocalMcpServer[]>[] = [];
	private installedError: Error | undefined;

	constructor(store: Pick<DisposableStore, 'add'>) {
		super();
		this.onDidInstallMcpServersInCurrentProfileEmitter = store.add(new Emitter<readonly IWorkbenchMcpServerInstallResult[]>());
		this.onDidInstallMcpServersInCurrentProfile = this.onDidInstallMcpServersInCurrentProfileEmitter.event;
		this.onDidUpdateMcpServersInCurrentProfileEmitter = store.add(new Emitter<readonly IWorkbenchMcpServerInstallResult[]>());
		this.onDidUpdateMcpServersInCurrentProfile = this.onDidUpdateMcpServersInCurrentProfileEmitter.event;
		this.onDidUninstallMcpServerInCurrentProfileEmitter = store.add(new Emitter<DidUninstallWorkbenchMcpServerEvent>());
		this.onDidUninstallMcpServerInCurrentProfile = this.onDidUninstallMcpServerInCurrentProfileEmitter.event;
		this.onDidChangeProfileEmitter = store.add(new Emitter<void>());
		this.onDidChangeProfile = this.onDidChangeProfileEmitter.event;
	}

	override async getInstalled(): Promise<IWorkbenchLocalMcpServer[]> {
		if (this.installedError) {
			const error = this.installedError;
			this.installedError = undefined;
			throw error;
		}
		return this.installedResults.shift() ?? this.installed;
	}

	override canInstall(): true {
		return true;
	}

	override async install(server: IInstallableMcpServer): Promise<IWorkbenchLocalMcpServer> {
		const local = this.installResult;
		if (!local) {
			throw new Error('No install result configured');
		}
		this.installed.push(local);
		this.fireInstall([{ name: server.name, local, mcpResource: local.mcpResource }]);
		return local;
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

	fireUninstall(local: IWorkbenchLocalMcpServer): void {
		this.onDidUninstallMcpServerInCurrentProfileEmitter.fire(local);
	}

	fireProfileChange(): void {
		this.onDidChangeProfileEmitter.fire();
	}

	queueInstalledResult(result: Promise<IWorkbenchLocalMcpServer[]>): void {
		this.installedResults.push(result);
	}

	failNextInstalledQuery(error: Error): void {
		this.installedError = error;
	}
}

class TestLogService extends NullLogService {
	readonly errors: (string | Error)[] = [];

	override error(message: string | Error, ..._args: unknown[]): void {
		this.errors.push(message);
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

	async function createFixture(installed: IWorkbenchLocalMcpServer[], accessValue: McpAccessValue = McpAccessValue.Registry, initialInstalledError?: Error, runtimeServers: IObservable<readonly IMcpServer[]> = constObservable([])) {
		const galleryService = new TestMcpGalleryService(store);
		const manifestService = new TestMcpGalleryManifestService(store);
		const managementService = new TestWorkbenchMcpManagementService(store);
		managementService.installed = [...installed];
		if (initialInstalledError) {
			managementService.failNextInstalledQuery(initialInstalledError);
		}
		const configurationService = new TestConfigurationService({ [mcpAccessConfig]: accessValue });
		const allowedMcpServersEmitter = store.add(new Emitter<void>());
		const openedEditors: McpServerEditorInput[] = [];
		const logService = store.add(new TestLogService());
		const workspaceService = new TestContextService();
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
			[IUriIdentityService, upcastPartial<IUriIdentityService>({ extUri })],
			[IWorkspaceContextService, workspaceService],
			[IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({})],
			[ILabelService, upcastPartial<ILabelService>({})],
			[IProductService, TestProductService],
			[IRemoteAgentService, upcastPartial<IRemoteAgentService>({ getEnvironment: async () => null })],
			[IConfigurationService, configurationService],
			[ITelemetryService, NullTelemetryService],
			[ILogService, logService],
			[IExtensionsWorkbenchService, upcastPartial<IExtensionsWorkbenchService>({})],
			[IAllowedMcpServersService, upcastPartial<IAllowedMcpServersService>({ onDidChangeAllowedMcpServers: allowedMcpServersEmitter.event })],
			[IMcpService, upcastPartial<IMcpService>({ servers: runtimeServers })],
			[IURLService, upcastPartial<IURLService>({ registerHandler: () => Disposable.None })],
			[IFileService, upcastPartial<IFileService>({})],
		);
		const instantiationService = store.add(new TestInstantiationService(services));
		const service = store.add(instantiationService.createInstance(McpWorkbenchService));
		await service.whenInitialLocalMcpServersLoaded;
		return { service, galleryService, manifestService, managementService, allowedMcpServersEmitter, openedEditors, logService, workspaceService, configurationService };
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

	test('settles initial local server readiness after a failed query', async () => {
		const error = new Error('Failed to query installed MCP servers');
		const { service, logService } = await createFixture([], McpAccessValue.Registry, error);

		assert.deepStrictEqual({
			local: service.local,
			errors: logService.errors,
		}, {
			local: [],
			errors: [error],
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

	test('notifies once for each runtime inventory or enablement change', async () => {
		const local = createLocal('server');
		const servers = observableValue<readonly IMcpServer[]>('servers', []);
		const enablement = observableValue('enablement', ContributionEnablementState.EnabledProfile);
		const runtime = upcastPartial<IMcpServer>({
			definition: upcastPartial<McpServerDefinition>({ id: local.id }),
			enablement,
		});
		const { service, galleryService } = await createFixture([local], McpAccessValue.All, undefined, servers);
		await complete(await galleryService.nextRequest(), new Map([[local.name, notFound()]]));
		const observed: (McpServerEnablementState | undefined)[] = [];
		store.add(service.onChange(() => observed.push(service.local[0].runtimeStatus?.state)));

		servers.set([runtime], undefined);
		enablement.set(ContributionEnablementState.DisabledWorkspace, undefined);
		enablement.set(ContributionEnablementState.EnabledProfile, undefined);
		servers.set([], undefined);

		assert.deepStrictEqual(observed, [
			undefined,
			McpServerEnablementState.DisabledWorkspace,
			undefined,
			McpServerEnablementState.Disabled,
		]);
	});

	for (const duplicateNames of [false, true]) {
		test(`installed discovery settles with ${duplicateNames ? 'duplicate' : 'distinct'} server names across workspace roots`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			// Native WebCrypto completion is not controlled by the virtual clock.
			const launchHash = sinon.stub(McpServerLaunch, 'hash').callsFake(async launch => JSON.stringify(launch));
			store.add(toDisposable(() => launchHash.restore()));
			const workspaceA = { ...createLocal('same', LocalMcpServerScope.Workspace), id: 'mcp.config.ws0.same', mcpResource: URI.file('/workspace-a/.vscode/mcp.json') };
			const secondName = duplicateNames ? 'same' : 'different';
			const workspaceB = { ...createLocal(secondName, LocalMcpServerScope.Workspace), id: `mcp.config.ws1.${secondName}`, mcpResource: URI.file('/workspace-b/.vscode/mcp.json') };
			const configurationService = new TestConfigurationService({ [mcpAccessConfig]: McpAccessValue.All });
			store.add(configurationService.onDidChangeConfigurationEmitter);
			const services = new ServiceCollection(
				[IConfigurationService, configurationService],
				[IFileService, upcastPartial<IFileService>({ registerProvider: () => Disposable.None })],
				[IStorageService, store.add(new TestStorageService())],
				[ILoggerService, store.add(new TestLoggerService())],
				[ILogService, new NullLogService()],
				[IWorkspaceContextService, new TestContextService()],
				[IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({})],
				[ITelemetryService, NullTelemetryService],
				[IProductService, TestProductService],
				[IAllowedMcpServersService, upcastPartial<IAllowedMcpServersService>({ onDidChangeAllowedMcpServers: Event.None, isAllowed: () => true, isServerAllowed: () => true })],
			);
			const instantiationService = store.add(new TestInstantiationService(services));
			const registry = store.add(instantiationService.createInstance(McpRegistry));
			instantiationService.stub(IMcpRegistry, registry);
			const runtime = store.add(instantiationService.createInstance(McpService));
			const { service, workspaceService, galleryService, logService } = await createFixture([workspaceA, workspaceB], McpAccessValue.All, undefined, runtime.servers);
			workspaceService.setWorkspace({
				id: 'multi-root',
				folders: [toWorkspaceFolder(URI.file('/workspace-a')), new WorkspaceFolder({ uri: URI.file('/workspace-b'), name: 'workspace-b', index: 1 })],
			});
			await complete(await galleryService.nextRequest(), new Map([
				[workspaceA.name, notFound()],
				[workspaceB.name, notFound()],
			]));
			let sourceReads = 0;
			const discovery = store.add(new InstalledMcpServersDiscovery(service, registry, upcastPartial<ITextModelService>({
				createModelReference: async () => {
					sourceReads++;
					throw new Error('No editor model');
				},
			}), logService));
			const observed: string[][] = [];
			store.add(autorun(reader => {
				const ids = runtime.servers.read(reader).map(server => server.definition.id).sort();
				if (ids.length) {
					observed.push(ids);
				}
			}));
			try {
				discovery.start();
				await waitForState(runtime.servers, servers => servers.length > 0);
				// Allow six 500ms collection refresh cycles to detect self-sustaining discovery.
				await timeout(3_000);
				assert.deepStrictEqual({
					observed,
					displayOrder: service.local.map(server => server.id),
					sourceReads,
					errors: logService.errors,
				}, {
					observed: [duplicateNames ? [workspaceB.id] : [workspaceA.id, workspaceB.id]],
					displayOrder: [workspaceB.id, workspaceA.id],
					sourceReads: duplicateNames ? 2 : 4,
					errors: [],
				});
			} finally {
				discovery.dispose();
				runtime.dispose();
			}
		}));
	}

	test('keeps same-name root and legacy lifecycle events independent', async () => {
		const legacy = { ...createLocal('same', LocalMcpServerScope.Workspace), id: 'mcp.config.ws0.same', mcpResource: URI.file('/workspace/.vscode/mcp.json') };
		const root = { ...legacy, id: 'workspace-dot-mcp.0.same', mcpResource: URI.file('/workspace/.mcp.json'), format: McpResourceFormat.WorkspaceRoot };
		const { service, managementService } = await createFixture([legacy], McpAccessValue.All);
		managementService.fireInstall([{ name: root.name, local: root, mcpResource: root.mcpResource }]);
		const afterInstall = service.local.map(server => server.id).sort();
		const updatedRoot: IWorkbenchLocalMcpServer = { ...root, config: { type: McpServerType.LOCAL, command: 'updated' } };
		managementService.fireUpdate([{ name: root.name, local: updatedRoot, mcpResource: root.mcpResource }]);
		const afterUpdate = service.local.map(server => ({ id: server.id, config: server.local?.config })).sort((a, b) => a.id.localeCompare(b.id));
		managementService.fireUninstall(root);
		assert.deepStrictEqual({
			afterInstall,
			afterUpdate,
			afterUninstall: service.local.map(server => server.id),
		}, {
			afterInstall: [legacy.id, root.id],
			afterUpdate: [{ id: legacy.id, config: legacy.config }, { id: root.id, config: updatedRoot.config }],
			afterUninstall: [legacy.id],
		});
	});

	test('returns the exact installed resource when a same-name server already exists', async () => {
		const existing = createLocal('same');
		const installed = { ...createLocal('same', LocalMcpServerScope.Workspace), mcpResource: URI.file('/workspace/.vscode/mcp.json') };
		const { service, galleryService, managementService } = await createFixture([existing]);
		const gallery = createGallery('same');
		await complete(await galleryService.nextRequest(), new Map([['same', found(gallery)]]));
		managementService.installFromGalleryResult = installed;
		const original = service.local[0];
		const result = await service.install(original);
		assert.deepStrictEqual({
			result: result.local?.mcpResource.toString(),
			resources: service.local.map(server => server.local?.mcpResource.toString()).sort(),
			original: original.local?.mcpResource.toString(),
			distinctModels: result !== original,
		}, {
			result: installed.mcpResource.toString(),
			resources: [existing.mcpResource.toString(), installed.mcpResource.toString()].sort(),
			original: existing.mcpResource.toString(),
			distinctModels: true,
		});
	});

	for (const source of ['gallery', 'uri']) {
		test(`updates the initiating editor model after its first ${source} install`, async () => {
			const { service, galleryService, managementService, openedEditors } = await createFixture([], McpAccessValue.All);
			const local = createLocal('new-server');
			if (source === 'gallery') {
				galleryService.queryItems = [createGallery(local.name)];
				managementService.installFromGalleryResult = local;
				const pager = await service.queryGallery();
				await service.open(pager.firstPage.items[0]);
			} else {
				managementService.installResult = local;
				await service.handleURL(URI.parse(`vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: local.name, command: 'node' }))}`));
			}
			const original = openedEditors[0].mcpServer;
			const installed = await service.install(original);
			assert.deepStrictEqual({
				sameModel: installed === original,
				editorModel: openedEditors[0].mcpServer === installed,
				state: original.installState,
				config: original.config,
				inventory: service.local.map(server => ({ id: server.id, isOriginal: server === original })),
			}, {
				sameModel: true,
				editorModel: true,
				state: McpServerInstallState.Installed,
				config: local.config,
				inventory: [{ id: local.id, isOriginal: true }],
			});
		});
	}

	test('does not substitute a root installation for an available gallery item', async () => {
		const root = { ...createLocal('same', LocalMcpServerScope.Workspace), id: 'workspace-dot-mcp.0.same', mcpResource: URI.file('/workspace/.mcp.json'), format: McpResourceFormat.WorkspaceRoot };
		const { service, galleryService } = await createFixture([root], McpAccessValue.All);
		const gallery = createGallery(root.name);
		galleryService.queryItems = [gallery];
		const pager = await service.queryGallery();
		await timeout(0);
		await timeout(0);
		const candidate = pager.firstPage.items[0];
		assert.deepStrictEqual({
			installedResource: candidate.local?.mcpResource.toString(),
			state: candidate.installState,
			gallery: candidate.gallery,
			rootResource: service.local[0].local?.mcpResource.toString(),
			registryLookups: galleryService.requestCount,
		}, {
			installedResource: undefined,
			state: McpServerInstallState.Uninstalled,
			gallery,
			rootResource: root.mcpResource.toString(),
			registryLookups: 0,
		});
	});

	test('does not associate gallery metadata with same-name root inventory', async () => {
		const legacy = createLocal('same', LocalMcpServerScope.Workspace);
		const root = { ...legacy, id: 'workspace-dot-mcp.0.same', mcpResource: URI.file('/workspace/.mcp.json'), format: McpResourceFormat.WorkspaceRoot };
		const { service, galleryService, managementService } = await createFixture([legacy, root], McpAccessValue.All);
		const gallery = createGallery(root.name);
		await complete(await galleryService.nextRequest(), new Map([[gallery.name, found(gallery)]]));
		const rootGalleryAfterSync = service.local.find(server => server.id === root.id)?.gallery;
		managementService.fireUpdate([{ name: root.name, local: root, source: gallery, mcpResource: root.mcpResource }]);
		assert.deepStrictEqual({
			rootGalleryAfterSync,
			rootGalleryAfterUpdate: service.local.find(server => server.id === root.id)?.gallery,
			legacyGallery: service.local.find(server => server.id === legacy.id)?.gallery,
		}, {
			rootGalleryAfterSync: undefined,
			rootGalleryAfterUpdate: undefined,
			legacyGallery: gallery,
		});
	});

	for (const source of ['name', 'url', 'manifest']) {
		test(`gallery ${source} link can install alongside a same-name root server`, async () => {
			const legacy = { ...createLocal('same', LocalMcpServerScope.Workspace), id: 'mcp.config.ws0.same', mcpResource: URI.file('/workspace/.vscode/mcp.json') };
			const root = { ...legacy, id: 'workspace-dot-mcp.0.same', mcpResource: URI.file('/workspace/.mcp.json'), format: McpResourceFormat.WorkspaceRoot };
			const { service, galleryService, managementService, openedEditors } = await createFixture([root], McpAccessValue.All);
			const gallery = { ...createGallery(root.name), galleryUrl: 'https://registry.example.test/servers/same' };
			galleryService.queryItems = [gallery];
			managementService.installFromGalleryResult = legacy;
			const link = source === 'name' ? 'vscode:mcp/by-name/same'
				: source === 'url' ? 'vscode:mcp/registry.example.test/servers/same'
					: `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: root.name, command: 'node', gallery: true }))}`;
			await service.handleURL(URI.parse(link));
			const candidate = openedEditors[0].mcpServer;
			const before = { resource: candidate.local?.mcpResource.toString(), state: candidate.installState };
			const installed = await service.install(candidate);
			assert.deepStrictEqual({
				before,
				sameEditor: candidate === installed,
				installedResource: installed.local?.mcpResource.toString(),
				resources: service.local.map(server => server.local?.mcpResource.toString()).sort(),
			}, {
				before: { resource: undefined, state: McpServerInstallState.Uninstalled },
				sameEditor: true,
				installedResource: legacy.mcpResource.toString(),
				resources: [root.mcpResource.toString(), legacy.mcpResource.toString()].sort(),
			});
		});
	}

	test('excludes roots before installed precedence under all and registry-only access', async () => {
		const user = createLocal('same');
		const remote = createLocal('same', LocalMcpServerScope.RemoteUser);
		const legacy = { ...createLocal('same', LocalMcpServerScope.Workspace), id: 'mcp.config.ws0.same', mcpResource: URI.file('/workspace/.vscode/mcp.json') };
		const root = { ...legacy, id: 'workspace-dot-mcp.0.same', mcpResource: URI.file('/workspace/.mcp.json'), format: McpResourceFormat.WorkspaceRoot };
		const { service, galleryService, configurationService } = await createFixture([user, remote, legacy, root], McpAccessValue.All);
		const all = service.getEnabledLocalMcpServers().map(server => server.id);
		await complete(await galleryService.nextRequest(), new Map([['same', found(createGallery('same'))]]));
		await configurationService.setUserConfiguration(mcpAccessConfig, McpAccessValue.Registry);
		const registry = service.getEnabledLocalMcpServers().map(server => server.id);
		const rootStatus = service.local.find(server => server.id === root.id)?.runtimeStatus?.state;
		await configurationService.setUserConfiguration(mcpAccessConfig, McpAccessValue.None);
		const none = service.getEnabledLocalMcpServers().map(server => server.id);
		await configurationService.setUserConfiguration(mcpAccessConfig, McpAccessValue.All);
		assert.deepStrictEqual({ all, registry, rootStatus, none, restored: service.getEnabledLocalMcpServers().map(server => server.id) }, {
			all: [legacy.id], registry: [legacy.id], rootStatus: McpServerEnablementState.DisabledByAccess, none: [], restored: [legacy.id],
		});
	});

	test('resolves root paths with explicit collection identity and provenance', async () => {
		const { service, workspaceService } = await createFixture([]);
		const folder = toWorkspaceFolder(URI.file('/workspace'));
		workspaceService.setWorkspace({ id: 'test', folders: [folder] });
		const local = { ...createLocal('same', LocalMcpServerScope.Workspace), mcpResource: folder.toResource('.mcp.json'), format: McpResourceFormat.WorkspaceRoot };
		const fromLocal = service.getMcpConfigPath(local);
		const fromResource = await service.getMcpConfigPath(local.mcpResource);
		assert.deepStrictEqual({
			same: fromResource,
			path: fromLocal && { collectionId: fromLocal.collectionId, target: fromLocal.target, format: fromLocal.format, provenance: fromLocal.provenance },
		}, {
			same: fromLocal,
			path: { collectionId: 'workspace-dot-mcp.0', target: ConfigurationTarget.WORKSPACE_FOLDER, format: McpResourceFormat.WorkspaceRoot, provenance: McpCollectionProvenance.WorkspaceDotMcp },
		});
	});

	test('matches root runtime status by definition identity rather than server name', async () => {
		const legacy = { ...createLocal('same', LocalMcpServerScope.Workspace), id: 'mcp.config.ws0.same', mcpResource: URI.file('/workspace/.vscode/mcp.json') };
		const root = { ...legacy, id: 'workspace-dot-mcp.0.same', mcpResource: URI.file('/workspace/.mcp.json'), format: McpResourceFormat.WorkspaceRoot };
		const runtime = upcastPartial<IMcpServer>({
			definition: upcastPartial<McpServerDefinition>({ id: root.id }),
			enablement: constObservable(ContributionEnablementState.EnabledProfile),
		});
		const { service } = await createFixture([legacy, root], McpAccessValue.All, undefined, constObservable([runtime]));
		assert.deepStrictEqual(service.local.map(server => ({ id: server.id, status: server.runtimeStatus?.state })).sort((a, b) => a.id.localeCompare(b.id)), [
			{ id: legacy.id, status: McpServerEnablementState.Disabled },
			{ id: root.id, status: undefined },
		]);
	});

	test('installed discovery publishes legacy and never republishes its same-name root copy', async () => {
		const legacy = { ...createLocal('same', LocalMcpServerScope.Workspace), id: 'mcp.config.ws0.same', mcpResource: URI.file('/workspace/.vscode/mcp.json') };
		const root = { ...legacy, id: 'workspace-dot-mcp.0.same', mcpResource: URI.file('/workspace/.mcp.json'), format: McpResourceFormat.WorkspaceRoot };
		const { service, workspaceService, logService } = await createFixture([legacy, root], McpAccessValue.All);
		workspaceService.setWorkspace({ id: 'test', folders: [toWorkspaceFolder(URI.file('/workspace'))] });
		const registered = new DeferredPromise<McpCollectionDefinition>();
		const discovery = store.add(new InstalledMcpServersDiscovery(service, upcastPartial<IMcpRegistry>({
			registerCollection: collection => {
				void registered.complete(collection);
				return Disposable.None;
			},
		}), upcastPartial<ITextModelService>({
			createModelReference: async () => { throw new Error('No editor model'); },
		}), logService));
		discovery.start();
		const collection = await registered.p;
		assert.deepStrictEqual({
			collectionId: collection.id,
			servers: collection.serverDefinitions.get().map(server => server.id),
		}, { collectionId: 'mcp.config.ws0', servers: [legacy.id] });
	});
});
