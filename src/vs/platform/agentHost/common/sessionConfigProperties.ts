/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isString } from '../../../base/common/types.js';
import { KNOWN_AUTO_APPROVE_VALUES, KNOWN_MODE_VALUES, SessionConfigKey } from './sessionConfigKeys.js';
import type { SessionConfigPropertySchema, SessionConfigSchema } from './state/protocol/commands.js';
import { ChatOriginKind, type ChatConfigState, type ChatSummary, type SessionConfigState } from './state/protocol/state.js';

export type SessionApprovalLevel = 'default' | 'assisted' | 'autoApprove';
export type SessionWorkspaceTarget = 'folder' | 'worktree';

export interface ISessionConfigProperty {
	readonly key: string;
	readonly schema: SessionConfigPropertySchema;
}

const copilotApprovalValues = new Set(['manual', 'assisted', 'allow-all']);
const vscodeIsolationValues = new Set(['folder', 'worktree']);
const copilotIsolationValues = new Set(['workspace', 'worktree']);

function getEnumProperty(schema: SessionConfigSchema | undefined, key: string, values: ReadonlySet<string>, required: string): ISessionConfigProperty | undefined {
	const property = schema?.properties[key];
	return property?.type === 'string' && !property.enumDynamic && Array.isArray(property.enum) && property.enum.includes(required)
		&& property.enum.every(value => isString(value) && values.has(value))
		? { key, schema: property } : undefined;
}

/** A published VS Code key wins even if its shape requires the generic picker. */
export function getSessionApprovalProperty(schema: SessionConfigSchema | undefined): ISessionConfigProperty | undefined {
	return schema && Object.hasOwn(schema.properties, SessionConfigKey.AutoApprove)
		? getEnumProperty(schema, SessionConfigKey.AutoApprove, KNOWN_AUTO_APPROVE_VALUES, 'default')
		: getEnumProperty(schema, 'approvalMode', copilotApprovalValues, 'manual');
}

export function getSessionModeProperty(schema: SessionConfigSchema | undefined): ISessionConfigProperty | undefined {
	return getEnumProperty(schema, SessionConfigKey.Mode, KNOWN_MODE_VALUES, 'interactive');
}

function usesVSCodeWorkspaceProperties(schema: SessionConfigSchema): boolean {
	return Object.hasOwn(schema.properties, SessionConfigKey.Isolation)
		|| (!Object.hasOwn(schema.properties, 'target') && !Object.hasOwn(schema.properties, 'baseBranch'));
}

export function getSessionIsolationProperty(schema: SessionConfigSchema): ISessionConfigProperty | undefined {
	return usesVSCodeWorkspaceProperties(schema)
		? getEnumProperty(schema, SessionConfigKey.Isolation, vscodeIsolationValues, 'folder')
		: getEnumProperty(schema, 'target', copilotIsolationValues, 'workspace');
}

export function getSessionBaseBranchProperty(schema: SessionConfigSchema): ISessionConfigProperty | undefined {
	const key = usesVSCodeWorkspaceProperties(schema) ? SessionConfigKey.Branch : 'baseBranch';
	const property = schema.properties[key];
	return property?.type === 'string' && (property.enumDynamic || property.enum?.every(isString)) ? { key, schema: property } : undefined;
}

export function getSessionWorkspaceProperties(schema: SessionConfigSchema) {
	const vscode = usesVSCodeWorkspaceProperties(schema);
	return {
		isolationKey: vscode ? SessionConfigKey.Isolation : 'target',
		baseBranchKey: vscode ? SessionConfigKey.Branch : 'baseBranch',
		isolation: getSessionIsolationProperty(schema),
		baseBranch: getSessionBaseBranchProperty(schema),
	};
}

/** Reuses existing controls without renaming the host's properties or confusing its two branch fields. */
export function getSessionConfigPresentationKey(key: string, schema: SessionConfigSchema): string {
	const workspace = getSessionWorkspaceProperties(schema);
	return key === workspace.isolation?.key ? SessionConfigKey.Isolation
		: key === workspace.baseBranch?.key ? SessionConfigKey.Branch
			: key === SessionConfigKey.Branch && !usesVSCodeWorkspaceProperties(schema) ? 'newBranch' : key;
}

export function readSessionApprovalLevel(property: ISessionConfigProperty | undefined, value: unknown): SessionApprovalLevel | undefined {
	const level = property?.key === 'approvalMode' ? value === 'manual' ? 'default' : value === 'allow-all' ? 'autoApprove' : value : value;
	return isString(value) && property?.schema.enum?.includes(value) && (level === 'default' || level === 'assisted' || level === 'autoApprove') ? level : undefined;
}

export function writeSessionApprovalLevel(property: ISessionConfigProperty | undefined, level: string): string | undefined {
	const value = property?.key === 'approvalMode' ? level === 'default' ? 'manual' : level === 'autoApprove' ? 'allow-all' : level : level;
	return readSessionApprovalLevel(property, value) === level ? value : undefined;
}

