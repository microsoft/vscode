/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ResolveSessionConfigResult } from '../../../../platform/agentHost/common/state/protocol/commands.js';
import { SessionConfigPropertySchema } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { IAgentHostSessionsProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISession, toSessionId } from '../../../services/sessions/common/session.js';
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

/** Scheme for the synthetic agent-host session settings files. */
export const AGENT_SESSION_SETTINGS_SCHEME = 'agent-session-settings';

/**
 * Build the URI used to open the settings file for an agent-host session.
 *
 * URI shape: `agent-session-settings://{providerId}/{resourceScheme}{resourcePath}.jsonc`
 *
 * - `authority` = {@link ISession.providerId} (e.g. `local-agent-host`, `agenthost-<auth>`)
 * - path encodes the session's resource scheme and path so the URI can be
 *   parsed back into an {@link ISession.sessionId} via {@link toSessionId}
 *   without having to look the session up on the provider.
 */
export function agentSessionSettingsUri(session: ISession): URI {
	// `resource.path` already starts with `/`, so splice it between the scheme and the `.jsonc` suffix.
	return URI.from({
		scheme: AGENT_SESSION_SETTINGS_SCHEME,
		authority: session.providerId,
		path: `/${session.resource.scheme}${session.resource.path}.jsonc`,
	});
}

interface ISessionSettingsContext extends IAgentHostSettingsContext {
	/** Reconstructed {@link ISession.sessionId}. */
	readonly sessionId: string;
}

function parseSessionSettingsUri(uri: URI): ISessionSettingsContext | undefined {
	if (uri.scheme !== AGENT_SESSION_SETTINGS_SCHEME) {
		return undefined;
	}
	const providerId = uri.authority;
	if (!providerId) {
		return undefined;
	}
	// Path: /{resourceScheme}/{rawId}.jsonc
	const path = uri.path.startsWith('/') ? uri.path.substring(1) : uri.path;
	const firstSlash = path.indexOf('/');
	if (firstSlash <= 0) {
		return undefined;
	}
	const resourceScheme = path.substring(0, firstSlash);
	let rest = path.substring(firstSlash); // includes leading '/'
	const lastDot = rest.lastIndexOf('.');
	if (lastDot > 0) {
		rest = rest.substring(0, lastDot);
	}
	if (!resourceScheme || rest === '/') {
		return undefined;
	}
	const resource = URI.from({ scheme: resourceScheme, path: rest });
	return { providerId, sessionId: toSessionId(providerId, resource) };
}

/**
 * Property filter: only session-mutable, non-read-only properties are
 * editable. Read-only / non-mutable properties (e.g. `isolation`, `branch`)
 * are preserved in the underlying config and round-tripped on write — they
 * just aren't surfaced for editing.
 */
const sessionSettingsPropertyFilter: AgentHostConfigPropertyFilter = (_key, schema) => {
	const s = schema as SessionConfigPropertySchema;
	return s.sessionMutable === true && s.readOnly !== true;
};

const sessionSettingsLocale: IAgentHostSettingsLocale = {
	get header() { return localize('agentSessionSettings.header', "Session settings for this agent host session."); },
	get saveHint() { return localize('agentSessionSettings.saveHint', "Edit values below and save to apply. Unknown or non-mutable properties are ignored."); },
	get parseError() { return localize('agentSessionSettings.parseError', "Failed to parse agent session settings as JSON."); },
	get notObject() { return localize('agentSessionSettings.notObject', "Agent session settings must be a JSON object."); },
};

/**
 * Serialize the session-mutable config values for a session into a
 * commented, pretty-printed JSON document.
 */
export function serializeSessionSettings(provider: IAgentHostSessionsProvider, sessionId: string): string {
	return serializeAgentHostConfigDocument(provider.getSessionConfig(sessionId), sessionSettingsPropertyFilter, sessionSettingsLocale);
}

/**
 * Build a JSON schema describing the editable session-mutable, non-readOnly
 * properties of an agent-host session config. The filter mirrors the one
 * used by {@link serializeSessionSettings} so validation matches the file
 * contents produced by this provider.
 */
export function buildSessionSettingsJsonSchema(config: ResolveSessionConfigResult): IJSONSchema {
	return buildAgentHostConfigJsonSchema(config, sessionSettingsPropertyFilter);
}

