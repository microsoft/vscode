/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import type { IRequestService } from '../../request/common/request.js';
import type { ICommonProperties } from '../../telemetry/common/telemetry.js';
import { OneDataSystemAppender } from '../../telemetry/node/1dsAppender.js';
import type { IAgentHostInternalTelemetryContext, IAgentHostInternalTelemetrySink, TelemetryMeasurements, TelemetryProps } from './agentHostRestrictedTelemetry.js';

// Public instrumentation key shipped as internalLargeStorageAriaKey in extensions/copilot/package.json.
const INTERNAL_LARGE_STORAGE_ARIA_KEY = 'ec712b3202c5462fb6877acae7f1f9d7-c19ad55e-3e3c-4f99-984b-827f6d95bd9e-6917';
const INTERNAL_EVENT_PREFIX = 'GitHub.copilot-chat';
const INTERNAL_EXTENSION_ID = 'GitHub.copilot-chat';

interface IInternalTelemetryAppender {
	log(eventName: string, data?: object): void;
	flush(): Promise<void>;
}

interface IAgentHostInternalTelemetrySenderOptions {
	readonly requestService?: IRequestService;
	readonly commonProperties?: ICommonProperties;
	readonly extensionVersion?: string;
	readonly createAppender?: (requestService: IRequestService | undefined, commonProperties: ICommonProperties | undefined, eventPrefix: string) => IInternalTelemetryAppender;
}

function getInternalCommonProperties(commonProperties: ICommonProperties | undefined, extensionVersion: string | undefined): ICommonProperties | undefined {
	if (!commonProperties) {
		return undefined;
	}
	const result = Object.create(null) as ICommonProperties;
	Object.defineProperties(result, Object.getOwnPropertyDescriptors(commonProperties));
	result['common.extname'] = INTERNAL_EXTENSION_ID;
	result['common.extversion'] = extensionVersion;
	result['common.vscodemachineid'] = commonProperties['common.machineId'];
	result['common.vscodesessionid'] = commonProperties['sessionID'];
	result['common.vscodecommithash'] = commonProperties['commitHash'];
	result['common.vscodeversion'] = commonProperties['version'];
	return result;
}

class InternalTelemetryAppender extends Disposable {

	constructor(readonly appender: IInternalTelemetryAppender) {
		super();
		this._register(toDisposable(() => { void appender.flush(); }));
	}
}

export class AgentHostInternalTelemetrySender extends Disposable implements IAgentHostInternalTelemetrySink {

	private readonly _appender = this._register(new MutableDisposable<InternalTelemetryAppender>());
	private _context: IAgentHostInternalTelemetryContext | undefined;

	constructor(private readonly _options: IAgentHostInternalTelemetrySenderOptions = {}) {
		super();
	}

	setContext(context: IAgentHostInternalTelemetryContext | undefined): void {
		this._context = context?.isInternal ? context : undefined;
		if (!this._context) {
			this._appender.clear();
			return;
		}
		const createAppender = this._options.createAppender ?? ((requestService, commonProperties) => new OneDataSystemAppender(requestService, true, INTERNAL_EVENT_PREFIX, commonProperties ?? null, INTERNAL_LARGE_STORAGE_ARIA_KEY));
		this._appender.value ??= new InternalTelemetryAppender(createAppender(this._options.requestService, getInternalCommonProperties(this._options.commonProperties, this._options.extensionVersion), INTERNAL_EVENT_PREFIX));
	}

	send(eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		if (!this._context) {
			return;
		}
		this.sendForContext(this._context, eventName, properties, measurements);
	}

	sendForContext(context: IAgentHostInternalTelemetryContext, eventName: string, properties?: TelemetryProps, measurements?: TelemetryMeasurements): void {
		if (!context.isInternal) {
			return;
		}
		const createAppender = this._options.createAppender ?? ((requestService, commonProperties) => new OneDataSystemAppender(requestService, true, INTERNAL_EVENT_PREFIX, commonProperties ?? null, INTERNAL_LARGE_STORAGE_ARIA_KEY));
		this._appender.value ??= new InternalTelemetryAppender(createAppender(this._options.requestService, getInternalCommonProperties(this._options.commonProperties, this._options.extensionVersion), INTERNAL_EVENT_PREFIX));
		this._appender.value.appender.log(eventName, {
			...properties,
			...measurements,
			'common.tid': context.trackingId,
			'common.userName': context.userName ?? 'undefined',
			'common.isVscodeTeamMember': context.isVscodeTeamMember ? 1 : 0,
		});
	}
}
