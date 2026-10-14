/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { arrayEquals, structuralEquals } from '../../../../base/common/equals.js';
import { DebugOwner, derivedObservableWithCache, derivedOpts, IObservable } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../../../platform/agentHost/common/agentHostFileSystemService.js';
import type { AgentHostUriMapper } from '../../../../platform/agentHost/common/agentHostUri.js';
import {
	CustomizationType,
	ResponsePartKind,
	ToolCallContributorKind,
	ToolCallStatus,
	getInlineToolInput,
	type ChildCustomization,
	type Customization,
	type ToolCallState,
	type Turn,
} from '../../../../platform/agentHost/common/state/sessionState.js';
import { ISessionChatCustomization, SessionCustomizationKind } from './sessionChatCustomizations.js';

/**
 * A reference to a customization extracted from a chat's output stream.
 *
 * References are deliberately resolved **against nothing**: they capture only
 * what the turn said, so a completed turn can be parsed once and cached even
 * though the session's customization tree keeps changing underneath.
 */
export const enum CustomizationRefKind {
	/** An MCP server addressed by customization id (exact, from the tool contributor). */
	Mcp = 'mcp',
	/** A file system path mentioned by a tool call. */
	Path = 'path',
	/** A skill invoked by name. */
	Skill = 'skill',
}

export interface ICustomizationRef {
	readonly kind: CustomizationRefKind;
	readonly value: string;
}

export function customizationRefsEqual(a: readonly ICustomizationRef[], b: readonly ICustomizationRef[]): boolean {
	return a === b || (a.length === b.length && a.every((ref, i) => ref.kind === b[i].kind && ref.value === b[i].value));
}

function sessionChatCustomizationEqual(a: ISessionChatCustomization, b: ISessionChatCustomization): boolean {
	return a.id === b.id
		&& a.kind === b.kind
		&& a.name === b.name
		&& a.uri?.toString() === b.uri?.toString();
}

export function sessionChatCustomizationsEqual(a: readonly ISessionChatCustomization[], b: readonly ISessionChatCustomization[]): boolean {
	return a === b || (a.length === b.length && a.every((customization, i) => sessionChatCustomizationEqual(customization, b[i])));
}

/** Tool names that invoke a skill by name rather than by path. */
const skillToolNames: ReadonlySet<string> = new Set(['skill', 'runskill', 'invokeskill']);

/** Fields a skill-invoking tool carries the skill name in. */
const skillNameFields: readonly string[] = ['skill', 'name', 'skillName', 'command'];

/**
 * Matches path-like tokens: anything containing a slash or backslash that is
 * plausibly a file path. Separators repeat because a Windows path arrives
 * backslash-escaped inside JSON tool input, and `:` is allowed so a Windows
 * drive prefix stays attached. Over-matching is harmless — a token only
 * survives if it resolves to a known customization.
 */
const pathTokenPattern = /[\w.~@$():[\]+-]*(?:[/\\]+[\w.~@$():[\]+-]+)+/g;

function readSkillName(input: string): string | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(input);
	} catch {
		return input.trim() || undefined;
	}
	if (!parsed || typeof parsed !== 'object') {
		return typeof parsed === 'string' ? parsed : undefined;
	}
	const record = parsed as Record<string, unknown>;
	for (const field of skillNameFields) {
		const value = record[field];
		if (typeof value === 'string' && value.length > 0) {
			return value;
		}
	}
	return undefined;
}

function pushRef(refs: ICustomizationRef[], seen: Set<string>, kind: CustomizationRefKind, value: string): void {
	const key = `${kind}\u0000${value}`;
	if (!seen.has(key)) {
		seen.add(key);
		refs.push({ kind, value });
	}
}

function parseToolCall(toolCall: ToolCallState, refs: ICustomizationRef[], seen: Set<string>): void {
	if (toolCall.contributor?.kind === ToolCallContributorKind.MCP) {
		pushRef(refs, seen, CustomizationRefKind.Mcp, toolCall.contributor.customizationId);
	}

	// Parameters are still streaming, so there is nothing stable to read yet.
	if (toolCall.status === ToolCallStatus.Streaming) {
		return;
	}
	const input = getInlineToolInput(toolCall.toolInput);
	if (!input) {
		return;
	}

	if (skillToolNames.has(toolCall.toolName.toLowerCase())) {
		const name = readSkillName(input);
		if (name) {
			pushRef(refs, seen, CustomizationRefKind.Skill, name);
		}
	}

	for (const match of input.matchAll(pathTokenPattern)) {
		pushRef(refs, seen, CustomizationRefKind.Path, match[0]);
	}
}

