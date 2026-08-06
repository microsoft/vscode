/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SimpleMessageAttachment } from '../state/protocol/state.js';

/**
 * Well-known typed views over a `SimpleMessageAttachment`'s `_meta` bag as
 * produced by the `completions` command, populated by the slash-command and
 * skill completion providers and read by the session handler. Read the bag
 * through {@link readCompletionAttachmentMeta} rather than indexing `_meta`
 * directly. Two variants are distinguished by which discriminating key is
 * present: a slash command (`command`) or a skill (`uri`).
 */

/**
 * A client-side side effect a command completion carries. When present, the
 * workbench interprets it on accept (see the shared agent-host completion action
 * handler) rather than treating the item as a plain text/reference insertion.
 *
 * Used by Copilot agent-host permission/mode toggles (e.g. `/yolo`,
 * `/autopilot on`): the item applies a well-known session-config change. Whether
 * the item leaves text behind is expressed by its `insertText` (empty for a pure
 * toggle; `/command ` for an item that keeps the text so an argument can be
 * typed, with {@link ICommandCompletionAttachmentMeta.argumentHint} as ghost text).
 */
export interface IAgentHostCompletionAction {
	/**
	 * A partial agent-host session-config change to apply when the completion is
	 * accepted, keyed by well-known session-config property (e.g. `autoApprove`,
	 * `mode`) to the string-enum value. Applied via the active session's provider
	 * so the corresponding picker updates reactively.
	 */
	readonly applyConfig?: Readonly<Record<string, string>>;
}

/**
 * The `_meta` shape attached to a `completions` result that resolves to a slash
 * command.
 */
export interface ICommandCompletionAttachmentMeta {
	/** The slash command name (without the leading `/`). */
	readonly command: string;
	/** Optional human-readable description of the command. */
	readonly description?: string;
	/**
	 * Optional hint describing the argument the command expects. Rendered as
	 * inline placeholder (ghost text) after an accepted command completion.
	 */
	readonly argumentHint?: string;
	/**
	 * Optional client-side action to run when the completion is accepted (e.g. a
	 * permission/mode session-config toggle). See {@link IAgentHostCompletionAction}.
	 */
	readonly action?: IAgentHostCompletionAction;
}

/**
 * The `_meta` shape attached to a `completions` result that resolves to a skill.
 */
export interface ISkillCompletionAttachmentMeta {
	/** The skill resource URI as a string. */
	readonly uri: string;
	/** Optional internal name of the skill. */
	readonly name?: string;
	/** Optional human-readable display name (e.g. the slash-command name). */
	readonly displayName?: string;
	/** Optional human-readable description of the skill. */
	readonly description?: string;
}

/**
 * A typed, discriminated view over the well-known `completions` attachment
 * `_meta` variants. The `kind` discriminant is computed by
 * {@link readCompletionAttachmentMeta} from which key is present on the wire; it
 * is not itself carried in `_meta`.
 */
export type CompletionAttachmentMeta =
	| ({ readonly kind: 'command' } & ICommandCompletionAttachmentMeta)
	| ({ readonly kind: 'skill' } & ISkillCompletionAttachmentMeta);

/**
 * Reads the well-known `completions` attachment `_meta` keys, classifying the
 * bag into a {@link CompletionAttachmentMeta} variant by its discriminating key
 * (`command` for a slash command, `uri` for a skill). Returns `undefined` when
 * the bag is absent or matches neither variant; wrong-typed keys are dropped.
 */
export function readCompletionAttachmentMeta(attachment: SimpleMessageAttachment): CompletionAttachmentMeta | undefined {
	const meta = attachment._meta;
	if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
		return undefined;
	}
	if (typeof meta['command'] === 'string') {
		const action = readCompletionActionMeta(meta['action']);
		return {
			kind: 'command',
			command: meta['command'],
			...(typeof meta['description'] === 'string' ? { description: meta['description'] } : {}),
			...(typeof meta['argumentHint'] === 'string' ? { argumentHint: meta['argumentHint'] } : {}),
			...(action ? { action } : {}),
		};
	}
	if (typeof meta['uri'] === 'string') {
		return {
			kind: 'skill',
			uri: meta['uri'],
			...(typeof meta['name'] === 'string' ? { name: meta['name'] } : {}),
			...(typeof meta['displayName'] === 'string' ? { displayName: meta['displayName'] } : {}),
			...(typeof meta['description'] === 'string' ? { description: meta['description'] } : {}),
		};
	}
	return undefined;
}

