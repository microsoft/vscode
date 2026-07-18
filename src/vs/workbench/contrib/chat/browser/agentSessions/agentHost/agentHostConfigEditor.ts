/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { parse, ParseError } from '../../../../../../base/common/json.js';
import { IJSONSchema } from '../../../../../../base/common/jsonSchema.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import {
	createFileSystemProviderError,
	FileChangeType,
	FilePermission,
	FileSystemProviderCapabilities,
	FileSystemProviderErrorCode,
	FileType,
	IFileChange,
	IFileDeleteOptions,
	IFileOverwriteOptions,
	IFileSystemProviderWithFileReadWriteCapability,
	IFileWriteOptions,
	IStat,
	IWatchOptions,
} from '../../../../../../platform/files/common/files.js';
import { Extensions as JSONExtensions, IJSONContributionRegistry } from '../../../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { ConfigPropertySchema, ConfigSchema } from '../../../../../../platform/agentHost/common/state/protocol/state.js';

// ============================================================================
// Target-neutral Agent Host config editor infrastructure.
//
// Both the sessions-window's per-session/per-provider settings editors
// (`vs/sessions/contrib/providers/agentHost/browser/*`) and the editor-window's
// ambient host settings editor render a config's schema as a JSONC document,
// watch for changes, and round-trip user edits through a replace API. This
// module factors out that shared plumbing so neither side needs to know about
// the other's notion of a "target" (a sessions provider vs. the ambient
// `IAgentHostService`).
// ============================================================================

/**
 * Minimal config shape shared by session and root configuration.
 */
export interface IAgentHostConfigLike {
	readonly schema: ConfigSchema;
	readonly values: Record<string, unknown>;
}

/**
 * Filter applied to schema properties to decide which ones surface in the
 * editable document (and in the derived JSON schema).
 */
export type AgentHostConfigPropertyFilter = (key: string, schema: ConfigPropertySchema) => boolean;

/**
 * Localized strings used to decorate the serialized JSONC document.
 */
export interface IAgentHostSettingsLocale {
	/** Header comment line describing the document. */
	readonly header: string;
	/** Secondary hint comment describing save semantics. */
	readonly saveHint: string;
	/** Error message thrown when the document fails to parse as JSONC. */
	readonly parseError: string;
	/** Error message thrown when the parsed document is not a JSON object. */
	readonly notObject: string;
}

/**
 * Convert a config property schema (protocol shape) into an
 * {@link IJSONSchema} suitable for registration with the JSON language
 * service.
 */
export function convertPropertySchema(schema: ConfigPropertySchema): IJSONSchema {
	const out: IJSONSchema = {
		type: schema.type,
		title: schema.title,
		description: schema.description,
		default: schema.default,
	};
	if (schema.enum && schema.enum.length > 0) {
		out.enum = [...schema.enum];
		if (schema.enumDescriptions && schema.enumDescriptions.length > 0) {
			out.enumDescriptions = [...schema.enumDescriptions];
		}
	}
	if (schema.type === 'array' && schema.items) {
		out.items = convertPropertySchema(schema.items);
	}
	if (schema.type === 'object' && schema.properties) {
		const properties: Record<string, IJSONSchema> = {};
		for (const [key, value] of Object.entries(schema.properties)) {
			properties[key] = convertPropertySchema(value);
		}
		out.properties = properties;
		if (schema.required && schema.required.length > 0) {
			out.required = [...schema.required];
		}
	}
	return out;
}

/**
 * Build a JSON schema describing the filtered properties of an agent-host
 * config. Properties that pass {@link filter} are included; others are
 * dropped. `required` entries are carried through when the referenced
 * property survives the filter.
 */
export function buildAgentHostConfigJsonSchema(config: IAgentHostConfigLike, filter: AgentHostConfigPropertyFilter): IJSONSchema {
	const properties: Record<string, IJSONSchema> = {};
	const required: string[] = [];
	for (const [key, schema] of Object.entries(config.schema.properties)) {
		if (!filter(key, schema)) {
			continue;
		}
		properties[key] = convertPropertySchema(schema);
		if (config.schema.required?.includes(key)) {
			required.push(key);
		}
	}
	const result: IJSONSchema = {
		type: 'object',
		properties,
		additionalProperties: true,
	};
	if (required.length > 0) {
		result.required = required;
	}
	return result;
}

