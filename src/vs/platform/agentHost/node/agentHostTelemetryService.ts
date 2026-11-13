/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hostname, release } from 'os';
import { raceTimeout } from '../../../base/common/async.js';
import type { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable, isDisposable, toDisposable, type DisposableStore, type IDisposable } from '../../../base/common/lifecycle.js';
import { Emitter, type Event } from '../../../base/common/event.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { getDevDeviceId, getMachineId, getSqmMachineId } from '../../../base/node/id.js';
import type { IRequestContext, IRequestOptions } from '../../../base/parts/request/common/request.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService, ILoggerService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IRequestService, type AuthInfo, type Credentials, type IRequestCompleteEvent } from '../../request/common/request.js';
import { OneDataSystemAppender } from '../../telemetry/node/1dsAppender.js';
import { resolveCommonProperties, verifyMicrosoftInternalDomain } from '../../telemetry/common/commonProperties.js';
import { ClassifiedEvent, IGDPRProperty, OmitMetadata, StrictPropertyCheck } from '../../telemetry/common/gdprTypings.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../telemetry/common/telemetry.js';
import { TelemetryLogAppender } from '../../telemetry/common/telemetryLogAppender.js';
import { TelemetryService } from '../../telemetry/common/telemetryService.js';
import { getPiiPathsFromEnvironment, getUserContentPathsFromEnvironment, isLoggingOnly, NullTelemetryService, supportsTelemetry, type ITelemetryAppender } from '../../telemetry/common/telemetryUtils.js';
import { AgentHostTelemetryLevelConfigKey, agentHostConfigValueToTelemetryLevel } from '../common/agentHostSchema.js';
import { AgentHostDevDeviceIdEnvKey, AgentHostMachineIdEnvKey, AgentHostSqmIdEnvKey, AgentHostTelemetryLevelEnvKey } from '../common/agentHostTelemetryEnv.js';
import { AgentHostRestrictedTelemetrySender, IAgentHostRestrictedTelemetry, IAgentHostInternalTelemetryContext, IAgentHostRestrictedTelemetryContext, TelemetryMeasurements, TelemetryProps } from './agentHostRestrictedTelemetry.js';
import { AgentHostInternalTelemetrySender } from './agentHostMicrosoftTelemetry.js';
import type { IAgentTelemetryContext } from '../common/agent.js';

export interface IAgentHostTelemetryServiceOptions {
	readonly environmentService: INativeEnvironmentService;
	readonly productService: IProductService;
	readonly fileService: IFileService;
	readonly loggerService: ILoggerService | undefined;
	readonly logService: ILogService;
	readonly disposables: DisposableStore;
	readonly disableTelemetry?: boolean;
	readonly fetchFn?: typeof globalThis.fetch;
	readonly requestService?: IRequestService;
	readonly readTelemetryLevelEnvironment?: () => string | undefined;
}

export interface IAgentHostTelemetryService extends ITelemetryService, IAgentHostRestrictedTelemetry {
	readonly onDidChangeTelemetryLevel: Event<TelemetryLevel>;
	updateTelemetryLevel(telemetryLevel: TelemetryLevel): void;
	/** Register an account reader with provider-owned lifetime, never process-wide account properties. */
	registerCopilotTelemetryProvider(provider: string, getContext: () => IAgentTelemetryContext): IDisposable;
	/** Read the current account for point-in-time events. Delayed events must capture their own account context. */
	getCopilotTelemetryContext(provider: string): IAgentTelemetryContext | undefined;
	/**
	 * Sends the events queued for the telemetry collector and resolves once
	 * every collector request has completed. That can take seconds, for
	 * example while the collector waits to retry a failed request, so bound
	 * the wait, as {@link flushAgentHostTelemetry} does. It unloads the
	 * collector, so events logged afterwards are not sent: call it only while
	 * the host shuts down. Resolves immediately when no collector is configured.
	 */
	flush(): Promise<void>;
}

