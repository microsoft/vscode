/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
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
} from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ISessionChatCustomization, SessionCustomizationKind } from '../../../../services/sessions/common/session.js';

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

export function sessionChatCustomizationsEqual(a: readonly ISessionChatCustomization[], b: readonly ISessionChatCustomization[]): boolean {
	return a === b || (a.length === b.length && a.every((customization, i) => customization.id === b[i].id
		&& customization.kind === b[i].kind
		&& customization.name === b[i].name
		&& customization.uri?.toString() === b[i].uri?.toString()));
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

/**
 * A lookup from the session's customization tree, resolving the references
 * parsed out of a chat back to customizations.
 */
export class CustomizationIndex {

	private readonly _byId = new Map<string, ISessionChatCustomization>();
	private readonly _byPath = new Map<string, ISessionChatCustomization>();
	private readonly _byContainerPath = new Map<string, ISessionChatCustomization>();
	private readonly _bySkillName = new Map<string, ISessionChatCustomization>();
	private readonly _roots: readonly string[];

	constructor(customizations: readonly Customization[] | undefined, workspaceRoots: readonly URI[] = []) {
		this._roots = workspaceRoots.map(root => normalizePath(root.path));
		for (const customization of customizations ?? []) {
			this._add(customization);
			for (const child of (customization as { children?: readonly ChildCustomization[] }).children ?? []) {
				this._add(child);
			}
		}
	}

	get isEmpty(): boolean {
		return this._byId.size === 0;
	}

	private _add(customization: Customization | ChildCustomization): void {
		const kind = kindByType.get(customization.type);
		if (!kind) {
			return;
		}
		const uri = customization.uri ? URI.parse(customization.uri) : undefined;
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
			const direct = this._byPath.get(candidate);
			if (direct) {
				return direct;
			}
			for (let parent = candidate; parent.includes('/'); parent = parent.slice(0, parent.lastIndexOf('/'))) {
				const container = this._byContainerPath.get(parent);
				if (container) {
					return container;
				}
			}
		}
		return undefined;
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