/** Extracts the customization references contained in a turn's response parts. */
export function parseTurnCustomizationRefs(responseParts: Turn['responseParts']): readonly ICustomizationRef[] {
	const refs: ICustomizationRef[] = [];
	const seen = new Set<string>();
	for (const part of responseParts) {
		if (part.kind === ResponsePartKind.ToolCall) {
			parseToolCall(part.toolCall, refs, seen);
		}
	}
	return refs;
}

export interface ICustomizationRefChatState {
	readonly turns?: readonly { readonly id: string; readonly responseParts: Turn['responseParts'] }[];
	readonly activeTurn?: { readonly responseParts: Turn['responseParts'] };
}

/**
 * Creates a stateful parser that turns a chat state into its customization
 * references, **parsing each completed turn at most once**.
 *
 * Completed turns are immutable once finalized, so each is parsed once and
 * memoized by turn id. Only the in-progress `activeTurn` is re-parsed on every
 * call, making streamed-delta updates O(active turn) rather than O(all turns).
 */
export function createIncrementalChatCustomizationRefsParser(
	parseTurn: (responseParts: Turn['responseParts']) => readonly ICustomizationRef[] = parseTurnCustomizationRefs,
): (chatState: ICustomizationRefChatState) => readonly ICustomizationRef[] {
	const completedTurnCache = new Map<string, readonly ICustomizationRef[]>();

	return (chatState: ICustomizationRefChatState): readonly ICustomizationRef[] => {
		const turns = chatState.turns ?? [];
		const completedIds = new Set(turns.map(turn => turn.id));
		for (const id of completedTurnCache.keys()) {
			if (!completedIds.has(id)) {
				completedTurnCache.delete(id);
			}
		}

		const refs: ICustomizationRef[] = [];
		const seen = new Set<string>();
		const append = (parsed: readonly ICustomizationRef[]): void => {
			for (const ref of parsed) {
				const key = `${ref.kind}\u0000${ref.value}`;
				if (!seen.has(key)) {
					seen.add(key);
					refs.push(ref);
				}
			}
		};

		for (const turn of turns) {
			let parsed = completedTurnCache.get(turn.id);
			if (!parsed) {
				parsed = parseTurn(turn.responseParts);
				completedTurnCache.set(turn.id, parsed);
			}
			append(parsed);
		}
		if (chatState.activeTurn) {
			append(parseTurn(chatState.activeTurn.responseParts));
		}
		return refs;
	};
}

const kindByType: ReadonlyMap<CustomizationType, SessionCustomizationKind> = new Map([
	[CustomizationType.Agent, SessionCustomizationKind.Agent],
	[CustomizationType.Skill, SessionCustomizationKind.Skill],
	[CustomizationType.Rule, SessionCustomizationKind.Instruction],
	[CustomizationType.Hook, SessionCustomizationKind.Hook],
	[CustomizationType.Prompt, SessionCustomizationKind.Prompt],
	[CustomizationType.McpServer, SessionCustomizationKind.McpServer],
	[CustomizationType.Plugin, SessionCustomizationKind.Plugin],
]);

/**
 * Normalizes a path for comparison: forward slashes, no repeats (a JSON-escaped
 * Windows path arrives doubled), no trailing slash, lower case.
 */
function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/$/, '').toLowerCase();
}

function toFsPath(uri: string): string | undefined {
	try {
		const parsed = URI.parse(uri);
		return parsed.scheme === 'file' ? normalizePath(parsed.path) : undefined;
	} catch {
		return undefined;
	}
}

/** Indexes host-side references while optionally mapping host-owned resource URIs for presentation. */
export class CustomizationIndex {

