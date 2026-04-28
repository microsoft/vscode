/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { RootConfigState } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { IAgentHostSessionsProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import {
	AbstractAgentHostConfigFileSystemProvider,
	AbstractAgentHostConfigSchemaRegistrar,
	AgentHostConfigPropertyFilter,
	buildAgentHostConfigJsonSchema,
	IAgentHostConfigLike,
	IAgentHostSettingsContext,
	IAgentHostSettingsLocale,
	serializeAgentHostConfigDocument,
} from './agentHostSettingsShared.js';

/** Scheme for the synthetic agent-host settings files. */
export const AGENT_HOST_SETTINGS_SCHEME = 'agent-host-settings';

/**
 * Build the URI used to open the settings file for an agent host provider.
 *
 * URI shape: `agent-host-settings://{providerId}/settings.jsonc`
 */
export function agentHostSettingsUri(providerId: string): URI {
	return URI.from({
		scheme: AGENT_HOST_SETTINGS_SCHEME,
		authority: providerId,
		path: `/settings.jsonc`,
	});
}

function parseHostSettingsUri(uri: URI): IAgentHostSettingsContext | undefined {
	if (uri.scheme !== AGENT_HOST_SETTINGS_SCHEME) {
		return undefined;
	}
	const providerId = uri.authority;
	if (!providerId) {
		return undefined;
	}
	return { providerId };
}

/** Root (agent host) config exposes no per-property mutability flags — all props are editable. */
const hostSettingsPropertyFilter: AgentHostConfigPropertyFilter = () => true;

const hostSettingsLocale: IAgentHostSettingsLocale = {
	get header() { return localize('agentHostSettings.header', "Agent host settings."); },
	get saveHint() { return localize('agentHostSettings.saveHint', "Edit values below and save to apply. Unknown properties are ignored."); },
	get parseError() { return localize('agentHostSettings.parseError', "Failed to parse agent host settings as JSON."); },
	get notObject() { return localize('agentHostSettings.notObject', "Agent host settings must be a JSON object."); },
};

/**
 * Serialize the root config values for an agent host provider into a
 * commented, pretty-printed JSON document.
 */
export function serializeHostSettings(provider: IAgentHostSessionsProvider): string {
	return serializeAgentHostConfigDocument(provider.getRootConfig(), hostSettingsPropertyFilter, hostSettingsLocale);
}

/**
 * Build a JSON schema describing the root config of an agent host provider.
 */
export function buildHostSettingsJsonSchema(config: RootConfigState): IJSONSchema {
	return buildAgentHostConfigJsonSchema(config, hostSettingsPropertyFilter);
}

/**
 * Filesystem provider serving synthetic JSONC documents representing the
 * root (agent host) configuration values of agent-host providers.
 */
export class AgentHostSettingsFileSystemProvider extends AbstractAgentHostConfigFileSystemProvider<IAgentHostSettingsContext> {

	protected readonly _schemeLabel = AGENT_HOST_SETTINGS_SCHEME;
	protected readonly _traceTag = 'AgentHostSettings';
	protected readonly _locale = hostSettingsLocale;

	constructor(
		private readonly _schemaRegistrar: AgentHostSettingsSchemaRegistrar,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@ILogService logService: ILogService,
	) {
		super(sessionsProvidersService, logService);
	}

	protected _parseUri(resource: URI): IAgentHostSettingsContext | undefined {
		return parseHostSettingsUri(resource);
	}

	protected _serialize(provider: IAgentHostSessionsProvider): string {
		return serializeHostSettings(provider);
	}

	protected _watchChanges(provider: IAgentHostSessionsProvider, _ctx: IAgentHostSettingsContext, fire: () => void): IDisposable {
		return provider.onDidChangeRootConfig(() => fire());
	}

	protected _ensureSchemaRegistered(provider: IAgentHostSessionsProvider): void {
		this._schemaRegistrar.ensureRegistered(provider, provider);
	}

	protected _hasConfig(provider: IAgentHostSessionsProvider): boolean {
		return provider.getRootConfig() !== undefined;
	}

	protected _replaceConfig(provider: IAgentHostSessionsProvider, _ctx: IAgentHostSettingsContext, values: Record<string, unknown>): Promise<void> {
		return provider.replaceRootConfig(values);
	}

	protected _describeForTrace(ctx: IAgentHostSettingsContext): string {
		return `provider ${ctx.providerId}`;
	}
}

/**
 * Keeps per-provider JSON schemas registered so editors of the synthetic
 * `agent-host-settings://…` files get completions, hover, and validation.
 */
export class AgentHostSettingsSchemaRegistrar extends AbstractAgentHostConfigSchemaRegistrar<IAgentHostSessionsProvider> {

	protected _propertyFilter(): AgentHostConfigPropertyFilter {
		return hostSettingsPropertyFilter;
	}

	protected _settingsUri(provider: IAgentHostSessionsProvider): string {
		return agentHostSettingsUri(provider.id).toString();
	}

	protected _schemaId(provider: IAgentHostSessionsProvider): string {
		return `vscode://schemas/agent-host-settings/${provider.id}.jsonc`;
	}

	protected _getConfig(_provider: IAgentHostSessionsProvider, target: IAgentHostSessionsProvider): IAgentHostConfigLike | undefined {
		return target.getRootConfig();
	}

	protected _targetsForProvider(provider: IAgentHostSessionsProvider): readonly IAgentHostSessionsProvider[] {
		return [provider];
	}

	protected _observeProvider(
		provider: IAgentHostSessionsProvider,
		onChanged: (target: IAgentHostSessionsProvider) => void,
		_onRemoved: (target: IAgentHostSessionsProvider) => void,
	): IDisposable {
		return provider.onDidChangeRootConfig(() => onChanged(provider));
	}
}
