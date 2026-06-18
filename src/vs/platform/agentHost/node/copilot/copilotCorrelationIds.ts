/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient } from '@github/copilot-sdk';
import { Disposable, toDisposable, type IDisposable } from '../../../../base/common/lifecycle.js';
import { IProductService } from '../../../product/common/productService.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';

/**
 * Property keys we forward to the Copilot SDK runtime as session correlation IDs.
 * The runtime prefixes each key with `sdk_correlation_` and stamps the result onto
 * every session telemetry event in GitHub's first-party telemetry cluster.
 */
export const enum CopilotCorrelationIdKey {
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

/**
 * Compose the correlation IDs we want to attach to every Copilot SDK session telemetry
 * event. Drops undefined values silently so the runtime never sees an invalid entry.
 *
 * Note: these end up in unrestricted telemetry `properties` on GitHub's cluster, so
 * values must not contain PII. Hashed identifiers (machineId / sqmId / devDeviceId) and
 * non-identifying VS Code metadata are fine; raw paths, user names, tokens are not.
 */
export function buildCopilotCorrelationIds(
	telemetryService: ITelemetryService,
	productService: IProductService,
): Record<string, string> {
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

	add(CopilotCorrelationIdKey.VSCodeVersion, productService.version);
	add(CopilotCorrelationIdKey.VSCodeCommit, productService.commit);
	add(CopilotCorrelationIdKey.VSCodeQuality, productService.quality);
	if (telemetryService.msftInternal !== undefined) {
		add(CopilotCorrelationIdKey.IsInternal, telemetryService.msftInternal ? 'true' : 'false');
	}
	add(CopilotCorrelationIdKey.MachineId, telemetryService.machineId);
	add(CopilotCorrelationIdKey.SqmId, telemetryService.sqmId);
	add(CopilotCorrelationIdKey.DevDeviceId, telemetryService.devDeviceId);
	add(CopilotCorrelationIdKey.SessionId, telemetryService.sessionId);

	return props;
}

type SendRequest = (...args: unknown[]) => Promise<unknown>;

interface IClientWithConnection {
	connection: { sendRequest: SendRequest } | null;
}

/**
 * Inject `internalCorrelationIds` into the params of outgoing `session.create` and
 * `session.resume` JSON-RPC requests by wrapping the SDK client's underlying
 * `MessageConnection.sendRequest`.
 *
 * `internalCorrelationIds` is an `@internal` protocol-level field on
 * `SessionCreateRequest` / `SessionResumeRequest` introduced in
 * github/copilot-agent-runtime#8490. It is intentionally NOT exposed on the public
 * `SessionConfig` / `ResumeSessionConfig` SDK surface (a guard test in the runtime
 * repo keeps it out of the generated public schema), so the SDK's hand-built
 * `sendRequest` payload won't forward an unknown field stashed on `SessionConfig`.
 *
 * The runtime reads the field off the RPC params, validates each entry, and prefixes
 * every key with `sdk_correlation_` before stamping it onto session telemetry events.
 *
 * Must be called after `client.start()` — the SDK only constructs `client.connection`
 * once the transport is connected. Returns an `IDisposable` that restores the
 * original `sendRequest` for tests; production callers can ignore it because the
 * wrapped client is discarded on restart.
 */
export function wireCopilotCorrelationIds(
	client: CopilotClient,
	provider: () => Record<string, string>,
): IDisposable {
	const conn = (client as unknown as IClientWithConnection).connection;
	if (!conn || typeof conn.sendRequest !== 'function') {
		return Disposable.None;
	}
	const original = conn.sendRequest;
	const wrapped: SendRequest = (...args: unknown[]) => {
		const method = args[0];
		const params = args[1];
		if ((method === 'session.create' || method === 'session.resume')
			&& params && typeof params === 'object' && !Array.isArray(params)
		) {
			const ids = provider();
			if (ids && Object.keys(ids).length > 0) {
				const merged = { ...(params as Record<string, unknown>), internalCorrelationIds: ids };
				return original.call(conn, method, merged, ...args.slice(2));
			}
		}
		return original.call(conn, ...args);
	};
	conn.sendRequest = wrapped;
	return toDisposable(() => {
		if (conn.sendRequest === wrapped) {
			conn.sendRequest = original;
		}
	});
}