function buildHeaderComment(
	locale: IAgentHostSettingsLocale,
	props: readonly (readonly [string, ConfigPropertySchema])[] | undefined,
): string {
	const lines: string[] = [];
	lines.push(`// ${locale.header}`);
	lines.push(`// ${locale.saveHint}`);
	if (props && props.length > 0) {
		lines.push('//');
		for (const [key, schema] of props) {
			const suffix = schema.enum && schema.enum.length > 0 ? ` (${schema.enum.join(' | ')})` : '';
			const title = schema.title || key;
			lines.push(`// ${key}: ${title}${suffix}`);
			if (schema.description) {
				lines.push(`//   ${schema.description}`);
			}
		}
	}
	lines.push('');
	return lines.join('\n');
}

/**
 * Serialize the filtered config values into a commented, pretty-printed
 * JSONC document.
 */
export function serializeAgentHostConfigDocument(
	config: IAgentHostConfigLike | undefined,
	filter: AgentHostConfigPropertyFilter,
	locale: IAgentHostSettingsLocale,
): string {
	if (!config) {
		return `${buildHeaderComment(locale, undefined)}{}\n`;
	}

	const editableProps = Object.entries(config.schema.properties).filter(([key, schema]) => filter(key, schema));
	const values: Record<string, unknown> = {};
	for (const [key] of editableProps) {
		if (config.values[key] !== undefined) {
			values[key] = config.values[key];
		}
	}

	return `${buildHeaderComment(locale, editableProps)}${JSON.stringify(values, null, 2)}\n`;
}

// ============================================================================
// AbstractAgentHostConfigFileSystemProvider
// ============================================================================

/**
 * Abstract filesystem provider backing the synthetic agent-host settings
 * JSONC editors. Subclasses supply scheme-specific URI parsing, target
 * resolution (e.g. a sessions provider, or the ambient agent host),
 * config-fetching, change-watching, and replace-dispatch hooks; the base
 * handles the boilerplate (`stat`/`readFile`/`writeFile`/error shapes).
 */
export abstract class AbstractAgentHostConfigFileSystemProvider<TContext, TTarget> extends Disposable implements IFileSystemProviderWithFileReadWriteCapability {

	readonly capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive;

	private readonly _onDidChangeCapabilities = this._register(new Emitter<void>());
	readonly onDidChangeCapabilities = this._onDidChangeCapabilities.event;

	protected readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile = this._onDidChangeFile.event;

	constructor(
		@ILogService protected readonly _logService: ILogService,
	) {
		super();
	}

	// ---- Subclass hooks -----------------------------------------------------

	/** URI scheme label used in error messages (e.g. `'agent-host-settings'`). */
	protected abstract readonly _schemeLabel: string;

	/** Log trace-tag (e.g. `'AgentHostSettings'`). */
	protected abstract readonly _traceTag: string;

	/** Localized strings for the JSONC document and write-path errors. */
	protected abstract readonly _locale: IAgentHostSettingsLocale;

	/** Parse a URI of the subclass's scheme into a typed context. */
	protected abstract _parseUri(resource: URI): TContext | undefined;

	/**
	 * Resolve the backing target (e.g. a sessions provider, the ambient
	 * agent host, a refcounted session subscription) for a parsed context.
	 * Called once per {@link stat}/{@link readFile}/{@link writeFile} call
	 * and once per {@link watch} call; every resolution that returns a
	 * target is paired with exactly one {@link _releaseTarget} call (see
	 * there for the ownership contract). Returning `undefined` signals the
	 * target genuinely could not be resolved (e.g. an unknown provider id) -
	 * a target whose backing value is merely pending or errored should still
	 * be resolved and returned so callers can render that state.
	 */
	protected abstract _resolveTarget(ctx: TContext): TTarget | undefined;

	/**
	 * Release a target obtained from {@link _resolveTarget}. Called exactly
	 * once for every resolution that returned a defined target: after
	 * {@link stat}/{@link readFile}/{@link writeFile} complete (including on
	 * error), and when a {@link watch} caller disposes its returned
	 * disposable. Default is a no-op for targets with no per-resolution
	 * ownership (e.g. a shared provider or the ambient agent host);
	 * subclasses whose {@link _resolveTarget} acquires a scoped resource
	 * (e.g. a refcounted subscription reference) must override this to
	 * release it symmetrically.
	 */
	protected _releaseTarget(_target: TTarget, _ctx: TContext): void {
		// no-op by default
	}