/**
 * Serializes a typed {@link ICommandCompletionAttachmentMeta} into the `_meta`
 * record, dropping `undefined` entries. Build a slash-command completion's
 * `_meta` through this so producers stay in lock-step with
 * {@link readCompletionAttachmentMeta}.
 */
export function toCommandCompletionAttachmentMeta(meta: ICommandCompletionAttachmentMeta): Record<string, unknown> {
	const result: Record<string, unknown> = { command: meta.command };
	if (meta.description !== undefined) {
		result['description'] = meta.description;
	}
	if (meta.argumentHint !== undefined) {
		result['argumentHint'] = meta.argumentHint;
	}
	const action = toCompletionActionMeta(meta.action);
	if (action !== undefined) {
		result['action'] = action;
	}
	return result;
}

/**
 * Reads the optional {@link IAgentHostCompletionAction} carried on a command
 * completion's raw `_meta` bag (under the `action` key). Kept as the single
 * seam consumers use to obtain the action, mirroring {@link getCommandArgumentHint}.
 * Returns `undefined` when absent or malformed; wrong-typed sub-fields are dropped.
 */
export function getCompletionAction(meta: Record<string, unknown> | undefined): IAgentHostCompletionAction | undefined {
	if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
		return undefined;
	}
	return readCompletionActionMeta(meta['action']);
}

/**
 * Parses an unknown value into an {@link IAgentHostCompletionAction}. Accepts an
 * object with a string-map `applyConfig`; returns `undefined` when no valid
 * `applyConfig` is present.
 */
function readCompletionActionMeta(value: unknown): IAgentHostCompletionAction | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	let applyConfig: Record<string, string> | undefined;
	const rawApplyConfig = raw['applyConfig'];
	if (rawApplyConfig && typeof rawApplyConfig === 'object' && !Array.isArray(rawApplyConfig)) {
		for (const [key, entry] of Object.entries(rawApplyConfig as Record<string, unknown>)) {
			if (typeof entry === 'string') {
				applyConfig ??= {};
				applyConfig[key] = entry;
			}
		}
	}
	if (applyConfig === undefined) {
		return undefined;
	}
	return { applyConfig };
}

/**
 * Serializes an {@link IAgentHostCompletionAction} into a plain record for the
 * `_meta` bag, dropping empty entries. Returns `undefined` when the action
 * carries nothing meaningful.
 */
function toCompletionActionMeta(action: IAgentHostCompletionAction | undefined): Record<string, unknown> | undefined {
	if (!action?.applyConfig || Object.keys(action.applyConfig).length === 0) {
		return undefined;
	}
	return { applyConfig: { ...action.applyConfig } };
}

/**
 * Reads the well-known `argumentHint` from a raw completion attachment `_meta`
 * bag. Kept as the single seam that consumers use to obtain the hint, so a
 * future promotion of `argumentHint` to a first-class attachment field only
 * needs to change this reader. Returns `undefined` when absent or wrong-typed.
 */
export function getCommandArgumentHint(meta: Record<string, unknown> | undefined): string | undefined {
	if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
		return undefined;
	}
	return typeof meta['argumentHint'] === 'string' ? meta['argumentHint'] : undefined;
}

/**
 * Serializes a typed {@link ISkillCompletionAttachmentMeta} into the `_meta`
 * record, dropping `undefined` entries. Build a skill completion's `_meta`
 * through this so producers stay in lock-step with
 * {@link readCompletionAttachmentMeta}.
 */
export function toSkillCompletionAttachmentMeta(meta: ISkillCompletionAttachmentMeta): Record<string, unknown> {
	const result: Record<string, unknown> = { uri: meta.uri };
	if (meta.name !== undefined) {
		result['name'] = meta.name;
	}
	if (meta.displayName !== undefined) {
		result['displayName'] = meta.displayName;
	}
	if (meta.description !== undefined) {
		result['description'] = meta.description;
	}
	return result;
}
