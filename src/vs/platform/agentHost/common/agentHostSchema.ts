/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { structuralEquals } from '../../../base/common/equals.js';
import { ConfigurationTarget, type IConfigurationService, type IConfigurationValue } from '../../configuration/common/configuration.js';
import type { IMcpServerConfiguration } from '../../mcp/common/mcpPlatformTypes.js';
import { TelemetryConfiguration, TelemetryLevel } from '../../telemetry/common/telemetry.js';
import { SessionConfigKey } from './sessionConfigKeys.js';
import type { SessionConfigPropertySchema, SessionConfigSchema } from './state/protocol/commands.js';
import { JsonRpcErrorCodes, ProtocolError } from './state/sessionProtocol.js';

// ---- Schema builder --------------------------------------------------------

/**
 * A schema property with a phantom TypeScript type and a precomputed
 * runtime validator.
 *
 * The `<T>` type parameter is the developer's assertion about the
 * property's runtime shape; the validator derived from `protocol`
 * (`type`, `enum`, `items`, `properties`, `required`) enforces it at
 * runtime.
 */
export interface ISchemaProperty<T> {
	readonly protocol: SessionConfigPropertySchema;
	/**
	 * Returns `true` iff `value` conforms to {@link protocol}. Narrows
	 * the type to `T` for callers. The boolean form is preferred for
	 * control flow; use {@link assertValid} when you want a descriptive
	 * error for the offending path.
	 */
	validate(value: unknown): value is T;
	/**
	 * Throws a {@link ProtocolError} with `JsonRpcErrorCodes.InvalidParams`
	 * describing the offending path (e.g. `'permissions.allow[2]'`) when
	 * `value` does not conform to {@link protocol}. Otherwise returns and
	 * narrows the type to `T`.
	 *
	 * @param path Dotted path prefix to embed in error messages. Defaults
	 * to empty (the value itself).
	 */
	assertValid(value: unknown, path?: string): asserts value is T;
}

/**
 * Defines a strongly-typed schema property whose runtime validator is
 * derived from the supplied JSON-schema descriptor.
 */
