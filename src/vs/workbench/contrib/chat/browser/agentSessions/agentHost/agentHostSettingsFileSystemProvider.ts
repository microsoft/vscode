/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../../base/common/event.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../../base/common/objects.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { createFileSystemProviderError, FileSystemProviderErrorCode } from '../../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { RootConfigState, RootState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ROOT_STATE_URI } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import {
	AbstractAgentHostConfigFileSystemProvider,
	AbstractAgentHostConfigSchemaRegistrar,
	AgentHostConfigPropertyFilter,
	IAgentHostConfigLike,
	IAgentHostSettingsLocale,
	serializeAgentHostConfigDocument,
} from './agentHostConfigEditor.js';

/** Scheme for the synthetic ambient agent-host settings file. */
export const AGENT_HOST_SETTINGS_SCHEME = 'agent-host-settings';

/** Fixed authority identifying the single ambient local agent host. */
export const AGENT_HOST_SETTINGS_LOCAL_AUTHORITY = 'local';

/**
 * Build the URI used to open the ambient local agent host's settings file.
 *
 * URI shape: `agent-host-settings://local/settings.jsonc`
 */
export function agentHostSettingsUri(): URI {
	return URI.from({
		scheme: AGENT_HOST_SETTINGS_SCHEME,
		authority: AGENT_HOST_SETTINGS_LOCAL_AUTHORITY,
		path: `/settings.jsonc`,
	});
}

/** Marker context: there is exactly one ambient target, so no fields are needed to identify it. */
interface IAmbientAgentHostSettingsContext {
	readonly kind: 'local';
}

function parseAmbientHostSettingsUri(uri: URI): IAmbientAgentHostSettingsContext | undefined {
	if (uri.scheme !== AGENT_HOST_SETTINGS_SCHEME || uri.authority !== AGENT_HOST_SETTINGS_LOCAL_AUTHORITY || uri.path !== '/settings.jsonc') {
		return undefined;
	}
	return { kind: 'local' };
}

/** Root (agent host) config exposes no per-property mutability flags, so all props are editable. */
const hostSettingsPropertyFilter: AgentHostConfigPropertyFilter = () => true;

const hostSettingsLocale: IAgentHostSettingsLocale = {
	get header() { return localize('agentHostSettings.header', "Agent host settings."); },
	get saveHint() { return localize('agentHostSettings.saveHint', "Edit values below and save to apply. Unknown properties are ignored."); },
	get parseError() { return localize('agentHostSettings.parseError', "Failed to parse agent host settings as JSON."); },
	get notObject() { return localize('agentHostSettings.notObject', "Agent host settings must be a JSON object."); },
};

function readRootConfig(state: RootState | Error | undefined): RootConfigState | undefined {
	if (!state || state instanceof Error) {
		return undefined;
	}
	return state.config;
}

/**
 * Filesystem provider serving a synthetic JSONC document representing the
 * root configuration of the ambient local {@link IAgentHostService}. Unlike
 * the sessions-window's provider-keyed equivalent, there is exactly one
 * target, the ambient agent host, so the provider maintains its own
 * optimistically-updated cache of the root config rather than resolving a
 * per-request target from a registry.
 */
export class AgentHostSettingsFileSystemProvider extends AbstractAgentHostConfigFileSystemProvider<IAmbientAgentHostSettingsContext, IAgentHostService> {

	protected readonly _schemeLabel = AGENT_HOST_SETTINGS_SCHEME;
	protected readonly _traceTag = 'AgentHostSettings';
	protected readonly _locale = hostSettingsLocale;

	private readonly _onDidChangeRootConfig = this._register(new Emitter<void>());

	/** Last-known root config state (schema + values), kept in sync with {@link IAgentHostService.rootState}. */
	private _rootConfig: RootConfigState | undefined;

	constructor(
		private readonly _schemaRegistrar: AgentHostSettingsSchemaRegistrar,
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@ILogService logService: ILogService,
	) {
		super(logService);
		this._syncRootConfig(this._agentHostService.rootState.value);
		this._register(this._agentHostService.rootState.onDidChange(state => this._syncRootConfig(state)));
	}

	private _syncRootConfig(state: RootState | Error | undefined): void {
		const next = readRootConfig(state);
		const prev = this._rootConfig;
		if (prev === next) {
			return;
		}
		if (!next) {
			this._rootConfig = undefined;
			this._onDidChangeRootConfig.fire();
			return;
		}
		if (prev?.schema === next.schema && equals(prev.values, next.values)) {
			return;
		}
		this._rootConfig = next;
		this._onDidChangeRootConfig.fire();
	}

	protected _parseUri(resource: URI): IAmbientAgentHostSettingsContext | undefined {
		return parseAmbientHostSettingsUri(resource);
	}

	protected _resolveTarget(): IAgentHostService {
		return this._agentHostService;
	}

	protected override _missingTargetError(): Error {
		return createFileSystemProviderError('Agent host is not available', FileSystemProviderErrorCode.FileNotFound);
	}

	protected _serialize(): string {
		return serializeAgentHostConfigDocument(this._rootConfig, hostSettingsPropertyFilter, hostSettingsLocale);
	}

	protected _watchChanges(_target: IAgentHostService, _ctx: IAmbientAgentHostSettingsContext, fire: () => void): IDisposable {
		return this._onDidChangeRootConfig.event(() => fire());
	}

	protected _ensureSchemaRegistered(target: IAgentHostService): void {
		this._schemaRegistrar.ensureRegistered(target);
	}

	protected _hasConfig(): boolean {
		return this._rootConfig !== undefined;
	}

	protected async _replaceConfig(_target: IAgentHostService, _ctx: IAmbientAgentHostSettingsContext, values: Record<string, unknown>): Promise<void> {
		const current = this._rootConfig;
		if (!current) {
			return;
		}

		// Filter to known properties so we don't dispatch values for keys the
		// host didn't publish a schema for.
		const nextValues: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(values)) {
			if (current.schema.properties[key]) {
				nextValues[key] = value;
			}
		}

		if (equals(nextValues, current.values)) {
			return;
		}

		this._rootConfig = { ...current, values: nextValues };
		this._onDidChangeRootConfig.fire();

		this._agentHostService.dispatch(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: nextValues,
			replace: true,
		});
	}

	protected _describeForTrace(): string {
		return 'local agent host';
	}
}

/**
 * Keeps the ambient local agent host's JSON schema registered so editors of
 * the synthetic `agent-host-settings://local/settings.jsonc` document get
 * completions, hover, and validation.
 */
export class AgentHostSettingsSchemaRegistrar extends AbstractAgentHostConfigSchemaRegistrar<IAgentHostService> {

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
	) {
		super();
		this._register(this._agentHostService.rootState.onDidChange(() => {
			// Only refresh if we already have a registration; otherwise the
			// next `readFile` will pick up the latest schema on demand.
			if (!this._isRegistered(this._agentHostService)) {
				return;
			}
			this._refreshSchema(this._agentHostService);
		}));
	}

	protected _propertyFilter(): AgentHostConfigPropertyFilter {
		return hostSettingsPropertyFilter;
	}

	protected _settingsUri(): string {
		return agentHostSettingsUri().toString();
	}

	protected _schemaId(): string {
		return `vscode://schemas/agent-host-settings/${AGENT_HOST_SETTINGS_LOCAL_AUTHORITY}.jsonc`;
	}

	protected _getConfig(target: IAgentHostService): IAgentHostConfigLike | undefined {
		return readRootConfig(target.rootState.value);
	}
}
