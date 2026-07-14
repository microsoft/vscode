/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hostname, release } from 'os';
import { Disposable, isDisposable, toDisposable, type DisposableStore } from '../../../base/common/lifecycle.js';
import { joinPath } from '../../../base/common/resources.js';
import { getDevDeviceId, getMachineId, getSqmMachineId } from '../../../base/node/id.js';
import { ConfigurationService } from '../../configuration/common/configurationService.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService, ILoggerService } from '../../log/common/log.js';
import { NullPolicyService } from '../../policy/common/policy.js';
import { IProductService } from '../../product/common/productService.js';
import { IRequestService } from '../../request/common/request.js';
import { OneDataSystemAppender } from '../../telemetry/node/1dsAppender.js';
import { resolveCommonProperties } from '../../telemetry/common/commonProperties.js';
import { ClassifiedEvent, IGDPRProperty, OmitMetadata, StrictPropertyCheck } from '../../telemetry/common/gdprTypings.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../telemetry/common/telemetry.js';
import { TelemetryLogAppender } from '../../telemetry/common/telemetryLogAppender.js';
import { TelemetryService } from '../../telemetry/common/telemetryService.js';
import { getPiiPathsFromEnvironment, isInternalTelemetry, isLoggingOnly, NullTelemetryService, supportsTelemetry, type ITelemetryAppender } from '../../telemetry/common/telemetryUtils.js';
import { AgentHostTelemetryLevelConfigKey, agentHostConfigValueToTelemetryLevel } from '../common/agentHostSchema.js';
import { AgentHostDevDeviceIdEnvKey, AgentHostMachineIdEnvKey, AgentHostSqmIdEnvKey } from '../common/agentHostTelemetryEnv.js';
import { AgentHostRestrictedTelemetrySender, IAgentHostRestrictedTelemetry, TelemetryMeasurements, TelemetryProps } from './agentHostRestrictedTelemetry.js';

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
}

export interface IAgentHostTelemetryService extends ITelemetryService, IAgentHostRestrictedTelemetry {
	updateTelemetryLevel(telemetryLevel: TelemetryLevel): void;
}

export class AgentHostTelemetryService extends Disposable implements IAgentHostTelemetryService {
	declare readonly _serviceBrand: undefined;

	private _telemetryLevel = TelemetryLevel.USAGE;

	/**
	 * Whether the current Copilot token opts into enhanced/restricted telemetry (`rt=1`). Defaults
	 * to `false` so nothing restricted is sent until an authenticated token confirms the opt-in,
	 * keeping public users off the enhanced pipeline the way the Copilot extension does.
	 */
	private _restrictedTelemetryEnabled = false;

	constructor(
		private readonly _delegate: ITelemetryService,
		private readonly _restricted?: IAgentHostRestrictedTelemetry,
	) {
		super();
		if (isDisposable(_delegate)) {
			this._register(_delegate);
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

	sendInternalMSFTTelemetryEvent(eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		if (this.telemetryLevel < TelemetryLevel.USAGE) {
			return;
		}
		this._restricted?.sendInternalMSFTTelemetryEvent(eventName, properties, measurements);
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

	setExperimentProperty(name: string, value: string): void {
		this._delegate.setExperimentProperty(name, value);
	}

	setCommonProperty(name: string, value: string | boolean): void {
		this._delegate.setCommonProperty(name, value);
	}

	updateTelemetryLevel(telemetryLevel: TelemetryLevel): void {
		this._telemetryLevel = Math.min(this._telemetryLevel, telemetryLevel);
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

export async function createAgentHostTelemetryService(options: IAgentHostTelemetryServiceOptions): Promise<IAgentHostTelemetryService> {
	const { environmentService, productService, fileService, loggerService, logService, disposables } = options;
	if (options.disableTelemetry || !loggerService || !supportsTelemetry(productService, environmentService)) {
		return disposables.add(new AgentHostTelemetryService(NullTelemetryService));
	}

	const configurationService = disposables.add(new ConfigurationService(joinPath(environmentService.appSettingsHome, 'settings.json'), fileService, new NullPolicyService(), logService));
	await configurationService.initialize();

	const appenders: ITelemetryAppender[] = [
		disposables.add(new TelemetryLogAppender('', false, loggerService, environmentService, productService)),
	];
	const internalTelemetry = isInternalTelemetry(productService, configurationService);
	if (!isLoggingOnly(productService, environmentService) && productService.aiConfig?.ariaKey) {
		const collectorAppender = new OneDataSystemAppender(options.requestService, internalTelemetry, 'monacoworkbench', null, productService.aiConfig.ariaKey);
		disposables.add(toDisposable(() => { void collectorAppender.flush(); }));
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

	const telemetryService = new TelemetryService({
		appenders,
		sendErrorTelemetry: true,
		commonProperties,
		piiPaths: getPiiPathsFromEnvironment(environmentService),
	}, configurationService, productService);

	const restricted = new AgentHostRestrictedTelemetrySender(commonProperties, logService, undefined, undefined, options.fetchFn);

	return disposables.add(new AgentHostTelemetryService(telemetryService, restricted));
}