export function schemaProperty<T>(protocol: SessionConfigPropertySchema): ISchemaProperty<T> {
	const assertFn = buildAssert(protocol);
	const assertValid = (value: unknown, path: string = ''): asserts value is T => assertFn(value, path);
	const validate = (value: unknown): value is T => {
		try {
			assertFn(value, '');
			return true;
		} catch {
			return false;
		}
	};
	return { protocol, validate, assertValid };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SchemaDefinition = Record<string, ISchemaProperty<any>>;

export type SchemaValue<P> = P extends ISchemaProperty<infer T> ? T : never;

export type SchemaValues<D extends SchemaDefinition> = {
	[K in keyof D]?: SchemaValue<D[K]>;
};

/**
 * A bundle of named schema properties plus helpers for serializing to the
 * protocol shape, validating a values bag at write sites, and validating
 * a single key at read sites.
 */
export interface ISchema<D extends SchemaDefinition> {
	readonly definition: D;
	/** Returns the protocol-serializable schema for this bundle. */
	toProtocol(): SessionConfigSchema;
	/**
	 * Validates each known key in `values` against its schema and returns
	 * a new plain record. Throws a {@link ProtocolError} with a path like
	 * `'permissions.allow[2]'` when any supplied value fails validation.
	 * Unknown keys are passed through untouched for forward-compatibility.
	 */
	values(values: SchemaValues<D>): Record<string, unknown>;
	/**
	 * Returns `true` iff `value` validates against the schema for `key`.
	 * Unknown keys return `false`.
	 */
	validate<K extends keyof D & string>(key: K, value: unknown): value is SchemaValue<D[K]>;
	/**
	 * Throws a {@link ProtocolError} describing the offending path when
	 * `value` does not validate against the schema for `key`, or when
	 * `key` is not defined in the schema.
	 */
	assertValid<K extends keyof D & string>(key: K, value: unknown): asserts value is SchemaValue<D[K]>;
	/**
	 * Returns a fully-typed values bag by validating each key of the
	 * schema against `values` and falling back to the default when
	 * the incoming value is missing or fails validation.
	 *
	 * Semantics: for every key declared in the schema `definition`:
	 * - if `values[key]` validates, it is kept;
	 * - else if `key` is present in `defaults`, the default is used;
	 * - else the key is omitted from the result.
	 *
	 * This means callers MAY supply defaults for only a subset of the
	 * schema — keys not present in `defaults` are simply left unset
	 * when the incoming value is missing or invalid. This is useful
	 * when some properties (e.g. per-session `permissions`) should be
	 * inherited from a higher scope rather than materialized on every
	 * new session.
	 *
	 * Intended for sanitizing untrusted input at protocol boundaries
	 * (e.g. `resolveSessionConfig`). Keys that fail validation are
	 * silently replaced with their default or dropped; use
	 * {@link values} or {@link assertValid} when you want a descriptive
	 * {@link ProtocolError} instead.
	 */
	validateOrDefault<T extends Partial<{ [K in keyof D]: SchemaValue<D[K]> }>>(values: { [K in keyof T]?: unknown } | undefined, defaults: T): T;
}

export function createSchema<D extends SchemaDefinition>(definition: D): ISchema<D> {
	return {
		definition,
		toProtocol(): SessionConfigSchema {
			const properties: Record<string, SessionConfigPropertySchema> = {};
			for (const key of Object.keys(definition)) {
				properties[key] = definition[key].protocol;
			}
			return { type: 'object', properties };
		},
		values(values) {
			const raw = values as Record<string, unknown>;
			for (const key of Object.keys(definition)) {
				const value = raw[key];
				if (value === undefined) {
					continue;
				}
				// Local with explicit annotation so TypeScript accepts the
				// assertion-signature call (per TS4104).
				const prop: ISchemaProperty<unknown> = definition[key];
				prop.assertValid(value, key);
			}
			return { ...raw };
		},
		validate<K extends keyof D & string>(key: K, value: unknown): value is SchemaValue<D[K]> {
			const prop = definition[key];
			return prop ? prop.validate(value) : false;
		},
		assertValid<K extends keyof D & string>(key: K, value: unknown): asserts value is SchemaValue<D[K]> {
			const prop: ISchemaProperty<unknown> | undefined = definition[key];
			if (!prop) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Unknown schema key '${key}'`);
			}
			// Re-bind post-narrowing to keep the call target explicitly typed
			// (required for assertion-signature calls, TS4104).
			const narrowed: ISchemaProperty<unknown> = prop;
			narrowed.assertValid(value, key);
		},
		validateOrDefault<T extends Partial<{ [K in keyof D]: SchemaValue<D[K]> }>>(values: { [K in keyof T]?: unknown } | undefined, defaults: T): T {
			const result: Record<string, unknown> = {};
			const raw: { [K in keyof T]?: unknown } = values ?? {};
			for (const key of Object.keys(definition)) {
				const prop = definition[key];
				const candidate = raw[key];
				if (candidate !== undefined && prop.validate(candidate)) {
					result[key] = candidate;
				} else if (Object.prototype.hasOwnProperty.call(defaults, key)) {
					result[key] = (defaults as Record<string, unknown>)[key];
				}
				// else: key not in defaults and incoming value missing/invalid
				// → leave unset so higher-scope defaults can fill in.
			}
			return result as T;
		},
	};
}

// ---- Validator derivation --------------------------------------------------

/**
 * A validator that throws a {@link ProtocolError} annotated with the
 * offending path when `value` does not conform, or returns normally
 * when it does.
 */
type AssertValidator = (value: unknown, path: string) => void;

function buildAssert(schema: SessionConfigPropertySchema): AssertValidator {
	if (schema.type === 'object' && schema.properties) {
		const propAsserts: Record<string, AssertValidator> = {};
		for (const key of Object.keys(schema.properties)) {
			propAsserts[key] = buildAssert(schema.properties[key] as SessionConfigPropertySchema);
		}
		const required = new Set(schema.required ?? []);
		return (value, path) => {
			if (typeof value !== 'object' || value === null || Array.isArray(value)) {
				throw invalidParams(path, 'object', value);
			}
			const obj = value as Record<string, unknown>;
			for (const key of Object.keys(propAsserts)) {
				const childPath = joinPath(path, key);
				if (obj[key] === undefined) {
					if (required.has(key)) {
						throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Missing required property at '${childPath}'`);
					}
					continue;
				}
				propAsserts[key](obj[key], childPath);
			}
		};
	}
	if (schema.type === 'array' && schema.items) {
		const itemAssert = buildAssert(schema.items as SessionConfigPropertySchema);
		return (value, path) => {
			if (!Array.isArray(value)) {
				throw invalidParams(path, 'array', value);
			}
			for (let i = 0; i < value.length; i++) {
				itemAssert(value[i], `${path}[${i}]`);
			}
		};
	}
	return buildPrimitiveAssert(schema);
}