export class AgentHostTelemetryService extends Disposable implements IAgentHostTelemetryService {
	declare readonly _serviceBrand: undefined;

	private _telemetryLevel: TelemetryLevel;
	private readonly _onDidChangeTelemetryLevel = this._register(new Emitter<TelemetryLevel>());
	readonly onDidChangeTelemetryLevel: Event<TelemetryLevel> = this._onDidChangeTelemetryLevel.event;

	/**
	 * Whether `/copilot_internal/user` enables enhanced/restricted telemetry. Defaults to `false`
	 * so nothing restricted is sent until the authenticated account confirms the opt-in.
	 */
	private _restrictedTelemetryEnabled = false;
	private _internalTelemetryEnabled = false;

	/** Whether the machine itself is internal, captured before any account can override it. */
	private readonly _internalMachine: boolean;
	private readonly _copilotTelemetryProviders = new Map<string, () => IAgentTelemetryContext>();

	constructor(
		private readonly _delegate: ITelemetryService,
		private readonly _restricted?: IAgentHostRestrictedTelemetry,
		copilotSdkVersion?: string,
		copilotRuntimeVersion?: string,
		initialTelemetryLevel: TelemetryLevel = TelemetryLevel.USAGE,
		private readonly _flushCollector?: () => Promise<void>,
	) {
		super();
		this._telemetryLevel = initialTelemetryLevel;
		this._internalMachine = _delegate.msftInternal === true;
		this._register(toDisposable(() => this._copilotTelemetryProviders.clear()));
		if (isDisposable(_delegate)) {
			this._register(_delegate);
		}
		if (copilotSdkVersion) {
			// __GDPR__COMMON__ "common.copilotSdkVersion" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The version of the Copilot SDK used by the Agent Host process." }
			this._delegate.setCommonProperty('common.copilotSdkVersion', copilotSdkVersion);
		}
		if (copilotRuntimeVersion) {
			// __GDPR__COMMON__ "common.copilotRuntimeVersion" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The version of the Copilot runtime used by the Agent Host process." }
			this._delegate.setCommonProperty('common.copilotRuntimeVersion', copilotRuntimeVersion);
		}
	}

	get telemetryLevel(): TelemetryLevel {
		return Math.min(this._delegate.telemetryLevel, this._telemetryLevel);
	}

	get sendErrorTelemetry(): boolean {
		return this.telemetryLevel >= TelemetryLevel.ERROR && this._delegate.sendErrorTelemetry;
	}

	get sessionId(): string {
		return this._delegate.sessionId;
	}

	get machineId(): string {
		return this._delegate.machineId;
	}

	get sqmId(): string {
		return this._delegate.sqmId;
	}

	get devDeviceId(): string {
		return this._delegate.devDeviceId;
	}

	get firstSessionDate(): string {
		return this._delegate.firstSessionDate;
	}

	get msftInternal(): boolean | undefined {
		return this._delegate.msftInternal;
	}

	publicLog(eventName: string, data?: ITelemetryData): void {
		if (this.telemetryLevel < TelemetryLevel.USAGE) {
			return;
		}
		this._delegate.publicLog(eventName, data);
	}

	publicLogError(eventName: string, data?: ITelemetryData): void {
		if (this.telemetryLevel < TelemetryLevel.ERROR) {
			return;
		}
		this._delegate.publicLogError(eventName, data);
	}

