/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, IReference } from '../../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../../base/common/objects.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { SessionConfigPropertySchema, SessionState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { isAutoApprovePolicyRestricted, normalizeSessionConfigValue } from '../../../common/agentHostConfigPolicy.js';
import {
	AbstractAgentHostConfigFileSystemProvider,
	AbstractAgentHostConfigSchemaRegistrar,
	AgentHostConfigPropertyFilter,
	IAgentHostConfigLike,
	IAgentHostSettingsLocale,
	serializeAgentHostConfigDocument,
} from './agentHostConfigEditor.js';

/** Scheme for the synthetic editor-window agent-host session settings file. */
export const AGENT_SESSION_SETTINGS_SCHEME = 'agent-session-settings';

/** Owner tag used when acquiring refcounted session-state subscriptions. */
const SUBSCRIPTION_OWNER = 'AgentSessionSettingsEditor';

/**
 * Build the URI used to open the settings file for a backend agent-host
 * session in the editor window.
 *
 * URI shape: `agent-session-settings://{provider}/{rawId}.jsonc`, where
 * `provider`/`rawId` are the scheme/path of the backend AHP session URI
 * (see {@link toAgentHostBackendSessionUri}), so the URI round-trips back to
 * the backend session without any additional lookup.
 */
export function agentSessionSettingsUri(backendSession: URI): URI {
	const rawId = backendSession.path.startsWith('/') ? backendSession.path.substring(1) : backendSession.path;
	return URI.from({
		scheme: AGENT_SESSION_SETTINGS_SCHEME,
		authority: backendSession.scheme,
		path: `/${rawId}.jsonc`,
	});
}

interface ISessionSettingsContext {
	readonly backendSession: URI;
}

function parseSessionSettingsUri(uri: URI): ISessionSettingsContext | undefined {
	if (uri.scheme !== AGENT_SESSION_SETTINGS_SCHEME || !uri.authority) {
		return undefined;
	}
	let rawId = uri.path.startsWith('/') ? uri.path.substring(1) : uri.path;
	const lastDot = rawId.lastIndexOf('.');
	if (lastDot > 0) {
		rawId = rawId.substring(0, lastDot);
	}
	if (!rawId) {
		return undefined;
	}
	return { backendSession: URI.from({ scheme: uri.authority, path: `/${rawId}` }) };
}

/**
 * Property filter: only session-mutable, non-read-only properties are
 * editable. Mirrors the sessions-window filter in
 * `vs/sessions/contrib/providers/agentHost/browser/agentSessionSettingsFileSystemProvider.ts`
 * - kept as a separate small local definition rather than a shared export
 * since it encodes session-config-specific business rules, not target-neutral
 * editor infrastructure.
 */
const sessionSettingsPropertyFilter: AgentHostConfigPropertyFilter = (_key, schema) => {
	const s = schema as SessionConfigPropertySchema;
	return s.sessionMutable === true && s.readOnly !== true;
};

const sessionSettingsLocale: IAgentHostSettingsLocale = {
	get header() { return localize('chatAgentSessionSettings.header', "Session settings for this agent host session."); },
	get saveHint() { return localize('chatAgentSessionSettings.saveHint', "Edit values below and save to apply. Unknown or non-mutable properties are ignored."); },
	get parseError() { return localize('chatAgentSessionSettings.parseError', "Failed to parse agent session settings as JSON."); },
	get notObject() { return localize('chatAgentSessionSettings.notObject', "Agent session settings must be a JSON object."); },
};

function readSessionConfig(state: SessionState | Error | undefined): IAgentHostConfigLike | undefined {
	if (!state || state instanceof Error || !state.config) {
		return undefined;
	}
	return state.config;
}

interface ISessionSettingsTarget {
	readonly backendSession: URI;
	readonly ref: IReference<IAgentSubscription<SessionState>>;
}

/**
 * Filesystem provider serving synthetic JSONC documents representing the
 * session-mutable config values of a selected agent-host session in the
 * editor window. Unlike the sessions-window's provider-keyed equivalent,
 * there is no `ISessionsProvidersService` to resolve a target from - the
 * backend AHP session URI is encoded directly in the settings URI (see
 * {@link agentSessionSettingsUri}).
 *
 * Every {@link _resolveTarget} call acquires a fresh, scoped reference via
 * {@link IAgentHostService.getSubscription} and {@link _releaseTarget}
 * releases exactly that reference - there is no provider-local cache or
 * refcount map. `stat`/`readFile`/`writeFile` hold their reference only for
 * the duration of the call; a `watch` holds its reference until the caller
 * disposes it. Multiple concurrent references to the same backend session
 * are deduped and refcounted by {@link IAgentHostService} itself.
 */