function buildPrimitiveAssert(schema: SessionConfigPropertySchema): AssertValidator {
	const enumDynamic = schema.enumDynamic === true;
	return (value, path) => {
		switch (schema.type) {
			case 'string': if (typeof value !== 'string') { throw invalidParams(path, 'string', value); } break;
			case 'number': if (typeof value !== 'number') { throw invalidParams(path, 'number', value); } break;
			case 'boolean': if (typeof value !== 'boolean') { throw invalidParams(path, 'boolean', value); } break;
			case 'array': if (!Array.isArray(value)) { throw invalidParams(path, 'array', value); } break;
			case 'object': if (typeof value !== 'object' || value === null || Array.isArray(value)) { throw invalidParams(path, 'object', value); } break;
		}
		if (schema.enum && !enumDynamic && !schema.enum.includes(value as string)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Invalid value at '${path || '<root>'}': ${safeStringify(value)} is not one of [${schema.enum.map(v => JSON.stringify(v)).join(', ')}]`);
		}
	};
}

function invalidParams(path: string, expected: string, value: unknown): ProtocolError {
	return new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Invalid value at '${path || '<root>'}': expected ${expected}, got ${safeStringify(value)}`);
}

function joinPath(parent: string, key: string): string {
	return parent ? `${parent}.${key}` : key;
}

function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

// ---- Platform-owned schema -------------------------------------------------

export type AutoApproveLevel = 'default' | 'assisted' | 'autoApprove';

export type SessionMode = 'interactive' | 'plan' | 'autopilot';

export interface IPermissionsValue {
	readonly allow: readonly string[];
	readonly deny: readonly string[];
}

const permissionsProperty = schemaProperty<IPermissionsValue>({
	type: 'object',
	title: localize('agentHost.sessionConfig.permissions', "Permissions"),
	description: localize('agentHost.sessionConfig.permissionsDescription', "Per-tool session permissions. Updated automatically when approving a tool \"in this Session\"."),
	properties: {
		allow: {
			type: 'array',
			title: localize('agentHost.sessionConfig.permissions.allow', "Allowed tools"),
			items: {
				type: 'string',
				title: localize('agentHost.sessionConfig.permissions.toolName', "Tool name"),
			},
		},
		deny: {
			type: 'array',
			title: localize('agentHost.sessionConfig.permissions.deny', "Denied tools"),
			items: {
				type: 'string',
				title: localize('agentHost.sessionConfig.permissions.toolName', "Tool name"),
			},
		},
	},
	default: { allow: [], deny: [] },
	sessionMutable: true,
});

/**
 * Session-config properties owned by the platform itself — i.e. consumed
 * by the agent host rather than by any particular agent.
 *
 * Agents extend this schema by spreading `platformSessionSchema.definition`
 * into their own {@link createSchema} call together with any
 * provider-specific properties.
 */
export const platformSessionSchema = createSchema({
	[SessionConfigKey.AutoApprove]: schemaProperty<AutoApproveLevel>({
		type: 'string',
		title: localize('agentHost.sessionConfig.autoApprove', "Approvals"),
		description: localize('agentHost.sessionConfig.autoApproveDescription', "Tool approval behavior for this session"),
		enum: ['default', 'assisted', 'autoApprove'],
		enumLabels: [
			localize('agentHost.sessionConfig.autoApprove.default', "Default approvals"),
			localize('agentHost.sessionConfig.autoApprove.assisted', "Assisted permissions (Preview)"),
			localize('agentHost.sessionConfig.autoApprove.bypass', "Allow all"),
		],
		enumDescriptions: [
			localize('agentHost.sessionConfig.autoApprove.defaultDescription', "Asks when approval settings don't apply"),
			localize('agentHost.sessionConfig.autoApprove.assistedDescription', "Evaluates risk before running tools"),
			localize('agentHost.sessionConfig.autoApprove.bypassDescription', "Runs tool calls without asking"),
		],
		default: 'default',
		sessionMutable: true,
	}),
	[SessionConfigKey.Permissions]: permissionsProperty,
	[SessionConfigKey.Mode]: schemaProperty<SessionMode>({
		type: 'string',
		title: localize('agentHost.sessionConfig.mode', "Agent Mode"),
		description: localize('agentHost.sessionConfig.modeDescription', "How the agent should approach this turn"),
		enum: ['interactive', 'plan', 'autopilot'],
		enumLabels: [
			localize('agentHost.sessionConfig.mode.interactive', "Interactive"),
			localize('agentHost.sessionConfig.mode.plan', "Plan"),
			localize('agentHost.sessionConfig.mode.autopilot', "Autopilot"),
		],
		enumDescriptions: [
			localize('agentHost.sessionConfig.mode.interactiveDescription', "Step-by-step collaboration"),
			localize('agentHost.sessionConfig.mode.planDescription', "Plan first, execute when ready"),
			localize('agentHost.sessionConfig.mode.autopilotDescription', "Autonomously iterates from start to finish"),
		],
		default: 'interactive',
		sessionMutable: true,
	}),
});

/**
 * Rewrites a legacy `autoApprove='autopilot'` config value — used before
 * Autopilot moved from the `autoApprove` axis onto the orthogonal `mode`
 * axis — into the current two-axis shape:
 *
 *  - `autoApprove='autopilot'` + `mode='plan'`  → `mode='plan'`, `autoApprove='default'`
 *    (legacy `plan` took precedence over autopilot when resolving the SDK mode).
 *  - `autoApprove='autopilot'` + any other mode → `mode='autopilot'`, `autoApprove='default'`.
 *
 * Returns a shallow copy with the migration applied, or the original
 * reference unchanged when no legacy value is present. Safe to call on
 * `undefined`.
 *
 * Without this, a session persisted (or a "remembered" picker value seeded)
 * with `autoApprove='autopilot'` would fail the new schema's enum validation
 * and silently fall back to `default`, downgrading the session from
 * autonomous Autopilot to manual per-tool confirmation.
 */
export function migrateLegacyAutopilotConfig<T extends Record<string, unknown> | undefined>(config: T): T {
	if (!config || config[SessionConfigKey.AutoApprove] !== 'autopilot') {
		return config;
	}
	const migrated: Record<string, unknown> = { ...config };
	if (migrated[SessionConfigKey.Mode] !== 'plan') {
		migrated[SessionConfigKey.Mode] = 'autopilot' satisfies SessionMode;
	}
	migrated[SessionConfigKey.AutoApprove] = 'default' satisfies AutoApproveLevel;
	return migrated as T;
}

/**
 * Root (agent host) config properties owned by the platform itself.
 *
 * Root config acts as the baseline that applies to every session:
 *
 * - {@link SessionConfigKey.Permissions} — host-wide allow/deny lists
 *   unioned with each session's own permissions when evaluating tool
 *   auto-approval. See `SessionPermissionManager` for the evaluation
 *   rules.
 */
export const AgentHostTelemetryLevelConfigKey = 'telemetryLevel';

/**
 * Root config key forwarded from the renderer when VS Code's
 * `chat.sessionSync.enabled` setting changes. Controls the `remote` flag
 * passed to the copilot-sdk `CopilotClientOptions`.
 */
export const AgentHostSessionSyncEnabledConfigKey = 'sessionSyncEnabled';

/**
 * Root config key forwarded from the renderer carrying the experiment-aware
 * value of `chat.agentHost.codexAgent.enabled`. The host registers the Codex
 * provider when this is `true`; disabling requires an agent host restart.
 */
export const AgentHostCodexEnabledConfigKey = 'codexAgentEnabled';

/**
 * Root config key forwarded from the renderer when VS Code's
 * `chat.tools.terminal.enableAutoApprove` setting changes. Controls whether
 * agent-host shell permission checks may apply terminal auto-approve rules.
 */
export const AgentHostTerminalAutoApproveEnabledConfigKey = 'terminalAutoApproveEnabled';

/**
 * The VS Code setting ID for terminal auto approve enablement. Defined here so
 * renderer-side agent-host clients can forward it without importing from
 * workbench terminal contributions.
 */
export const TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID = 'chat.tools.terminal.enableAutoApprove';

/**
 * Root config key forwarded from the renderer when VS Code's
 * `chat.tools.global.autoApprove` setting changes. When `true`, the global
 * auto-approve ("approve everything") setting is enabled and the agent host
 * treats every tool call as auto-approved — equivalent to a session running
 * with Allow all.
 */
export const AgentHostGlobalAutoApproveEnabledConfigKey = 'globalAutoApproveEnabled';

/**
 * The VS Code setting ID for global auto approve. Defined here so renderer-side
 * agent-host clients can forward it without importing from `workbench/contrib/chat`.
 */
export const GLOBAL_AUTO_APPROVE_SETTING_ID = 'chat.tools.global.autoApprove';

/**
 * Root config key forwarded from the renderer when VS Code's `chat.autoReply`
 * setting changes. When `true`, the agent host auto-answers `ask_user`
 * questions instead of blocking on the user — the user is treated as
 * unavailable and the agent is told to use its best judgment, mirroring the
 * behavior of `autopilot` mode.
 */
export const AgentHostAutoReplyEnabledConfigKey = 'autoReplyEnabled';

/**
 * The VS Code setting ID for auto-reply. Defined here so renderer-side
 * agent-host clients can forward it without importing from `workbench/contrib/chat`.
 */
export const AUTO_REPLY_SETTING_ID = 'chat.autoReply';

// Root config key forwarded from the renderer when Copilot Chat's `github.copilot.chat.preferLongContext.enabled` setting changes.
export const AgentHostPreferLongContextEnabledConfigKey = 'preferLongContextEnabled';

// The Copilot Chat setting ID for preferring long context, forwarded into the agent host root config.
export const PREFER_LONG_CONTEXT_SETTING_ID = 'github.copilot.chat.preferLongContext.enabled';

/**
 * Root config key forwarded from the renderer when VS Code's
 * `chat.tools.terminal.autoApprove` setting changes. Holds the effective
 * terminal auto-approve rule object for agent-host shell permission checks.
 */
export const AgentHostTerminalAutoApproveRulesConfigKey = 'terminalAutoApproveRules';

export interface IAgentHostTerminalAutoApproveRule {
	readonly approve: boolean;
	readonly matchCommandLine?: boolean;
}

export type AgentHostTerminalAutoApproveRuleValue = boolean | null | IAgentHostTerminalAutoApproveRule;
export type AgentHostTerminalAutoApproveRules = Record<string, AgentHostTerminalAutoApproveRuleValue>;

/**
 * The VS Code setting IDs for terminal auto approve rules. Defined here so
 * renderer-side agent-host clients can forward them without importing from
 * workbench terminal contributions.
 */
export const TERMINAL_AUTO_APPROVE_SETTING_ID = 'chat.tools.terminal.autoApprove';
export const TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID = 'chat.tools.terminal.ignoreDefaultAutoApproveRules';

export function getAgentHostTerminalAutoApproveRulesConfig(configurationService: IConfigurationService): AgentHostTerminalAutoApproveRules {
	const config = configurationService.getValue<AgentHostTerminalAutoApproveRules | undefined>(TERMINAL_AUTO_APPROVE_SETTING_ID);
	const configInspectValue = configurationService.inspect<Readonly<AgentHostTerminalAutoApproveRules>>(TERMINAL_AUTO_APPROVE_SETTING_ID);
	const ignoreDefaults = configurationService.getValue<boolean>(TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID) === true;
	return normalizeAgentHostTerminalAutoApproveRulesConfig(config, configInspectValue, ignoreDefaults);
}

export function normalizeAgentHostTerminalAutoApproveRulesConfig(config: AgentHostTerminalAutoApproveRules | undefined, configInspectValue: IConfigurationValue<Readonly<AgentHostTerminalAutoApproveRules>>, ignoreDefaults: boolean): AgentHostTerminalAutoApproveRules {
	if (!config) {
		return {};
	}

	const rules: AgentHostTerminalAutoApproveRules = {};
	for (const [key, value] of Object.entries(config)) {
		if (ignoreDefaults && isDefaultOnlyAutoApproveRule(key, value, configInspectValue)) {
			continue;
		}
		rules[key] = value;
	}
	return rules;
}

function isDefaultOnlyAutoApproveRule(key: string, value: AgentHostTerminalAutoApproveRuleValue, configInspectValue: IConfigurationValue<Readonly<AgentHostTerminalAutoApproveRules>>): boolean {
	const defaultValue = configInspectValue.default?.value;
	const isDefaultRule = hasMatchingRule(defaultValue, key, value);
	if (!isDefaultRule) {
		return false;
	}

	const sourceTarget = getAutoApproveRuleSourceTarget(key, value, configInspectValue);

	return sourceTarget === ConfigurationTarget.DEFAULT;
}

function getAutoApproveRuleSourceTarget(key: string, value: AgentHostTerminalAutoApproveRuleValue, configInspectValue: IConfigurationValue<Readonly<AgentHostTerminalAutoApproveRules>>): ConfigurationTarget {
	if (hasMatchingRule(configInspectValue.workspaceFolderValue, key, value)) {
		return ConfigurationTarget.WORKSPACE_FOLDER;
	}
	if (hasMatchingRule(configInspectValue.workspaceValue, key, value)) {
		return ConfigurationTarget.WORKSPACE;
	}
	if (hasMatchingRule(configInspectValue.userRemoteValue, key, value)) {
		return ConfigurationTarget.USER_REMOTE;
	}
	if (hasMatchingRule(configInspectValue.userLocalValue, key, value)) {
		return ConfigurationTarget.USER_LOCAL;
	}
	if (hasMatchingRule(configInspectValue.userValue, key, value)) {
		return ConfigurationTarget.USER;
	}
	if (hasMatchingRule(configInspectValue.applicationValue, key, value)) {
		return ConfigurationTarget.APPLICATION;
	}
	return ConfigurationTarget.DEFAULT;
}

function hasMatchingRule(config: Readonly<AgentHostTerminalAutoApproveRules> | undefined, key: string, value: AgentHostTerminalAutoApproveRuleValue): boolean {
	return !!config && Object.prototype.hasOwnProperty.call(config, key) && structuralEquals(config[key], value);
}

/**
 * Root config key holding agent-host-level MCP server definitions.
 *
 * The value is a map of server name → {@link IMcpServerConfiguration}
 * (the same `servers` shape used by `mcp.json`). These servers are
 * exposed to every session created by the host, merged with any
 * plugin-provided MCP servers when launching the copilot-sdk client.
 */
export const AgentHostMcpServersConfigKey = 'mcpServers';

/**
 * Map of server name → MCP server configuration, as stored in the
 * {@link AgentHostMcpServersConfigKey} root config value.
 */
export type AgentHostMcpServers = Record<string, IMcpServerConfiguration>;

/**
 * The VS Code setting ID for session sync. Defined here so the platform
 * layer (renderer-side forwarding) can reference it without importing from
 * `workbench/contrib/chat`.
 */
export const SESSION_SYNC_ENABLED_SETTING_ID = 'chat.sessionSync.enabled';

export function telemetryLevelToAgentHostConfigValue(telemetryLevel: TelemetryLevel): TelemetryConfiguration {
	switch (telemetryLevel) {
		case TelemetryLevel.NONE:
			return TelemetryConfiguration.OFF;
		case TelemetryLevel.CRASH:
			return TelemetryConfiguration.CRASH;
		case TelemetryLevel.ERROR:
			return TelemetryConfiguration.ERROR;
		case TelemetryLevel.USAGE:
			return TelemetryConfiguration.ON;
	}
}

export function agentHostConfigValueToTelemetryLevel(value: unknown): TelemetryLevel | undefined {
	switch (value) {
		case TelemetryConfiguration.OFF:
			return TelemetryLevel.NONE;
		case TelemetryConfiguration.CRASH:
			return TelemetryLevel.CRASH;
		case TelemetryConfiguration.ERROR:
			return TelemetryLevel.ERROR;
		case TelemetryConfiguration.ON:
			return TelemetryLevel.USAGE;
		default:
			return undefined;
	}
}

/**
 * Field descriptors for a single MCP server entry, shared by the stdio and
 * http shapes. The agent-host config schema has no `oneOf`, so both variants'
 * fields are described together; `type` selects which fields apply
 * (`stdio` uses `command`/`args`/`env`/`cwd`, `http` uses `url`/`headers`).
 */
const mcpServerConfigProperties: Record<string, SessionConfigPropertySchema> = {
	type: {
		type: 'string',
		title: localize('agentHost.config.mcpServers.type.title', "Server Type"),
		description: localize('agentHost.config.mcpServers.type.description', "The transport used to reach the server: `stdio` for a local command, `http` for a remote endpoint."),
		enum: ['stdio', 'http'],
	},
	command: {
		type: 'string',
		title: localize('agentHost.config.mcpServers.command.title', "Command"),
		description: localize('agentHost.config.mcpServers.command.description', "For `stdio` servers, the executable to spawn."),
	},
	args: {
		type: 'array',
		title: localize('agentHost.config.mcpServers.args.title', "Arguments"),
		description: localize('agentHost.config.mcpServers.args.description', "For `stdio` servers, the arguments passed to the command."),
		items: { type: 'string', title: localize('agentHost.config.mcpServers.arg.title', "Argument") },
	},
	env: {
		type: 'object',
		title: localize('agentHost.config.mcpServers.env.title', "Environment"),
		description: localize('agentHost.config.mcpServers.env.description', "For `stdio` servers, environment variables set on the spawned process."),
	},
	cwd: {
		type: 'string',
		title: localize('agentHost.config.mcpServers.cwd.title', "Working Directory"),
		description: localize('agentHost.config.mcpServers.cwd.description', "For `stdio` servers, the working directory the command runs in."),
	},
	url: {
		type: 'string',
		title: localize('agentHost.config.mcpServers.url.title', "URL"),
		description: localize('agentHost.config.mcpServers.url.description', "For `http` servers, the endpoint URL of the MCP server."),
	},
	headers: {
		type: 'object',
		title: localize('agentHost.config.mcpServers.headers.title', "Headers"),
		description: localize('agentHost.config.mcpServers.headers.description', "For `http` servers, HTTP headers sent with every request."),
	},
};

/**
 * Documents the value shape of the {@link AgentHostMcpServersConfigKey} map.
 *
 * The config value is a map of server name → server config. The schema
 * language has no `additionalProperties`, so the per-entry shape is attached
 * under a placeholder key (`<serverName>`) rather than at the map level —
 * this keeps the field descriptions discoverable without the runtime
 * validator mistaking a real server named e.g. `command` for the `command`
 * field. Real entries (keyed by actual server names) are passed through.
 */
const mcpServersValueProperties: Record<string, SessionConfigPropertySchema> = {
	'<serverName>': {
		type: 'object',
		title: localize('agentHost.config.mcpServers.entry.title', "MCP Server"),
		description: localize('agentHost.config.mcpServers.entry.description', "A single MCP server entry. The property key is the server name."),
		properties: mcpServerConfigProperties,
	},
};

export const platformRootSchema = createSchema({
	[SessionConfigKey.Permissions]: permissionsProperty,
	[AgentHostTelemetryLevelConfigKey]: schemaProperty<TelemetryConfiguration>({
		type: 'string',
		title: localize('agentHost.config.telemetryLevel.title', "Telemetry Level"),
		description: localize('agentHost.config.telemetryLevel.description', "Most restrictive telemetry level requested by connected clients."),
		enum: [TelemetryConfiguration.ON, TelemetryConfiguration.ERROR, TelemetryConfiguration.CRASH, TelemetryConfiguration.OFF],
		default: TelemetryConfiguration.ON,
	}),
	[AgentHostSessionSyncEnabledConfigKey]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentHost.config.sessionSyncEnabled.title', "Session Sync"),
		description: localize('agentHost.config.sessionSyncEnabled.description', "Whether remote session sync is enabled for the copilot-sdk CLI."),
		default: false,
	}),
	[AgentHostCodexEnabledConfigKey]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentHost.config.codexAgentEnabled.title', "Codex Agent"),
		description: localize('agentHost.config.codexAgentEnabled.description', "Whether the Codex provider is enabled."),
		default: false,
	}),
	[AgentHostTerminalAutoApproveEnabledConfigKey]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentHost.config.terminalAutoApproveEnabled.title', "Terminal Auto Approve"),
		description: localize('agentHost.config.terminalAutoApproveEnabled.description', "Whether terminal auto-approve rules forwarded by the connected client are allowed to apply to agent-host shell permission requests."),
		default: true,
	}),
	[AgentHostGlobalAutoApproveEnabledConfigKey]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentHost.config.globalAutoApproveEnabled.title', "Global Auto Approve"),
		description: localize('agentHost.config.globalAutoApproveEnabled.description', "Whether VS Code's global auto-approve setting is enabled. When `true`, every tool call is auto-approved, equivalent to a session using Allow all."),
		default: false,
	}),
	[AgentHostAutoReplyEnabledConfigKey]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentHost.config.autoReplyEnabled.title', "Auto Reply"),
		description: localize('agentHost.config.autoReplyEnabled.description', "Whether VS Code's auto-reply setting is enabled. When `true`, `ask_user` questions are auto-answered instead of blocking on the user, mirroring autopilot mode."),
		default: false,
	}),
	[AgentHostPreferLongContextEnabledConfigKey]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentHost.config.preferLongContextEnabled.title', "Prefer Long Context"),
		description: localize('agentHost.config.preferLongContextEnabled.description', "Whether Copilot Chat's prefer-long-context setting is enabled. When `true`, models with a free long context window only show the long context option in the picker. When `false` (default), the smaller default context option stays selectable."),
		default: false,
	}),
	[AgentHostTerminalAutoApproveRulesConfigKey]: schemaProperty<AgentHostTerminalAutoApproveRules>({
		type: 'object',
		title: localize('agentHost.config.terminalAutoApproveRules.title', "Terminal Auto Approve Rules"),
		description: localize('agentHost.config.terminalAutoApproveRules.description', "Terminal auto-approve rules forwarded by the connected client for agent-host shell permission checks."),
		default: {},
	}),
	[AgentHostMcpServersConfigKey]: schemaProperty<AgentHostMcpServers>({
		type: 'object',
		title: localize('agentHost.config.mcpServers.title', "MCP Servers"),
		description: localize('agentHost.config.mcpServers.description', "Agent-host-level MCP servers exposed to every session, keyed by server name. Each value is a server configuration (see `<serverName>`)."),
		properties: mcpServersValueProperties,
		default: {},
	}),
});
