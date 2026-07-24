/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient } from '@github/copilot-sdk';
import { IProductService } from '../../../product/common/productService.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';

/**
 * The copilot SDK prefixes each key with `sdk_correlation_` and stamps
 * the result onto every sdk event.
 */
const enum CommonTelemetryPropertyKey {
	VSCodeVersion = 'vscode_version',
	VSCodeCommit = 'vscode_commit',
	VSCodeQuality = 'vscode_quality',
	IsInternal = 'is_internal',
	MachineId = 'machine_id',
	SqmId = 'sqm_id',
	DevDeviceId = 'dev_device_id',
	SessionId = 'session_id',
}

type SendRequest = (...args: unknown[]) => Promise<unknown>;

interface IClientWithConnection {
	connection: { sendRequest: SendRequest } | null;
}

/**
 * Forwards a curated set of VS Code common telemetry properties into the Copilot SDK
 * session RPC layer so they end up on every session telemetry event in GitHub's events.
 *
 */
export class CopilotCommonTelemetryProperties {

	constructor(
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IProductService private readonly _productService: IProductService,
	) { }

	/**
	 * Wraps `client.connection.sendRequest` so outgoing `session.create` /
	 * `session.resume` requests carry our common telemetry properties. Must be
	 * called after `client.start()` — the SDK only constructs
	 * `client.connection` once the transport is connected.
	 *
	 * The wrapping is intentionally not disposable: the SDK client is fully
	 * stopped and replaced on token / config changes, so the wrapped
	 * `sendRequest` is reclaimed alongside the rest of the client. Storing a
	 * disposable here would keep the client connection reachable across
	 * restarts.
	 */
	wireCopilotCommonTelemetryProperties(client: CopilotClient): void {
		const conn = (client as unknown as IClientWithConnection).connection;
		if (!conn || typeof conn.sendRequest !== 'function') {
			return;
		}
		const original = conn.sendRequest;
		conn.sendRequest = (...args: unknown[]) => {
			const method = args[0];
			const params = args[1];
			if ((method === 'session.create' || method === 'session.resume')
				&& params && typeof params === 'object' && !Array.isArray(params)
			) {
				const props = this._buildCommonTelemetryProperties();
				if (Object.keys(props).length > 0) {
					const merged = { ...(params as Record<string, unknown>), internalCorrelationIds: props };
					return original.call(conn, method, merged, ...args.slice(2));
				}
			}
			return original.call(conn, ...args);
		};
	}

	private _buildCommonTelemetryProperties(): Record<string, string> {
		const props: Record<string, string> = {};
		const setIfDefined = (key: CommonTelemetryPropertyKey, value: string | undefined): void => {
			if (value) {
				props[key] = value;
			}
		};

		setIfDefined(CommonTelemetryPropertyKey.VSCodeVersion, this._productService.version);
		setIfDefined(CommonTelemetryPropertyKey.VSCodeCommit, this._productService.commit);
		setIfDefined(CommonTelemetryPropertyKey.VSCodeQuality, this._productService.quality);
		if (this._telemetryService.msftInternal !== undefined) {
			props[CommonTelemetryPropertyKey.IsInternal] = this._telemetryService.msftInternal ? 'true' : 'false';
		}
		setIfDefined(CommonTelemetryPropertyKey.MachineId, this._telemetryService.machineId);
		setIfDefined(CommonTelemetryPropertyKey.SqmId, this._telemetryService.sqmId);
		setIfDefined(CommonTelemetryPropertyKey.DevDeviceId, this._telemetryService.devDeviceId);
		setIfDefined(CommonTelemetryPropertyKey.SessionId, this._telemetryService.sessionId);

		return props;
	}
}