export class AgentSessionSettingsFileSystemProvider extends AbstractAgentHostConfigFileSystemProvider<ISessionSettingsContext, ISessionSettingsTarget> {

	protected readonly _schemeLabel = AGENT_SESSION_SETTINGS_SCHEME;
	protected readonly _traceTag = 'AgentSessionSettings';
	protected readonly _locale = sessionSettingsLocale;

	constructor(
		private readonly _schemaRegistrar: AgentSessionSettingsSchemaRegistrar,
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService logService: ILogService,
	) {
		super(logService);
	}

	protected _parseUri(resource: URI): ISessionSettingsContext | undefined {
		return parseSessionSettingsUri(resource);
	}

	protected _resolveTarget(ctx: ISessionSettingsContext): ISessionSettingsTarget {
		const ref = this._agentHostService.getSubscription(StateComponents.Session, ctx.backendSession, SUBSCRIPTION_OWNER);
		return { backendSession: ctx.backendSession, ref };
	}

	protected override _releaseTarget(target: ISessionSettingsTarget): void {
		target.ref.dispose();
	}

	protected _serialize(target: ISessionSettingsTarget): string {
		return serializeAgentHostConfigDocument(readSessionConfig(target.ref.object.value), sessionSettingsPropertyFilter, sessionSettingsLocale);
	}

	protected _watchChanges(target: ISessionSettingsTarget, _ctx: ISessionSettingsContext, fire: () => void): IDisposable {
		return target.ref.object.onDidChange(() => fire());
	}

	protected _ensureSchemaRegistered(target: ISessionSettingsTarget): void {
		this._schemaRegistrar.ensureRegistered(target.backendSession);
	}

	protected _hasConfig(target: ISessionSettingsTarget): boolean {
		return readSessionConfig(target.ref.object.value) !== undefined;
	}

	// The input is the user's full view of editable values. Dispatch as a
	// replace: every non-editable property is forced through unchanged from
	// the current values, and an editable property the user omitted is left
	// out of the replacement payload entirely, clearing it. Editable values
	// the user *did* supply are still clamped by
	// normalizeSessionConfigValue - otherwise an org auto-approve policy
	// enforced everywhere else (chip picker, sessions-window replace) could
	// be bypassed simply by editing this JSONC document directly.
	protected async _replaceConfig(target: ISessionSettingsTarget, ctx: ISessionSettingsContext, values: Record<string, unknown>): Promise<void> {
		const current = readSessionConfig(target.ref.object.value);
		if (!current) {
			return;
		}

		const policyRestricted = isAutoApprovePolicyRestricted(this._configurationService);
		const nextValues: Record<string, unknown> = {};
		for (const [key, schema] of Object.entries(current.schema.properties)) {
			if (sessionSettingsPropertyFilter(key, schema)) {
				if (Object.hasOwn(values, key)) {
					nextValues[key] = normalizeSessionConfigValue(key, values[key], policyRestricted);
				}
			} else if (Object.hasOwn(current.values, key)) {
				nextValues[key] = current.values[key];
			}
		}

		if (equals(nextValues, current.values)) {
			return;
		}

		this._agentHostService.dispatch(ctx.backendSession.toString(), {
			type: ActionType.SessionConfigChanged,
			config: nextValues,
			replace: true,
		});
	}

	protected _describeForTrace(ctx: ISessionSettingsContext): string {
		return `session ${ctx.backendSession.toString()}`;
	}
}

/**
 * Keeps the JSON schema registered for an open `agent-session-settings://...`
 * document. Reads the current config via
 * {@link IAgentHostService.getSubscriptionUnmanaged}, which returns the live
 * value of the {@link AgentSessionSettingsFileSystemProvider}'s own managed
 * subscription for the same backend session (already acquired by the time
 * `readFile` calls {@link ensureRegistered}) - the registrar itself never
 * acquires a subscription.
 */
export class AgentSessionSettingsSchemaRegistrar extends AbstractAgentHostConfigSchemaRegistrar<URI> {

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
	) {
		super();
	}

	protected _propertyFilter(): AgentHostConfigPropertyFilter {
		return sessionSettingsPropertyFilter;
	}

	protected _settingsUri(backendSession: URI): string {
		return agentSessionSettingsUri(backendSession).toString();
	}

	protected _schemaId(backendSession: URI): string {
		const rawId = backendSession.path.startsWith('/') ? backendSession.path.substring(1) : backendSession.path;
		return `vscode://schemas/agent-session-settings/${backendSession.scheme}/${rawId}.jsonc`;
	}

	protected _getConfig(backendSession: URI): IAgentHostConfigLike | undefined {
		const sub = this._agentHostService.getSubscriptionUnmanaged(StateComponents.Session, backendSession);
		return readSessionConfig(sub?.value);
	}
}
