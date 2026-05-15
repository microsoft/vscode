/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { dirname } from '../../../base/common/path.js';
import { hasKey } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { AgentHostConfigKey, agentHostCustomizationConfigSchema, defaultAgentHostCustomizationConfigValues } from '../common/agentHostCustomizationConfig.js';
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
	 * Fires whenever a {@link ActionType.RootConfigChanged} action is
	 * processed by the state manager, signalling that callers should
	 * re-read any root config values they depend on.
	 */
	readonly onDidRootConfigChange: Event<void>;

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

	/**
	 * Returns the merged config values currently stored on `session`.
	 *
	 * Reflects the live state managed by the reducer: every
	 * {@link ActionType.SessionConfigChanged} action mutates these values
	 * before this method returns. Callers materializing a provisional session
	 * use this to read the user's latest selections without subscribing to
	 * the action stream themselves.
	 */
	getSessionConfigValues(session: ProtocolURI): Record<string, unknown> | undefined;

	/**
	 * Returns the host-level value for `key`, validating it against
	 * `schema.definition[key]`. Invalid persisted values are logged and treated
	 * as missing.
	 */
	getRootValue<D extends SchemaDefinition, K extends keyof D & string>(
		schema: ISchema<D>,
		key: K,
	): SchemaValue<D[K]> | undefined;

	/**
	 * Merges a partial config patch into the host-level value bag and persists
	 * the updated values for future agent-host lifetimes.
	 */
	updateRootConfig(patch: Record<string, unknown>, replace?: boolean): void;

	/**
	 * Persists the current host-level value bag without mutating it.
	 */
	persistRootConfig(): void;
}

export class AgentConfigurationService extends Disposable implements IAgentConfigurationService {
	declare readonly _serviceBrand: undefined;
	private _rootConfigWrite = Promise.resolve();

	private readonly _onDidRootConfigChange = this._register(new Emitter<void>());
	readonly onDidRootConfigChange: Event<void> = this._onDidRootConfigChange.event;

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		@ILogService private readonly _logService: ILogService,
		private readonly _rootConfigResource?: URI,
	) {
		super();
		// Merge our customization schema/values into the existing root config
		// (which already carries platform properties like permissions) rather
		// than replacing it.
		const existing = this._stateManager.rootState.config;
		const ownSchema = agentHostCustomizationConfigSchema.toProtocol();
		this._stateManager.rootState.config = {
			schema: {
				type: 'object',
				properties: { ...existing?.schema.properties, ...ownSchema.properties },
			},
			values: { ...existing?.values, ...this._loadPersistedRootConfig() },
		};

		this._register(this._stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.RootConfigChanged) {
				this._onDidRootConfigChange.fire();
			}
		}));
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
			return this._stateManager.getSessionState(parentInfo.parentSession.toString())?.summary.workingDirectory;
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

	getSessionConfigValues(session: ProtocolURI): Record<string, unknown> | undefined {
		return this._stateManager.getSessionState(session)?.config?.values;
	}

	getRootValue<D extends SchemaDefinition, K extends keyof D & string>(
		schema: ISchema<D>,
		key: K,
	): SchemaValue<D[K]> | undefined {
		const root = this._stateManager.rootState.config?.values;
		const raw = root?.[key];
		if (raw === undefined) {
			return undefined;
		}
		try {
			schema.assertValid(key, raw);
			return raw;
		} catch (err) {
			const reason = err instanceof ProtocolError ? err.message : String(err);
			this._logService.warn(`[AgentConfigurationService] Host value for '${key}' failed schema validation, ignoring: ${reason}`);
			return undefined;
		}
	}

	updateRootConfig(patch: Record<string, unknown>, replace = false): void {
		this._stateManager.dispatchServerAction({
			type: ActionType.RootConfigChanged,
			config: patch,
			replace,
		});
		this.persistRootConfig();
	}

	persistRootConfig(): void {
		if (!this._rootConfigResource) {
			return;
		}

		const values = this._stateManager.rootState.config?.values ?? { [AgentHostConfigKey.Customizations]: [] };
		const content = JSON.stringify(values, undefined, '\t');
		const resource = this._rootConfigResource;

		this._rootConfigWrite = this._rootConfigWrite
			.catch(err => {
				this._logService.warn('[AgentConfigurationService] Previous host config write failed', err);
			})
			.then(async () => {
				await fs.promises.mkdir(dirname(resource.fsPath), { recursive: true });
				await fs.promises.writeFile(resource.fsPath, `${content}\n`, 'utf8');
			})
			.catch(err => {
				this._logService.error(`[AgentConfigurationService] Failed to persist host config to ${resource.fsPath}`, err);
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
			const parent = this._stateManager.getSessionState(parentInfo.parentSession.toString())?.config?.values;
			if (parent) {
				yield parent;
			}
		}
		const host = this._stateManager.rootState.config?.values;
		if (host) {
			yield host;
		}
	}

	private _loadPersistedRootConfig(): Record<string, unknown> {
		const defaults = defaultAgentHostCustomizationConfigValues;
		if (!this._rootConfigResource) {
			return { ...defaults };
		}

		try {
			const raw = fs.readFileSync(this._rootConfigResource.fsPath, 'utf8');
			const parsed = JSON.parse(raw) as Record<string, unknown>;
			return agentHostCustomizationConfigSchema.validateOrDefault(parsed, defaults);
		} catch (err) {
			const code = err && typeof err === 'object' && hasKey(err, { code: true }) ? String(err.code) : undefined;
			if (code !== 'ENOENT') {
				this._logService.warn(`[AgentConfigurationService] Failed to read host config from ${this._rootConfigResource.fsPath}: ${err instanceof Error ? err.message : String(err)}`);
			}
			return { ...defaults };
		}
	}
}