	publicLog2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>): void {
		if (this.telemetryLevel < TelemetryLevel.USAGE) {
			return;
		}
		this._delegate.publicLog2(eventName, data);
	}

	publicLogError2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>): void {
		if (this.telemetryLevel < TelemetryLevel.ERROR) {
			return;
		}
		this._delegate.publicLogError2(eventName, data);
	}

	sendGHTelemetryEvent(eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		if (this.telemetryLevel < TelemetryLevel.USAGE) {
			return;
		}
		this._restricted?.sendGHTelemetryEvent(eventName, properties, measurements);
	}

	sendEnhancedGHTelemetryEvent(eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		if (this.telemetryLevel < TelemetryLevel.USAGE || !this._restrictedTelemetryEnabled) {
			return;
		}
		this._restricted?.sendEnhancedGHTelemetryEvent(eventName, properties, measurements);
	}

	sendEnhancedGHTelemetryEventForContext(context: IAgentHostRestrictedTelemetryContext, eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		if (this.telemetryLevel < TelemetryLevel.USAGE || !context.restrictedTelemetryEnabled) {
			return;
		}
		this._restricted?.sendEnhancedGHTelemetryEventForContext(context, eventName, properties, measurements);
	}

	sendInternalMSFTTelemetryEvent(eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		if (this.telemetryLevel < TelemetryLevel.USAGE || !this._internalTelemetryEnabled) {
			return;
		}
		this._restricted?.sendInternalMSFTTelemetryEvent(eventName, properties, measurements);
	}

	sendInternalMSFTTelemetryEventForContext(context: IAgentHostInternalTelemetryContext, eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		if (this.telemetryLevel < TelemetryLevel.USAGE || !context.isInternal) {
			return;
		}
		this._restricted?.sendInternalMSFTTelemetryEventForContext(context, eventName, properties, measurements);
	}

	setCopilotTrackingId(trackingId: string | undefined): void {
		this._restricted?.setCopilotTrackingId(trackingId);
	}

	setRestrictedTelemetryEndpoint(endpointUrl: string | undefined): void {
		this._restricted?.setRestrictedTelemetryEndpoint(endpointUrl);
	}

	setRestrictedTelemetryEnabled(enabled: boolean): void {
		this._restrictedTelemetryEnabled = enabled;
		// Mirror onto the sender so the restricted-table writer enforces the same `rt` gate
		// independently (defense in depth), matching the extension's opted-in-only reporter.
		this._restricted?.setRestrictedTelemetryEnabled(enabled);
	}

	setInternalTelemetryContext(context: IAgentHostInternalTelemetryContext | undefined): void {
		this._internalTelemetryEnabled = context?.isInternal === true;
		if (context) {
			// Signing in to an external account has to clear the account half of the signal again.
			this._delegate.setCommonProperty('common.msftInternal', this._internalMachine || this._internalTelemetryEnabled);
		}
		this._restricted?.setInternalTelemetryContext(context);
	}

	setExperimentProperty(name: string, value: string): void {
		this._delegate.setExperimentProperty(name, value);
	}

	setCommonProperty(name: string, value: string | boolean | undefined): void {
		this._delegate.setCommonProperty(name, value);
		this._restricted?.setCommonProperty(name, value);
	}

	registerCopilotTelemetryProvider(provider: string, getContext: () => IAgentTelemetryContext): IDisposable {
		this._copilotTelemetryProviders.set(provider, getContext);
		return toDisposable(() => {
			if (this._copilotTelemetryProviders.get(provider) === getContext) {
				this._copilotTelemetryProviders.delete(provider);
			}
		});
	}

	getCopilotTelemetryContext(provider: string): IAgentTelemetryContext | undefined {
		return this._copilotTelemetryProviders.get(provider)?.();
	}

	updateTelemetryLevel(telemetryLevel: TelemetryLevel): void {
		const previous = this.telemetryLevel;
		this._telemetryLevel = Math.min(this._telemetryLevel, telemetryLevel);
		const next = this.telemetryLevel;
		if (next !== previous) {
			this._onDidChangeTelemetryLevel.fire(next);
		}
	}

	flush(): Promise<void> {
		return this._flushCollector?.() ?? Promise.resolve();
	}
}

/** How long a graceful shutdown waits for {@link IAgentHostTelemetryService.flush}. */
export const AGENT_HOST_TELEMETRY_FLUSH_TIMEOUT_MS = 1000;

