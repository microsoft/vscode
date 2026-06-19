/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient } from '@github/copilot-sdk';
import { IProductService } from '../../../product/common/productService.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';

/**
 * Property keys we forward to the Copilot SDK runtime as common telemetry
 * properties. The runtime prefixes each key with `sdk_correlation_` and stamps
 * the result onto every session telemetry event in GitHub's first-party
 * telemetry cluster.
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

/**
 * Runtime validation mirrors `buildSessionCorrelationProperties` in
 * github/copilot-agent-runtime: lower-snake-case key starting with `[a-z0-9]`, max 64 chars,
 * non-empty string value, max 512 chars, up to 16 entries.
 */
const KEY_REGEX = /^[a-z0-9][a-z0-9_]{0,63}$/;
const MAX_VALUE_LENGTH = 512;
const MAX_KEYS = 16;

type SendRequest = (...args: unknown[]) => Promise<unknown>;

interface IClientWithConnection {
	connection: { sendRequest: SendRequest } | null;
}

/**
 * Forwards a curated set of VS Code common telemetry properties into the Copilot SDK
 * session RPC layer so they end up on every session telemetry event in GitHub's
 * first-party telemetry cluster.
 *
 * The runtime field — `internalCorrelationIds` on `SessionCreateRequest` /
 * `SessionResumeRequest` — was introduced in
 * github/copilot-agent-runtime#8490. It is intentionally `@internal`: not exposed
 * on the public `@github/copilot-sdk` `SessionConfig` / `ResumeSessionConfig`,
 * and the SDK's hand-built `session.create` / `session.resume` payloads do not
 * forward unknown fields stashed on `SessionConfig`. So we inject the field at
 * the JSON-RPC layer by wrapping `client.connection.sendRequest`.
 *
 * Note: values land in unrestricted `properties` on GitHub's cluster, so they
 * must not contain PII. Hashed identifiers (machineId / sqmId / devDeviceId) and
 * non-identifying VS Code metadata are fine; raw paths, user names, tokens are not.
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

	/**
	 * Compose the common telemetry properties we want to attach to every
	 * Copilot SDK session telemetry event. Drops undefined / empty / over-length
	 * values silently so the runtime never sees an invalid entry.
	 */
	private _buildCommonTelemetryProperties(): Record<string, string> {
		const props: Record<string, string> = {};
		const add = (key: string, value: string | undefined): void => {
			if (Object.keys(props).length >= MAX_KEYS) {
				return;
			}
			if (!value || !KEY_REGEX.test(key) || value.length > MAX_VALUE_LENGTH) {
				return;
			}
			props[key] = value;
		};

		add(CommonTelemetryPropertyKey.VSCodeVersion, this._productService.version);
		add(CommonTelemetryPropertyKey.VSCodeCommit, this._productService.commit);
		add(CommonTelemetryPropertyKey.VSCodeQuality, this._productService.quality);
		if (this._telemetryService.msftInternal !== undefined) {
			add(CommonTelemetryPropertyKey.IsInternal, this._telemetryService.msftInternal ? 'true' : 'false');
		}
		add(CommonTelemetryPropertyKey.MachineId, this._telemetryService.machineId);
		add(CommonTelemetryPropertyKey.SqmId, this._telemetryService.sqmId);
		add(CommonTelemetryPropertyKey.DevDeviceId, this._telemetryService.devDeviceId);
		add(CommonTelemetryPropertyKey.SessionId, this._telemetryService.sessionId);

		return props;
	}
}