	/** Error to throw when {@link _resolveTarget} returns `undefined` for a parsed context. */
	protected _missingTargetError(_ctx: TContext): Error {
		return createFileSystemProviderError(`${this._schemeLabel} target is not available`, FileSystemProviderErrorCode.FileNotFound);
	}

	/** Render the current config for a context as a JSONC document. */
	protected abstract _serialize(target: TTarget, ctx: TContext): string;

	/**
	 * Subscribe for changes relevant to the given context. When a change is
	 * detected the subclass should invoke {@link fire}.
	 */
	protected abstract _watchChanges(target: TTarget, ctx: TContext, fire: () => void): IDisposable;

	/** Register / refresh the JSON schema for the given context. */
	protected abstract _ensureSchemaRegistered(target: TTarget, ctx: TContext): void;

	/** Whether the backing config is currently available. */
	protected abstract _hasConfig(target: TTarget, ctx: TContext): boolean;

	/** Dispatch a replace write of the parsed JSONC document. */
	protected abstract _replaceConfig(target: TTarget, ctx: TContext, values: Record<string, unknown>): Promise<void>;

	/**
	 * Build a short human-readable description of `ctx` for log messages
	 * when a write is ignored due to missing config (e.g. a session id).
	 */
	protected abstract _describeForTrace(ctx: TContext): string;

	// ---- IFileSystemProvider ------------------------------------------------

	watch(resource: URI, _opts: IWatchOptions): IDisposable {
		const parsed = this._parseUri(resource);
		if (!parsed) {
			return Disposable.None;
		}
		const target = this._resolveTarget(parsed);
		if (!target) {
			return Disposable.None;
		}
		const watcher = this._watchChanges(target, parsed, () => {
			this._onDidChangeFile.fire([{ type: FileChangeType.UPDATED, resource }]);
		});
		// `watch` owns the resolved target for as long as the caller holds
		// the returned disposable; release it only once that happens.
		return toDisposable(() => {
			watcher.dispose();
			this._releaseTarget(target, parsed);
		});
	}

	async stat(resource: URI): Promise<IStat> {
		const { target, ctx } = this._resolveOrThrow(resource);
		try {
			const content = this._serialize(target, ctx);
			return {
				type: FileType.File,
				ctime: 0,
				mtime: 0,
				size: VSBuffer.fromString(content).byteLength,
				permissions: 0 as FilePermission,
			};
		} finally {
			this._releaseTarget(target, ctx);
		}
	}

	async readdir(): Promise<[string, FileType][]> {
		throw createFileSystemProviderError('readdir not supported', FileSystemProviderErrorCode.NoPermissions);
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		const { target, ctx } = this._resolveOrThrow(resource);
		try {
			const content = this._serialize(target, ctx);

			// Register the JSON schema on demand the first time a settings
			// file is read. The subclass keeps it in sync from then on.
			this._ensureSchemaRegistered(target, ctx);

			return VSBuffer.fromString(content).buffer;
		} finally {
			this._releaseTarget(target, ctx);
		}
	}

	async writeFile(resource: URI, content: Uint8Array, _opts: IFileWriteOptions): Promise<void> {
		const { target, ctx } = this._resolveOrThrow(resource);
		try {
			const text = VSBuffer.wrap(content).toString();
			const errors: ParseError[] = [];
			const parsedJson = parse(text, errors);
			if (errors.length > 0) {
				throw createFileSystemProviderError(this._locale.parseError, FileSystemProviderErrorCode.Unavailable);
			}
			if (parsedJson === null || typeof parsedJson !== 'object' || Array.isArray(parsedJson)) {
				throw createFileSystemProviderError(this._locale.notObject, FileSystemProviderErrorCode.Unavailable);
			}

			if (!this._hasConfig(target, ctx)) {
				this._logService.trace(`[${this._traceTag}] No config state for ${this._describeForTrace(ctx)}; ignoring write.`);
				this._onDidChangeFile.fire([{ type: FileChangeType.UPDATED, resource }]);
				return;
			}

			await this._replaceConfig(target, ctx, parsedJson as Record<string, unknown>);

			this._onDidChangeFile.fire([{ type: FileChangeType.UPDATED, resource }]);
		} finally {
			this._releaseTarget(target, ctx);
		}
	}

	async mkdir(): Promise<void> {
		throw createFileSystemProviderError('mkdir not supported', FileSystemProviderErrorCode.NoPermissions);
	}