/**
 * Delivers the telemetry queued before a graceful shutdown, waiting at most
 * {@link AGENT_HOST_TELEMETRY_FLUSH_TIMEOUT_MS}. Never rejects. Run it after
 * providers stop, so it also delivers what they report while stopping.
 */
export async function flushAgentHostTelemetry(telemetryService: ITelemetryService, logService: ILogService): Promise<void> {
	if (!isAgentHostTelemetryService(telemetryService)) {
		return;
	}
	try {
		await raceTimeout(telemetryService.flush(), AGENT_HOST_TELEMETRY_FLUSH_TIMEOUT_MS, () => {
			logService.warn(`Agent Host telemetry did not finish flushing within ${AGENT_HOST_TELEMETRY_FLUSH_TIMEOUT_MS}ms during shutdown.`);
		});
	} catch (error) {
		logService.error('Agent Host telemetry flush failed during shutdown.', error);
	}
}

/**
 * Delegates to a request service and remembers each request until it settles.
 * The collector starts the requests it sends while unloading without waiting
 * for them, so a flush waits on these as well.
 */
class InFlightRequestService implements IRequestService {
	declare readonly _serviceBrand: undefined;

	private readonly _inFlight = new Set<Promise<IRequestContext>>();

	constructor(private readonly _delegate: IRequestService) { }

	get onDidCompleteRequest(): Event<IRequestCompleteEvent> {
		return this._delegate.onDidCompleteRequest;
	}

	request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		const request = this._delegate.request(options, token);
		this._inFlight.add(request);
		const forget = () => this._inFlight.delete(request);
		request.then(forget, forget);
		return request;
	}

	/** Resolves once no request is in flight, including requests started while waiting. */
	async whenIdle(): Promise<void> {
		while (this._inFlight.size > 0) {
			await Promise.allSettled(this._inFlight);
		}
	}

	resolveProxy(url: string): Promise<string | undefined> {
		return this._delegate.resolveProxy(url);
	}

	lookupAuthorization(authInfo: AuthInfo): Promise<Credentials | undefined> {
		return this._delegate.lookupAuthorization(authInfo);
	}

	lookupKerberosAuthorization(url: string): Promise<string | undefined> {
		return this._delegate.lookupKerberosAuthorization(url);
	}

	loadCertificates(): Promise<string[]> {
		return this._delegate.loadCertificates();
	}
}

export function updateAgentHostTelemetryLevelFromConfig(telemetryService: ITelemetryService, config: Record<string, unknown> | undefined): void {
	const telemetryLevel = config?.[AgentHostTelemetryLevelConfigKey];
	const telemetryLevelValue = agentHostConfigValueToTelemetryLevel(telemetryLevel);
	if (!isAgentHostTelemetryService(telemetryService) || telemetryLevelValue === undefined) {
		return;
	}
	telemetryService.updateTelemetryLevel(telemetryLevelValue);
}

export function isAgentHostTelemetryService(telemetryService: ITelemetryService): telemetryService is IAgentHostTelemetryService {
	return typeof (telemetryService as IAgentHostTelemetryService).updateTelemetryLevel === 'function';
}

async function resolveCopilotExtensionVersion(environmentService: INativeEnvironmentService, fileService: IFileService, logService: ILogService): Promise<string | undefined> {
	if (!environmentService.builtinExtensionsPath) {
		return undefined;
	}
	try {
		const manifest = JSON.parse((await fileService.readFile(joinPath(URI.file(environmentService.builtinExtensionsPath), 'copilot', 'package.json'))).value.toString()) as { version?: unknown };
		return typeof manifest.version === 'string' ? manifest.version : undefined;
	} catch (error) {
		logService.debug(`[agentHostTelemetry] Failed to resolve Copilot extension version: ${error instanceof Error ? error.message : String(error)}`);
		return undefined;
	}
}