/**
 * Filesystem provider serving synthetic JSONC documents that represent the
 * session-mutable config values of agent-host sessions.
 */
export class AgentSessionSettingsFileSystemProvider extends AbstractAgentHostConfigFileSystemProvider<ISessionSettingsContext> {

	protected readonly _schemeLabel = AGENT_SESSION_SETTINGS_SCHEME;
	protected readonly _traceTag = 'AgentSessionSettings';
	protected readonly _locale = sessionSettingsLocale;

	constructor(
		private readonly _schemaRegistrar: AgentSessionSettingsSchemaRegistrar,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@ILogService logService: ILogService,
	) {
		super(sessionsProvidersService, logService);
	}

	protected _parseUri(resource: URI): ISessionSettingsContext | undefined {
		return parseSessionSettingsUri(resource);
	}

	protected _serialize(provider: IAgentHostSessionsProvider, ctx: ISessionSettingsContext): string {
		return serializeSessionSettings(provider, ctx.sessionId);
	}

	protected _watchChanges(provider: IAgentHostSessionsProvider, ctx: ISessionSettingsContext, fire: () => void): IDisposable {
		return provider.onDidChangeSessionConfig(changedSessionId => {
			if (changedSessionId === ctx.sessionId) {
				fire();
			}
		});
	}

	protected _ensureSchemaRegistered(provider: IAgentHostSessionsProvider, ctx: ISessionSettingsContext): void {
		const session = provider.getSessions().find(s => s.sessionId === ctx.sessionId);
		if (session) {
			this._schemaRegistrar.ensureRegistered(provider, session);
		}
	}

	protected _hasConfig(provider: IAgentHostSessionsProvider, ctx: ISessionSettingsContext): boolean {
		return provider.getSessionConfig(ctx.sessionId) !== undefined;
	}

	// The input is the user's full view of editable values. Dispatch as a
	// replace — `replaceSessionConfig` guarantees non-editable properties
	// (non-mutable or readOnly) are preserved regardless of what we send,
	// and unknown keys are ignored.
	protected _replaceConfig(provider: IAgentHostSessionsProvider, ctx: ISessionSettingsContext, values: Record<string, unknown>): Promise<void> {
		return provider.replaceSessionConfig(ctx.sessionId, values);
	}

	protected _describeForTrace(ctx: ISessionSettingsContext): string {
		return `session ${ctx.sessionId}`;
	}
}

/**
 * Keeps per-session JSON schemas registered so editors of the synthetic
 * `agent-session-settings://…` files get completions, hover, and validation.
 */
export class AgentSessionSettingsSchemaRegistrar extends AbstractAgentHostConfigSchemaRegistrar<ISession> {

	protected _propertyFilter(): AgentHostConfigPropertyFilter {
		return sessionSettingsPropertyFilter;
	}

	protected _settingsUri(session: ISession): string {
		return agentSessionSettingsUri(session).toString();
	}

	// Schema content is served via the `vscode://schemas/...` filesystem
	// provider (see `SettingsFileSystemProvider`); the JSON language client
	// only knows how to fetch schema content for that scheme. The
	// settings-file URI is used as the fileMatch glob so the schema is
	// applied to the actual editor document.
	protected _schemaId(session: ISession): string {
		return `vscode://schemas/agent-session-settings/${session.providerId}/${session.resource.scheme}/${session.resource.path}.jsonc`;
	}

	protected _getConfig(provider: IAgentHostSessionsProvider, session: ISession): IAgentHostConfigLike | undefined {
		return provider.getSessionConfig(session.sessionId);
	}

	protected _targetsForProvider(provider: IAgentHostSessionsProvider): readonly ISession[] {
		return provider.getSessions();
	}

	protected _observeProvider(
		provider: IAgentHostSessionsProvider,
		onChanged: (session: ISession) => void,
		onRemoved: (session: ISession) => void,
	): IDisposable {
		const store = new DisposableStore();
		store.add(provider.onDidChangeSessionConfig(sessionId => {
			const session = provider.getSessions().find(s => s.sessionId === sessionId);
			if (session) {
				onChanged(session);
			}
		}));
		store.add(provider.onDidChangeSessions(e => {
			for (const removed of e.removed) {
				onRemoved(removed);
			}
		}));
		return store;
	}
}