export function readSessionIsolation(property: ISessionConfigProperty | undefined, value: unknown): SessionWorkspaceTarget | undefined {
	const isolation = property?.key === 'target' && value === 'workspace' ? 'folder' : value;
	return isString(value) && property?.schema.enum?.includes(value) && (isolation === 'folder' || isolation === 'worktree') ? isolation : undefined;
}

export function writeSessionIsolation(property: ISessionConfigProperty | undefined, isolation: string): string | undefined {
	const value = property?.key === 'target' && isolation === 'folder' ? 'workspace' : isolation;
	return readSessionIsolation(property, value) === isolation ? value : undefined;
}

export function getAvailableSessionApprovalValues(property: ISessionConfigProperty, schema: SessionConfigSchema, values: Readonly<Record<string, unknown>>): readonly string[] {
	const offered = (property.schema.enum ?? []).filter((value): value is string => isString(value) && readSessionApprovalLevel(property, value) !== undefined);
	const available = values.availableApprovalModes;
	return schema.properties.availableApprovalModes?.type === 'array' && schema.properties.availableApprovalModes.readOnly === true && Array.isArray(available)
		? offered.filter(value => available.includes(value)) : offered;
}

/**
 * Supported approval values that the host's read-only availability report withholds. Unlike values absent from
 * the schema, they are supported but not currently allowed; the report does not say why.
 */
export function getWithheldSessionApprovalValues(property: ISessionConfigProperty, schema: SessionConfigSchema, values: Readonly<Record<string, unknown>>): readonly string[] {
	const available = getAvailableSessionApprovalValues(property, schema, values);
	return (property.schema.enum ?? []).filter((value): value is string => isString(value) && readSessionApprovalLevel(property, value) !== undefined && !available.includes(value));
}

export function getEffectiveSessionApprovalValue(property: ISessionConfigProperty, schema: SessionConfigSchema, values: Readonly<Record<string, unknown>>): unknown {
	return schema.properties.effectiveApprovalMode?.type === 'string' && schema.properties.effectiveApprovalMode.readOnly === true && isString(values.effectiveApprovalMode)
		? values.effectiveApprovalMode : values[property.key] ?? property.schema.default;
}

/**
 * Whether a picker in a chat may change a property: before the session is
 * created, or afterwards when the session's value may change or the chat may
 * set its own (`chatMutable`, independent of `sessionMutable`).
 */
export function isSessionConfigWritable(schema: SessionConfigPropertySchema | undefined, isNewSession: boolean): boolean {
	return !!schema && !schema.readOnly && (isNewSession || schema.sessionMutable === true || schema.chatMutable === true);
}

/** `mutable`: whether the write may change the property at all (before creation, or its session or chat mutability). */
function getSessionConfigWriteError(schema: SessionConfigSchema, values: Readonly<Record<string, unknown>>, key: string, value: unknown, mutable: (property: SessionConfigPropertySchema) => boolean): string | undefined {
	const property = schema.properties[key];
	// readOnly controls picker edits, not settings-derived values forwarded to the host.
	if (!property || !mutable(property)
		|| (key === 'approvalMode' && Object.hasOwn(schema.properties, SessionConfigKey.AutoApprove))
		|| ((key === 'target' || key === 'baseBranch') && usesVSCodeWorkspaceProperties(schema))) {
		return `Session configuration '${key}' is not writable.`;
	}
	const approval = getSessionApprovalProperty(schema);
	if ((approval?.key === key && (!isString(value) || !getAvailableSessionApprovalValues(approval, schema, values).includes(value)))
		|| (value !== undefined && property.enum?.length && !property.enumDynamic && !property.enum.some(candidate => candidate === value))) {
		return `Session configuration '${key}' does not offer '${String(value)}'.`;
	}
	return undefined;
}

export function validateSessionConfigWrite(schema: SessionConfigSchema, values: Readonly<Record<string, unknown>>, key: string, value: unknown, isNewSession: boolean): void {
	const error = getSessionConfigWriteError(schema, values, key, value, property => isNewSession || property.sessionMutable === true);
	if (error) {
		throw new Error(error);
	}
}

/** Retains advertised inputs without inventing defaults, renaming aliases, or forwarding approval reports. */
export function filterSessionConfigValues(schema: SessionConfigSchema, values: Readonly<Record<string, unknown>> | undefined, isNewSession = true): Record<string, unknown> {
	return Object.fromEntries(Object.entries(values ?? {}).filter(([key, value]) =>
		value !== undefined && !((key === 'availableApprovalModes' || key === 'effectiveApprovalMode') && schema.properties[key]?.readOnly)
		&& !getSessionConfigWriteError(schema, values ?? {}, key, value, property => isNewSession || property.sessionMutable === true)
	));
}

/** Whether a chat may set `key` for itself; every other property is set on the session. */
export function isChatConfigProperty(schema: SessionConfigSchema | undefined, key: string): boolean {
	return schema?.properties[key]?.chatMutable === true;
}

/** Whether the session's schema lets a chat set any property for itself; a host without such properties keeps all config on the session. */
export function hasChatConfigProperties(schema: SessionConfigSchema | undefined): boolean {
	return Object.values(schema?.properties ?? {}).some(property => property.chatMutable === true);
}

