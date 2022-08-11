/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import * as extHostProtocol from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';

export interface IExtHostTelemetryLogService {
	readonly _serviceBrand: undefined;

	logToTelemetryOutputChannel(extension: IExtensionDescription, eventName: string, data: Record<string, any>): void;
}

export const IExtHostTelemetryLogService = createDecorator<IExtHostTelemetryLogService>('IExtHostTelemetryLogService');

export class ExtHostTelemetryLogService implements IExtHostTelemetryLogService {

	declare readonly _serviceBrand: undefined;

	private readonly _telemetryShape: extHostProtocol.MainThreadTelemetryShape;

	constructor(
		@IExtHostRpcService rpc: IExtHostRpcService,
	) {
		this._telemetryShape = rpc.getProxy(extHostProtocol.MainContext.MainThreadTelemetry);
	}

	public logToTelemetryOutputChannel(extension: IExtensionDescription, eventName: string, data: Record<string, any>): void {
		this._telemetryShape.$logTelemetryToOutputChannel(`${extension.identifier.value}/${eventName}`, data);
	}
}
