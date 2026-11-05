/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotClient, type CopilotClientOptions } from '@github/copilot-sdk';
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { INativeEnvironmentService } from '../../../../environment/common/environment.js';
import { AbstractNativeEnvironmentService } from '../../../../environment/common/environmentService.js';
import { FileService } from '../../../../files/common/fileService.js';
import { IFileService } from '../../../../files/common/files.js';
import { DiskFileSystemProvider } from '../../../../files/node/diskFileSystemProvider.js';
import { InstantiationService } from '../../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../../log/common/log.js';
import product from '../../../../product/common/product.js';
import { IProductService } from '../../../../product/common/productService.js';
import { ITelemetryService } from '../../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../telemetry/common/telemetryUtils.js';
import { IAgentHostOTelService, NullAgentHostOTelService } from '../../../common/otel/agentHostOTelService.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import type { IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { createAgentServiceFoundation } from '../../../node/agentServiceFoundation.js';
import { registerAgentHostCoreServices, registerAgentHostHostServices } from '../../../node/agentHostServices.js';
import { IByokLmBridgeRegistry, NullByokLmBridgeRegistry } from '../../../node/byokLmBridgeRegistry.js';
import { CopilotAgent } from '../../../node/copilot/copilotAgent.js';
import { SessionDataService } from '../../../node/sessionDataService.js';
import { createTestAgentHostProxyResolver } from '../agentServiceTestUtils.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';
import { isCredentialEnvironmentKey, labelTestCredential } from './copilotCredentialTestUtils.js';

class TestEnvironmentService extends AbstractNativeEnvironmentService { }

/** Tracks disposal without replacing SDK session creation. */
class ObservedCopilotClient extends CopilotClient {
	onStarted: (() => void) | undefined;

	override async start(): Promise<void> {
		await super.start();
		this.onStarted?.();
	}

	stopCount = 0;
	stopErrorCount = 0;

	override async stop(): Promise<Error[]> {
		this.stopCount++;
		const errors = await super.stop();
		this.stopErrorCount = errors.length;
		return errors;
	}
}

class LocalEndpointCopilotAgent extends CopilotAgent {
	endpoint = '';
	home = '';
	configuration: IAgentConfigurationService | undefined;
	readonly clients: { options: CopilotClientOptions; client: ObservedCopilotClient }[] = [];
	onClientStarted: ((client: CopilotClient, options: CopilotClientOptions) => void) | undefined;

	protected override _createCopilotClient(options: CopilotClientOptions): CopilotClient {
		for (const [key, value] of Object.entries(options.env ?? {})) {
			assert.ok(!isCredentialEnvironmentKey(key) || labelTestCredential(value) !== 'UNEXPECTED', `Unexpected credential environment key in test subprocess: ${key}`);
		}
		assert.notStrictEqual(labelTestCredential(options.gitHubToken), 'UNEXPECTED', 'Unexpected test startup credential');
		const client = new ObservedCopilotClient({
			...options,
			env: {
				...createIsolatedProviderEnvironment(this.home, options.env),
				COPILOT_HOME: options.env?.COPILOT_HOME,
				COPILOT_API_URL: this.endpoint,
				COPILOT_DEBUG_GITHUB_API_URL: this.endpoint,
				COPILOT_MANAGED_SETTINGS_CACHE: '0',
				COPILOT_TELEMETRY_ENABLED: 'false',
			},
		});
		this.clients.push({
			options: {
				...options,
				gitHubToken: options.gitHubToken === undefined ? undefined : labelTestCredential(options.gitHubToken),
				env: Object.fromEntries(Object.entries(options.env ?? {}).map(([key, value]) =>
					[key, isCredentialEnvironmentKey(key) && value !== undefined ? labelTestCredential(value) : value])),
			},
			client,
		});
		client.onStarted = () => this.onClientStarted?.(client, options);
		return client;
	}
}

/** Reuses the production service registrations and the real provider startup/launcher. */
export function createLocalEndpointCopilotAgent(store: DisposableStore, home: string, endpoint: string, rootConfiguration: Record<string, unknown> = {}): LocalEndpointCopilotAgent {
	const logService = new NullLogService();
	const productService: IProductService = { ...product, _serviceBrand: undefined };
	const fileService = store.add(new FileService(logService));
	store.add(fileService.registerProvider(Schemas.file, store.add(new DiskFileSystemProvider(logService))));
	const environment = new TestEnvironmentService({ _: [], 'user-data-dir': home }, { homeDir: home, userDataDir: home, tmpDir: home }, productService);
	const sessionDataService = new SessionDataService(URI.file(home), fileService, logService);
	const services = new ServiceCollection(
		[INativeEnvironmentService, environment],
		[IProductService, productService],
		[ILogService, logService],
		[IFileService, fileService],
		[ISessionDataService, sessionDataService],
		[ITelemetryService, NullTelemetryService],
		[IByokLmBridgeRegistry, new NullByokLmBridgeRegistry()],
	);
	const localFetch: typeof globalThis.fetch = (input, init) => {
		const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
		if (url.hostname !== 'api.github.com' && url.origin !== endpoint) {
			throw new Error(`Unexpected host fetch: ${url.origin}`);
		}
		return globalThis.fetch(`${endpoint}${url.pathname}${url.search}`, init);
	};
	const foundation = createAgentServiceFoundation({
		services, owned: store, logService, productService,
		transientProxyConfiguration: false,
		proxyResolver: createTestAgentHostProxyResolver(localFetch),
		fetchFn: localFetch,
	});
	foundation.configurationService.updateRootConfig(rootConfiguration);
	registerAgentHostCoreServices(services, { storageResource: undefined, fetchFn: localFetch, gitHubServiceOptions: foundation.gitHubServiceOptions });
	registerAgentHostHostServices(services, { userDataPath: URI.file(home), fetchFn: localFetch, byok: { kind: 'unavailable' } });
	services.set(IAgentHostOTelService, NullAgentHostOTelService);
	const instantiationService = store.add(new InstantiationService(services, true));
	const agent = store.add(instantiationService.createInstance(LocalEndpointCopilotAgent));
	agent.home = home;
	agent.endpoint = endpoint;
	agent.configuration = foundation.configurationService;
	return agent;
}