	private readonly _byId = new Map<string, ISessionChatCustomization>();
	private readonly _byPath = new Map<string, ISessionChatCustomization>();
	private readonly _byContainerPath = new Map<string, ISessionChatCustomization>();
	private readonly _bySkillName = new Map<string, ISessionChatCustomization>();
	private readonly _resolvedPaths = new Map<string, ISessionChatCustomization | undefined>();
	/** Tokens looked up on this index; only these are worth carrying to the next one. */
	private readonly _usedPathTokens = new Set<string>();
	private readonly _resolvedPathDependencies = new Map<string, { readonly paths: readonly string[]; readonly containerPaths: readonly string[] }>();
	private readonly _roots: readonly string[];

	constructor(
		customizations: readonly Customization[] | undefined,
		private readonly _workspaceRoots: readonly URI[] = [],
		mapHostUri?: AgentHostUriMapper,
		previous?: CustomizationIndex,
	) {
		this._roots = _workspaceRoots.map(root => normalizePath(root.path));
		for (const customization of customizations ?? []) {
			const container = customization.type === CustomizationType.Plugin || customization.type === CustomizationType.Directory ? customization : undefined;
			const mapUri = container?.clientId !== undefined ? undefined : mapHostUri;
			this._add(customization, mapUri);
			for (const child of container?.children ?? []) {
				this._add(child, mapUri);
			}
		}
		this._reuseResolvedPaths(previous);
	}

	get isEmpty(): boolean {
		return this._byId.size === 0;
	}

	private _add(customization: Customization | ChildCustomization, mapHostUri: AgentHostUriMapper | undefined): void {
		const kind = kindByType.get(customization.type);
		if (!kind) {
			return;
		}
		const originalUri = customization.uri ? URI.parse(customization.uri) : undefined;
		const uri = originalUri && mapHostUri && originalUri.scheme !== SYNCED_CUSTOMIZATION_SCHEME ? mapHostUri(originalUri) : originalUri;
		const entry: ISessionChatCustomization = { id: customization.id, kind, name: customization.name, ...(uri ? { uri } : {}) };
		this._byId.set(customization.id, entry);

		if (kind === SessionCustomizationKind.Skill) {
			this._bySkillName.set(customization.name.toLowerCase(), entry);
		}

		const path = customization.uri ? toFsPath(customization.uri) : undefined;
		if (!path) {
			return;
		}
		this._byPath.set(path, entry);
		// A skill or plugin owns everything beside it, so reading any file in its
		// folder counts as using it. The type decides where that folder is: a
		// plugin's URI is already its root, while a skill points at its own file.
		// Guessing from punctuation would misread a versioned plugin root such as
		// `.../plugins/foo/1.2.0` as a file and claim its siblings.
		if (kind === SessionCustomizationKind.Plugin) {
			this._byContainerPath.set(path, entry);
		} else if (kind === SessionCustomizationKind.Skill) {
			const container = path.slice(0, path.lastIndexOf('/'));
			if (container) {
				this._byContainerPath.set(container, entry);
			}
		}
	}

	private _resolvePath(token: string): ISessionChatCustomization | undefined {
		this._usedPathTokens.add(token);
		if (this._resolvedPaths.has(token)) {
			return this._resolvedPaths.get(token);
		}
		const resolved = this._resolvePathUncached(token);
		this._resolvedPaths.set(token, resolved);
		return resolved;
	}

	protected _resolvePathUncached(token: string): ISessionChatCustomization | undefined {
		const paths: string[] = [];
		const containerPaths: string[] = [];
		this._resolvedPathDependencies.set(token, { paths, containerPaths });
		const candidates: string[] = [];
		const normalized = normalizePath(token.startsWith('file://') ? (toFsPath(token) ?? token) : token);
		if (!normalized) {
			return undefined;
		}
		candidates.push(normalized.startsWith('/') ? normalized : `/${normalized}`);
		for (const root of this._roots) {
			candidates.push(`${root}/${normalized.replace(/^\.\//, '')}`);
		}

		for (const candidate of candidates) {
			paths.push(candidate);
			const direct = this._byPath.get(candidate);
			if (direct) {
				return direct;
			}
			for (let parent = candidate; parent.includes('/'); parent = parent.slice(0, parent.lastIndexOf('/'))) {
				containerPaths.push(parent);
				const container = this._byContainerPath.get(parent);
				if (container) {
					return container;
				}
			}
		}
		return undefined;
	}

