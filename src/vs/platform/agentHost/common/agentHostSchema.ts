/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
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

export type AutoApproveLevel = 'default' | 'autoApprove' | 'autopilot';

export type SessionMode = 'interactive' | 'plan';

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
		enum: ['default', 'autoApprove', 'autopilot'],
		enumLabels: [
			localize('agentHost.sessionConfig.autoApprove.default', "Default Approvals"),
			localize('agentHost.sessionConfig.autoApprove.bypass', "Bypass Approvals"),
			localize('agentHost.sessionConfig.autoApprove.autopilot', "Autopilot (Preview)"),
		],
		enumDescriptions: [
			localize('agentHost.sessionConfig.autoApprove.defaultDescription', "Copilot uses your configured settings"),
			localize('agentHost.sessionConfig.autoApprove.bypassDescription', "All tool calls are auto-approved"),
			localize('agentHost.sessionConfig.autoApprove.autopilotDescription', "Autonomously iterates from start to finish"),
		],
		default: 'default',
		sessionMutable: true,
	}),
	[SessionConfigKey.Permissions]: permissionsProperty,
	[SessionConfigKey.Mode]: schemaProperty<SessionMode>({
		type: 'string',
		title: localize('agentHost.sessionConfig.mode', "Agent Mode"),
		description: localize('agentHost.sessionConfig.modeDescription', "How the agent should approach this turn"),
		enum: ['interactive', 'plan'],
		enumLabels: [
			localize('agentHost.sessionConfig.mode.interactive', "Interactive"),
			localize('agentHost.sessionConfig.mode.plan', "Plan"),
		],
		enumDescriptions: [
			localize('agentHost.sessionConfig.mode.interactiveDescription', "Ask for input and approval for each action"),
			localize('agentHost.sessionConfig.mode.planDescription', "Generate a plan first, then choose how to execute it"),
		],
		default: 'interactive',
		sessionMutable: true,
	}),
});

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
export const platformRootSchema = createSchema({
	[SessionConfigKey.Permissions]: permissionsProperty,
});