/** The values of `values` that the session's schema lets a chat set for itself. */
export function filterChatConfigValues(schema: SessionConfigSchema | undefined, values: Readonly<Record<string, unknown>> | undefined): Record<string, unknown> {
	return Object.fromEntries(Object.entries(values ?? {}).filter(([key, value]) => value !== undefined && isChatConfigProperty(schema, key)));
}

/** A chat's effective config: the session's config with the chat's own values applied over it (see {@link applyChatConfigLayers}). */
export function getEffectiveChatConfig(session: SessionConfigState, chat: ChatConfigState | undefined): SessionConfigState {
	const own = filterChatConfigValues(session.schema, chat?.values);
	return Object.keys(own).length === 0 ? session : { schema: session.schema, values: applyChatConfigLayers(session.values, [own]) };
}

const APPROVAL_KEYS: readonly string[] = [SessionConfigKey.AutoApprove, 'approvalMode'];

/**
 * Applies a chat's own config layers (innermost first: the chat, then the
 * chats that spawned it) over `base` (the session's values); an inner value
 * wins. A host-reported effective approval mode describes the approvals of
 * its own layer and the layers outside it, so one from outside a layer that
 * chose its own approvals does not apply.
 */
export function applyChatConfigLayers(base: Readonly<Record<string, unknown>>, layers: readonly Readonly<Record<string, unknown>>[]): Record<string, unknown> {
	const values: Record<string, unknown> = {};
	let approvalsChosen = false;
	for (const layer of [...layers, base]) {
		for (const [key, value] of Object.entries(layer)) {
			if (!Object.hasOwn(values, key) && !(key === 'effectiveApprovalMode' && approvalsChosen)) {
				values[key] = value;
			}
		}
		approvalsChosen ||= APPROVAL_KEYS.some(key => Object.hasOwn(layer, key));
	}
	return values;
}

/**
 * The chats whose own config values apply to `chat`, innermost first: the chat,
 * then the chats that spawned it, following the `Tool` origins recorded in the
 * session's chat catalog (as the host does), never the chat URI's shape.
 */
export function getChatConfigChain(chats: readonly Pick<ChatSummary, 'resource' | 'origin'>[] | undefined, chat: string): readonly string[] {
	const chain = [chat];
	let current = chat;
	while (true) {
		const origin = chats?.find(summary => summary.resource === current)?.origin;
		if (origin?.kind !== ChatOriginKind.Tool || chain.includes(origin.chat)) {
			return chain;
		}
		current = origin.chat;
		chain.push(current);
	}
}

/**
 * The chat whose own values a write from `chat` changes: the chat itself, or
 * for a subagent its nearest spawning chat that is not one, as the host does
 * for a subagent's writes.
 */
export function getChatConfigWriteTarget(chats: readonly Pick<ChatSummary, 'resource' | 'origin'>[] | undefined, chat: string): string {
	return getChatConfigChain(chats, chat).at(-1)!;
}

/** The own config values of a chat chain (innermost first) as one chat's (see {@link applyChatConfigLayers}). */
export function mergeChatConfigChain(configs: readonly (ChatConfigState | undefined)[]): ChatConfigState | undefined {
	const present = configs.filter((config): config is ChatConfigState => config !== undefined);
	return present.length === 0 ? undefined : { values: applyChatConfigLayers({}, present.map(config => config.values)) };
}

/** Splits a config patch into the values a chat sets for itself and the values set on the session. */
export function splitChatConfigPatch(schema: SessionConfigSchema | undefined, patch: Readonly<Record<string, unknown>>): { readonly chat: Record<string, unknown>; readonly session: Record<string, unknown> } {
	const chat: Record<string, unknown> = {};
	const session: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(patch)) {
		(isChatConfigProperty(schema, key) ? chat : session)[key] = value;
	}
	return { chat, session };
}

/**
 * Throws when a client may not set `key` to `value` for a chat. `values` are
 * the chat's effective values; the session's write rules apply on top of
 * the property being settable per chat.
 */
export function validateChatConfigWrite(schema: SessionConfigSchema, values: Readonly<Record<string, unknown>>, key: string, value: unknown): void {
	if (!isChatConfigProperty(schema, key)) {
		throw new Error(`Session configuration '${key}' cannot be set for a chat.`);
	}
	// A chat may set a `chatMutable` property for itself even when the session's value is fixed; read-only ones are host-written.
	const error = getSessionConfigWriteError(schema, values, key, value, property => property.readOnly !== true);
	if (error) {
		throw new Error(error);
	}
}

/**
 * Throws when a picker in a chat may not write `key` to `value`: a running
 * session's `chatMutable` property is written to the chat, everything else to
 * the session.
 */
export function validateChatPickerConfigWrite(schema: SessionConfigSchema, values: Readonly<Record<string, unknown>>, key: string, value: unknown, isNewSession: boolean): void {
	if (!isNewSession && isChatConfigProperty(schema, key)) {
		validateChatConfigWrite(schema, values, key, value);
	} else {
		validateSessionConfigWrite(schema, values, key, value, isNewSession);
	}
}