	private _reuseResolvedPaths(previous: CustomizationIndex | undefined): void {
		if (!previous || !arrayEquals(this._workspaceRoots, previous._workspaceRoots, isEqual)) {
			return;
		}
		const changedPaths = changedCustomizationPaths(previous._byPath, this._byPath);
		const changedContainerPaths = changedCustomizationPaths(previous._byContainerPath, this._byContainerPath);
		const pathsChanged = changedPaths.size > 0 || changedContainerPaths.size > 0;
		for (const token of previous._usedPathTokens) {
			const resolved = previous._resolvedPaths.get(token);
			const dependencies = previous._resolvedPathDependencies.get(token);
			const affected = dependencies && pathsChanged
				&& (dependencies.paths.some(path => changedPaths.has(path))
					|| dependencies.containerPaths.some(path => changedContainerPaths.has(path)));
			if (!dependencies || affected) {
				continue;
			}
			this._resolvedPaths.set(token, resolved);
			this._resolvedPathDependencies.set(token, dependencies);
		}
	}

	resolve(ref: ICustomizationRef): ISessionChatCustomization | undefined {
		switch (ref.kind) {
			case CustomizationRefKind.Mcp:
				return this._byId.get(ref.value);
			case CustomizationRefKind.Skill:
				return this._bySkillName.get(ref.value.toLowerCase());
			case CustomizationRefKind.Path:
				return this._resolvePath(ref.value);
		}
	}
}

function changedCustomizationPaths(
	previous: ReadonlyMap<string, ISessionChatCustomization>,
	current: ReadonlyMap<string, ISessionChatCustomization>,
): ReadonlySet<string> {
	const changed = new Set<string>();
	for (const [path, customization] of previous) {
		const updated = current.get(path);
		if (!updated || !sessionChatCustomizationEqual(customization, updated)) {
			changed.add(path);
		}
	}
	for (const [path, customization] of current) {
		const old = previous.get(path);
		if (!old || !sessionChatCustomizationEqual(old, customization)) {
			changed.add(path);
		}
	}
	return changed;
}

export type CustomizationIndexFactory = (
	customizations: readonly Customization[] | undefined,
	workspaceRoots: readonly URI[],
	mapHostUri: AgentHostUriMapper | undefined,
	previous: CustomizationIndex | undefined,
) => CustomizationIndex;

/**
 * Creates a customization index whose identity is stable across equivalent
 * protocol snapshots and workspace-root emissions. Resolved paths are carried
 * across rebuilds only while they keep being looked up, and are dropped when
 * the optional `options.scope` changes (for example when switching chats).
 */
export function createCustomizationIndexObservable(
	owner: DebugOwner,
	customizations: IObservable<readonly Customization[] | undefined>,
	workspaceRoots: IObservable<readonly URI[]>,
	mapHostUri?: IObservable<AgentHostUriMapper | undefined>,
	{ createIndex = (items, roots, mapper, previous) => new CustomizationIndex(items, roots, mapper, previous), scope }: { createIndex?: CustomizationIndexFactory; scope?: IObservable<unknown> } = {},
): IObservable<CustomizationIndex> {
	const stableCustomizations = derivedOpts<readonly Customization[] | undefined>({ owner, equalsFn: structuralEquals }, reader => customizations.read(reader));
	const stableWorkspaceRoots = derivedOpts<readonly URI[]>({ owner, equalsFn: (a, b) => arrayEquals(a, b, isEqual) }, reader => workspaceRoots.read(reader));
	let lastScope: unknown;
	return derivedObservableWithCache(owner, (reader, previous) => {
		const currentScope = scope?.read(reader);
		const sameScope = currentScope === lastScope;
		lastScope = currentScope;
		return createIndex(stableCustomizations.read(reader), stableWorkspaceRoots.read(reader), mapHostUri?.read(reader), sameScope ? previous : undefined);
	});
}

/**
 * Resolves parsed references to customizations, keeping first-appearance order
 * and dropping duplicates.
 */
export function resolveChatCustomizations(refs: readonly ICustomizationRef[], index: CustomizationIndex): readonly ISessionChatCustomization[] {
	if (index.isEmpty || refs.length === 0) {
		return [];
	}
	const resolved: ISessionChatCustomization[] = [];
	const seen = new Set<string>();
	for (const ref of refs) {
		const customization = index.resolve(ref);
		if (customization && !seen.has(customization.id)) {
			seen.add(customization.id);
			resolved.push(customization);
		}
	}
	return resolved;
}
