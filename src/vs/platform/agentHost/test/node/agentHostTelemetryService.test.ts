/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLoggerService, NullLogService } from '../../../log/common/log.js';
import type { IProductService } from '../../../product/common/productService.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { AgentHostTelemetryLevelConfigKey, telemetryLevelToAgentHostConfigValue } from '../../common/agentHostSchema.js';
import { AgentHostRestrictedTelemetrySender, IAgentHostRestrictedTelemetry, IAgentHostInternalTelemetryContext, IAgentHostRestrictedTelemetryContext, TelemetryProps } from '../../node/agentHostRestrictedTelemetry.js';
import { AgentHostTelemetryService, createAgentHostTelemetryService, type IAgentHostTelemetryService, updateAgentHostTelemetryLevelFromConfig } from '../../node/agentHostTelemetryService.js';
import { AgentHostInternalTelemetrySender } from '../../node/agentHostMicrosoftTelemetry.js';

class TestTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;

	telemetryLevel = TelemetryLevel.USAGE;
	sendErrorTelemetry = true;
	sessionId = 'sessionId';
	machineId = 'machineId';
	sqmId = 'sqmId';
	devDeviceId = 'devDeviceId';
	firstSessionDate = 'firstSessionDate';
	readonly events: { eventName: string; data: ITelemetryData | undefined }[] = [];
	readonly errorEvents: { eventName: string; data: ITelemetryData | undefined }[] = [];
	readonly commonProperties: Record<string, string | boolean> = {};

	publicLog(eventName: string, data?: ITelemetryData): void {
		this.events.push({ eventName, data });
	}

	publicLogError(eventName: string, data?: ITelemetryData): void {
		this.errorEvents.push({ eventName, data });
	}

	publicLog2(eventName: string, data?: ITelemetryData): void {
		this.events.push({ eventName, data });
	}

	publicLogError2(eventName: string, data?: ITelemetryData): void {
		this.errorEvents.push({ eventName, data });
	}

	setExperimentProperty(): void { }
	setCommonProperty(name: string, value: string | boolean): void {
		this.commonProperties[name] = value;
	}
}

class TestRestrictedSink implements IAgentHostRestrictedTelemetry {
	readonly enhanced: string[] = [];
	readonly standard: string[] = [];
	readonly trackingIds: (string | undefined)[] = [];
	readonly endpoints: (string | undefined)[] = [];
	readonly enabledFlags: boolean[] = [];
	readonly internal: string[] = [];
	readonly internalContexts: (IAgentHostInternalTelemetryContext | undefined)[] = [];
	readonly commonProperties: Record<string, string | boolean> = {};

	sendGHTelemetryEvent(eventName: string, _properties?: TelemetryProps): void {
		this.standard.push(eventName);
	}
	sendEnhancedGHTelemetryEvent(eventName: string, _properties?: TelemetryProps): void {
		this.enhanced.push(eventName);
	}
	sendEnhancedGHTelemetryEventForContext(_context: IAgentHostRestrictedTelemetryContext, eventName: string): void {
		this.enhanced.push(eventName);
	}
	sendInternalMSFTTelemetryEvent(eventName: string): void {
		this.internal.push(eventName);
	}
	sendInternalMSFTTelemetryEventForContext(_context: IAgentHostInternalTelemetryContext, eventName: string): void {
		this.internal.push(eventName);
	}
	setCopilotTrackingId(trackingId: string | undefined): void {
		this.trackingIds.push(trackingId);
	}
	setRestrictedTelemetryEndpoint(endpointUrl: string | undefined): void {
		this.endpoints.push(endpointUrl);
	}
	setRestrictedTelemetryEnabled(enabled: boolean): void {
		this.enabledFlags.push(enabled);
	}
	setInternalTelemetryContext(context: IAgentHostInternalTelemetryContext | undefined): void {
		this.internalContexts.push(context);
	}
	setCommonProperty(name: string, value: string | boolean): void {
		this.commonProperties[name] = value;
	}
}