	async delete(_resource: URI, _opts: IFileDeleteOptions): Promise<void> {
		throw createFileSystemProviderError('delete not supported', FileSystemProviderErrorCode.NoPermissions);
	}

	async rename(_from: URI, _to: URI, _opts: IFileOverwriteOptions): Promise<void> {
		throw createFileSystemProviderError('rename not supported', FileSystemProviderErrorCode.NoPermissions);
	}

	// ---- Helpers ------------------------------------------------------------

	private _resolveOrThrow(resource: URI): { target: TTarget; ctx: TContext } {
		const ctx = this._parseUri(resource);
		if (!ctx) {
			throw createFileSystemProviderError(`Invalid ${this._schemeLabel} URI: ${resource.toString()}`, FileSystemProviderErrorCode.FileNotFound);
		}
		const target = this._resolveTarget(ctx);
		if (!target) {
			throw this._missingTargetError(ctx);
		}
		return { target, ctx };
	}
}

// ============================================================================
// AbstractAgentHostConfigSchemaRegistrar
// ============================================================================

/**
 * Abstract base for the schema registrars that keep JSON schemas registered
 * on the {@link IJSONContributionRegistry} for the synthetic settings
 * editors. Subclasses plumb the target type that identifies what a schema
 * belongs to (an `ISession`/`IAgentHostSessionsProvider` for the sessions
 * window, the ambient `IAgentHostService` for the editor window) and any
 * lifecycle needed to discover/observe/dispose targets.
 *
 * Registration is lazy - {@link ensureRegistered} is called by the
 * filesystem provider when a settings file is first read.
 */
export abstract class AbstractAgentHostConfigSchemaRegistrar<TTarget> extends Disposable {

	private readonly _schemaRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);

	/** Per-target registered-schema disposables, keyed by the settings URI string. */
	private readonly _targetSchemas = this._register(new DisposableMap<string /* settingsUri */>());

	/**
	 * Tracks the {@link ConfigSchema} identity last used to register a schema
	 * for a given settings URI so we can skip re-registration when only
	 * values have changed.
	 */
	private readonly _lastSchemaIdentity = new Map<string /* settingsUri */, ConfigSchema>();

	// ---- Subclass hooks -----------------------------------------------------

	/** Stringified URI identifying the settings document for a target. */
	protected abstract _settingsUri(target: TTarget): string;

	/** `vscode://schemas/...` schema id used for JSON language service registration. */
	protected abstract _schemaId(target: TTarget): string;

	/** Fetch the backing config for a target. Returns `undefined` when none yet. */
	protected abstract _getConfig(target: TTarget): IAgentHostConfigLike | undefined;

	/** Filter applied to schema properties when building the JSON schema. */
	protected abstract _propertyFilter(): AgentHostConfigPropertyFilter;

	// ---- Public API ---------------------------------------------------------

	/**
	 * Ensures a JSON schema is registered for the given target. Safe to
	 * call repeatedly; a no-op when the cached schema identity matches.
	 */
	ensureRegistered(target: TTarget): void {
		this._refreshSchema(target);
	}

	// ---- Protected API for subclass-driven change tracking -------------------

	/** Whether a schema is currently registered for `target`. */
	protected _isRegistered(target: TTarget): boolean {
		return this._lastSchemaIdentity.has(this._settingsUri(target));
	}

	protected _refreshSchema(target: TTarget): void {
		const config = this._getConfig(target);
		if (!config) {
			return;
		}
		const settingsUri = this._settingsUri(target);
		const identity = config.schema;
		if (this._lastSchemaIdentity.get(settingsUri) === identity) {
			return;
		}

		const schema = buildAgentHostConfigJsonSchema(config, this._propertyFilter());
		const schemaId = this._schemaId(target);

		// Dispose any prior registration first, otherwise the old cleanup
		// disposable would delete the freshly registered schema.
		this._targetSchemas.deleteAndDispose(settingsUri);

		const store = new DisposableStore();
		this._schemaRegistry.registerSchema(schemaId, schema, store);
		store.add(this._schemaRegistry.registerSchemaAssociation(schemaId, settingsUri));
		store.add(toDisposable(() => this._lastSchemaIdentity.delete(settingsUri)));

		this._targetSchemas.set(settingsUri, store);
		this._lastSchemaIdentity.set(settingsUri, identity);
	}

	protected _disposeSchemaForTarget(target: TTarget): void {
		this._targetSchemas.deleteAndDispose(this._settingsUri(target));
	}
}
