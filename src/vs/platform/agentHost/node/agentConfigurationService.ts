/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import type { ISchema, SchemaDefinition, SchemaValue } from '../common/agentHostSchema.js';
import { ProtocolError } from '../common/state/sessionProtocol.js';
import { ActionType } from '../common/state/sessionActions.js';
import { parseSubagentSessionUri, type URI as ProtocolURI } from '../common/state/sessionState.js';
import { AgentHostStateManager } from './agentHostStateManager.js';

export const IAgentConfigurationService = createDecorator<IAgentConfigurationService>('agentConfigurationService');

/**
 * Cohesive read/write surface for agent-host configuration.
 *
 * All platform-layer consumers (tool auto-approval, side effects, future
 * host-config editors) should read and mutate config values through this
 * service rather than reaching into raw session state. The service owns
 * the `session → parent session → host` inheritance chain so that
 * host-level defaults, subagent inheritance, and per-session overrides
 * compose the same way everywhere.
 *
 * Reads go through a caller-supplied {@link ISchema}: each raw value is
 * validated against the property's schema before being returned, so a
 * malformed value in one layer transparently falls back to the next.
 */
export interface IAgentConfigurationService {
	readonly _serviceBrand: undefined;

	/**
	 * Returns the effective value of `key` for `session`, walking the
	 * `session → parent session → host` chain and returning the first
	 * layer that provides a value which validates against
	 * `schema.definition[key]`. Layers that provide a malformed value
	 * are logged and skipped. Returns `undefined` when no layer provides
	 * a valid value.
	 */
	getEffectiveValue<D extends SchemaDefinition, K extends keyof D & string>(
		session: ProtocolURI,
		schema: ISchema<D>,
		key: K,
	): SchemaValue<D[K]> | undefined;

	/**
	 * Returns the effective working directory for a session, falling back
	 * to the parent (subagent) session's working directory when the
	 * session itself does not have one set. The host layer does not carry
	 * a working directory.
	 */
	getEffectiveWorkingDirectory(session: ProtocolURI): string | undefined;

	/**
	 * Merges a partial config patch into a session's values via a
	 * {@link ActionType.SessionConfigChanged} action. Keys not present in
	 * `patch` are left untouched. The patch is applied atomically through
	 * the state manager's reducer.
	 */
	updateSessionConfig(session: ProtocolURI, patch: Record<string, unknown>): void;
}

export class AgentConfigurationService extends Disposable implements IAgentConfigurationService {
	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	getEffectiveValue<D extends SchemaDefinition, K extends keyof D & string>(
		session: ProtocolURI,
		schema: ISchema<D>,
		key: K,
	): SchemaValue<D[K]> | undefined {
		for (const values of this._effectiveChain(session)) {
			const raw = values[key];
			if (raw === undefined) {
				continue;
			}
			try {
				schema.assertValid(key, raw);
				return raw;
			} catch (err) {
				const reason = err instanceof ProtocolError ? err.message : String(err);
				this._logService.warn(`[AgentConfigurationService] Value for '${key}' on ${session} failed schema validation, falling back: ${reason}`);
			}
		}
		return undefined;
	}

	getEffectiveWorkingDirectory(session: ProtocolURI): string | undefined {
		const own = this._stateManager.getSessionState(session)?.summary.workingDirectory;
		if (own !== undefined) {
			return own;
		}
		const parentInfo = parseSubagentSessionUri(session);
		if (parentInfo) {
			return this._stateManager.getSessionState(parentInfo.parentSession)?.summary.workingDirectory;
		}
		return undefined;
	}

	updateSessionConfig(session: ProtocolURI, patch: Record<string, unknown>): void {
		this._stateManager.dispatchServerAction({
			type: ActionType.SessionConfigChanged,
			session,
			config: patch,
		});
	}

	/**
	 * Yields the raw value bags that contribute to the effective config
	 * for `session`, in precedence order: session, parent subagent
	 * session (if any), host.
	 */
	private *_effectiveChain(session: ProtocolURI): Iterable<Record<string, unknown>> {
		const own = this._stateManager.getSessionState(session)?.config?.values;
		if (own) {
			yield own;
		}
		const parentInfo = parseSubagentSessionUri(session);
		if (parentInfo) {
			const parent = this._stateManager.getSessionState(parentInfo.parentSession)?.config?.values;
			if (parent) {
				yield parent;
			}
		}
		const host = this._stateManager.rootState.config?.values;
		if (host) {
			yield host;
		}
	}
}