suite('AgentHostTelemetryService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function createFactoryService(telemetryLevelArg: string | undefined, telemetryLevelEnvironment: string | undefined): Promise<IAgentHostTelemetryService> {
		const localDisposables = disposables.add(new DisposableStore());
		const logService = new NullLogService();
		const fileService = localDisposables.add(new FileService(logService));
		localDisposables.add(fileService.registerProvider(Schemas.file, localDisposables.add(new InMemoryFileSystemProvider())));
		return createAgentHostTelemetryService({
			environmentService: {
				args: telemetryLevelArg === undefined ? {} : { 'telemetry-level': telemetryLevelArg },
				isBuilt: true,
				disableTelemetry: false,
				appRoot: '/app',
				extensionsPath: '/extensions',
				userHome: URI.file('/home'),
				tmpDir: URI.file('/tmp'),
				userDataPath: '/user-data',
				appSettingsHome: URI.file('/User'),
			} as INativeEnvironmentService,
			productService: {
				_serviceBrand: undefined,
				version: '1.130.0',
				enableTelemetry: true,
			} as IProductService,
			fileService,
			loggerService: localDisposables.add(new NullLoggerService()),
			logService,
			disposables: localDisposables,
			readTelemetryLevelEnvironment: () => telemetryLevelEnvironment,
		});
	}

	test('uses the most restrictive valid launch source and fails closed for malformed sources', async () => {
		const services = await Promise.all([
			createFactoryService('all', 'off'),
			createFactoryService('off', 'all'),
			createFactoryService('invalid', 'all'),
			createFactoryService('all', 'invalid'),
			createFactoryService(undefined, undefined),
		]);

		assert.deepStrictEqual(services.map(service => service.telemetryLevel), [
			TelemetryLevel.NONE,
			TelemetryLevel.NONE,
			TelemetryLevel.NONE,
			TelemetryLevel.NONE,
			TelemetryLevel.USAGE,
		]);
	});

	test('logging-only builds do not create restricted network senders', async () => {
		const localDisposables = disposables.add(new DisposableStore());
		const logService = new NullLogService();
		const fileService = localDisposables.add(new FileService(logService));
		const fileSystemProvider = localDisposables.add(new InMemoryFileSystemProvider());
		localDisposables.add(fileService.registerProvider(Schemas.inMemory, fileSystemProvider));
		const service = await createAgentHostTelemetryService({
			environmentService: {
				isBuilt: false,
				disableTelemetry: false,
				appRoot: '/app',
				extensionsPath: '/extensions',
				userHome: URI.from({ scheme: Schemas.inMemory, path: '/home' }),
				tmpDir: URI.from({ scheme: Schemas.inMemory, path: '/tmp' }),
				userDataPath: '/user-data',
				appSettingsHome: URI.from({ scheme: Schemas.inMemory, path: '/User' }),
			} as INativeEnvironmentService,
			productService: { _serviceBrand: undefined, version: '1.130.0' } as IProductService,
			fileService,
			loggerService: localDisposables.add(new NullLoggerService()),
			logService,
			disposables: localDisposables,
		});
		assert.strictEqual((service as unknown as { _restricted: AgentHostRestrictedTelemetrySender | undefined })._restricted, undefined);
	});

	test('uses the built-in Copilot manifest version for internal telemetry', async () => {
		const localDisposables = disposables.add(new DisposableStore());
		const logService = new NullLogService();
		const fileService = localDisposables.add(new FileService(logService));
		const fileSystemProvider = localDisposables.add(new InMemoryFileSystemProvider());
		localDisposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
		await fileService.createFolder(URI.file('/extensions/copilot'));
		await fileService.writeFile(URI.file('/extensions/copilot/package.json'), VSBuffer.fromString(JSON.stringify({ version: '0.58.0' })));

		const service = await createAgentHostTelemetryService({
			environmentService: {
				isBuilt: true,
				disableTelemetry: false,
				appRoot: '/app',
				extensionsPath: '/extensions',
				builtinExtensionsPath: '/extensions',
				userHome: URI.file('/home'),
				tmpDir: URI.file('/tmp'),
				userDataPath: '/user-data',
				appSettingsHome: URI.file('/User'),
			} as INativeEnvironmentService,
			productService: {
				_serviceBrand: undefined,
				version: '1.130.0',
				enableTelemetry: true,
				aiConfig: { ariaKey: 'test-key' },
			} as IProductService,
			fileService,
			loggerService: localDisposables.add(new NullLoggerService()),
			logService,
			disposables: localDisposables,
		});
		const restricted = (service as unknown as { _restricted: AgentHostRestrictedTelemetrySender })._restricted;
		const internalSender = (restricted as unknown as { _internalSink: AgentHostInternalTelemetrySender })._internalSink;

		assert.strictEqual((internalSender as unknown as { _options: { extensionVersion: string | undefined } })._options.extensionVersion, '0.58.0');
	});

	test('uses the launch telemetry level before a client connects and only becomes more restrictive', () => {
		const delegate = new TestTelemetryService();
		const service = disposables.add(new AgentHostTelemetryService(delegate, undefined, undefined, undefined, TelemetryLevel.USAGE));

		service.publicLog('beforeClientLevel', { count: 1 });
		service.updateTelemetryLevel(TelemetryLevel.ERROR);
		service.publicLog('afterClientLevel', { count: 2 });
		service.publicLogError('afterClientLevelError', { count: 3 });
		service.updateTelemetryLevel(TelemetryLevel.NONE);
		service.updateTelemetryLevel(TelemetryLevel.USAGE);
		service.publicLog2('afterDisable');
		service.publicLogError2('afterDisableError');

		assert.deepStrictEqual({
			telemetryLevel: service.telemetryLevel,
			sendErrorTelemetry: service.sendErrorTelemetry,
			events: delegate.events,
			errorEvents: delegate.errorEvents,
		}, {
			telemetryLevel: TelemetryLevel.NONE,
			sendErrorTelemetry: false,
			events: [{ eventName: 'beforeClientLevel', data: { count: 1 } }],
			errorEvents: [{ eventName: 'afterClientLevelError', data: { count: 3 } }],
		});
	});

	test('forwards common properties to standard and restricted telemetry', () => {
		const delegate = new TestTelemetryService();
		const sink = new TestRestrictedSink();
		const service = disposables.add(new AgentHostTelemetryService(delegate, sink));

		service.setCommonProperty('copilotSku', 'copilot_for_business_seat');

		assert.deepStrictEqual({ delegate: delegate.commonProperties, restricted: sink.commonProperties }, {
			delegate: { copilotSku: 'copilot_for_business_seat' },
			restricted: { copilotSku: 'copilot_for_business_seat' },
		});
	});

	test('uses most restrictive client telemetry level', () => {
		const service = disposables.add(new AgentHostTelemetryService(new TestTelemetryService()));

		service.updateTelemetryLevel(TelemetryLevel.ERROR);
		service.updateTelemetryLevel(TelemetryLevel.USAGE);

		assert.strictEqual(service.telemetryLevel, TelemetryLevel.ERROR);
	});

	test('adds the Copilot SDK and runtime versions as common properties', () => {
		const delegate = new TestTelemetryService();
		disposables.add(new AgentHostTelemetryService(delegate, undefined, '1.0.9-preview.3', '1.0.78'));

		assert.deepStrictEqual(delegate.commonProperties, {
			'common.copilotSdkVersion': '1.0.9-preview.3',
			'common.copilotRuntimeVersion': '1.0.78',
		});
	});

	test('updates telemetry level from root config string enum', () => {
		const service = disposables.add(new AgentHostTelemetryService(new TestTelemetryService()));

		updateAgentHostTelemetryLevelFromConfig(service, {
			[AgentHostTelemetryLevelConfigKey]: telemetryLevelToAgentHostConfigValue(TelemetryLevel.ERROR),
		});

		assert.strictEqual(service.telemetryLevel, TelemetryLevel.ERROR);
	});

	test('enhanced GH telemetry is gated on the restricted (rt) opt-in; standard GH telemetry is not', () => {
		const restricted = new TestRestrictedSink();
		const service = disposables.add(new AgentHostTelemetryService(new TestTelemetryService(), restricted));
		service.updateTelemetryLevel(TelemetryLevel.USAGE);

		service.sendEnhancedGHTelemetryEvent('request.options.tools'); // dropped: rt disabled by default
		service.sendGHTelemetryEvent('completion'); // sent: standard GH telemetry is not rt-gated
		service.setRestrictedTelemetryEnabled(true);
		service.sendEnhancedGHTelemetryEvent('request.options.tools'); // sent: rt now enabled
		service.setCopilotTrackingId('tid-1');
		service.setRestrictedTelemetryEndpoint('https://ghe.example/telemetry');

		assert.deepStrictEqual({
			enhanced: restricted.enhanced,
			standard: restricted.standard,
			trackingIds: restricted.trackingIds,
			endpoints: restricted.endpoints,
		}, {
			enhanced: ['request.options.tools'],
			standard: ['completion'],
			trackingIds: ['tid-1'],
			endpoints: ['https://ghe.example/telemetry'],
		});
		// The rt opt-in is mirrored onto the sender (defense in depth), matching the extension's
		// opted-in-only restricted reporter.
		assert.deepStrictEqual(restricted.enabledFlags, [true]);
	});

	test('enhanced GH telemetry stays suppressed when telemetry is disabled, even for an rt=1 user', () => {
		const delegate = new TestTelemetryService();
		delegate.telemetryLevel = TelemetryLevel.ERROR; // user opted below USAGE
		const restricted = new TestRestrictedSink();
		const service = disposables.add(new AgentHostTelemetryService(delegate, restricted));
		service.updateTelemetryLevel(TelemetryLevel.USAGE);

		service.setRestrictedTelemetryEnabled(true); // rt=1
		service.sendEnhancedGHTelemetryEvent('request.options.tools');
		service.sendGHTelemetryEvent('completion');

		// Neither standard nor enhanced GH telemetry is delegated below USAGE, regardless of rt.
		assert.deepStrictEqual({ enhanced: restricted.enhanced, standard: restricted.standard }, { enhanced: [], standard: [] });
	});

	test('internal telemetry is independently gated and identity is cleared on account changes', () => {
		const restricted = new TestRestrictedSink();
		const service = disposables.add(new AgentHostTelemetryService(new TestTelemetryService(), restricted));
		service.updateTelemetryLevel(TelemetryLevel.USAGE);
		const internalContext = { isInternal: true, trackingId: 'tid-1', userName: 'octocat', isVscodeTeamMember: true };

		service.sendInternalMSFTTelemetryEvent('beforeIdentity');
		service.setInternalTelemetryContext(internalContext);
		service.sendInternalMSFTTelemetryEvent('internal');
		service.setInternalTelemetryContext(undefined);
		service.sendInternalMSFTTelemetryEvent('afterClear');

		assert.deepStrictEqual({ internal: restricted.internal, contexts: restricted.internalContexts }, {
			internal: ['internal'],
			contexts: [internalContext, undefined],
		});
	});
});