export async function createAgentHostTelemetryService(options: IAgentHostTelemetryServiceOptions): Promise<IAgentHostTelemetryService> {
	const { environmentService, productService, fileService, loggerService, logService, disposables } = options;
	if (options.disableTelemetry || !loggerService || !supportsTelemetry(productService, environmentService)) {
		return disposables.add(new AgentHostTelemetryService(NullTelemetryService));
	}

	const initialTelemetryLevel = Math.min(
		parseLaunchTelemetryLevel(environmentService.args?.['telemetry-level']),
		parseLaunchTelemetryLevel((options.readTelemetryLevelEnvironment ?? (() => process.env[AgentHostTelemetryLevelEnvKey]))()),
	);
	const internalTelemetry = verifyMicrosoftInternalDomain(productService.msftInternalDomains ?? []);

	const appenders: ITelemetryAppender[] = [
		disposables.add(new TelemetryLogAppender({ prefix: '', loggerId: 'agentHostTelemetry' }, false, loggerService, environmentService, productService)),
	];
	const loggingOnly = isLoggingOnly(productService, environmentService);
	let flushCollector: (() => Promise<void>) | undefined;
	if (!loggingOnly && productService.aiConfig?.ariaKey) {
		const collectorRequests = options.requestService && new InFlightRequestService(options.requestService);
		const collectorAppender = new OneDataSystemAppender(collectorRequests ?? options.requestService, internalTelemetry, 'monacoworkbench', null, productService.aiConfig.ariaKey);
		let flushed: Promise<void> | undefined;
		// Shared by the shutdown flush and disposal, so the collector is only unloaded once.
		const flush = () => flushed ??= (async () => {
			await collectorAppender.flush();
			await collectorRequests?.whenIdle();
		})();
		disposables.add(toDisposable(() => { void flush(); }));
		flushCollector = flush;
		appenders.push(collectorAppender);
	}

	// Prefer the host-forwarded identifiers (see `agentHostTelemetryEnv`) so the
	// agent host reports the same persisted machineId/sqmId/devDeviceId as the
	// workbench. Fall back to computing them live when not provided (e.g. the
	// remote/server agent host, which does not forward them).
	const [machineId, sqmId, devDeviceId] = await Promise.all([
		process.env[AgentHostMachineIdEnvKey] || getMachineId(error => logService.error(error)),
		process.env[AgentHostSqmIdEnvKey] || getSqmMachineId(error => logService.error(error)),
		process.env[AgentHostDevDeviceIdEnvKey] || getDevDeviceId(error => logService.error(error)),
	]);

	const commonProperties = resolveCommonProperties(release(), hostname(), process.arch, productService.commit, productService.version, machineId, sqmId, devDeviceId, internalTelemetry, productService.date);

	const telemetryService = TelemetryService.createWithLevel({
		appenders,
		sendErrorTelemetry: true,
		commonProperties,
		piiPaths: getPiiPathsFromEnvironment(environmentService),
		userContentPaths: getUserContentPathsFromEnvironment(environmentService),
		telemetryLevel: initialTelemetryLevel,
	}, productService);

	const extensionVersion = loggingOnly ? undefined : await resolveCopilotExtensionVersion(environmentService, fileService, logService);
	const internalSender = loggingOnly ? undefined : disposables.add(new AgentHostInternalTelemetrySender({ requestService: options.requestService, commonProperties, extensionVersion }));
	const restricted = loggingOnly ? undefined : new AgentHostRestrictedTelemetrySender(commonProperties, logService, undefined, internalSender, options.fetchFn);

	return disposables.add(new AgentHostTelemetryService(telemetryService, restricted, productService.copilotVersions?.sdk, productService.copilotVersions?.runtime, initialTelemetryLevel, flushCollector));
}

function parseLaunchTelemetryLevel(value: string | undefined): TelemetryLevel {
	return value === undefined
		? TelemetryLevel.USAGE
		: agentHostConfigValueToTelemetryLevel(value) ?? TelemetryLevel.NONE;
}
