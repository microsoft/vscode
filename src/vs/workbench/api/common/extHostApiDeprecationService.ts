/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../platform/log/common/log.js';
import * as extHostProtocol from './extHost.protocol.js';
import { IExtHostRpcService } from './extHostRpcService.js';

export interface IExtHostApiDeprecationService {
	readonly _serviceBrand: undefined;

	report(apiId: string, extension: IExtensionDescription, migrationSuggestion: string, options?: { usageId?: string }): void;
}

export const IExtHostApiDeprecationService = createDecorator<IExtHostApiDeprecationService>('IExtHostApiDeprecationService');

export class ExtHostApiDeprecationService implements IExtHostApiDeprecationService {

	declare readonly _serviceBrand: undefined;

	private readonly _reportedUsages = new Set<string>();
	private readonly _telemetryShape: extHostProtocol.MainThreadTelemetryShape;

	constructor(
		@IExtHostRpcService rpc: IExtHostRpcService,
		@ILogService private readonly _extHostLogService: ILogService,
	) {
		this._telemetryShape = rpc.getProxy(extHostProtocol.MainContext.MainThreadTelemetry);
	}

	public report(apiId: string, extension: IExtensionDescription, migrationSuggestion: string, options?: { usageId?: string }): void {
		const key = this.getUsageKey(apiId, extension, options?.usageId);
		if (this._reportedUsages.has(key)) {
			return;
		}
		this._reportedUsages.add(key);

		if (extension.isUnderDevelopment) {
			this._extHostLogService.warn(`[Deprecation Warning] '${apiId}' is deprecated. ${migrationSuggestion}`);
		}

		type DeprecationTelemetry = {
			extensionId: string;
			apiId: string;
			usageId: string;
		};
		type DeprecationTelemetryMeta = {
			extensionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The id of the extension that is using the deprecated API' };
			apiId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The id of the deprecated API' };
			usageId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Id identifying the specific usage of the deprecated API' };
			owner: 'mjbvz';
			comment: 'Helps us gain insights on extensions using deprecated API so we can assist in migration to new API';
		};
		this._telemetryShape.$publicLog2<DeprecationTelemetry, DeprecationTelemetryMeta>('extHostDeprecatedApiUsage', {
			extensionId: extension.identifier.value,
			apiId: apiId,
			usageId: options?.usageId ?? '',
		});
	}

	private getUsageKey(apiId: string, extension: IExtensionDescription, usageId?: string): string {
		const rootKey = `${apiId}-${extension.identifier.value}`;
		return usageId ? `${rootKey}-${usageId}` : rootKey;
	}
}


export const NullApiDeprecationService = Object.freeze(new class implements IExtHostApiDeprecationService {
	declare readonly _serviceBrand: undefined;

	public report(_apiId: string, _extension: IExtensionDescription, _warningMessage: string): void {
		// noop
	}
}());
